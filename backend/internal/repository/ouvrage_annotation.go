// Package repository — implémentation OuvrageAnnotationRepository
// (ADR-0008 §1, bibliothèque P4 : annotations de page).
//
// RLS : toutes les méthodes passent par db.WithTx avec les claims du
// context (pattern ouvrage_lecture.go). Les policies
// OuvrageAnnotation_* (000127) font le scope : visibilité
// PRIVEE/FILIERE/ETABLISSEMENT + ouvrage visible (délégation EXISTS aux
// conditions de Ouvrage_select) ; update/delete propriétaire seul.
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// OuvrageAnnotationRepository implémente domain.OuvrageAnnotationRepository.
type OuvrageAnnotationRepository struct {
	pool *pgxpool.Pool
}

// NewOuvrageAnnotationRepository crée un nouveau OuvrageAnnotationRepository.
func NewOuvrageAnnotationRepository(pool *pgxpool.Pool) *OuvrageAnnotationRepository {
	return &OuvrageAnnotationRepository{pool: pool}
}

// scanOuvrageAnnotation scanne une ligne. Le nom de l'auteur est
// hydraté par le helper SECURITY DEFINER user_display_name (000129) :
// un JOIN "User" hériterait de la RLS User_select (un enseignant sans
// EnseignerFiliere ne voit pas les étudiants → lignes DROPPÉES ; un
// ADMIN global ne voit que ses etabs → nom NULL) — leçon P3 valable
// pour les queries des repos autant que pour les policies.
func scanOuvrageAnnotation(s scanner, a *domain.OuvrageAnnotation) error {
	return s.Scan(
		&a.ID, &a.OuvrageID, &a.UserID, &a.UserNom, &a.FiliereID,
		&a.Page, &a.Contenu, &a.Visibilite, &a.CreatedAt, &a.UpdatedAt,
	)
}

const ouvrageAnnotationSelect = `
	SELECT a."id", a."ouvrageId", a."userId", user_display_name(a."userId"), a."filiereId",
	       a."page", a."contenu", a."visibilite"::text, a."createdAt", a."updatedAt"
	FROM "OuvrageAnnotation" a`

// ListByOuvrage — annotations visibles de l'appelant, triées par page
// puis date (le panneau UI groupe par page). page > 0 filtre sur la page.
func (r *OuvrageAnnotationRepository) ListByOuvrage(ctx context.Context, ouvrageID string, page int) ([]domain.OuvrageAnnotation, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("ListByOuvrage: claims manquants dans le context")
	}
	out := []domain.OuvrageAnnotation{}
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		query := ouvrageAnnotationSelect + `
			WHERE a."ouvrageId" = $1`
		args := []any{ouvrageID}
		if page > 0 {
			query += ` AND a."page" = $2`
			args = append(args, page)
		}
		query += ` ORDER BY a."page" ASC, a."createdAt" ASC LIMIT 500`
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("query annotations: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var a domain.OuvrageAnnotation
			if err := scanOuvrageAnnotation(rows, &a); err != nil {
				return fmt.Errorf("scan annotation: %w", err)
			}
			out = append(out, a)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Create — INSERT (RLS WITH CHECK : propriétaire + ouvrage visible ; un
// ouvrage invisible → 42501 mappé 404 par le usecase pré-check).
func (r *OuvrageAnnotationRepository) Create(ctx context.Context, input domain.CreateAnnotationInput) (*domain.OuvrageAnnotation, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("Create annotation: claims manquants dans le context")
	}
	var out *domain.OuvrageAnnotation
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			INSERT INTO "OuvrageAnnotation"
				("id", "ouvrageId", "userId", "filiereId", "page", "contenu", "visibilite", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
			RETURNING "id", "ouvrageId", "userId", user_display_name($3),
				"filiereId", "page", "contenu", "visibilite"::text, "createdAt", "updatedAt"`,
			uuid.NewString(), input.OuvrageID, input.UserID, input.FiliereID,
			input.Page, input.Contenu, input.Visibilite)
		var a domain.OuvrageAnnotation
		if err := scanOuvrageAnnotation(row, &a); err != nil {
			return fmt.Errorf("scan annotation créée: %w", err)
		}
		out = &a
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Update — PATCH propriétaire (RLS UPDATE : 0 ligne = refusé ou absent).
func (r *OuvrageAnnotationRepository) Update(ctx context.Context, annotationID string, input domain.UpdateAnnotationInput) (*domain.OuvrageAnnotation, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("Update annotation: claims manquants dans le context")
	}
	var out *domain.OuvrageAnnotation
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		set := ` "updatedAt" = now()`
		args := []any{annotationID}
		if input.Contenu != nil {
			args = append(args, *input.Contenu)
			set += fmt.Sprintf(", \"contenu\" = $%d", len(args))
		}
		if input.Visibilite != nil {
			args = append(args, *input.Visibilite)
			set += fmt.Sprintf(", \"visibilite\" = $%d", len(args))
		}
		row := tx.QueryRow(ctx, `
			UPDATE "OuvrageAnnotation" SET `+set+`
			WHERE "id" = $1
			RETURNING "id", "ouvrageId", "userId", user_display_name("userId"),
				"filiereId", "page", "contenu", "visibilite"::text, "createdAt", "updatedAt"`,
			args...)
		var a domain.OuvrageAnnotation
		if err := scanOuvrageAnnotation(row, &a); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return &domain.NotFoundError{Entity: "annotation", ID: annotationID}
			}
			return fmt.Errorf("scan annotation modifiée: %w", err)
		}
		out = &a
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Delete — DELETE propriétaire (RLS DELETE : 0 ligne silencieuse →
// NotFoundError, leçon P2 : capturer le rowcount immédiatement).
func (r *OuvrageAnnotationRepository) Delete(ctx context.Context, annotationID string) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return fmt.Errorf("Delete annotation: claims manquants dans le context")
	}
	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx, `DELETE FROM "OuvrageAnnotation" WHERE "id" = $1`, annotationID)
		if err != nil {
			return fmt.Errorf("delete annotation: %w", err)
		}
		if ct.RowsAffected() == 0 {
			return &domain.NotFoundError{Entity: "annotation", ID: annotationID}
		}
		return nil
	})
}
