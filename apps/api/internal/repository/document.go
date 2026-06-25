// Package repository — implémentation DocumentRepository.
package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/apps/api/internal/db"
	"github.com/udevrard7/sect/apps/api/internal/domain"
)

// DocumentRepository implémente domain.DocumentRepository.
type DocumentRepository struct {
	pool *pgxpool.Pool
}

// NewDocumentRepository crée un nouveau DocumentRepository.
func NewDocumentRepository(pool *pgxpool.Pool) *DocumentRepository {
	return &DocumentRepository{pool: pool}
}

const columnsDocument = `"id", "ownerId", "nomFichier", "cheminStockage", "tailleFichier",
	"typeMime", "statutAnalyse", "themesDetectes", "conceptsCles", "volumeEstime",
	"contenuTexte", "dateUpload", "createdAt", "updatedAt", "deletedAt",
	"erreurAnalyse", "resumeAnalyse", "uniteEnseignementId"`

func scanDocument(s scanner) (*domain.Document, error) {
	d := &domain.Document{}
	err := s.Scan(
		&d.ID, &d.OwnerID, &d.NomFichier, &d.CheminStockage, &d.TailleFichier,
		&d.TypeMime, &d.StatutAnalyse, &d.ThemesDetectes, &d.ConceptsCles, &d.VolumeEstime,
		&d.ContenuTexte, &d.DateUpload, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
		&d.ErreurAnalyse, &d.ResumeAnalyse, &d.UniteEnseignementID,
	)
	if err != nil {
		return nil, err
	}
	return d, nil
}

// FindByID récupère un document par ID (RLS actif, exclut deletedAt).
func (r *DocumentRepository) FindByID(ctx context.Context, id string) (*domain.Document, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var doc *domain.Document
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Document" WHERE "id" = $1 AND "deletedAt" IS NULL`, columnsDocument), id)
		d, err := scanDocument(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "Document", ID: id}
			}
			return fmt.Errorf("query document: %w", err)
		}
		doc = d
		return nil
	})
	if err != nil {
		return nil, err
	}
	return doc, nil
}

// ListByOwner liste les documents d'un utilisateur (RLS actif).
func (r *DocumentRepository) ListByOwner(ctx context.Context, ownerID string) ([]*domain.Document, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.Document
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		query := fmt.Sprintf(`SELECT %s FROM "Document" WHERE "ownerId" = $1 AND "deletedAt" IS NULL ORDER BY "dateUpload" DESC`, columnsDocument)
		rows, err := tx.Query(ctx, query, ownerID)
		if err != nil {
			return fmt.Errorf("query documents: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			d, err := scanDocument(rows)
			if err != nil {
				return fmt.Errorf("scan document: %w", err)
			}
			result = append(result, d)
		}
		if result == nil {
			result = []*domain.Document{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// Create crée un document (bypass RLS — owner = user courant).
func (r *DocumentRepository) Create(ctx context.Context, input domain.CreateDocumentInput) (*domain.Document, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	id := uuid.NewString()
	statut := input.StatutAnalyse
	if statut == "" {
		statut = domain.StatutAnalyseEnAttente
	}

	row := tx.QueryRow(ctx, `
		INSERT INTO "Document" ("id", "ownerId", "nomFichier", "cheminStockage", "tailleFichier",
			"typeMime", "statutAnalyse", "themesDetectes", "conceptsCles", "volumeEstime",
			"contenuTexte", "dateUpload", "createdAt", "updatedAt", "deletedAt",
			"erreurAnalyse", "resumeAnalyse", "uniteEnseignementId")
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NULL, $8,
			CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, $9, NULL, $10)
		RETURNING `+columnsDocument,
		id, input.OwnerID, input.NomFichier, input.CheminStockage,
		nullableIntPtr(input.TailleFichier), nullableStrPtr(input.TypeMime),
		statut, nullableStrPtr(input.ContenuTexte),
		nullableStrPtr(input.ErreurAnalyse), nullableStrPtr(input.UniteEnseignementID))

	doc, err := scanDocument(row)
	if err != nil {
		return nil, fmt.Errorf("create document: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return doc, nil
}

// SoftDelete désactive un document (deletedAt = now).
func (r *DocumentRepository) SoftDelete(ctx context.Context, id string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
	}

	tag, err := tx.Exec(ctx, `UPDATE "Document" SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "deletedAt" IS NULL`, id)
	if err != nil {
		return fmt.Errorf("soft delete document: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return &domain.NotFoundError{Entity: "Document", ID: id}
	}

	return tx.Commit(ctx)
}

// Suppress unused import warning
var _ = strings.TrimSpace
