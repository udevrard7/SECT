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

// columnsDocument — colonnes QUALIFIÉES de l'alias d (SELECT avec jointure :
// FindByID / ListByOwner joignent UniteEnseignement — le préfixe lève
// l'ambiguïté, fix D2 82d8e5b9).
// ⚠️ NE JAMAIS utiliser dans un RETURNING d'INSERT/UPDATE : l'alias d
// n'existe pas hors FROM → PostgreSQL 42P01 « missing FROM-clause entry
// for table d » → 500 « erreur interne » (leçon P1, cf. columnsOuvrageVeilleBare).
// Pour le RETURNING : columnsDocumentBare ci-dessous.
const columnsDocument = `d."id", d."ownerId", d."nomFichier", d."cheminStockage", d."tailleFichier",
        d."typeMime", d."statutAnalyse", d."themesDetectes", d."conceptsCles", d."volumeEstime",
        d."contenuTexte", d."dateUpload", d."createdAt", d."updatedAt", d."deletedAt",
        d."erreurAnalyse", d."resumeAnalyse", d."uniteEnseignementId"`

// columnsDocumentBare — SANS préfixe d'alias, pour le RETURNING des INSERT
// (leçon P1 / SECT-BIBLIO : un préfixe d'alias dans un RETURNING sans FROM
// = 42P01 → 500). PANNE SECT-DOC-INSERT-1 : le D2 fix 82d8e5b9 (29/06) a
// qualifié la constante partagée avec d. pour les SELECT à jointure — le
// RETURNING du Create est devenu invalide : AUCUN upload de document
// n'a abouti en production du 29/06 au 27/10 (POST /api/documents → 500
// « erreur interne », erreur exacte « create document: ERROR: missing
// FROM-clause entry for table "d" (SQLSTATE 42P01) » capturée par le
// logging d'observabilité SECT-DOC-DIAG). Même pattern que
// columnsOuvrageVeilleBare / columnsOuvrageSectionBare / columnsOuvrageLectureBare.
const columnsDocumentBare = `"id", "ownerId", "nomFichier", "cheminStockage", "tailleFichier",
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
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code ouvrait une tx via
// r.pool.BeginTx SANS SetClaimsTx → claims NULL → policy Document_insert
// (ownerId = current_user_id()) voyait NULL → l'INSERT était rejeté (0 ligne
// ou erreur RLS). Fix : db.WithTx avec claims du context.
func (r *DocumentRepository) Create(ctx context.Context, input domain.CreateDocumentInput) (*domain.Document, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("Create: claims manquants dans le context")
	}

	var doc *domain.Document
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
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
                        RETURNING `+columnsDocumentBare,
			id, input.OwnerID, input.NomFichier, input.CheminStockage,
			nullableIntPtr(input.TailleFichier), nullableStrPtr(input.TypeMime),
			statut, nullableStrPtr(input.ContenuTexte),
			nullableStrPtr(input.ErreurAnalyse), nullableStrPtr(input.UniteEnseignementID))

		created, err := scanDocument(row)
		if err != nil {
			return fmt.Errorf("create document: %w", err)
		}
		doc = created
		return nil
	})
	if err != nil {
		return nil, err
	}
	return doc, nil
}

