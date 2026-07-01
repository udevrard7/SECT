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
//
// EXAM-PREP-STUDENT-DOCS-RLS (fix 2026-07) : les claims RLS sont maintenant
// posés via db.WithTx (pattern GetDashboard). La policy Document_select
// (migration 000034) a une branche is_etudiant() qui laisse passer les
// documents dont l'UE appartient à la filière de l'étudiant. Le scoping
// strict filière + niveau est ASSURÉ EN OUTRE par la clause WHERE ci-dessous
// (défense en profondeur : RLS + SQL).
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
                return nil
        })
        if err != nil {
                return nil, err
        }
        if result == nil {
                result = []*domain.Document{}
        }
        return result, nil
}

// GetUserNiveau récupère le niveau d'un utilisateur depuis la table User.
// EXAM-PREP-NIVEAU-FIX-1 : le JWT SessionClaims n'a pas de champ Niveau,
// on le récupère depuis la DB. Retourne "" si l'utilisateur n'existe pas
// ou si la colonne "niveau" est NULL.
//
// EXAM-PREP-STUDENT-DOCS-RLS : claims RLS posés via db.WithTx (la policy
// User_select exige current_user_id() = User.id pour les étudiants).
func (r *ExamPrepRepository) GetUserNiveau(ctx context.Context, userID string) (string, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return "", fmt.Errorf("no RLS claims in context")
        }

        var niveau *string
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                err := tx.QueryRow(ctx, `
                        SELECT "niveau" FROM "User" WHERE "id" = $1
                `, userID).Scan(&niveau)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return nil // pas d'erreur : niveau vide
                        }
                        return fmt.Errorf("query user niveau: %w", err)
                }
                return nil
        })
        if err != nil {
                return "", err
        }
        if niveau == nil {
                return "", nil
        }
        return *niveau, nil
}

// GetDocumentContent récupère le contenu textuel d'un document.
// EXAM-PREP-CONNECT-1 — Étape 3 : utilisé par le Q&A RAG pour construire
// le prompt avec le contexte du document.
//
// EXAM-PREP-STUDENT-DOCS-RLS : claims RLS posés via db.WithTx. Le scoping
// strict filière+niveau est assuré côté usecase via CheckDocumentAccess
// (appelé avant cette méthode pour les étudiants) + RLS Document_select.
// Si le document n'existe pas ou est supprimé, retourne une chaîne vide.
func (r *ExamPrepRepository) GetDocumentContent(ctx context.Context, documentID string) (string, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return "", fmt.Errorf("no RLS claims in context")
        }

        var contenu *string
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                err := tx.QueryRow(ctx, `
                        SELECT "contenuTexte" FROM "Document"
                        WHERE "id" = $1 AND "deletedAt" IS NULL
                `, documentID).Scan(&contenu)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return nil // pas d'erreur : contenu vide
                        }
                        return fmt.Errorf("query document content: %w", err)
                }
                return nil
        })
        if err != nil {
                return "", err
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

// GetDocumentForReader récupère un document complet (avec contenuTexte) pour
// le lecteur modal (HIGHLIGHT-FLASHCARD-1).
//
// EXAM-PREP-STUDENT-DOCS-RLS : claims RLS posés via db.WithTx. Le scoping
// strict filière+niveau est assuré côté usecase via CheckDocumentAccess
// (appelé avant pour les étudiants) + RLS Document_select.
func (r *ExamPrepRepository) GetDocumentForReader(ctx context.Context, documentID string) (*domain.Document, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var d *domain.Document
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Document" d WHERE d."id" = $1 AND d."deletedAt" IS NULL`, columnsDocument), documentID)
                doc, err := scanDocument(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "Document", ID: documentID}
                        }
                        return fmt.Errorf("query document for reader: %w", err)
                }
                d = doc
                return nil
        })
        if err != nil {
                return nil, err
        }
        return d, nil
}

