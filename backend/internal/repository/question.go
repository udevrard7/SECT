// Package repository — implémentation QuestionRepository.
package repository

import (
	"context"
	"encoding/json"
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

// QuestionRepository implémente domain.QuestionRepository.
type QuestionRepository struct {
	pool *pgxpool.Pool
}

// NewQuestionRepository crée un nouveau QuestionRepository.
func NewQuestionRepository(pool *pgxpool.Pool) *QuestionRepository {
	return &QuestionRepository{pool: pool}
}

const columnsQuestion = `"id", "documentId", "chapterId", "auteurId", "type", "enonce", "propositions",
        "reponseCorrecte", "explication", "difficulte", "themes", "tags",
        "scoreQualite", "validee", "langue", "createdAt", "updatedAt", "deletedAt"`

func scanQuestion(s scanner) (*domain.Question, error) {
	q := &domain.Question{}
	err := s.Scan(
		&q.ID, &q.DocumentID, &q.ChapterID, &q.AuteurID, &q.Type, &q.Enonce,
		&q.Propositions, &q.ReponseCorrecte, &q.Explication, &q.Difficulte,
		&q.Themes, &q.Tags, &q.ScoreQualite, &q.Validee, &q.Langue,
		&q.CreatedAt, &q.UpdatedAt, &q.DeletedAt,
	)
	if err != nil {
		return nil, err
	}
	// Sanitize json.RawMessage fields : les valeurs TEXT vides ou non-JSON
	// doivent être nil pour que json.Marshal produise "null" au lieu d' échouer.
	q.Propositions = sanitizeRawMessage(q.Propositions)
	q.ReponseCorrecte = sanitizeRawMessage(q.ReponseCorrecte)
	q.Themes = sanitizeRawMessage(q.Themes)
	q.Tags = sanitizeRawMessage(q.Tags)
	return q, nil
}

// sanitizeRawMessage retourne nil si la RawMessage est vide ou "null",
// sinon la retourne telle quelle si c'est du JSON valide, sinon nil.
func sanitizeRawMessage(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	// Vérifier que c'est du JSON valide
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil // non-JSON → nil (sera "null" dans la réponse)
	}
	return raw
}

// FindByID récupère une question par ID (RLS actif, exclut deletedAt).
func (r *QuestionRepository) FindByID(ctx context.Context, id string) (*domain.Question, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var q *domain.Question
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Question" WHERE "id" = $1 AND "deletedAt" IS NULL`, columnsQuestion), id)
		u, err := scanQuestion(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "Question", ID: id}
			}
			return fmt.Errorf("query question: %w", err)
		}
		q = u
		return nil
	})
	if err != nil {
		return nil, err
	}
	return q, nil
}

