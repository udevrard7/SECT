package worker

// bibliotheque_purge_worker.go — Worker périodique de purge de la
// corbeille de la bibliothèque (ADR-0008 §5, exécution ADR-0007
// §stockage : « purge des octets R2 = job P4 »).
//
// Les ouvrages soft-déletés (corbeille, P1) depuis plus de 30 jours
// sont hard-déletés : la ligne (CASCADE emporte OuvrageLecture,
// OuvrageSection, AlignementOuvrage, OuvrageAnnotation — plus de
// référence = plus de métriques sociales) ET l'objet R2 (post-commit,
// pattern corbeillePurge — jamais dans la tx).
//
// Chaque purge est journalisée dans AuditLog (action=OUVRAGE_PURGE_AUTO)
// AVANT le DELETE, pour traçabilité même si le DELETE échoue.
//
// La policy Ouvrage_delete (000128) n'accepte QUE is_system() : l'app
// ne peut JAMAIS hard-deleter, le worker est l'unique porte.
//
// Pattern identique à cleanup_worker.go (struct + ticker 1h + premier
// check au démarrage pour le rattrapage).

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/monitoring"
)

// bibliothequePurgeSeuilJours — jours de grâce en corbeille avant purge
// définitive (ligne + octets R2 + quota libéré).
const bibliothequePurgeSeuilJours = 30

// bibliothequePurgeInterval — cadence du check (1 h : la purge n'est
// jamais urgente, le premier check au boot couvre le rattrapage).
const bibliothequePurgeInterval = 1 * time.Hour

// BibliothequePurgeWorker purge périodiquement la corbeille.
type BibliothequePurgeWorker struct {
	dbPool  *pgxpool.Pool
	logger  *slog.Logger
	storage domain.StorageClient
	reg     *monitoring.WorkerRegistry // ADR-0011 : registre monitoring (nil-safe)
}

// NewBibliothequePurgeWorker crée un nouveau worker de purge. storage
// peut être nil (mode DB-only : la ligne est purgée, un éventuel objet
// R2 orphelin est journalisé en warning — R2 est configuré en prod
// depuis SECT-R2-CONFIG-1, le mode nil reste la ceinture-bretelles).
func NewBibliothequePurgeWorker(dbPool *pgxpool.Pool, logger *slog.Logger, storage domain.StorageClient) *BibliothequePurgeWorker {
	return &BibliothequePurgeWorker{dbPool: dbPool, logger: logger, storage: storage}
}

// WithRegistry injecte le registre de workers (ADR-0011 — visibilité dans
// l'onglet Système de /monitoring : runs, erreurs, dernier run, durée).
// Nil-safe : sans registre, le worker se comporte exactement comme avant.
func (w *BibliothequePurgeWorker) WithRegistry(reg *monitoring.WorkerRegistry) *BibliothequePurgeWorker {
	w.reg = reg
	return w
}

// Start lance le worker en goroutine (non-bloquant). Premier check
// immédiat au démarrage (rattrapage), puis toutes les heures.
func (w *BibliothequePurgeWorker) Start(ctx context.Context) {
	w.logger.Info("BibliothequePurgeWorker started, checking every 1h",
		"seuilJours", bibliothequePurgeSeuilJours)

	go func() {
		w.reg.TrackContext(ctx, "bibliotheque-purge", w.checkAndPurge)

		ticker := time.NewTicker(bibliothequePurgeInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				w.logger.Info("BibliothequePurgeWorker stopping...")
				return
			case <-ticker.C:
				w.reg.TrackContext(ctx, "bibliotheque-purge", w.checkAndPurge)
			}
		}
	}()
}

// purgeCandidate — un ouvrage éligible à la purge.
type purgeCandidate struct {
	ID              string
	Titre           string
	CheminStockage  *string
	TailleFichier   int
	EtablissementID string
}

// checkAndPurge : fetch des candidats → pour chacun, audit AVANT le
// DELETE → DELETE sous claims system (tx dédiée) → suppression R2
// post-commit. Un échec par item n'interrompt pas les autres (retenté
// au prochain tick).
func (w *BibliothequePurgeWorker) checkAndPurge(ctx context.Context) {
	candidates, err := w.fetchCandidates(ctx)
	if err != nil {
		w.logger.Error("BibliothequePurgeWorker: fetch candidats échoué", "error", err.Error())
		return
	}
	if len(candidates) == 0 {
		w.logger.Debug("BibliothequePurgeWorker: corbeille à jour, rien à purger")
		return
	}
	w.logger.Info("BibliothequePurgeWorker: ouvrages à purger",
		"count", len(candidates), "seuilJours", bibliothequePurgeSeuilJours)

	purged := 0
	for _, c := range candidates {
		if err := w.purgeOne(ctx, c); err != nil {
			w.logger.Error("BibliothequePurgeWorker: purge échouée (retenté au prochain tick)",
				"ouvrageId", c.ID, "error", err.Error())
			continue
		}
		purged++
	}
	w.logger.Info("BibliothequePurgeWorker: purge terminée", "purged", purged, "candidates", len(candidates))
}