// CheckDocumentAccess vérifie qu'un document appartient à une UE de la
// filière + niveau de l'étudiant. EXAM-PREP-READER-SECURITY-FIX-1.
//
// EXAM-PREP-STUDENT-DOCS-RLS : claims RLS posés via db.WithTx.
func (r *ExamPrepRepository) CheckDocumentAccess(ctx context.Context, documentID, filiereID, niveau string) (bool, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return false, fmt.Errorf("no RLS claims in context")
        }

        var exists bool
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `
                        SELECT EXISTS(
                                SELECT 1 FROM "Document" d
                                JOIN "UniteEnseignement" ue ON ue."id" = d."uniteEnseignementId"
                                WHERE d."id" = $1 AND d."deletedAt" IS NULL
                                        AND ue."filiereId" = $2
                                        AND (ue."niveau" = $3 OR ue."niveaux" LIKE $4)
                        )
                `, documentID, filiereID, niveau, "%\""+niveau+"\"%").Scan(&exists)
        })
        if err != nil {
                return false, fmt.Errorf("check document access: %w", err)
        }
        return exists, nil
}

// ============================================================
// BATCH LOOKUPS (DOC-ANALYZER-2)
// ============================================================

// ListChaptersByDocumentIDs retourne les chapitres groupés par documentId.
// Ordre : "ordre" ASC. Retourne une map vide (non-nil) si docIDs est vide.
//
// EXAM-PREP-STUDENT-DOCS-RLS : claims RLS posés via db.WithTx (la policy
// Chapter_select a maintenant une branche is_etudiant() via la filière de
// l'UE du document parent — migration 000034).
func (r *ExamPrepRepository) ListChaptersByDocumentIDs(ctx context.Context, docIDs []string) (map[string][]*domain.Chapter, error) {
        result := make(map[string][]*domain.Chapter)
        if len(docIDs) == 0 {
                return result, nil
        }

        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
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

        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query chapters: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        ch := &domain.Chapter{}
                        if err := rows.Scan(&ch.ID, &ch.DocumentID, &ch.Titre, &ch.Ordre, &ch.Sujets, &ch.CreatedAt); err != nil {
                                return fmt.Errorf("scan chapter: %w", err)
                        }
                        result[ch.DocumentID] = append(result[ch.DocumentID], ch)
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// ListUEsByIDs retourne les unités d'enseignement par ID (batch).
// Seuls id/code/nom/creditsECTS sont lus.
//
// EXAM-PREP-STUDENT-DOCS-RLS : claims RLS posés via db.WithTx (la policy
// UniteEnseignement_select a déjà une branche is_etudiant() depuis 000024).
func (r *ExamPrepRepository) ListUEsByIDs(ctx context.Context, ueIDs []string) (map[string]*domain.UniteEnseignement, error) {
        result := make(map[string]*domain.UniteEnseignement)
        if len(ueIDs) == 0 {
                return result, nil
        }

        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
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

        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query UEs: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        ue := &domain.UniteEnseignement{}
                        if err := rows.Scan(&ue.ID, &ue.Code, &ue.Nom, &ue.CreditsECTS); err != nil {
                                return fmt.Errorf("scan UE: %w", err)
                        }
                        result[ue.ID] = ue
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// ListUserRefsByIDs retourne des références utilisateurs par ID (batch).
// Seuls id/name/email sont lus (métadonnées de propriétaire de document).
//
// EXAM-PREP-STUDENT-DOCS-RLS : claims RLS posés via db.WithTx. La policy
// User_select (000024) restreint les étudiants aux enseignants de leur
// filière — ce qui est exactement le périmètre attendu pour afficher le
// nom du propriétaire d'un document consulté par l'étudiant.
func (r *ExamPrepRepository) ListUserRefsByIDs(ctx context.Context, userIDs []string) (map[string]*domain.UserRef, error) {
        result := make(map[string]*domain.UserRef)
        if len(userIDs) == 0 {
                return result, nil
        }

        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
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

        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query users: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        u := &domain.UserRef{}
                        if err := rows.Scan(&u.ID, &u.Name, &u.Email); err != nil {
                                return fmt.Errorf("scan user: %w", err)
                        }
                        result[u.ID] = u
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// ============================================================
// REVIEW (spaced repetition)
// ============================================================

// ListReviewItems liste les items de révision (dus si DueOnly).
func (r *ExamPrepRepository) ListReviewItems(ctx context.Context, params domain.ReviewListParams) ([]*domain.ReviewItem, error) {
        // REVIEW-FIX-1 : RLS désactivé (scoping userId déjà en SQL WHERE clause).
        // Pattern identique à ListStudentDocuments, GetDocumentContent.
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

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
                       "nextReviewAt", "lastReviewedAt", "repetitions", "createdAt", "updatedAt"
                FROM "ReviewItem" WHERE %s ORDER BY "nextReviewAt" ASC
        `, strings.Join(where, " AND "))

        rows, err := tx.Query(ctx, query, args...)
        if err != nil {
                return nil, fmt.Errorf("query review items: %w", err)
        }
        defer rows.Close()

        var result []*domain.ReviewItem
        for rows.Next() {
                item := &domain.ReviewItem{}
                if err := rows.Scan(&item.ID, &item.UserID, &item.ChapterID, &item.QuestionID,
                        &item.Interval, &item.EaseFactor, &item.NextReviewAt, &item.LastReviewAt,
                        &item.Repetitions, &item.CreatedAt, &item.UpdatedAt); err != nil {
                        return nil, fmt.Errorf("scan review item: %w", err)
                }
                result = append(result, item)
        }
        if result == nil {
                result = []*domain.ReviewItem{}
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
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
                        "lastReviewedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
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
                                "lastReviewedAt", "createdAt", "updatedAt")
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
                                "lastReviewedAt" = CURRENT_TIMESTAMP,
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
                        // P1-A5 : filtrer par document owner au lieu de enseignantId IS NULL
                        // (enseignantId est toujours NULL → l'ancien filtre matchait tous les threads)
                        where = `WHERE d."ownerId" = $1`
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

        tag, err := tx.Exec(ctx, `UPDATE "HelpThread" SET "statut" = 'CLOS', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, threadID)
        if err != nil {
                return fmt.Errorf("close help thread: %w", err)
        }
        if tag.RowsAffected() == 0 {
                return &domain.NotFoundError{Entity: "HelpThread", ID: threadID}
        }

        return tx.Commit(ctx)
}

// DeleteHelpThread supprime un fil + ses messages (hard delete cascade).
func (r *ExamPrepRepository) DeleteHelpThread(ctx context.Context, threadID string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // Supprimer les messages d'abord (pas de FK cascade garantie)
        _, err = tx.Exec(ctx, `DELETE FROM "HelpMessage" WHERE "threadId" = $1`, threadID)
        if err != nil {
                return fmt.Errorf("delete help messages: %w", err)
        }

        // Supprimer le thread
        tag, err := tx.Exec(ctx, `DELETE FROM "HelpThread" WHERE "id" = $1`, threadID)
        if err != nil {
                return fmt.Errorf("delete help thread: %w", err)
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
func (r *ExamPrepRepository) CreateHelpMessage(ctx context.Context, threadID, auteurID, role string, input domain.CreateHelpMessageInput) (*domain.HelpMessage, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // P1-A4 : utiliser le rôle réel (claims.Role) au lieu de hardcoded 'ETUDIANT'
        id := uuid.NewString()
        row := tx.QueryRow(ctx, `
                INSERT INTO "HelpMessage" ("id", "threadId", "auteurId", "role", "content", "createdAt")
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                RETURNING "id", "threadId", "auteurId", "content", "createdAt"
        `, id, threadID, auteurID, role, input.Contenu)

        m := &domain.HelpMessage{}
        err = row.Scan(&m.ID, &m.ThreadID, &m.AuteurID, &m.Contenu, &m.CreatedAt)
        if err != nil {
                return nil, fmt.Errorf("create help message: %w", err)
        }

        // P1-A8 : si l'enseignant répond, passer le thread à REPONDU
        if role == "ENSEIGNANT" {
                _, _ = tx.Exec(ctx, `UPDATE "HelpThread" SET "updatedAt" = CURRENT_TIMESTAMP, "statut" = 'REPONDU' WHERE "id" = $1`, threadID)
        } else {
                _, _ = tx.Exec(ctx, `UPDATE "HelpThread" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, threadID)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return m, nil
}

// ============================================================
// FLASHCARDS (HIGHLIGHT-FLASHCARD-1)
// ============================================================

// CreateFlashcard insère une nouvelle Flashcard dans la table "Flashcard".
// RLS désactivé : écriture système déclenchée par l'étudiant
// (la table Flashcard n'a pas de politique RLS étudiant).
//
// HIGHLIGHT-FLASHCARD-1 : la table Flashcard n'a pas de colonne userId.
// L'appartenance est dérivée via ReviewItem (cf. CreateFlashcardReviewItem).
func (r *ExamPrepRepository) CreateFlashcard(ctx context.Context, input domain.CreateFlashcardInput) (*domain.Flashcard, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        id := uuid.NewString()
        row := tx.QueryRow(ctx, `
                INSERT INTO "Flashcard" ("id", "chapterId", "documentId", "recto", "verso", "createdAt")
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                RETURNING "id", "chapterId", "documentId", "recto", "verso", "createdAt"
        `, id, nullableStrPtr(input.ChapterID), nullableStrPtr(input.DocumentID), input.Recto, input.Verso)

        f := &domain.Flashcard{}
        var chapterID, documentID *string
        if err := row.Scan(&f.ID, &chapterID, &documentID, &f.Recto, &f.Verso, &f.CreatedAt); err != nil {
                return nil, fmt.Errorf("create flashcard: %w", err)
        }
        f.ChapterID = chapterID
        f.DocumentID = documentID

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return f, nil
}

// ListFlashcards liste les flashcards d'un utilisateur. Le lien user↔flashcard
// est assuré par JOIN ReviewItem : r.questionId = f.id AND r.userId = $1.
// Si documentID != "", on filtre en plus par f.documentId = $2.
//
// Pas de placeholder réutilisé : si documentID == "", on construit la
// requête avec un seul paramètre ($1 = userID) ; sinon avec deux ($1=userID,
// $2=documentID). Compatible pgx Simple Protocol.
func (r *ExamPrepRepository) ListFlashcards(ctx context.Context, userID, documentID string) ([]*domain.Flashcard, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.Flashcard
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var query string
                var args []any
                if documentID != "" {
                        query = `
                                SELECT f."id", f."chapterId", f."documentId", f."recto", f."verso", f."createdAt"
                                FROM "Flashcard" f
                                JOIN "ReviewItem" r ON r."questionId" = f."id"
                                WHERE r."userId" = $1 AND f."documentId" = $2
                                ORDER BY f."createdAt" DESC
                        `
                        args = []any{userID, documentID}
                } else {
                        query = `
                                SELECT f."id", f."chapterId", f."documentId", f."recto", f."verso", f."createdAt"
                                FROM "Flashcard" f
                                JOIN "ReviewItem" r ON r."questionId" = f."id"
                                WHERE r."userId" = $1
                                ORDER BY f."createdAt" DESC
                        `
                        args = []any{userID}
                }

                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query flashcards: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        f := &domain.Flashcard{}
                        var chapterID, documentID *string
                        if err := rows.Scan(&f.ID, &chapterID, &documentID, &f.Recto, &f.Verso, &f.CreatedAt); err != nil {
                                return fmt.Errorf("scan flashcard: %w", err)
                        }
                        f.ChapterID = chapterID
                        f.DocumentID = documentID
                        result = append(result, f)
                }
                if result == nil {
                        result = []*domain.Flashcard{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// DeleteFlashcard supprime la flashcard ET son ReviewItem associé.
// L'ordre importe : on supprime d'abord le ReviewItem (pas de FK vers Flashcard
// → cascade manuelle), puis la Flashcard. Si la flashcard n'existe pas ou
// n'appartient pas à l'utilisateur, on retourne NotFoundError.
//
// RLS off : la table Flashcard n'a pas de politique RLS étudiant.
func (r *ExamPrepRepository) DeleteFlashcard(ctx context.Context, userID, flashcardID string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // 1. Supprimer le ReviewItem associé (s'il existe). La condition
        //    userId + questionId garantit qu'on ne touche que le ReviewItem de CET
        //    utilisateur pour CETTE flashcard.
        _, _ = tx.Exec(ctx, `
                DELETE FROM "ReviewItem" WHERE "userId" = $1 AND "questionId" = $2
        `, userID, flashcardID)

        // 2. Supprimer la Flashcard. Si RowsAffected == 0, elle n'existe pas
        //    (ou a déjà été supprimée) → NotFoundError.
        tag, err := tx.Exec(ctx, `DELETE FROM "Flashcard" WHERE "id" = $1`, flashcardID)
        if err != nil {
                return fmt.Errorf("delete flashcard: %w", err)
        }
        if tag.RowsAffected() == 0 {
                return &domain.NotFoundError{Entity: "Flashcard", ID: flashcardID}
        }

        return tx.Commit(ctx)
}

// CreateFlashcardReviewItem insère un ReviewItem pour une flashcard fraîchement
// créée. Le champ questionId stocke l'ID de la flashcard (convention
// HIGHLIGHT-FLASHCARD-1 — réutilisation de la colonne existante, pas de
// migration).
//
// Defaults SM-2 : interval=0, easeFactor=2.5, repetitions=0,
// nextReviewAt=CURRENT_TIMESTAMP (dû immédiatement). L'étudiant pourra
// marquer la flashcard comme révisée via /api/exam-prep/review (MarkReviewed)
// qui appliquera la formule SM-2 sur le premier review.
//
// RLS off : écriture système.
func (r *ExamPrepRepository) CreateFlashcardReviewItem(ctx context.Context, userID, flashcardID string, chapterID *string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        var chapArg any
        if chapterID != nil && *chapterID != "" {
                chapArg = *chapterID
        }

        reviewID := uuid.NewString()
        _, err = tx.Exec(ctx, `
                INSERT INTO "ReviewItem" ("id", "userId", "chapterId", "questionId",
                        "interval", "easeFactor", "repetitions", "nextReviewAt",
                        "lastReviewedAt", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, 0, 2.5, 0,
                        CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, reviewID, userID, chapArg, flashcardID)
        if err != nil {
                return fmt.Errorf("create flashcard review item: %w", err)
        }

        return tx.Commit(ctx)
}

// ============================================================
// QUESTION BANK — votes collaboratifs + cache (QUESTION-BANK-1)
// ============================================================

// VoteQuestion upsert un vote (+1/-1) d'un utilisateur sur une question.
// Stratégie : tente un INSERT ; si la contrainte UNIQUE("questionId","userId")
// est violée (SQLSTATE 23505), on UPDATE la valeur existante.
//
// RLS désactivé : écriture système (un étudiant peut voter sur n'importe quelle
// question validée de la banque — le scoping filière est assuré par le fait
// que l'étudiant n'accède qu'aux documents de sa filière côté frontend, et
// le backend trust le questionID passé par un utilisateur authentifié).
func (r *ExamPrepRepository) VoteQuestion(ctx context.Context, userID, questionID string, value int) (*domain.QuestionVote, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        id := uuid.NewString()
        vote := &domain.QuestionVote{
                ID:         id,
                QuestionID: questionID,
                UserID:     userID,
                Value:      value,
        }
        // Tentative d'INSERT. Si l'utilisateur a déjà voté → 23505 → on bascule en UPDATE.
        err = tx.QueryRow(ctx, `
                INSERT INTO "QuestionVote" ("id", "questionId", "userId", "value", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING "id", "questionId", "userId", "value", "createdAt", "updatedAt"
        `, id, questionID, userID, value).Scan(
                &vote.ID, &vote.QuestionID, &vote.UserID, &vote.Value, &vote.CreatedAt, &vote.UpdatedAt,
        )
        if err == nil {
                if err := tx.Commit(ctx); err != nil {
                        return nil, fmt.Errorf("commit: %w", err)
                }
                return vote, nil
        }

        // INSERT a échoué. Si ce n'est PAS une violation de contrainte unique → propager.
        if !isUniqueViolation(err) {
                return nil, fmt.Errorf("insert question vote: %w", err)
        }

        // 23505 → l'utilisateur a déjà voté → UPDATE de la valeur existante.
        // On réutilise la variable `vote` déclarée plus haut (QuestionID/UserID
        // déjà positionnés) ; le UPDATE RETURNING rescanne ID/Value/timestamps.
        err = tx.QueryRow(ctx, `
                UPDATE "QuestionVote" SET "value" = $3, "updatedAt" = CURRENT_TIMESTAMP
                WHERE "questionId" = $1 AND "userId" = $2
                RETURNING "id", "value", "createdAt", "updatedAt"
        `, questionID, userID, value).Scan(&vote.ID, &vote.Value, &vote.CreatedAt, &vote.UpdatedAt)
        if err != nil {
                return nil, fmt.Errorf("update question vote: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return vote, nil
}

// RemoveVote supprime le vote d'un utilisateur sur une question (un-vote).
// RLS off. No-op (pas d'erreur) si le vote n'existait pas.
func (r *ExamPrepRepository) RemoveVote(ctx context.Context, userID, questionID string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        _, err = tx.Exec(ctx, `
                DELETE FROM "QuestionVote" WHERE "questionId" = $1 AND "userId" = $2
        `, questionID, userID)
        if err != nil {
                return fmt.Errorf("delete question vote: %w", err)
        }

        return tx.Commit(ctx)
}

// ListQuestionBank liste les questions validées d'un document avec les stats
// de vote agrégées + le vote du user courant.
//
// RLS activé (db.WithTx + claims) : lecture student-scoped. Le paramètre
// chapterID est accepté mais IGNORÉ en v1 (la table Question n'a pas de
// colonne chapterId — filtrage par documentId uniquement).
//
// Requête : LEFT JOIN QuestionVote v (tous les votes) pour l'agrégation,
// LEFT JOIN QuestionVote v2 (vote du user courant) pour userVote. Le GROUP BY
// q.id + v2.value est correct : v2.value est constant pour un (question, user)
// donné, donc une seule ligne agrégée par question.
//
// Placeholders : $1=documentId, $2=userId, $3=limit, $4=offset (tous distincts
// → compatible pgx Simple Protocol).
func (r *ExamPrepRepository) ListQuestionBank(ctx context.Context, userID, documentID string, chapterID *string, limit, offset int) ([]*domain.QuestionBankItem, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        if limit <= 0 || limit > 200 {
                limit = 50
        }
        if offset < 0 {
                offset = 0
        }

        var result []*domain.QuestionBankItem
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(ctx, `
                        SELECT q."id", q."documentId", q."auteurId", q."type", q."enonce",
                               q."propositions", q."reponseCorrecte", q."explication",
                               q."difficulte", q."themes", q."validee", q."createdAt",
                               COALESCE(SUM(CASE WHEN v."value" > 0 THEN v."value" ELSE 0 END), 0)::int AS upvotes,
                               COALESCE(SUM(CASE WHEN v."value" < 0 THEN -v."value" ELSE 0 END), 0)::int AS downvotes,
                               COALESCE(SUM(v."value"), 0)::int AS netvotes,
                               v2."value" AS uservote
                        FROM "Question" q
                        LEFT JOIN "QuestionVote" v ON v."questionId" = q."id"
                        LEFT JOIN "QuestionVote" v2 ON v2."questionId" = q."id" AND v2."userId" = $2
                        WHERE q."documentId" = $1 AND q."deletedAt" IS NULL AND q."validee" = true
                        GROUP BY q."id", q."documentId", q."auteurId", q."type", q."enonce",
                                 q."propositions", q."reponseCorrecte", q."explication",
                                 q."difficulte", q."themes", q."validee", q."createdAt", v2."value"
                        ORDER BY netvotes DESC, q."createdAt" DESC
                        LIMIT $3 OFFSET $4
                `, documentID, userID, limit, offset)
                if err != nil {
                        return fmt.Errorf("query question bank: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        item := &domain.QuestionBankItem{}
                        var userVote *int
                        if err := rows.Scan(
                                &item.ID, &item.DocumentID, &item.AuteurID, &item.Type, &item.Enonce,
                                &item.Propositions, &item.ReponseCorrecte, &item.Explication,
                                &item.Difficulte, &item.Themes, &item.Validee, &item.CreatedAt,
                                &item.Upvotes, &item.Downvotes, &item.NetVotes, &userVote,
                        ); err != nil {
                                return fmt.Errorf("scan question bank item: %w", err)
                        }
                        item.UserVote = userVote
                        result = append(result, item)
                }
                if result == nil {
                        result = []*domain.QuestionBankItem{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// CountQuestionsByDocument compte les questions validées d'un document.
// Utilisé par le cache check dans practice/generate. Le paramètre chapterID
// est ignoré en v1 ; difficulte est appliqué si non-nil (dynamic query).
//
// RLS activé : lecture student-scoped.
func (r *ExamPrepRepository) CountQuestionsByDocument(ctx context.Context, documentID string, chapterID *string, difficulte *string) (int, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return 0, fmt.Errorf("no RLS claims in context")
        }

        var count int
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                query := `SELECT count(*)::int FROM "Question" WHERE "documentId" = $1 AND "deletedAt" IS NULL AND "validee" = true`
                args := []any{documentID}
                if difficulte != nil && *difficulte != "" {
                        query += ` AND "difficulte" = $2`
                        args = append(args, *difficulte)
                }
                return tx.QueryRow(ctx, query, args...).Scan(&count)
        })
        if err != nil {
                return 0, err
        }
        return count, nil
}

// ListExistingQuestions retourne des questions validées existantes pour servir
// le cache (sans les joins de vote — plus léger que ListQuestionBank).
// Ordonné par createdAt DESC (questions les plus récentes d'abord).
//
// Le paramètre chapterID est ignoré en v1 ; difficulte est appliqué si non-nil.
//
// RLS activé : lecture student-scoped.
func (r *ExamPrepRepository) ListExistingQuestions(ctx context.Context, documentID string, chapterID *string, difficulte *string, limit int) ([]*domain.QuestionBankItem, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        if limit <= 0 || limit > 200 {
                limit = 50
        }

        var result []*domain.QuestionBankItem
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                query := `
                        SELECT "id", "documentId", "auteurId", "type", "enonce",
                               "propositions", "reponseCorrecte", "explication",
                               "difficulte", "themes", "validee", "createdAt"
                        FROM "Question"
                        WHERE "documentId" = $1 AND "deletedAt" IS NULL AND "validee" = true
                `
                args := []any{documentID}
                argIdx := 2
                if difficulte != nil && *difficulte != "" {
                        query += fmt.Sprintf(` AND "difficulte" = $%d`, argIdx)
                        args = append(args, *difficulte)
                        argIdx++
                }
                query += fmt.Sprintf(` ORDER BY "createdAt" DESC LIMIT $%d`, argIdx)
                args = append(args, limit)

                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query existing questions: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        item := &domain.QuestionBankItem{}
                        if err := rows.Scan(
                                &item.ID, &item.DocumentID, &item.AuteurID, &item.Type, &item.Enonce,
                                &item.Propositions, &item.ReponseCorrecte, &item.Explication,
                                &item.Difficulte, &item.Themes, &item.Validee, &item.CreatedAt,
                        ); err != nil {
                                return fmt.Errorf("scan existing question: %w", err)
                        }
                        result = append(result, item)
                }
                if result == nil {
                        result = []*domain.QuestionBankItem{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// ============================================================
// DOCUMENT AUDIO (AUDIO-LEARNING-1 — Mode Audio-Learning)
// ============================================================

// CreateDocumentAudio insère une nouvelle ligne DocumentAudio avec le statut
// EN_COURS et un script vide (le worker le remplira après génération IA).
// RLS désactivé : écriture système (le worker/handler n'a pas de claims HTTP).
func (r *ExamPrepRepository) CreateDocumentAudio(ctx context.Context, input domain.CreateDocumentAudioInput) (*domain.DocumentAudio, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        id := uuid.NewString()
        audio := &domain.DocumentAudio{
                ID:         id,
                DocumentID: input.DocumentID,
                UserID:     input.UserID,
                Script:     input.Script,
                Status:     "EN_COURS",
        }

        err = tx.QueryRow(ctx, `
                INSERT INTO "DocumentAudio" ("id", "documentId", "userId", "script",
                        "r2Key", "durationSec", "status", "errorMessage",
                        "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, NULL, NULL, $5, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING "createdAt", "updatedAt"
        `, id, input.DocumentID, input.UserID, input.Script, "EN_COURS").Scan(&audio.CreatedAt, &audio.UpdatedAt)
        if err != nil {
                return nil, fmt.Errorf("insert document audio: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return audio, nil
}

// UpdateDocumentAudioStatus met à jour le statut d'un audio (+ r2Key et/ou
// errorMessage si non-nil). RLS désactivé : écriture système (worker).
func (r *ExamPrepRepository) UpdateDocumentAudioStatus(ctx context.Context, audioID, status string, r2Key *string, errorMessage *string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if r2Key != nil && errorMessage != nil {
                _, err = tx.Exec(ctx, `
                        UPDATE "DocumentAudio"
                        SET "status" = $1, "r2Key" = $2, "errorMessage" = $3, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $4
                `, status, *r2Key, *errorMessage, audioID)
        } else if r2Key != nil {
                _, err = tx.Exec(ctx, `
                        UPDATE "DocumentAudio"
                        SET "status" = $1, "r2Key" = $2, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $3
                `, status, *r2Key, audioID)
        } else if errorMessage != nil {
                _, err = tx.Exec(ctx, `
                        UPDATE "DocumentAudio"
                        SET "status" = $1, "errorMessage" = $2, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $3
                `, status, *errorMessage, audioID)
        } else {
                _, err = tx.Exec(ctx, `
                        UPDATE "DocumentAudio"
                        SET "status" = $1, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $2
                `, status, audioID)
        }
        if err != nil {
                return fmt.Errorf("update document audio status: %w", err)
        }

        return tx.Commit(ctx)
}

// UpdateDocumentAudioScript met à jour uniquement le script d'un audio
// (avant la synthèse TTS). RLS désactivé : écriture système (worker).
func (r *ExamPrepRepository) UpdateDocumentAudioScript(ctx context.Context, audioID, script string) error {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        _, err = tx.Exec(ctx, `
                UPDATE "DocumentAudio"
                SET "script" = $1, "updatedAt" = CURRENT_TIMESTAMP
                WHERE "id" = $2
        `, script, audioID)
        if err != nil {
                return fmt.Errorf("update document audio script: %w", err)
        }

        return tx.Commit(ctx)
}

// ListDocumentAudio liste tous les audios d'un document, ordonnés par
// createdAt DESC. RLS désactivé : lecture système (les audios sont
// partagés entre étudiants d'une même filière — comme les questions de
// la banque collaborative).
func (r *ExamPrepRepository) ListDocumentAudio(ctx context.Context, documentID string) ([]*domain.DocumentAudio, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        rows, err := tx.Query(ctx, `
                SELECT "id", "documentId", "userId", "script", "r2Key",
                       "durationSec", "status", "errorMessage", "createdAt", "updatedAt"
                FROM "DocumentAudio"
                WHERE "documentId" = $1
                ORDER BY "createdAt" DESC
        `, documentID)
        if err != nil {
                return nil, fmt.Errorf("query document audio: %w", err)
        }
        defer rows.Close()

        var result []*domain.DocumentAudio
        for rows.Next() {
                a := &domain.DocumentAudio{}
                if err := rows.Scan(
                        &a.ID, &a.DocumentID, &a.UserID, &a.Script, &a.R2Key,
                        &a.DurationSec, &a.Status, &a.ErrorMessage, &a.CreatedAt, &a.UpdatedAt,
                ); err != nil {
                        return nil, fmt.Errorf("scan document audio: %w", err)
                }
                result = append(result, a)
        }
        if result == nil {
                result = []*domain.DocumentAudio{}
        }

        tx.Commit(ctx)
        return result, nil
}

// GetDocumentAudio récupère un audio par son ID. RLS désactivé : lecture système.
func (r *ExamPrepRepository) GetDocumentAudio(ctx context.Context, audioID string) (*domain.DocumentAudio, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        a := &domain.DocumentAudio{}
        err = tx.QueryRow(ctx, `
                SELECT "id", "documentId", "userId", "script", "r2Key",
                       "durationSec", "status", "errorMessage", "createdAt", "updatedAt"
                FROM "DocumentAudio"
                WHERE "id" = $1
        `, audioID).Scan(
                &a.ID, &a.DocumentID, &a.UserID, &a.Script, &a.R2Key,
                &a.DurationSec, &a.Status, &a.ErrorMessage, &a.CreatedAt, &a.UpdatedAt,
        )
        if err != nil {
                return nil, fmt.Errorf("get document audio: %w", err)
        }

        tx.Commit(ctx)
        return a, nil
}