// List liste les questions paginées (RLS actif, etablissementScope filtre via auteur).
func (r *QuestionRepository) List(ctx context.Context, params domain.QuestionListParams, etablissementScope string) (*domain.QuestionListResult, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	if params.Page < 1 {
		params.Page = 1
	}
	if params.Limit < 1 || params.Limit > 200 {
		params.Limit = 50
	}

	result := &domain.QuestionListResult{Page: params.Page, Limit: params.Limit}

	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var where []string
		var args []any
		argIdx := 1

		where = append(where, `"deletedAt" IS NULL`)

		if params.UserID != "" {
			where = append(where, fmt.Sprintf(`("auteurId" = $%d OR EXISTS (SELECT 1 FROM "Document" d WHERE d."id" = "Question"."documentId" AND d."ownerId" = $%d))`, argIdx, argIdx))
			args = append(args, params.UserID)
			argIdx++
		}
		if params.DocumentID != "" {
			where = append(where, fmt.Sprintf(`"documentId" = $%d`, argIdx))
			args = append(args, params.DocumentID)
			argIdx++
		}
		if params.Type != "" {
			where = append(where, fmt.Sprintf(`"type" = $%d`, argIdx))
			args = append(args, params.Type)
			argIdx++
		}
		if params.Difficulte != "" {
			where = append(where, fmt.Sprintf(`"difficulte" = $%d`, argIdx))
			args = append(args, params.Difficulte)
			argIdx++
		}
		if params.Validee != nil {
			where = append(where, fmt.Sprintf(`"validee" = $%d`, argIdx))
			args = append(args, *params.Validee)
			argIdx++
		}
		if params.Search != "" {
			where = append(where, fmt.Sprintf(`"enonce" ILIKE $%d`, argIdx))
			args = append(args, "%"+params.Search+"%")
			argIdx++
		}
		// etablissementScope : filtre via auteur.etablissementId
		if etablissementScope != "" {
			where = append(where, fmt.Sprintf(`EXISTS (SELECT 1 FROM "User" u WHERE u."id" = "Question"."auteurId" AND u."etablissementId" = $%d)`, argIdx))
			args = append(args, etablissementScope)
			argIdx++
		}

		whereClause := "WHERE " + strings.Join(where, " AND ")

		// Count
		err := tx.QueryRow(ctx, fmt.Sprintf(`SELECT count(*) FROM "Question" %s`, whereClause), args...).Scan(&result.Total)
		if err != nil {
			return fmt.Errorf("count questions: %w", err)
		}
		result.TotalPages = (result.Total + params.Limit - 1) / params.Limit

		// Fetch page
		offset := (params.Page - 1) * params.Limit
		listSQL := fmt.Sprintf(`SELECT %s FROM "Question" %s ORDER BY "createdAt" DESC LIMIT $%d OFFSET $%d`,
			columnsQuestion, whereClause, argIdx, argIdx+1)
		args = append(args, params.Limit, offset)

		rows, err := tx.Query(ctx, listSQL, args...)
		if err != nil {
			return fmt.Errorf("query questions: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			q, err := scanQuestion(rows)
			if err != nil {
				return fmt.Errorf("scan question: %w", err)
			}
			result.Questions = append(result.Questions, q)
		}
		if result.Questions == nil {
			result.Questions = []*domain.Question{}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return result, nil
}

// Create crée une question.
//
// BUGFIX (AUDIT-RLS-VAGUE-4) : le code utilisait r.pool.BeginTx SANS
// SetClaimsTx → claims NULL → policy Question_modify_enseignant
// (is_enseignant() AND auteurId = current_user_id()) voyait NULL → INSERT bloqué.
// Alignement sur le commentaire (db.WithTx avec claims user depuis le context).
func (r *QuestionRepository) Create(ctx context.Context, input domain.CreateQuestionInput, auteurID string) (*domain.Question, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("QuestionRepository.Create: claims manquants dans le context")
	}

	var q *domain.Question
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		id := uuid.NewString()
		difficulte := input.Difficulte
		if difficulte == "" {
			difficulte = domain.DifficulteMoyen
		}

		// Propositions/reponseCorrecte/themes: si vides, stocker NULL
		var props, reponse, themes any
		if len(input.Propositions) > 0 && string(input.Propositions) != "null" {
			props = []byte(input.Propositions)
		}
		if len(input.ReponseCorrecte) > 0 && string(input.ReponseCorrecte) != "null" {
			reponse = []byte(input.ReponseCorrecte)
		}
		if len(input.Themes) > 0 && string(input.Themes) != "null" {
			themes = []byte(input.Themes)
		}

		row := tx.QueryRow(ctx, `
                        INSERT INTO "Question" ("id", "documentId", "chapterId", "auteurId", "type", "enonce", "propositions",
                                "reponseCorrecte", "explication", "difficulte", "themes", "tags",
                                "scoreQualite", "validee", "langue", "createdAt", "updatedAt", "deletedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, NULL, true, 'fr', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                        RETURNING `+columnsQuestion,
			id, nullableStrPtr(input.DocumentID), nullableStrPtr(input.ChapterID), auteurID, input.Type, input.Enonce,
			props, reponse, nullableStrPtr(input.Explication), difficulte, themes)

		u, err := scanQuestion(row)
		if err != nil {
			// SECT-BIBLIO-P2.5 : FK chapterId invalide -> 400 lisible, pas 500
			// (leçon SECT-PRODUIT-1 ; pattern ouvrage.go Create).
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23503" {
				return &domain.ValidationError{Field: "chapterId", Message: "chapitre introuvable"}
			}
			return fmt.Errorf("create question: %w", err)
		}
		q = u
		return nil
	})
	if err != nil {
		return nil, err
	}
	return q, nil
}