// fetchCandidates — ouvrages soft-déletés depuis > seuil, sous claims
// system (Ouvrage_select accepte is_system — les corbeillés sont
// invisibles pour les lecteurs). make_interval(days => $1) avec
// paramètre typé int : leçon AUTOCLOSE-FIX-1 (JAMAIS d'arithmétique
// d'intervalle sur un paramètre non typé — 42883 au parse).
func (w *BibliothequePurgeWorker) fetchCandidates(ctx context.Context) ([]purgeCandidate, error) {
	var candidates []purgeCandidate
	err := db.WithSystemTx(ctx, w.dbPool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT "id", "titre", "cheminStockage", "tailleFichier", "etablissementId"
			FROM "Ouvrage"
			WHERE "deletedAt" IS NOT NULL
			  AND "deletedAt" < now() - make_interval(days => $1::int)
			ORDER BY "deletedAt" ASC
			LIMIT 100`, bibliothequePurgeSeuilJours)
		if err != nil {
			return fmt.Errorf("query candidats purge: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var c purgeCandidate
			if err := rows.Scan(&c.ID, &c.Titre, &c.CheminStockage, &c.TailleFichier, &c.EtablissementID); err != nil {
				return fmt.Errorf("scan candidat purge: %w", err)
			}
			candidates = append(candidates, c)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return candidates, nil
}

// purgeOne — une purge : audit (INSERT direct, pattern cleanup_worker :
// la policy AuditLog_insert est WITH CHECK(true)) + tx system pour le
// DELETE (0 ligne = refus RLS → erreur explicite) + R2 post-commit
// best-effort HORS tx (pattern corbeillePurge).
func (w *BibliothequePurgeWorker) purgeOne(ctx context.Context, c purgeCandidate) error {
	// 1. Audit AVANT le DELETE (traçabilité même si le DELETE échoue).
	details := map[string]any{
		"ouvrageId":     c.ID,
		"titre":         c.Titre,
		"tailleFichier": c.TailleFichier,
		"seuilJours":    bibliothequePurgeSeuilJours,
		"methode":       "bibliotheque_purge_worker",
	}
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		return fmt.Errorf("marshal audit details: %w", err)
	}
	if _, err := w.dbPool.Exec(ctx, `
		INSERT INTO "AuditLog" ("id", "userId", "userEmail", "action", "entite", "entiteId",
			"details", "adresseIp", "reason", "etablissementId", "createdAt")
		VALUES ($1, NULL, 'system-worker', 'OUVRAGE_PURGE_AUTO', 'Ouvrage', $2,
			$3, 'system-worker', $4, $5, CURRENT_TIMESTAMP)`,
		uuid.NewString(), c.ID, string(detailsJSON),
		fmt.Sprintf("Purge corbeille bibliothèque (deletedAt > %d jours)", bibliothequePurgeSeuilJours),
		c.EtablissementID,
	); err != nil {
		return fmt.Errorf("insert audit log: %w", err)
	}

	// 2. DELETE sous claims system (policy Ouvrage_delete = is_system
	// SEUL). Le rowcount est capturé immédiatement (leçon P2 : un DELETE
	// RLS refusé est un 0 ligne SILENCIEUX, pas une erreur).
	if err := db.WithSystemTx(ctx, w.dbPool, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx, `DELETE FROM "Ouvrage" WHERE "id" = $1`, c.ID)
		if err != nil {
			return fmt.Errorf("delete ouvrage: %w", err)
		}
		if ct.RowsAffected() == 0 {
			return fmt.Errorf("delete refusé (0 ligne — policy Ouvrage_delete is_system attendue, cf. 000128)")
		}
		return nil
	}); err != nil {
		return err
	}

	// 3. Suppression R2 POST-COMMIT best-effort : la ligne est déjà
	// purgée ; un échec R2 laisse un orphelin (journalisé) qui sera
	// nettoyable manuellement — jamais l'inverse (une ligne fantôme
	// pointant des octets supprimés casserait le lecteur).
	if c.CheminStockage != nil && *c.CheminStockage != "" {
		if w.storage == nil {
			w.logger.Warn("BibliothequePurgeWorker: storage nil — objet R2 orphelin (mode DB-only)",
				"ouvrageId", c.ID, "key", *c.CheminStockage)
		} else if err := w.storage.Delete(ctx, *c.CheminStockage); err != nil {
			w.logger.Warn("BibliothequePurgeWorker: suppression R2 échouée (orphelin à nettoyer)",
				"ouvrageId", c.ID, "key", *c.CheminStockage, "error", err.Error())
		}
	}
	return nil
}