// SoftDelete désactive un document (deletedAt = now).
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code ouvrait une tx SANS
// SetClaimsTx → claims NULL → policy Document_modify_owner (ownerId =
// current_user_id()) voyait NULL → 0 ligne affectée → NotFoundError même
// pour le owner légitime. Fix : db.WithTx avec claims du context.
func (r *DocumentRepository) SoftDelete(ctx context.Context, id string) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return fmt.Errorf("SoftDelete: claims manquants dans le context")
	}

	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE "Document" SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "deletedAt" IS NULL`, id)
		if err != nil {
			return fmt.Errorf("soft delete document: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return &domain.NotFoundError{Entity: "Document", ID: id}
		}
		return nil
	})
}

// Suppress unused import warning
var _ = strings.TrimSpace

// UpdateAnalysis met à jour les champs d'analyse d'un document (P1-D1).
// Utilisé par le doc_analyzer_worker après traitement IA.
//
// BUGFIX (AUDIT-RLS-REPOS-001 / VAGUE-3) : le code ouvrait une tx SANS
// SetClaimsTx → claims NULL → policy Document_modify_owner (ownerId =
// current_user_id()) voyait NULL → 0 ligne affectée (silencieux car pas de
// NotFoundError check sur RowsAffected). Le worker ne voyait pas l'erreur
// mais l'UPDATE n'était pas appliqué en production (RLS actif).
// Fix : db.WithTx avec db.SystemClaims() — le worker n'a pas de JWT user, on
// utilise les claims system-worker qui débloquent la policy Document_all_system
// (is_system() = true).
//
// SECT-DOC-IA-1 : sémantique COALESCE — nil = inchangé (cf. domaine).
// ErreurAnalyse : NULLIF-like via ClearErreurAnalyse, car un *string nil doit
// pouvoir signifier « ne pas toucher » ET le worker doit pouvoir VIDER
// l'erreur au succès (avant : nil → NULL direct, l'appelant ne pouvait pas
// exprimer « garder »).
func (r *DocumentRepository) UpdateAnalysis(ctx context.Context, id string, params domain.UpdateAnalysisInput) error {
	return db.WithTx(ctx, r.pool, db.SystemClaims(), func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
                        UPDATE "Document"
                        SET "statutAnalyse" = COALESCE($1, "statutAnalyse"),
                            "themesDetectes" = COALESCE($2, "themesDetectes"),
                            "conceptsCles" = COALESCE($3, "conceptsCles"),
                            "volumeEstime" = COALESCE($4, "volumeEstime"),
                            "resumeAnalyse" = COALESCE($5, "resumeAnalyse"),
                            "contenuTexte" = COALESCE($6, "contenuTexte"),
                            "erreurAnalyse" = CASE WHEN $7 THEN NULL ELSE COALESCE($8, "erreurAnalyse") END,
                            "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $9
                `, nullableStatut(params.StatutAnalyse),
			nullableStrPtr(params.ThemesDetectes),
			nullableStrPtr(params.ConceptsCles),
			nullableStrPtr(params.VolumeEstime),
			nullableStrPtr(params.ResumeAnalyse),
			nullableStrPtr(params.ContenuTexte),
			params.ClearErreurAnalyse,
			nullableStrPtr(params.ErreurAnalyse),
			id)
		if err != nil {
			return fmt.Errorf("update document analysis: %w", err)
		}
		return nil
	})
}

// nullableStatut — *StatutAnalyse → interface{} nil-able pour pgx.
func nullableStatut(s *domain.StatutAnalyse) any {
	if s == nil {
		return nil
	}
	return string(*s)
}

// DeleteChapters — SECT-DOC-IA-1 : purge des chapitres d'un document avant
// une re-analyse forcée (worker, claims system). Les anciennes lignes sont
// remplacées atomiquement par la régénération qui suit immédiatement.
func (r *DocumentRepository) DeleteChapters(ctx context.Context, documentID string) error {
	return db.WithTx(ctx, r.pool, db.SystemClaims(), func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `DELETE FROM "Chapter" WHERE "documentId" = $1`, documentID)
		if err != nil {
			return fmt.Errorf("delete chapters: %w", err)
		}
		return nil
	})
}

// ListChapters — SECT-BIBLIO-P2.5 : chapitres d'un support, ordonnés
// (RLS actif : Chapter_select = document_owned_by_me OU étudiant-filière).
// sujets reste le TEXT-JSON brut (pattern TEXT-JSON du codebase) — le
// frontend le parse comme themesDetectes.
func (r *DocumentRepository) ListChapters(ctx context.Context, documentID string) ([]*domain.Chapter, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("ListChapters: claims manquants dans le context")
	}

	var result []*domain.Chapter
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT c."id", c."documentId", c."titre", c."ordre", c."sujets", c."createdAt"
                        FROM "Chapter" c
                        WHERE c."documentId" = $1
                        ORDER BY c."ordre" ASC
                `, documentID)
		if err != nil {
			return fmt.Errorf("query chapters: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			ch := &domain.Chapter{}
			if err := rows.Scan(&ch.ID, &ch.DocumentID, &ch.Titre, &ch.Ordre, &ch.Sujets, &ch.CreatedAt); err != nil {
				return fmt.Errorf("scan chapter: %w", err)
			}
			result = append(result, ch)
		}
		if result == nil {
			result = []*domain.Chapter{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
