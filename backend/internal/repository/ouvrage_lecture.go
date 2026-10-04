// Package repository — implémentation OuvrageLectureRepository
// (ADR-0007 P2 : lecture mesurée).
//
// RLS : toutes les méthodes passent par db.WithTx avec les claims du
// context (pattern ouvrage.go). Les policies OuvrageLecture_* (000124)
// font le scope : propriétaire uniquement + ouvrage visible (délégation
// EXISTS aux conditions de Ouvrage_select — corbeille/droits expirés
// exclus UNE seule fois).
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// OuvrageLectureRepository implémente domain.OuvrageLectureRepository.
type OuvrageLectureRepository struct {
	pool *pgxpool.Pool
}

// NewOuvrageLectureRepository crée un nouveau OuvrageLectureRepository.
func NewOuvrageLectureRepository(pool *pgxpool.Pool) *OuvrageLectureRepository {
	return &OuvrageLectureRepository{pool: pool}
}

const columnsOuvrageLecture = `l."id", l."ouvrageId", l."userId", l."dernierePage",
	l."pagesVues", l."tempsTotalSec", l."derniereLectureAt", l."createdAt", l."updatedAt"`

// columnsOuvrageLectureBare — sans préfixe d'alias, pour le RETURNING
// des INSERT sans alias (leçon P1 : o. dans un RETURNING d'INSERT sans
// FROM = 42601 missing FROM-clause entry → 500).
const columnsOuvrageLectureBare = `"id", "ouvrageId", "userId", "dernierePage",
	"pagesVues", "tempsTotalSec", "derniereLectureAt", "createdAt", "updatedAt"`

// scanOuvrageLecture scanne une ligne OuvrageLecture.
func scanOuvrageLecture(s scanner) (*domain.OuvrageLecture, error) {
	l := &domain.OuvrageLecture{}
	err := s.Scan(
		&l.ID, &l.OuvrageID, &l.UserID, &l.DernierePage,
		&l.PagesVues, &l.TempsTotalSec, &l.DerniereLectureAt,
		&l.CreatedAt, &l.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return l, nil
}

// parsePagesVues — tolérant : un JSON invalide (jamais produit par nos
// écritures sanitarisées, mais par prudence) repart à zéro au lieu
// d'échouer la requête (la télémétrie ne doit jamais casser la lecture).
func parsePagesVues(s string) map[string]int {
	var m map[string]int
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		return nil
	}
	return m
}

// mergePagesVues — fusion Go de l'existant et du delta (somme par
// page), bornée à MaxEntreesPagesVues entrées : au-delà, on garde les
// pages les plus hautes (les plus récentes d'un manuel) — déterministe.
func mergePagesVues(existing, delta map[string]int) map[string]int {
	merged := make(map[string]int, len(existing)+len(delta))
	for k, v := range existing {
		merged[k] = v
	}
	for k, v := range delta {
		merged[k] += v
	}
	if len(merged) <= domain.MaxEntreesPagesVues {
		return merged
	}
	keys := make([]string, 0, len(merged))
	for k := range merged {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		// les clés sont des numéros de page sanitarisés (entiers) —
		// comparer numériquement, pas lexicalement ("10" < "9").
		a, _ := strconv.Atoi(keys[i])
		b, _ := strconv.Atoi(keys[j])
		return a < b
	})
	trimmed := make(map[string]int, domain.MaxEntreesPagesVues)
	for _, k := range keys[len(keys)-domain.MaxEntreesPagesVues:] {
		trimmed[k] = merged[k]
	}
	return trimmed
}

// clampInt — borne inclusive [min, max].
func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// mapLectureWriteError — traduit les codes PG du chemin écriture en
// NotFoundError (404) : un ouvrage invisible (RLS 42501 — évaluée AVANT
// les contraintes, donc 42501 et non 23503), une référence inexistante
// (23503) ou une course de première insertion (23505 — deux onglets
// ouverts sur la même première lecture ; le heartbeat suivant passera
// par UPDATE) se présentent TOUS comme « ouvrage introuvable » pour le
// client. Ceinture ET bretelles : le cas nominal est déjà filtré par le
// SELECT FOR UPDATE, ces codes ne surviennent que dans les recoins.
func mapLectureWriteError(err error, ouvrageID string) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) &&
		(pgErr.Code == "42501" || pgErr.Code == "23503" || pgErr.Code == "23505") {
		return &domain.NotFoundError{Entity: "Ouvrage", ID: ouvrageID}
	}
	return err
}