// Update met à jour une question (partial update).
//
// BUGFIX (AUDIT-RLS-VAGUE-4) : le code utilisait r.pool.BeginTx SANS
// SetClaimsTx → claims NULL → policy Question_modify_enseignant bloquait
// l'UPDATE → NotFoundError. Alignement sur db.WithTx avec claims user.
func (r *QuestionRepository) Update(ctx context.Context, id string, input domain.UpdateQuestionInput) (*domain.Question, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return nil, fmt.Errorf("QuestionRepository.Update: claims manquants dans le context")
	}

	var q *domain.Question
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var setClauses []string
		var args []any
		argIdx := 1

		addSet := func(col string, val any) {
			setClauses = append(setClauses, fmt.Sprintf(`"%s" = $%d`, col, argIdx))
			args = append(args, val)
			argIdx++
		}

		if input.Enonce != nil {
			addSet("enonce", *input.Enonce)
		}
		if input.Propositions != nil {
			addSet("propositions", jsonRawOrNull(input.Propositions))
		}
		if input.ReponseCorrecte != nil {
			addSet("reponseCorrecte", jsonRawOrNull(input.ReponseCorrecte))
		}
		if input.Explication != nil {
			addSet("explication", nullableStrPtr(input.Explication))
		}
		if input.Difficulte != nil {
			addSet("difficulte", *input.Difficulte)
		}
		if input.Themes != nil {
			addSet("themes", jsonRawOrNull(input.Themes))
		}
		if input.Tags != nil {
			addSet("tags", jsonRawOrNull(input.Tags))
		}
		if input.Validee != nil {
			addSet("validee", *input.Validee)
		}
		// SECT-BIBLIO-P2.5 : tri-state — null explicite = retirer (NULL),
		// valeur = rattacher, absent = inchangé (pattern UpdateOuvrageInput).
		if input.UnsetChapterID {
			addSet("chapterId", nil)
		} else if input.ChapterID != nil {
			addSet("chapterId", nullableStrPtr(input.ChapterID))
		}

		if len(setClauses) == 0 {
			row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Question" WHERE "id" = $1 AND "deletedAt" IS NULL`, columnsQuestion), id)
			u, err := scanQuestion(row)
			if err != nil {
				if err == pgx.ErrNoRows {
					return &domain.NotFoundError{Entity: "Question", ID: id}
				}
				return err
			}
			q = u
			return nil
		}

		setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)
		args = append(args, id)
		updateSQL := fmt.Sprintf(`UPDATE "Question" SET %s WHERE "id" = $%d AND "deletedAt" IS NULL RETURNING %s`,
			strings.Join(setClauses, ", "), argIdx, columnsQuestion)

		row := tx.QueryRow(ctx, updateSQL, args...)
		u, err := scanQuestion(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "Question", ID: id}
			}
			// SECT-BIBLIO-P2.5 : FK chapterId invalide -> 400 lisible.
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23503" {
				return &domain.ValidationError{Field: "chapterId", Message: "chapitre introuvable"}
			}
			return fmt.Errorf("update question: %w", err)
		}
		q = u
		return nil
	})
	if err != nil {
		return nil, err
	}
	return q, nil
}

// SoftDelete désactive une question (deletedAt = now).
//
// BUGFIX (AUDIT-RLS-VAGUE-4) : le code utilisait r.pool.BeginTx SANS
// SetClaimsTx → claims NULL → policy Question_modify_enseignant bloquait
// l'UPDATE → 0 rows → NotFoundError. Alignement sur db.WithTx.
func (r *QuestionRepository) SoftDelete(ctx context.Context, id string) error {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return fmt.Errorf("QuestionRepository.SoftDelete: claims manquants dans le context")
	}

	return db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE "Question" SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1 AND "deletedAt" IS NULL`, id)
		if err != nil {
			return fmt.Errorf("soft delete question: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return &domain.NotFoundError{Entity: "Question", ID: id}
		}
		return nil
	})
}

// BatchHardDelete supprime définitivement plusieurs questions.
//
// BUGFIX (AUDIT-RLS-VAGUE-4) : le code utilisait r.pool.BeginTx SANS
// SetClaimsTx → claims NULL → policy Question_modify_enseignant bloquait
// le DELETE → 0 rows supprimées silencieusement. Alignement sur db.WithTx.
func (r *QuestionRepository) BatchHardDelete(ctx context.Context, ids []string) (int, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok || claims.UserID == "" {
		return 0, fmt.Errorf("QuestionRepository.BatchHardDelete: claims manquants dans le context")
	}

	var affected int
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		// Construire IN clause
		placeholders := make([]string, len(ids))
		args := make([]any, len(ids))
		for i, id := range ids {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
			args[i] = id
		}

		query := fmt.Sprintf(`DELETE FROM "Question" WHERE "id" IN (%s)`, strings.Join(placeholders, ","))
		tag, err := tx.Exec(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("batch delete questions: %w", err)
		}
		affected = int(tag.RowsAffected())
		return nil
	})
	if err != nil {
		return 0, err
	}
	return affected, nil
}

// GetChapter — SECT-BIBLIO-P2.5 : chapitre + document + propriétaire pour
// la validation de cohérence (usecase). RLS : Chapter_select =
// document_owned_by_me OU étudiant-filière — l'enseignant ne voit donc que
// les chapitres de SES supports (la validation croisée documentId/question
// reste nécessaire : un enseignant multi-supports ne doit pas mélanger).
func (r *QuestionRepository) GetChapter(ctx context.Context, chapterID string) (*domain.QuestionChapterRef, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("GetChapter: claims manquants dans le context")
	}

	var ref *domain.QuestionChapterRef
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			SELECT c."id", c."documentId", c."titre", c."ordre", d."ownerId"
			FROM "Chapter" c
			JOIN "Document" d ON d."id" = c."documentId"
			WHERE c."id" = $1 AND d."deletedAt" IS NULL
		`, chapterID)
		var out domain.QuestionChapterRef
		if err := row.Scan(&out.ID, &out.DocumentID, &out.Titre, &out.Ordre, &out.OwnerID); err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "Chapitre", ID: chapterID}
			}
			return fmt.Errorf("query chapter: %w", err)
		}
		ref = &out
		return nil
	})
	if err != nil {
		return nil, err
	}
	return ref, nil
}

// jsonRawOrNull retourne la valeur JSON ou NULL si "null" ou vide.
func jsonRawOrNull(raw []byte) any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return []byte(raw)
}
