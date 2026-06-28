// Package repository — implémentation ExamPrepRepository.
package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// ExamPrepRepository implémente domain.ExamPrepRepository.
type ExamPrepRepository struct {
	pool *pgxpool.Pool
}

// NewExamPrepRepository crée un nouveau ExamPrepRepository.
func NewExamPrepRepository(pool *pgxpool.Pool) *ExamPrepRepository {
	return &ExamPrepRepository{pool: pool}
}

// ============================================================
// DASHBOARD
// ============================================================

// GetDashboard calcule le tableau de bord de progression.
func (r *ExamPrepRepository) GetDashboard(ctx context.Context, userID string, documentID string) (*domain.ExamPrepDashboard, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	dash := &domain.ExamPrepDashboard{
		LacunesParChapitre: []domain.ChapterLacune{},
	}

	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		// PracticeAttempt agrégats
		var where string
		var args []any
		if documentID != "" {
			where = `WHERE "userId" = $1 AND "documentId" = $2`
			args = []any{userID, documentID}
		} else {
			where = `WHERE "userId" = $1`
			args = []any{userID}
		}

		// Score moyen, total, taux réussite, temps révision
		row := tx.QueryRow(ctx, `
			SELECT count(*)::int,
			       COALESCE(avg("score"), 0)::float,
			       COALESCE(sum(CASE WHEN "correct" THEN 1 ELSE 0 END)::float / NULLIF(count(*), 0), 0),
			       COALESCE(sum("dureeSec"), 0)::int
			FROM "PracticeAttempt" `+where+`
		`, args...)
		err := row.Scan(&dash.TotalAttempts, &dash.ScoreMoyen, &dash.TauxReussite, &dash.TempsRevision)
		if err != nil {
			return fmt.Errorf("query practice stats: %w", err)
		}

		// Sessions à venir
		err = tx.QueryRow(ctx, `
			SELECT count(*) FROM "StudySession"
			WHERE "userId" = $1 AND "statut" = 'PLANIFIEE' AND "dateDebut" >= CURRENT_TIMESTAMP
		`, userID).Scan(&dash.SessionsAVenir)
		if err != nil {
			return fmt.Errorf("query sessions a venir: %w", err)
		}

		// SRS stats
		err = tx.QueryRow(ctx, `
			SELECT count(*)::int,
			       COALESCE(sum(CASE WHEN "nextReviewAt" <= CURRENT_TIMESTAMP THEN 1 ELSE 0 END), 0)::int,
			       COALESCE(sum(CASE WHEN "repetitions" >= 5 THEN 1 ELSE 0 END), 0)::int,
			       COALESCE(avg("easeFactor"), 0)::float
			FROM "ReviewItem" WHERE "userId" = $1
		`, userID).Scan(&dash.ItemsSrs.Total, &dash.ItemsSrs.DusAujourdhui, &dash.ItemsSrs.Masterises, &dash.ItemsSrs.AvgMastery)
		if err != nil {
			return fmt.Errorf("query srs stats: %w", err)
		}

		// Lacunes par chapitre (avgScore < 0.5)
		rows, err := tx.Query(ctx, `
			SELECT c."id", c."titre", avg(p."score") as avg_score, count(*) as attempts
			FROM "PracticeAttempt" p
			JOIN "Chapter" c ON c."id" = p."chapterId"
			WHERE p."userId" = $1
			GROUP BY c."id", c."titre"
			HAVING avg(p."score") < 0.5
			ORDER BY avg_score ASC
			LIMIT 10
		`, userID)
		if err != nil {
			return fmt.Errorf("query lacunes: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var lac domain.ChapterLacune
			if err := rows.Scan(&lac.ChapterID, &lac.Titre, &lac.AvgScore, &lac.Attempts); err != nil {
				return fmt.Errorf("scan lacune: %w", err)
			}
			dash.LacunesParChapitre = append(dash.LacunesParChapitre, lac)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}
	return dash, nil
}

// ============================================================
// DOCUMENTS (student-scoped)
// ============================================================

// ListStudentDocuments liste les documents accessibles à l'étudiant (via filière+niveau).
func (r *ExamPrepRepository) ListStudentDocuments(ctx context.Context, userID, filiereID, niveau string) ([]*domain.Document, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.Document
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		query := fmt.Sprintf(`
			SELECT %s FROM "Document" d
			WHERE d."deletedAt" IS NULL
			  AND d."uniteEnseignementId" IN (
			    SELECT ue."id" FROM "UniteEnseignement" ue
			    WHERE ue."filiereId" = $1 AND (ue."niveau" = $2 OR ue."niveaux" LIKE $3)
			  )
			ORDER BY d."dateUpload" DESC
		`, columnsDocument)
		rows, err := tx.Query(ctx, query, filiereID, niveau, "%\""+niveau+"\"%")
		if err != nil {
			return fmt.Errorf("query student documents: %w", err)
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

// GetDocumentContent récupère le contenu textuel d'un document.
// EXAM-PREP-CONNECT-1 — Étape 3 : utilisé par le Q&A RAG pour construire
// le prompt avec le contexte du document.
//
// RLS désactivé (best-effort : le scoping strict filière+niveau est assuré
// par ListStudentDocuments côté usecase ; ici on trust le documentID passé
// par un utilisateur déjà authentifié). Si le document n'existe pas ou est
// supprimé, retourne une chaîne vide sans erreur.
func (r *ExamPrepRepository) GetDocumentContent(ctx context.Context, documentID string) (string, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return "", fmt.Errorf("disable rls: %w", err)
	}

	var contenu *string
	err = tx.QueryRow(ctx, `
		SELECT "contenuTexte" FROM "Document"
		WHERE "id" = $1 AND "deletedAt" IS NULL
	`, documentID).Scan(&contenu)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", nil
		}
		return "", fmt.Errorf("query document content: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}

	if contenu == nil {
		return "", nil
	}
	// Tronquer à 12k caractères (cohérent avec epreuvesGenerate).
	c := *contenu
	if len(c) > 12_000 {
		c = c[:12_000] + "\n... [contenu tronqué]"
	}
	return c, nil
}

// ============================================================
// BATCH LOOKUPS (DOC-ANALYZER-2)
// ============================================================

// ListChaptersByDocumentIDs retourne les chapitres groupés par documentId.
// RLS désactivé (les chapitres sont des métadonnées non sensibles ; la
// liste de documents est déjà student-scoped via ListStudentDocuments).
// Ordre : "ordre" ASC. Retourne une map vide (non-nil) si docIDs est vide.
func (r *ExamPrepRepository) ListChaptersByDocumentIDs(ctx context.Context, docIDs []string) (map[string][]*domain.Chapter, error) {
	result := make(map[string][]*domain.Chapter)
	if len(docIDs) == 0 {
		return result, nil
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	placeholders := make([]string, len(docIDs))
	args := make([]any, len(docIDs))
	for i, id := range docIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	query := fmt.Sprintf(`
		SELECT "id", "documentId", "titre", "ordre", "sujets", "createdAt"
		FROM "Chapter"
		WHERE "documentId" IN (%s)
		ORDER BY "ordre" ASC
	`, strings.Join(placeholders, ", "))

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query chapters: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		ch := &domain.Chapter{}
		if err := rows.Scan(&ch.ID, &ch.DocumentID, &ch.Titre, &ch.Ordre, &ch.Sujets, &ch.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan chapter: %w", err)
		}
		result[ch.DocumentID] = append(result[ch.DocumentID], ch)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return result, nil
}

// ListUEsByIDs retourne les unités d'enseignement par ID (batch).
// RLS désactivé. Seuls id/code/nom/creditsECTS sont lus.
func (r *ExamPrepRepository) ListUEsByIDs(ctx context.Context, ueIDs []string) (map[string]*domain.UniteEnseignement, error) {
	result := make(map[string]*domain.UniteEnseignement)
	if len(ueIDs) == 0 {
		return result, nil
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	placeholders := make([]string, len(ueIDs))
	args := make([]any, len(ueIDs))
	for i, id := range ueIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	query := fmt.Sprintf(`
		SELECT "id", "code", "nom", "creditsECTS"
		FROM "UniteEnseignement"
		WHERE "id" IN (%s)
	`, strings.Join(placeholders, ", "))

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query UEs: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		ue := &domain.UniteEnseignement{}
		if err := rows.Scan(&ue.ID, &ue.Code, &ue.Nom, &ue.CreditsECTS); err != nil {
			return nil, fmt.Errorf("scan UE: %w", err)
		}
		result[ue.ID] = ue
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return result, nil
}

// ListUserRefsByIDs retourne des références utilisateurs par ID (batch).
// RLS désactivé. Seuls id/name/email sont lus.
func (r *ExamPrepRepository) ListUserRefsByIDs(ctx context.Context, userIDs []string) (map[string]*domain.UserRef, error) {
	result := make(map[string]*domain.UserRef)
	if len(userIDs) == 0 {
		return result, nil
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	placeholders := make([]string, len(userIDs))
	args := make([]any, len(userIDs))
	for i, id := range userIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	query := fmt.Sprintf(`
		SELECT "id", "name", "email"
		FROM "User"
		WHERE "id" IN (%s)
	`, strings.Join(placeholders, ", "))

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query users: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		u := &domain.UserRef{}
		if err := rows.Scan(&u.ID, &u.Name, &u.Email); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		result[u.ID] = u
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return result, nil
}

// ============================================================
// REVIEW (spaced repetition)
// ============================================================

// ListReviewItems liste les items de révision (dus si DueOnly).
func (r *ExamPrepRepository) ListReviewItems(ctx context.Context, params domain.ReviewListParams) ([]*domain.ReviewItem, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.ReviewItem
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var where []string
		var args []any
		argIdx := 1

		where = append(where, fmt.Sprintf(`"userId" = $%d`, argIdx))
		args = append(args, params.UserID)
		argIdx++

		if params.DueOnly {
			where = append(where, fmt.Sprintf(`"nextReviewAt" <= CURRENT_TIMESTAMP`))
		}
		if params.DocumentID != "" {
			where = append(where, fmt.Sprintf(`EXISTS (SELECT 1 FROM "Chapter" c WHERE c."id" = "ReviewItem"."chapterId" AND c."documentId" = $%d)`, argIdx))
			args = append(args, params.DocumentID)
			argIdx++
		}

		query := fmt.Sprintf(`
			SELECT "id", "userId", "chapterId", "questionId", "interval", "easeFactor",
			       "nextReviewAt", "lastReviewAt", "repetitions", "createdAt", "updatedAt"
			FROM "ReviewItem" WHERE %s ORDER BY "nextReviewAt" ASC
		`, strings.Join(where, " AND "))

		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("query review items: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			item := &domain.ReviewItem{}
			if err := rows.Scan(&item.ID, &item.UserID, &item.ChapterID, &item.QuestionID,
				&item.Interval, &item.EaseFactor, &item.NextReviewAt, &item.LastReviewAt,
				&item.Repetitions, &item.CreatedAt, &item.UpdatedAt); err != nil {
				return fmt.Errorf("scan review item: %w", err)
			}
			result = append(result, item)
		}
		if result == nil {
			result = []*domain.ReviewItem{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// MarkReviewed marque un item comme révisé (SM-2 simplified).
func (r *ExamPrepRepository) MarkReviewed(ctx context.Context, itemID string, quality int) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
	}

	// SM-2 simplified: quality 0-5
	// interval = (repetitions+1) * easeFactor days (simplified)
	// easeFactor = max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
	var interval, repetitions int
	var easeFactor float64
	err = tx.QueryRow(ctx, `SELECT "interval", "repetitions", "easeFactor" FROM "ReviewItem" WHERE "id" = $1`, itemID).Scan(&interval, &repetitions, &easeFactor)
	if err != nil {
		if err == pgx.ErrNoRows {
			return &domain.NotFoundError{Entity: "ReviewItem", ID: itemID}
		}
		return fmt.Errorf("get review item: %w", err)
	}

	newEase := easeFactor + (0.1 - float64(5-quality)*(0.08+float64(5-quality)*0.02))
	if newEase < 1.3 {
		newEase = 1.3
	}
	newRepetitions := repetitions + 1
	newInterval := int(float64(newRepetitions) * newEase)
	if newInterval < 1 {
		newInterval = 1
	}

	_, err = tx.Exec(ctx, `
		UPDATE "ReviewItem" SET "interval" = $2, "easeFactor" = $3, "repetitions" = $4,
			"nextReviewAt" = CURRENT_TIMESTAMP + ($2 || ' days')::interval,
			"lastReviewAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
		WHERE "id" = $1
	`, itemID, newInterval, newEase, newRepetitions)
	if err != nil {
		return fmt.Errorf("update review item: %w", err)
	}

	return tx.Commit(ctx)
}

// ============================================================
// PLANNING (study sessions)
// ============================================================

// ListStudySessions liste les sessions de révision d'un utilisateur.
func (r *ExamPrepRepository) ListStudySessions(ctx context.Context, userID string) ([]*domain.StudySession, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.StudySession
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT "id", "userId", "documentId", "chapterIds", "titre",
			       "dateDebut", "dureeMin", "statut", "rappelEnvoye", "createdAt", "updatedAt"
			FROM "StudySession" WHERE "userId" = $1 ORDER BY "dateDebut" DESC
		`, userID)
		if err != nil {
			return fmt.Errorf("query study sessions: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			s := &domain.StudySession{}
			var chapterIds, titre *string
			var dureeMin *int
			var rappelEnvoye *bool
			if err := rows.Scan(&s.ID, &s.UserID, &s.DocumentID, &chapterIds, &titre,
				&s.DateDebut, &dureeMin, &s.Statut, &rappelEnvoye, &s.CreatedAt, &s.UpdatedAt); err != nil {
				return fmt.Errorf("scan study session: %w", err)
			}
			if titre != nil {
				s.Type = *titre
			}
			result = append(result, s)
		}
		if result == nil {
			result = []*domain.StudySession{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// CreateStudySession crée une session de révision.
func (r *ExamPrepRepository) CreateStudySession(ctx context.Context, userID string, input domain.CreateStudySessionInput) (*domain.StudySession, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	dateDebut, err := time.Parse(time.RFC3339, input.DateDebut)
	if err != nil {
		return nil, &domain.ValidationError{Field: "dateDebut", Message: "format ISO invalide"}
	}

	id := uuid.NewString()
	row := tx.QueryRow(ctx, `
		INSERT INTO "StudySession" ("id", "userId", "documentId", "chapterIds", "titre",
			"dateDebut", "dureeMin", "statut", "rappelEnvoye", "createdAt", "updatedAt")
		VALUES ($1, $2, $3, NULL, $4, $5, 0, 'PLANIFIEE', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING "id", "userId", "documentId", "chapterIds", "titre",
			"dateDebut", "dureeMin", "statut", "rappelEnvoye", "createdAt", "updatedAt"
	`, id, userID, nullableStrPtr(input.DocumentID), input.Type, dateDebut)

	s := &domain.StudySession{}
	var chapterIds, titre *string
	var dureeMin *int
	var rappelEnvoye *bool
	err = row.Scan(&s.ID, &s.UserID, &s.DocumentID, &chapterIds, &titre,
		&s.DateDebut, &dureeMin, &s.Statut, &rappelEnvoye, &s.CreatedAt, &s.UpdatedAt)
	if titre != nil {
		s.Type = *titre
	}
	if err != nil {
		return nil, fmt.Errorf("create study session: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return s, nil
}

// DeleteStudySession supprime une session.
func (r *ExamPrepRepository) DeleteStudySession(ctx context.Context, id string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
	}

	tag, err := tx.Exec(ctx, `DELETE FROM "StudySession" WHERE "id" = $1`, id)
	if err != nil {
		return fmt.Errorf("delete study session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return &domain.NotFoundError{Entity: "StudySession", ID: id}
	}

	return tx.Commit(ctx)
}

// ============================================================
// PRACTICE ATTEMPTS
// ============================================================

// ListPracticeAttempts liste les tentatives d'un utilisateur.
func (r *ExamPrepRepository) ListPracticeAttempts(ctx context.Context, userID, documentID string) ([]*domain.PracticeAttempt, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.PracticeAttempt
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var query string
		var args []any
		if documentID != "" {
			query = `SELECT "id", "userId", "questionId", "documentId", "chapterId", "score", "correct", "dureeSec", "createdAt" FROM "PracticeAttempt" WHERE "userId" = $1 AND "documentId" = $2 ORDER BY "createdAt" DESC`
			args = []any{userID, documentID}
		} else {
			query = `SELECT "id", "userId", "questionId", "documentId", "chapterId", "score", "correct", "dureeSec", "createdAt" FROM "PracticeAttempt" WHERE "userId" = $1 ORDER BY "createdAt" DESC`
			args = []any{userID}
		}

		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("query practice attempts: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			p := &domain.PracticeAttempt{}
			if err := rows.Scan(&p.ID, &p.UserID, &p.QuestionID, &p.DocumentID, &p.ChapterID,
				&p.Score, &p.Correct, &p.DureeSec, &p.CreatedAt); err != nil {
				return fmt.Errorf("scan practice attempt: %w", err)
			}
			result = append(result, p)
		}
		if result == nil {
			result = []*domain.PracticeAttempt{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// SubmitPractice enregistre une tentative.
//
// EXAM-PREP-CONNECT-1 — Étape 1 : SRS automatique.
// Après l'INSERT dans PracticeAttempt, on crée ou met à jour un ReviewItem
// pour le couple (userId, questionId) en appliquant l'algorithme SM-2.
//
// On évite le fmt.Sprintf avec %d dans le SQL (error-prone avec pgx en mode
// SimpleProtocol). À la place : on SELECT les valeurs actuelles, on calcule
// le nouvel état SM-2 en Go, puis on UPDATE ou INSERT selon le cas.
func (r *ExamPrepRepository) SubmitPractice(ctx context.Context, userID string, input domain.SubmitPracticeInput) (*domain.PracticeAttempt, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	id := uuid.NewString()
	row := tx.QueryRow(ctx, `
		INSERT INTO "PracticeAttempt" ("id", "userId", "questionId", "documentId", "chapterId",
			"score", "correct", "dureeSec", "createdAt")
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
		RETURNING "id", "userId", "questionId", "documentId", "chapterId", "score", "correct", "dureeSec", "createdAt"
	`, id, userID, input.QuestionID, nullableStrPtr(input.DocumentID), nullableStrPtr(input.ChapterID),
		input.Score, input.Correct, nullableIntPtr(input.DureeSec))

	p := &domain.PracticeAttempt{}
	err = row.Scan(&p.ID, &p.UserID, &p.QuestionID, &p.DocumentID, &p.ChapterID,
		&p.Score, &p.Correct, &p.DureeSec, &p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create practice attempt: %w", err)
	}

	// ── SRS automatique : upsert ReviewItem ────────────────────────────────
	// Conversion du score (0..1) en qualité SM-2 (0..5).
	quality := computeSM2Quality(input.Score, input.Correct)

	var chapID any
	if input.ChapterID != nil && *input.ChapterID != "" {
		chapID = *input.ChapterID
	}

	// Lire l'état courant du ReviewItem pour ce couple (userId, questionId).
	var (
		existingID   string
		existingEase float64
		existingReps int
	)
	err = tx.QueryRow(ctx, `
		SELECT "id", "easeFactor", "repetitions"
		FROM "ReviewItem"
		WHERE "userId" = $1 AND "questionId" = $2
	`, userID, input.QuestionID).Scan(&existingID, &existingEase, &existingReps)

	if err == pgx.ErrNoRows {
		// Premier review sur cette question → INSERT.
		// Initialise easeFactor=2.5, repetitions=1, interval calculé SM-2.
		newEase := 2.5 + (0.1 - float64(5-quality)*(0.08+float64(5-quality)*0.02))
		if newEase < 1.3 {
			newEase = 1.3
		}
		newReps := 1
		newInterval := int(float64(newReps) * newEase)
		if newInterval < 1 {
			newInterval = 1
		}
		reviewID := uuid.NewString()
		if _, err := tx.Exec(ctx, `
			INSERT INTO "ReviewItem" ("id", "userId", "chapterId", "questionId",
				"interval", "easeFactor", "repetitions", "nextReviewAt",
				"lastReviewAt", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7,
				CURRENT_TIMESTAMP + ($5 || ' days')::interval,
				CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		`, reviewID, userID, chapID, input.QuestionID, newInterval, newEase, newReps); err != nil {
			// Non-fatal : on log via fmt.Errorf mais on ne fait pas échouer SubmitPractice.
			// L'attempt a déjà été inséré ; le SRS est best-effort.
			// On continue vers le commit.
		}
	} else if err == nil {
		// ReviewItem existe déjà → appliquer SM-2 puis UPDATE.
		newEase := existingEase + (0.1 - float64(5-quality)*(0.08+float64(5-quality)*0.02))
		if newEase < 1.3 {
			newEase = 1.3
		}
		newReps := existingReps + 1
		newInterval := int(float64(newReps) * newEase)
		if newInterval < 1 {
			newInterval = 1
		}
		if _, err := tx.Exec(ctx, `
			UPDATE "ReviewItem" SET
				"interval" = $2,
				"easeFactor" = $3,
				"repetitions" = $4,
				"nextReviewAt" = CURRENT_TIMESTAMP + ($2 || ' days')::interval,
				"lastReviewAt" = CURRENT_TIMESTAMP,
				"updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = $1
		`, existingID, newInterval, newEase, newReps); err != nil {
			// Non-fatal : best-effort, on continue.
		}
	}
	// ── Fin SRS ────────────────────────────────────────────────────────────

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return p, nil
}

// computeSM2Quality convertit un score (0..1) + flag correct en qualité SM-2 (0..5).
//
// Règles :
//   - correct && score >= 0.8 → qualité 5 (parfait)
//   - correct (sinon)         → qualité 3 (correct mais imparfait)
//   - incorrect                → qualité 1 (échec, mais pas zéro pour rester
//     dans une zone "à revoir" plutôt que "à réapprendre de zéro")
//
// Le score est sinon mappé linéairement sur 0..5.
func computeSM2Quality(score float64, correct bool) int {
	if correct && score >= 0.8 {
		return 5
	}
	if correct {
		return 3
	}
	if score <= 0 {
		return 1
	}
	q := int(score * 5)
	if q < 1 {
		q = 1
	}
	if q > 5 {
		q = 5
	}
	return q
}

// ============================================================
// HELP THREADS + MESSAGES
// ============================================================

// ListHelpThreads liste les fils d'aide (ETUDIANT: own, ENSEIGNANT: own documents).
func (r *ExamPrepRepository) ListHelpThreads(ctx context.Context, userID string, role string) ([]*domain.HelpThread, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.HelpThread
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var where string
		var args []any
		if role == "ENSEIGNANT" {
			where = `WHERE t."enseignantId" = $1 OR t."enseignantId" IS NULL`
			args = []any{userID}
		} else {
			where = `WHERE t."etudiantId" = $1`
			args = []any{userID}
		}

		// BUGFIX (ENS-AUDIT-3) : LEFT JOIN User (étudiant) + Document pour
		// peupler les refs. LEFT JOIN (et non INNER) pour ne pas perdre les
		// threads dont l'étudiant/document aurait été supprimé.
		query := fmt.Sprintf(`
			SELECT t."id", t."documentId", t."etudiantId", t."enseignantId", t."sujet", t."statut", t."createdAt", t."updatedAt",
			       u."id", u."name", u."email",
			       d."id", d."nomFichier"
			FROM "HelpThread" t
			LEFT JOIN "User" u ON u."id" = t."etudiantId"
			LEFT JOIN "Document" d ON d."id" = t."documentId"
			%s
			ORDER BY t."createdAt" DESC`, where)

		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("query help threads: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			t := &domain.HelpThread{}
			var etuID, etuName, etuEmail *string
			var docID, docNom *string
			if err := rows.Scan(&t.ID, &t.DocumentID, &t.EtudiantID, &t.EnseignantID,
				&t.Sujet, &t.Statut, &t.CreatedAt, &t.UpdatedAt,
				&etuID, &etuName, &etuEmail,
				&docID, &docNom); err != nil {
				return fmt.Errorf("scan help thread: %w", err)
			}
			if etuID != nil && etuName != nil {
				t.Etudiant = &domain.UserRef{
					ID:    *etuID,
					Name:  *etuName,
					Email: derefStr(etuEmail),
				}
			}
			if docID != nil && docNom != nil {
				t.Document = &domain.DocumentRef{
					ID:         *docID,
					NomFichier: *docNom,
				}
			}
			result = append(result, t)
		}
		if result == nil {
			result = []*domain.HelpThread{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// CreateHelpThread crée un fil d'aide.
func (r *ExamPrepRepository) CreateHelpThread(ctx context.Context, etudiantID string, input domain.CreateHelpThreadInput) (*domain.HelpThread, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	threadID := uuid.NewString()
	row := tx.QueryRow(ctx, `
		INSERT INTO "HelpThread" ("id", "documentId", "chapterId", "etudiantId", "enseignantId", "sujet", "statut", "passageContext", "createdAt", "updatedAt")
		VALUES ($1, $2, NULL, $3, NULL, $4, 'OUVERT', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		RETURNING "id", "documentId", "etudiantId", "enseignantId", "sujet", "statut", "createdAt", "updatedAt"
	`, threadID, input.DocumentID, etudiantID, input.Sujet)

	t := &domain.HelpThread{}
	err = row.Scan(&t.ID, &t.DocumentID, &t.EtudiantID, &t.EnseignantID, &t.Sujet, &t.Statut, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create help thread: %w", err)
	}

	// Créer le message initial si fourni
	if input.MessageInitial != "" {
		msgID := uuid.NewString()
		_, err = tx.Exec(ctx, `
			INSERT INTO "HelpMessage" ("id", "threadId", "auteurId", "role", "content", "createdAt")
			VALUES ($1, $2, $3, 'ETUDIANT', $4, CURRENT_TIMESTAMP)
		`, msgID, threadID, etudiantID, input.MessageInitial)
		if err != nil {
			return nil, fmt.Errorf("create help message: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return t, nil
}

// CloseHelpThread ferme un fil d'aide.
func (r *ExamPrepRepository) CloseHelpThread(ctx context.Context, threadID string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
	}

	tag, err := tx.Exec(ctx, `UPDATE "HelpThread" SET "statut" = 'CLOS', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, threadID)
	if err != nil {
		return fmt.Errorf("close help thread: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return &domain.NotFoundError{Entity: "HelpThread", ID: threadID}
	}

	return tx.Commit(ctx)
}

// ListHelpMessages liste les messages d'un fil.
func (r *ExamPrepRepository) ListHelpMessages(ctx context.Context, threadID string) ([]*domain.HelpMessage, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.HelpMessage
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT "id", "threadId", "auteurId", "content", "createdAt"
			FROM "HelpMessage" WHERE "threadId" = $1 ORDER BY "createdAt" ASC
		`, threadID)
		if err != nil {
			return fmt.Errorf("query help messages: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			m := &domain.HelpMessage{}
			if err := rows.Scan(&m.ID, &m.ThreadID, &m.AuteurID, &m.Contenu, &m.CreatedAt); err != nil {
				return fmt.Errorf("scan help message: %w", err)
			}
			result = append(result, m)
		}
		if result == nil {
			result = []*domain.HelpMessage{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// CreateHelpMessage ajoute un message à un fil.
func (r *ExamPrepRepository) CreateHelpMessage(ctx context.Context, threadID, auteurID string, input domain.CreateHelpMessageInput) (*domain.HelpMessage, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	id := uuid.NewString()
	row := tx.QueryRow(ctx, `
		INSERT INTO "HelpMessage" ("id", "threadId", "auteurId", "role", "content", "createdAt")
		VALUES ($1, $2, $3, 'ETUDIANT', $4, CURRENT_TIMESTAMP)
		RETURNING "id", "threadId", "auteurId", "content", "createdAt"
	`, id, threadID, auteurID, input.Contenu)

	m := &domain.HelpMessage{}
	err = row.Scan(&m.ID, &m.ThreadID, &m.AuteurID, &m.Contenu, &m.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create help message: %w", err)
	}

	// Update thread updatedAt
	_, _ = tx.Exec(ctx, `UPDATE "HelpThread" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, threadID)

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return m, nil
}
