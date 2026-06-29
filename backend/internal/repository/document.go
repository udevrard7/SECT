// Package repository — implémentation DocumentRepository.
package repository

import (
        "context"
        "fmt"
        "strings"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// DocumentRepository implémente domain.DocumentRepository.
type DocumentRepository struct {
        pool *pgxpool.Pool
}

// NewDocumentRepository crée un nouveau DocumentRepository.
func NewDocumentRepository(pool *pgxpool.Pool) *DocumentRepository {
        return &DocumentRepository{pool: pool}
}

const columnsDocument = `d."id", d."ownerId", d."nomFichier", d."cheminStockage", d."tailleFichier",
        d."typeMime", d."statutAnalyse", d."themesDetectes", d."conceptsCles", d."volumeEstime",
        d."contenuTexte", d."dateUpload", d."createdAt", d."updatedAt", d."deletedAt",
        d."erreurAnalyse", d."resumeAnalyse", d."uniteEnseignementId"`

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

// scanDocumentWithUE scan un document + les colonnes UE du LEFT JOIN (P1-D2).
func scanDocumentWithUE(s scanner) (*domain.Document, error) {
        d := &domain.Document{}
        var ueID, ueCode, ueNom, ueNiveaux *string
        var ueNiveau string
        err := s.Scan(
                &d.ID, &d.OwnerID, &d.NomFichier, &d.CheminStockage, &d.TailleFichier,
                &d.TypeMime, &d.StatutAnalyse, &d.ThemesDetectes, &d.ConceptsCles, &d.VolumeEstime,
                &d.ContenuTexte, &d.DateUpload, &d.CreatedAt, &d.UpdatedAt, &d.DeletedAt,
                &d.ErreurAnalyse, &d.ResumeAnalyse, &d.UniteEnseignementID,
                &ueID, &ueCode, &ueNom, &ueNiveau, &ueNiveaux,
        )
        if err != nil {
                return nil, err
        }
        if ueID != nil && ueCode != nil {
                d.UniteEnseignement = &domain.DocumentUERef{
                        ID:      *ueID,
                        Code:    *ueCode,
                        Nom:     derefStr(ueNom),
                        Niveau:  ueNiveau,
                        Niveaux: ueNiveaux,
                }
        }
        return d, nil
}

// FindByID récupère un document par ID (RLS actif, exclut deletedAt).
// P1-D2 : LEFT JOIN UniteEnseignement pour peupler le nested UE.
func (r *DocumentRepository) FindByID(ctx context.Context, id string) (*domain.Document, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var doc *domain.Document
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, fmt.Sprintf(`
                        SELECT %s, ue."id", ue."code", ue."nom", COALESCE(ue."niveau"::text, ''), ue."niveaux"
                        FROM "Document" d
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = d."uniteEnseignementId"
                        WHERE d."id" = $1 AND d."deletedAt" IS NULL
                `, columnsDocument), id)
                d, err := scanDocumentWithUE(row)
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
// P1-D2 : LEFT JOIN UniteEnseignement pour peupler le nested UE.
// P2-D6 : exclut contenuTexte de la liste pour réduire le payload.
func (r *DocumentRepository) ListByOwner(ctx context.Context, ownerID string) ([]*domain.Document, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.Document
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // P2-D6 : colonnes sans contenuTexte pour la liste
                colsList := `d."id", d."ownerId", d."nomFichier", d."cheminStockage", d."tailleFichier",
                        d."typeMime", d."statutAnalyse", d."themesDetectes", d."conceptsCles", d."volumeEstime",
                        NULL as "contenuTexte", d."dateUpload", d."createdAt", d."updatedAt", d."deletedAt",
                        d."erreurAnalyse", d."resumeAnalyse", d."uniteEnseignementId"`
                query := fmt.Sprintf(`
                        SELECT %s, ue."id", ue."code", ue."nom", COALESCE(ue."niveau"::text, ''), ue."niveaux"
                        FROM "Document" d
                        LEFT JOIN "UniteEnseignement" ue ON ue."id" = d."uniteEnseignementId"
                        WHERE d."ownerId" = $1 AND d."deletedAt" IS NULL
                        ORDER BY d."dateUpload" DESC
                `, colsList)
                rows, err := tx.Query(ctx, query, ownerID)
                if err != nil {
                        return fmt.Errorf("query documents: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        d, err := scanDocumentWithUE(rows)
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

// UpdateAnalysis met à jour les champs d'analyse d'un document (P1-D1).
// Utilisé par le doc_analyzer_worker après traitement IA.
func (r *DocumentRepository) UpdateAnalysis(ctx context.Context, id string, params domain.UpdateAnalysisInput) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
                return fmt.Errorf("disable rls: %w", err)
        }

        _, err = tx.Exec(ctx, `
                UPDATE "Document"
                SET "statutAnalyse" = $1,
                    "themesDetectes" = $2,
                    "conceptsCles" = $3,
                    "volumeEstime" = $4,
                    "resumeAnalyse" = $5,
                    "erreurAnalyse" = $6,
                    "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = $7
        `, params.StatutAnalyse,
                nullableStrPtr(params.ThemesDetectes),
                nullableStrPtr(params.ConceptsCles),
                nullableStrPtr(params.VolumeEstime),
                nullableStrPtr(params.ResumeAnalyse),
                nullableStrPtr(params.ErreurAnalyse),
                id)
        if err != nil {
                return fmt.Errorf("update document analysis: %w", err)
        }

        return tx.Commit(ctx)
}
