// Package repository — implémentation OuvragePropositionRepository
// (ADR-0008 §2, bibliothèque P4 : file G1 RESPONSABLE→ADMIN).
//
// RLS : policies OuvrageProposition_* (000127) — le proposant voit ses
// propositions, l'ADMIN voit tout ; insert RESPONSABLE de son etab ;
// update (tranche) ADMIN ; delete ADMIN ∨ proposant EN_ATTENTE.
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// OuvragePropositionRepository implémente domain.OuvragePropositionRepository.
type OuvragePropositionRepository struct {
	pool *pgxpool.Pool
}

// NewOuvragePropositionRepository crée un nouveau OuvragePropositionRepository.
func NewOuvragePropositionRepository(pool *pgxpool.Pool) *OuvragePropositionRepository {
	return &OuvragePropositionRepository{pool: pool}
}

// scanOuvrageProposition scanne une ligne (proposant + ouvrage lié
// hydratés par JOIN — LEFT JOIN Ouvrage : la proposition survit à la
// purge de l'ouvrage, ouvrageId SET NULL).
func scanOuvrageProposition(s scanner, p *domain.OuvrageProposition) error {
	return s.Scan(
		&p.ID, &p.EtablissementID, &p.ProposantID, &p.ProposantNom,
		&p.Titre, &p.Auteurs, &p.Categorie, &p.Editeur, &p.AnneePublication,
		&p.ISBN, &p.Langue, &p.FiliereID, &p.Niveau, &p.Themes, &p.Description,
		&p.LicenceOrigine, &p.Statut, &p.MotifRefus, &p.TrancheParID,
		&p.TrancheAt, &p.OuvrageID, &p.OuvrageTitre, &p.CreatedAt, &p.UpdatedAt,
	)
}

const ouvragePropositionSelect = `
        SELECT p."id", p."etablissementId", p."proposantId", u."name",
               p."titre", p."auteurs", p."categorie", p."editeur", p."anneePublication",
               p."isbn", p."langue", p."filiereId", p."niveau"::text, p."themes", p."description",
               p."licenceOrigine", p."statut"::text, p."motifRefus", p."trancheParId",
               p."trancheAt", p."ouvrageId", o."titre", p."createdAt", p."updatedAt"
        FROM "OuvrageProposition" p
        JOIN "User" u ON u."id" = p."proposantId"
        LEFT JOIN "Ouvrage" o ON o."id" = p."ouvrageId"`

// normalizePropositionPagination — page ≥ 1, limit 1..100 défaut 20
// (pattern ouvrage.go).
func normalizePropositionPagination(params *domain.PropositionListParams) {
	if params.Page < 1 {
		params.Page = 1
	}
	if params.Limit < 1 {
		params.Limit = 20
	}
	if params.Limit > 100 {
		params.Limit = 100
	}
}

