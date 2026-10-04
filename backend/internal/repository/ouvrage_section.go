// Package repository — implémentation OuvrageSectionRepository (ADR-0007
// §P3, migration 000126). G1 : mutations ADMIN (policies 000126) ; lecture
// etab-scopée par délégation à Ouvrage_select (EXISTS parent).
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

// OuvrageSectionRepository implémente domain.OuvrageSectionRepository.
type OuvrageSectionRepository struct {
	pool *pgxpool.Pool
}

// NewOuvrageSectionRepository crée un nouveau OuvrageSectionRepository.
func NewOuvrageSectionRepository(pool *pgxpool.Pool) *OuvrageSectionRepository {
	return &OuvrageSectionRepository{pool: pool}
}

// columnsOuvrageSection — préfixée s. pour les SELECT avec alias ;
// columnsOuvrageSectionBare (leçon RETURNING bare, SECT-BIBLIO-P1) pour
// les RETURNING d'INSERT/UPDATE.
const columnsOuvrageSection = `s."id", s."ouvrageId", s."titre", s."pageDebut", s."pageFin", s."ordre", s."createdAt"`

var columnsOuvrageSectionBare = `"id", "ouvrageId", "titre", "pageDebut", "pageFin", "ordre", "createdAt"`

func scanOuvrageSection(s scanner) (*domain.OuvrageSection, error) {
	sec := &domain.OuvrageSection{}
	if err := s.Scan(&sec.ID, &sec.OuvrageID, &sec.Titre, &sec.PageDebut, &sec.PageFin, &sec.Ordre, &sec.CreatedAt); err != nil {
		return nil, err
	}
	return sec, nil
}

// mapSectionWriteError — RLS évalué AVANT les contraintes sur INSERT
// (leçon 000124) : un ouvrage invisible produit 42501 (pas 23503) ;
// l'ADMIN voit tout, donc 23503 = ouvrage réellement inexistant.
func mapSectionWriteError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23503":
			return &domain.ValidationError{Field: "ouvrageId", Message: "ouvrage introuvable"}
		case "42501":
			return &domain.NotFoundError{Entity: "Ouvrage", ID: "section"}
		}
	}
	return err
}

// ListByOuvrage — TOC ordonné (RLS : etab-scoped via parent Ouvrage).
func (r *OuvrageSectionRepository) ListByOuvrage(ctx context.Context, ouvrageID string) ([]*domain.OuvrageSection, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("ListByOuvrage: claims manquants dans le context")
	}

	var result []*domain.OuvrageSection
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, fmt.Sprintf(`
			SELECT %s
			FROM "OuvrageSection" s
			WHERE s."ouvrageId" = $1
			ORDER BY s."ordre" ASC, s."createdAt" ASC
		`, columnsOuvrageSection), ouvrageID)
		if err != nil {
			return fmt.Errorf("query ouvrage sections: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			sec, err := scanOuvrageSection(rows)
			if err != nil {
				return fmt.Errorf("scan ouvrage section: %w", err)
			}
			result = append(result, sec)
		}
		if result == nil {
			result = []*domain.OuvrageSection{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// FindByID — une section (RLS).
func (r *OuvrageSectionRepository) FindByID(ctx context.Context, id string) (*domain.OuvrageSection, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("FindByID: claims manquants dans le context")
	}

	var sec *domain.OuvrageSection
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(`
			SELECT %s FROM "OuvrageSection" s WHERE s."id" = $1
		`, columnsOuvrageSection), id)
		out, err := scanOuvrageSection(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "OuvrageSection", ID: id}
			}
			return fmt.Errorf("query ouvrage section: %w", err)
		}
		sec = out
		return nil
	})
	if err != nil {
		return nil, err
	}
	return sec, nil
}

// Create — ADMIN (G1). Validation pages : debut ≤ fin quand les deux.
func (r *OuvrageSectionRepository) Create(ctx context.Context, input domain.CreateOuvrageSectionInput) (*domain.OuvrageSection, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("Create: claims manquants dans le context")
	}

	var sec *domain.OuvrageSection
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		id := uuid.NewString()
		row := tx.QueryRow(ctx, fmt.Sprintf(`
			INSERT INTO "OuvrageSection" ("id", "ouvrageId", "titre", "pageDebut", "pageFin", "ordre", "createdAt")
			VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
			RETURNING %s
		`, columnsOuvrageSectionBare),
			id, input.OuvrageID, input.Titre, nullableIntPtr(input.PageDebut), nullableIntPtr(input.PageFin), input.Ordre)

		out, err := scanOuvrageSection(row)
		if err != nil {
			return mapSectionWriteError(fmt.Errorf("create ouvrage section: %w", err))
		}
		sec = out
		return nil
	})
	if err != nil {
		return nil, err
	}
	return sec, nil
}

// Update — PATCH tri-state (ADMIN). Aucun champ → no-op SELECT (pattern
// question.go Update : renvoie l'état courant sans UPDATE).
func (r *OuvrageSectionRepository) Update(ctx context.Context, id string, input domain.UpdateOuvrageSectionInput) (*domain.OuvrageSection, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("Update: claims manquants dans le context")
	}

	var sec *domain.OuvrageSection
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var setClauses []string
		var args []any
		argIdx := 1

		addSet := func(col string, val any) {
			setClauses = append(setClauses, fmt.Sprintf(`"%s" = $%d`, col, argIdx))
			args = append(args, val)
			argIdx++
		}

		if input.Titre != nil {
			addSet("titre", *input.Titre)
		}
		if input.UnsetPageDebut {
			addSet("pageDebut", nil)
		} else if input.PageDebut != nil {
			addSet("pageDebut", *input.PageDebut)
		}
		if input.UnsetPageFin {
			addSet("pageFin", nil)
		} else if input.PageFin != nil {
			addSet("pageFin", *input.PageFin)
		}
		if input.Ordre != nil {
			addSet("ordre", *input.Ordre)
		}

		if len(setClauses) == 0 {
			row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "OuvrageSection" s WHERE s."id" = $1`, columnsOuvrageSection), id)
			out, err := scanOuvrageSection(row)
			if err != nil {
				if err == pgx.ErrNoRows {
					return &domain.NotFoundError{Entity: "OuvrageSection", ID: id}
				}
				return err
			}
			sec = out
			return nil
		}

		args = append(args, id)
		updateSQL := fmt.Sprintf(`UPDATE "OuvrageSection" SET %s WHERE "id" = $%d RETURNING %s`,
			strings.Join(setClauses, ", "), argIdx, columnsOuvrageSectionBare)

		row := tx.QueryRow(ctx, updateSQL, args...)
		out, err := scanOuvrageSection(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "OuvrageSection", ID: id}
			}
			return fmt.Errorf("update ouvrage section: %w", err)
		}
		sec = out
		return nil
	})
	if err != nil {
		return nil, err
	}
	return sec, nil
}

// Delete — DELETE réel (ADMIN ; alignements préservés via ON DELETE SET
// NULL). RLS refusé = 0 ligne SILENCIEUSE (leçon 000124) → NotFound.
func (r *OuvrageSectionRepository) Delete(ctx context.Context, id string) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return fmt.Errorf("Delete: claims manquants dans le context")
	}

	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `DELETE FROM "OuvrageSection" WHERE "id" = $1`, id)
		if err != nil {
			return fmt.Errorf("delete ouvrage section: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return &domain.NotFoundError{Entity: "OuvrageSection", ID: id}
		}
		return nil
	})
}
