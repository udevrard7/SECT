// Package worker — clôture automatique des épreuves expirées.
//
// CLOTURE-AUTO-WORKER : goroutine périodique qui vérifie toutes les 60s les
// épreuves EN_COURS dont la dateFin + delaiGrace est dépassée, et les clôture
// automatiquement en DB.
//
// Aussi : clôture TOUS_SOUMIS — quand toutes les sessions d'une épreuve
// EN_COURS sont SOUMISES/CORRIGEE/RETOURNEE (plus aucune EN_COURS ou
// NON_COMMENCEE), l'épreuve est clôturée automatiquement.
//
// Ce worker garantit que les épreuves sont clôturées même sans étudiant
// actif pollant /api/epreuves/auto-close.
package worker

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/db"
)

// AutoCloseWorker vérifie périodiquement les épreuves à clôture automatique.
type AutoCloseWorker struct {
	dbPool *pgxpool.Pool
	logger *slog.Logger
}

// NewAutoCloseWorker crée un nouveau worker de clôture automatique.
func NewAutoCloseWorker(dbPool *pgxpool.Pool, logger *slog.Logger) *AutoCloseWorker {
	return &AutoCloseWorker{dbPool: dbPool, logger: logger}
}

// Start lance le worker en goroutine (non-bloquant).
// À appeler dans main.go avant le serveur HTTP.
func (w *AutoCloseWorker) Start(ctx context.Context) {
	w.logger.Info("AutoClose Worker started, checking every 60s...")

	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()

		// Premier check immédiat au démarrage (récupération des épreuves
		// expirées pendant que le serveur était down).
		w.checkAndClose(ctx)

		for {
			select {
			case <-ctx.Done():
				w.logger.Info("AutoClose Worker stopping...")
				return
			case <-ticker.C:
				w.checkAndClose(ctx)
			}
		}
	}()
}

// checkAndClose effectue les deux types de clôture automatique :
//  1. Délai dépassé : dateFin + delaiGrace < now
//  2. TOUS_SOUMIS : toutes les sessions sont SOUMISES/CORRIGEE/RETOURNEE
func (w *AutoCloseWorker) checkAndClose(ctx context.Context) {
	closedByTimeout, err := w.closeExpiredEpreuves(ctx)
	if err != nil {
		w.logger.Error("AutoClose: closeExpiredEpreuves failed", "error", err)
	}
	if closedByTimeout > 0 {
		w.logger.Info("AutoClose: epreuves clôturées (délai dépassé)", "count", closedByTimeout)
	}

	closedByAllSubmitted, err := w.closeAllSubmittedEpreuves(ctx)
	if err != nil {
		w.logger.Error("AutoClose: closeAllSubmittedEpreuves failed", "error", err)
	}
	if closedByAllSubmitted > 0 {
		w.logger.Info("AutoClose: epreuves clôturées (tous soumis)", "count", closedByAllSubmitted)
	}
}