// List — la file (scoping RLS : l'ADMIN voit tout, le RESPONSABLE voit
// ses propositions). Tri : EN_ATTENTE d'abord, puis plus récentes.
func (r *OuvragePropositionRepository) List(ctx context.Context, params domain.PropositionListParams) (*domain.PropositionListResult, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("List propositions: claims manquants dans le context")
	}
	normalizePropositionPagination(&params)
	result := &domain.PropositionListResult{
		Propositions: []domain.OuvrageProposition{},
		Page:         params.Page,
		Limit:        params.Limit,
	}
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		where := ` WHERE 1=1`
		args := []any{}
		if params.Statut != "" {
			args = append(args, params.Statut)
			where += fmt.Sprintf(` AND p."statut" = $%d`, len(args))
		}
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM "OuvrageProposition" p`+where, args...).Scan(&result.Total); err != nil {
			return fmt.Errorf("count propositions: %w", err)
		}
		query := ouvragePropositionSelect + where +
			` ORDER BY (p."statut" = 'EN_ATTENTE') DESC, p."createdAt" DESC`
		args = append(args, params.Limit, (params.Page-1)*params.Limit)
		query += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(args)-1, len(args))
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("query propositions: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var p domain.OuvrageProposition
			if err := scanOuvrageProposition(rows, &p); err != nil {
				return fmt.Errorf("scan proposition: %w", err)
			}
			result.Propositions = append(result.Propositions, p)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// FindByID — 0 ligne (absente OU invisible RLS) → NotFoundError.
func (r *OuvragePropositionRepository) FindByID(ctx context.Context, id string) (*domain.OuvrageProposition, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("FindByID proposition: claims manquants dans le context")
	}
	var out *domain.OuvrageProposition
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, ouvragePropositionSelect+` WHERE p."id" = $1`, id)
		var p domain.OuvrageProposition
		if err := scanOuvrageProposition(row, &p); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return &domain.NotFoundError{Entity: "proposition", ID: id}
			}
			return fmt.Errorf("scan proposition: %w", err)
		}
		out = &p
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Create — INSERT (RLS WITH CHECK : RESPONSABLE, son etab).
func (r *OuvragePropositionRepository) Create(ctx context.Context, input domain.CreatePropositionInput) (*domain.OuvrageProposition, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("Create proposition: claims manquants dans le context")
	}
	id := uuid.NewString()
	var out *domain.OuvrageProposition
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
                        INSERT INTO "OuvrageProposition"
                                ("id", "etablissementId", "proposantId", "titre", "auteurs", "categorie",
                                 "editeur", "anneePublication", "isbn", "langue", "filiereId", "niveau",
                                 "themes", "description", "licenceOrigine", "statut", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                                'EN_ATTENTE', now(), now())
                        RETURNING "id", "etablissementId", "proposantId",
                                (SELECT "name" FROM "User" WHERE "id" = $3),
                                "titre", "auteurs", "categorie", "editeur", "anneePublication",
                                "isbn", "langue", "filiereId", "niveau"::text, "themes", "description",
                                "licenceOrigine", "statut"::text, "motifRefus", "trancheParId",
                                "trancheAt", "ouvrageId", NULL, "createdAt", "updatedAt"`,
			id, input.EtablissementID, input.ProposantID, input.Titre, input.Auteurs,
			input.Categorie, input.Editeur, input.AnneePublication, input.ISBN,
			input.Langue, input.FiliereID, input.Niveau, input.Themes,
			input.Description, input.LicenceOrigine)
		var p domain.OuvrageProposition
		if err := scanOuvrageProposition(row, &p); err != nil {
			return fmt.Errorf("scan proposition créée: %w", err)
		}
		out = &p
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// Trancher — transition EN_ATTENTE → statut final (ADMIN, RLS UPDATE).
// Déjà tranchée → ConflictError (garde WHERE statut = 'EN_ATTENTE').
func (r *OuvragePropositionRepository) Trancher(ctx context.Context, id string, statut domain.StatutProposition, motifRefus *string, trancheParID string) (*domain.OuvrageProposition, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("Trancher proposition: claims manquants dans le context")
	}
	var out *domain.OuvrageProposition
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
                        UPDATE "OuvrageProposition"
                        SET "statut" = $2, "motifRefus" = $3, "trancheParId" = $4,
                            "trancheAt" = now(), "updatedAt" = now()
                        WHERE "id" = $1 AND "statut" = 'EN_ATTENTE'
                        RETURNING "id", "etablissementId", "proposantId",
                                (SELECT "name" FROM "User" WHERE "id" = "OuvrageProposition"."proposantId"),
                                "titre", "auteurs", "categorie", "editeur", "anneePublication",
                                "isbn", "langue", "filiereId", "niveau"::text, "themes", "description",
                                "licenceOrigine", "statut"::text, "motifRefus", "trancheParId",
                                "trancheAt", "ouvrageId", NULL, "createdAt", "updatedAt"`,
			id, statut, motifRefus, trancheParID)
		var p domain.OuvrageProposition
		if err := scanOuvrageProposition(row, &p); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// Déjà tranchée OU invisible (RLS). On distingue via un
				// second SELECT : visible+tranchée → 409 ; invisible → 404.
				var s string
				err2 := tx.QueryRow(ctx, `SELECT "statut"::text FROM "OuvrageProposition" WHERE "id" = $1`, id).Scan(&s)
				if err2 != nil {
					return &domain.NotFoundError{Entity: "proposition", ID: id}
				}
				return &domain.ConflictError{Message: "proposition déjà tranchée (" + s + ")"}
			}
			return fmt.Errorf("scan proposition tranchée: %w", err)
		}
		out = &p
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// LinkOuvrage — pose ouvrageId sur une proposition ACCEPTEE (le dépôt
// ADMIN via POST /api/ouvrages?propositionId=…). Refuse silencieusement
// les non-ACCEPTEE (garde WHERE) → NotFoundError pour l'appelant.
func (r *OuvragePropositionRepository) LinkOuvrage(ctx context.Context, id, ouvrageID string) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return fmt.Errorf("LinkOuvrage: claims manquants dans le context")
	}
	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx, `
                        UPDATE "OuvrageProposition"
                        SET "ouvrageId" = $2, "updatedAt" = now()
                        WHERE "id" = $1 AND "statut" = 'ACCEPTEE'`,
			id, ouvrageID)
		if err != nil {
			return fmt.Errorf("link proposition: %w", err)
		}
		if ct.RowsAffected() == 0 {
			var s string
			err2 := tx.QueryRow(ctx, `SELECT "statut"::text FROM "OuvrageProposition" WHERE "id" = $1`, id).Scan(&s)
			if err2 != nil {
				return &domain.NotFoundError{Entity: "proposition", ID: id}
			}
			return &domain.ConflictError{Message: "la proposition doit être ACCEPTEE avant le dépôt (statut actuel : " + s + ")"}
		}
		return nil
	})
}

// Delete — ADMIN ∨ proposant EN_ATTENTE (RLS DELETE ; 0 ligne →
// NotFoundError ou ConflictError selon la visibilité/statut).
func (r *OuvragePropositionRepository) Delete(ctx context.Context, id string) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return fmt.Errorf("Delete proposition: claims manquants dans le context")
	}
	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx, `
                        DELETE FROM "OuvrageProposition"
                        WHERE "id" = $1
                          AND ("statut" = 'EN_ATTENTE' OR is_admin())`,
			id)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) {
				return fmt.Errorf("delete proposition: %s", pgErr.Message)
			}
			return fmt.Errorf("delete proposition: %w", err)
		}
		if ct.RowsAffected() == 0 {
			var s string
			err2 := tx.QueryRow(ctx, `SELECT "statut"::text FROM "OuvrageProposition" WHERE "id" = $1`, id).Scan(&s)
			if err2 != nil {
				return &domain.NotFoundError{Entity: "proposition", ID: id}
			}
			return &domain.ConflictError{Message: "retrait possible uniquement en EN_ATTENTE (statut actuel : " + s + ")"}
		}
		return nil
	})
}