// GetLecture — la progression de (ouvrage, utilisateur) ;
// (nil, nil) = première lecture (aucune ligne). L'auto-masquage est
// assuré par la policy OuvrageLecture_select (EXISTS → ouvrage
// invisible = aucune ligne), ET par le pré-check FindByID du usecase
// (un ouvrage invisible sans progression répond aussi 404 — pas de
// fiche d'existence via {"lecture": null}).
func (r *OuvrageLectureRepository) GetLecture(ctx context.Context, ouvrageID, userID string) (*domain.OuvrageLecture, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var out *domain.OuvrageLecture
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(`
			SELECT %s
			FROM "OuvrageLecture" l
			WHERE l."ouvrageId" = $1 AND l."userId" = $2`,
			columnsOuvrageLecture), ouvrageID, userID)
		l, err := scanOuvrageLecture(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return nil // première lecture — pas une erreur
			}
			return fmt.Errorf("query ouvrage lecture: %w", err)
		}
		out = l
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// UpsertLecture — read-modify-write sous SELECT FOR UPDATE :
//
//  1. SELECT ... FOR UPDATE de la ligne propriétaire (verrou : deux
//     onglets concurrents ne fusionnent pas en perte de données) ;
//  2. pas de ligne → INSERT (première lecture) ;
//  3. ligne existante → fusion pagesVues côté Go + cumul temps clampé,
//     puis UPDATE ... RETURNING.
//
// Le marque-page DernierePage n'est appliqué que s'il est fourni
// (marquage explicite) : un heartbeat de temps seul ne déplace pas la
// reprise — last-write-wins sur les marquages déclaratifs uniquement.
func (r *OuvrageLectureRepository) UpsertLecture(ctx context.Context, ouvrageID, userID string, input domain.RecordLectureInput) (*domain.OuvrageLecture, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("UpsertLecture: claims manquants dans le context")
	}

	var out *domain.OuvrageLecture
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var (
			existingID    string
			existingPage  int
			existingPages *string
			existingTemps int
		)
		err := tx.QueryRow(ctx, `
			SELECT "id", "dernierePage", "pagesVues", "tempsTotalSec"
			FROM "OuvrageLecture"
			WHERE "ouvrageId" = $1 AND "userId" = $2
			FOR UPDATE`, ouvrageID, userID,
		).Scan(&existingID, &existingPage, &existingPages, &existingTemps)

		if err == pgx.ErrNoRows {
			// Première lecture → INSERT. RLS (WITH CHECK) est évalué
			// AVANT les contraintes : un ouvrage invisible → 42501.
			var existing map[string]int
			if input.PagesVues != nil {
				existing = input.PagesVues
			}
			merged := mergePagesVues(nil, existing)
			pvJSON, mErr := json.Marshal(merged)
			if mErr != nil {
				return fmt.Errorf("marshal pagesVues: %w", mErr)
			}
			pvStr := string(pvJSON)
			derniere := 1
			if input.DernierePage != nil {
				derniere = clampInt(*input.DernierePage, 1, domain.MaxPageOuvrage)
			}
			temps := clampInt(input.TempsDeltaSec, 0, domain.MaxTempsTotalSec)

			row := tx.QueryRow(ctx, fmt.Sprintf(`
				INSERT INTO "OuvrageLecture" ("id", "ouvrageId", "userId", "dernierePage",
					"pagesVues", "tempsTotalSec", "derniereLectureAt", "createdAt", "updatedAt")
				VALUES ($1, $2, $3, $4, $5, $6,
					CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
				RETURNING %s`,
				columnsOuvrageLectureBare),
				uuid.NewString(), ouvrageID, userID, derniere,
				nullableStrPtr(&pvStr), temps)
			l, err := scanOuvrageLecture(row)
			if err != nil {
				return mapLectureWriteError(fmt.Errorf("insert ouvrage lecture: %w", err), ouvrageID)
			}
			out = l
			return nil
		}
		if err != nil {
			return fmt.Errorf("select for update ouvrage lecture: %w", err)
		}

		// Ligne existante → fusion côté Go puis UPDATE.
		var current map[string]int
		if existingPages != nil {
			current = parsePagesVues(*existingPages)
		}
		merged := mergePagesVues(current, input.PagesVues)
		pvJSON, mErr := json.Marshal(merged)
		if mErr != nil {
			return fmt.Errorf("marshal pagesVues: %w", mErr)
		}
		pvStr := string(pvJSON)
		newPage := existingPage
		if input.DernierePage != nil {
			newPage = clampInt(*input.DernierePage, 1, domain.MaxPageOuvrage)
		}
		newTemps := clampInt(existingTemps+input.TempsDeltaSec, 0, domain.MaxTempsTotalSec)

		row := tx.QueryRow(ctx, fmt.Sprintf(`
			UPDATE "OuvrageLecture" l
			SET "dernierePage" = $3, "pagesVues" = $4, "tempsTotalSec" = $5,
			    "derniereLectureAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
			WHERE l."id" = $1 AND l."ouvrageId" = $2
			RETURNING %s`,
			columnsOuvrageLecture),
			existingID, ouvrageID, newPage, nullableStrPtr(&pvStr), newTemps)
		l, err := scanOuvrageLecture(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				// L'ouvrage est devenu invisible entre le SELECT et
				// l'UPDATE (policy update) — 404, pas de 500.
				return &domain.NotFoundError{Entity: "Ouvrage", ID: ouvrageID}
			}
			return fmt.Errorf("update ouvrage lecture: %w", err)
		}
		out = l
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// ActiviteEtablissement — agrégats d'activité par ouvrage via la
// fonction SECURITY DEFINER bibliotheque_activite_etablissement
// (000124), exécutée SOUS les claims de l'appelant (SetClaimsTx) : la
// fonction ré-impose elle-même rôle ∈ (ENS, RESP, ADMIN) + cloisonne
// par établissement (un non-ADMIN ne voit que son établissement).
// Appelée sous claims utilisateur (pas system) — l'ADMIN global comme
// l'enseignant passent par le même chemin.
func (r *OuvrageLectureRepository) ActiviteEtablissement(ctx context.Context, etablissementID string) ([]domain.OuvrageActivite, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var out []domain.OuvrageActivite
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT ouvrage_id, titre, categorie, nb_lecteurs, pages_vues_total,
			       temps_total_sec, derniere_activite
			FROM public.bibliotheque_activite_etablissement($1)`,
			etablissementID)
		if err != nil {
			return fmt.Errorf("query bibliotheque activite: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var a domain.OuvrageActivite
			if err := rows.Scan(
				&a.OuvrageID, &a.Titre, &a.Categorie, &a.NbLecteurs,
				&a.PagesVuesTotal, &a.TempsTotalSec, &a.DerniereActivite,
			); err != nil {
				return fmt.Errorf("scan bibliotheque activite: %w", err)
			}
			out = append(out, a)
		}
		if out == nil {
			out = []domain.OuvrageActivite{}
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// SumTempsLectureByUser — secondes de lecture cumulées sur tous les
// ouvrages (badge « lecteur assidu », ADR-0008 §3). RLS self-only : le
// WHERE explicite est redondant avec la policy par défense en profondeur.
func (r *OuvrageLectureRepository) SumTempsLectureByUser(ctx context.Context, userID string) (int64, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return 0, fmt.Errorf("SumTempsLectureByUser: claims manquants dans le context")
	}
	var total int64
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT COALESCE(SUM("tempsTotalSec"), 0) FROM "OuvrageLecture" WHERE "userId" = $1`,
			userID).Scan(&total)
	})
	if err != nil {
		return 0, err
	}
	return total, nil
}