// closeExpiredEpreuves clôture les épreuves EN_COURS dont dateFin + grâce < now.
func (w *AutoCloseWorker) closeExpiredEpreuves(ctx context.Context) (int, error) {
	tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Poser les claims system-worker pour RLS (policies Epreuve_all_system).
	if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
		return 0, fmt.Errorf("set claims: %w", err)
	}

	now := time.Now().UTC()

	// Clôturer toutes les épreuves EN_COURS ou TERMINEE dont
	// dateFin + delaiGrace < now.
	cmd, err := tx.Exec(ctx, `
                UPDATE "Epreuve"
                SET "statut" = 'CLOTUREE',
                    "clotureeAt" = $1,
                    "clotureeAutomatiquement" = true,
                    "raisonCloture" = 'Délai dépassé (fin de période + grâce)',
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "statut" IN ('EN_COURS', 'TERMINEE')
                  AND "deletedAt" IS NULL
                  AND "dateFin" IS NOT NULL
                  AND ("dateFin" + make_interval(mins => COALESCE("delaiGrace", 0))) < $1
        `, now)
	if err != nil {
		return 0, fmt.Errorf("update expired epreuves: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}

	closedCount := int(cmd.RowsAffected())
	if closedCount > 0 {
		// SECT-ALERTES-FIX-1 P5 : créer une Alerte SYSTEME + notifier l'enseignant
		// pour chaque épreuve clôturée automatiquement. Non bloquant.
		w.createAutoCloseAlertes(ctx, now)
	}

	return closedCount, nil
}

// closeAllSubmittedEpreuves clôture les épreuves EN_COURS où toutes les
// sessions sont SOUMISES, CORRIGEE ou RETOURNEE (plus aucune EN_COURS ou
// NON_COMMENCEE). Nécessite au moins 1 session pour déclencher.
func (w *AutoCloseWorker) closeAllSubmittedEpreuves(ctx context.Context) (int, error) {
	tx, err := w.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := db.SetClaimsTx(ctx, tx, db.SystemClaims()); err != nil {
		return 0, fmt.Errorf("set claims: %w", err)
	}

	now := time.Now().UTC()

	// Trouver les épreuves EN_COURS qui ont au moins 1 session ET où
	// aucune session n'est EN_COURS ou NON_COMMENCEE.
	rows, err := tx.Query(ctx, `
                SELECT e."id", e."titre"
                FROM "Epreuve" e
                WHERE e."statut" = 'EN_COURS'
                  AND e."deletedAt" IS NULL
                  AND EXISTS (SELECT 1 FROM "SessionPassation" s WHERE s."epreuveId" = e."id")
                  AND NOT EXISTS (
                    SELECT 1 FROM "SessionPassation" s
                    WHERE s."epreuveId" = e."id"
                      AND s."statut" IN ('EN_COURS', 'NON_COMMENCEE')
                  )
        `)
	if err != nil {
		return 0, fmt.Errorf("query all-submitted epreuves: %w", err)
	}

	var epreuveIDs []string
	var titres []string
	for rows.Next() {
		var id, titre string
		if err := rows.Scan(&id, &titre); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan: %w", err)
		}
		epreuveIDs = append(epreuveIDs, id)
		titres = append(titres, titre)
	}
	rows.Close()

	if len(epreuveIDs) == 0 {
		if err := tx.Commit(ctx); err != nil {
			return 0, fmt.Errorf("commit (no rows): %w", err)
		}
		return 0, nil
	}

	// Clôturer ces épreuves
	cmd, err := tx.Exec(ctx, `
                UPDATE "Epreuve"
                SET "statut" = 'CLOTUREE',
                    "clotureeAt" = $1,
                    "clotureeAutomatiquement" = true,
                    "raisonCloture" = 'TOUS_SOUMIS',
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = ANY($2::text[])
                  AND "statut" = 'EN_COURS'
        `, now, epreuveIDs)
	if err != nil {
		return 0, fmt.Errorf("update all-submitted epreuves: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}

	for i, titre := range titres {
		w.logger.Info("AutoClose: TOUS_SOUMIS", "epreuveId", epreuveIDs[i], "titre", titre)
	}

	return int(cmd.RowsAffected()), nil
}

// createAutoCloseAlertes crée une Alerte SYSTEME pour chaque épreuve clôturée
// automatiquement + notifie l'enseignant propriétaire. Non bloquant.
// SECT-ALERTES-FIX-1 P5.
func (w *AutoCloseWorker) createAutoCloseAlertes(ctx context.Context, closeTime time.Time) {
	// Récupérer les épreuves clôturées automatiquement à ce tick (clotureeAt ≈ closeTime)
	// RLS-ACTUAL-SWITCH-1 : lecture via claims système (Epreuve_all_system) —
	// collecte en tx courte. SECT-DEBTS-FIX-1 : l'INSERT Alerte passe aussi en
	// tx système (la policy Alerte_insert_system exige désormais is_system())
	// et fournit "updatedAt" (colonne NOT NULL sans default à l'origine :
	// l'ancien INSERT l'omettait → échec silencieux, les alertes
	// d'auto-clôture ne persistaient jamais).
	type closedEpreuve struct {
		epreuveID, titre, enseignantID string
	}
	var epreuves []closedEpreuve
	err := db.WithSystemTx(ctx, w.dbPool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                SELECT e."id", e."titre", e."enseignantId", e."filiereId"
                FROM "Epreuve" e
                WHERE e."statut" = 'CLOTUREE'
                  AND e."clotureeAutomatiquement" = true
                  AND e."clotureeAt" IS NOT NULL
                  AND e."clotureeAt" >= $1
        `, closeTime.Add(-5*time.Second))
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var ce closedEpreuve
			var filiereID *string
			if err := rows.Scan(&ce.epreuveID, &ce.titre, &ce.enseignantID, &filiereID); err != nil {
				continue
			}
			epreuves = append(epreuves, ce)
		}
		return rows.Err()
	})
	if err != nil {
		w.logger.Warn("createAutoCloseAlertes: query failed", "error", err)
		return
	}

	for _, ce := range epreuves {
		epreuveID, titre, enseignantID := ce.epreuveID, ce.titre, ce.enseignantID

		// INSERT Alerte SYSTEME en tx système (claims posés par WithSystemTx).
		// SECT-DEBTS-FIX-1 : "updatedAt" fourni explicitement (NOT NULL) et
		// erreur loggée — l'ancien code jetait l'erreur (`_, _ =`) tout en
		// loggant « créée » quoi qu'il arrive.
		alerteID := uuid.NewString()
		description := fmt.Sprintf("L'épreuve « %s » a été clôturée automatiquement (délai dépassé).", titre)
		if err := db.WithSystemTx(ctx, w.dbPool, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx, `
                        INSERT INTO "Alerte" ("id", "titre", "description", "severity", "type", "epreuveId", "userId", "lue", "resolu", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, 'INFO', 'SYSTEME', $4, $5, false, false, NOW(), NOW())`,
				alerteID,
				"Épreuve clôturée automatiquement",
				description,
				epreuveID, enseignantID)
			return err
		}); err != nil {
			w.logger.Error("AutoClose: échec création alerte SYSTEME",
				"epreuveId", epreuveID, "enseignantId", enseignantID, "error", err)
			continue
		}

		w.logger.Info("AutoClose: alerte SYSTEME créée", "epreuveId", epreuveID, "enseignantId", enseignantID)
	}
}
