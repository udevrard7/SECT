// Package repository — implémentation OuvrageVeilleRepository
// (ADR-0008 §4, bibliothèque P4 : veille thématique).
//
// RLS : policies OuvrageVeille_* (000127) — propriétaire seul, sauf
// select qui accepte is_system() : le matching au dépôt tourne sous
// claims SYSTEM (l'ADMIN déposant ne voit pas les veilles des lecteurs).
package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// OuvrageVeilleRepository implémente domain.OuvrageVeilleRepository.
type OuvrageVeilleRepository struct {
	pool *pgxpool.Pool
}

// NewOuvrageVeilleRepository crée un nouveau OuvrageVeilleRepository.
func NewOuvrageVeilleRepository(pool *pgxpool.Pool) *OuvrageVeilleRepository {
	return &OuvrageVeilleRepository{pool: pool}
}

const columnsOuvrageVeille = `v."id", v."userId", v."etablissementId", v."terme", v."categorie", v."createdAt", v."updatedAt"`

func scanOuvrageVeille(s scanner, v *domain.OuvrageVeille) error {
	return s.Scan(&v.ID, &v.UserID, &v.EtablissementID, &v.Terme, &v.Categorie, &v.CreatedAt, &v.UpdatedAt)
}

// ListByUser — les veilles de l'appelant, plus récentes d'abord.
func (r *OuvrageVeilleRepository) ListByUser(ctx context.Context, userID string) ([]domain.OuvrageVeille, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("ListByUser veilles: claims manquants dans le context")
	}
	var out []domain.OuvrageVeille
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT `+columnsOuvrageVeille+`
			FROM "OuvrageVeille" v
			WHERE v."userId" = $1
			ORDER BY v."createdAt" DESC
			LIMIT 100`, userID)
		if err != nil {
			return fmt.Errorf("query veilles: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var v domain.OuvrageVeille
			if err := scanOuvrageVeille(rows, &v); err != nil {
				return fmt.Errorf("scan veille: %w", err)
			}
			out = append(out, v)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Create — INSERT ; UNIQUE(userId, terme) → ConflictError (23505).
func (r *OuvrageVeilleRepository) Create(ctx context.Context, input domain.CreateVeilleInput) (*domain.OuvrageVeille, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("Create veille: claims manquants dans le context")
	}
	var out *domain.OuvrageVeille
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			INSERT INTO "OuvrageVeille" ("id", "userId", "etablissementId", "terme", "categorie", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, now(), now())
			RETURNING `+columnsOuvrageVeille,
			uuid.NewString(), input.UserID, input.EtablissementID, input.Terme, input.Categorie)
		var v domain.OuvrageVeille
		if err := scanOuvrageVeille(row, &v); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				return &domain.ConflictError{Message: "vous avez déjà une alerte pour ce terme"}
			}
			return fmt.Errorf("scan veille créée: %w", err)
		}
		out = &v
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Delete — propriétaire (RLS) ; 0 ligne → NotFoundError.
func (r *OuvrageVeilleRepository) Delete(ctx context.Context, id, userID string) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return fmt.Errorf("Delete veille: claims manquants dans le context")
	}
	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx, `DELETE FROM "OuvrageVeille" WHERE "id" = $1 AND "userId" = $2`, id, userID)
		if err != nil {
			return fmt.Errorf("delete veille: %w", err)
		}
		if ct.RowsAffected() == 0 {
			return &domain.NotFoundError{Entity: "veille", ID: id}
		}
		return nil
	})
}

// MatchingAbonnes — les veilles de l'établissement dont le terme matche
// l'ouvrage déposé (ILIKE sur titre/auteurs/themes/description — la
// MÊME surface que la recherche catalogue, q étendu à themes en P4) et
// dont la catégorie (si posée) correspond.
//
// S'exécute sous claims SYSTEM : WithSystemTx pose les claims
// system-worker → la policy OuvrageVeille_select (is_system) laisse
// passer la lecture des veilles de tous les lecteurs de l'étab.
func (r *OuvrageVeilleRepository) MatchingAbonnes(ctx context.Context, etablissementID string, o *domain.Ouvrage) ([]domain.OuvrageVeille, error) {
	var out []domain.OuvrageVeille
	err := db.WithSystemTx(ctx, r.pool, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT `+columnsOuvrageVeille+`
			FROM "OuvrageVeille" v
			WHERE v."etablissementId" = $1
			  AND v."userId" <> $2
			  AND (
				LOWER($3) LIKE '%' || LOWER(v."terme") || '%'
				OR LOWER(COALESCE($4, '')) LIKE '%' || LOWER(v."terme") || '%'
				OR LOWER(COALESCE($5, '')) LIKE '%' || LOWER(v."terme") || '%'
				OR LOWER(COALESCE($6, '')) LIKE '%' || LOWER(v."terme") || '%'
			  )
			  AND (v."categorie" IS NULL OR v."categorie" = $7)`,
			etablissementID, o.CreatedByID, o.Titre, deRef(o.Auteurs), deRef(o.Themes), deRef(o.Description), o.Categorie)
		if err != nil {
			return fmt.Errorf("query veilles matchantes: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var v domain.OuvrageVeille
			if err := scanOuvrageVeille(rows, &v); err != nil {
				return fmt.Errorf("scan veille matchante: %w", err)
			}
			out = append(out, v)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// deRef — dereference sûre d'un *string ("" si nil), pour les
// COALESCE du matching.
func deRef(s *string) string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(*s)
}
