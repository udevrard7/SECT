// Package repository — implémentation SessionRepository + ResultatRepository.
package repository

import (
        "context"
        "encoding/json"
        "fmt"
        "strings"
        "time"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        "github.com/jackc/pgx/v5/pgxpool"
        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
)

// ============================================================
// SESSION REPOSITORY
// ============================================================

// SessionRepository implémente domain.SessionRepository.
type SessionRepository struct {
        pool *pgxpool.Pool
}

// NewSessionRepository crée un nouveau SessionRepository.
func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
        return &SessionRepository{pool: pool}
}

const columnsSession = `"id", "etudiantId", "epreuveId", "statut", "dateDebut", "dateFin",
        "score", "logEvents", "alertes", "createdAt", "updatedAt",
        "propositionMappings", "penalite"`

func scanSession(s scanner) (*domain.SessionPassation, error) {
        sess := &domain.SessionPassation{}
        err := s.Scan(
                &sess.ID, &sess.EtudiantID, &sess.EpreuveID, &sess.Statut,
                &sess.DateDebut, &sess.DateFin, &sess.Score,
                &sess.LogEvents, &sess.Alertes, &sess.CreatedAt, &sess.UpdatedAt,
                &sess.PropositionMappings, &sess.Penalite,
        )
        if err != nil {
                return nil, err
        }
        // Sanitize json.RawMessage
        sess.LogEvents = sanitizeRawMessage(sess.LogEvents)
        sess.PropositionMappings = sanitizeRawMessage(sess.PropositionMappings)
        return sess, nil
}

// FindByID récupère une session par ID (RLS actif).
func (r *SessionRepository) FindByID(ctx context.Context, id string) (*domain.SessionPassation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var sess *domain.SessionPassation
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "SessionPassation" WHERE "id" = $1`, columnsSession), id)
                s, err := scanSession(row)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return &domain.NotFoundError{Entity: "SessionPassation", ID: id}
                        }
                        return fmt.Errorf("query session: %w", err)
                }
                sess = s
                return nil
        })
        if err != nil {
                return nil, err
        }
        return sess, nil
}

// List liste les sessions (RLS actif).
func (r *SessionRepository) List(ctx context.Context, params domain.SessionListParams) ([]*domain.SessionPassation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []*domain.SessionPassation
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                if params.EtudiantID != "" {
                        where = append(where, fmt.Sprintf(`"etudiantId" = $%d`, argIdx))
                        args = append(args, params.EtudiantID)
                        argIdx++
                }
                if params.EpreuveID != "" {
                        where = append(where, fmt.Sprintf(`"epreuveId" = $%d`, argIdx))
                        args = append(args, params.EpreuveID)
                        argIdx++
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                query := fmt.Sprintf(`SELECT %s FROM "SessionPassation" %s ORDER BY "createdAt" DESC`, columnsSession, whereClause)
                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query sessions: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        s, err := scanSession(rows)
                        if err != nil {
                                return fmt.Errorf("scan session: %w", err)
                        }
                        result = append(result, s)
                }
                if result == nil {
                        result = []*domain.SessionPassation{}
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// FindByEtudiantAndEpreuve cherche une session existante (bypass RLS pour vérif).
func (r *SessionRepository) FindByEtudiantAndEpreuve(ctx context.Context, etudiantID, epreuveID string) (*domain.SessionPassation, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "SessionPassation" WHERE "etudiantId" = $1 AND "epreuveId" = $2 ORDER BY "createdAt" DESC LIMIT 1`, columnsSession), etudiantID, epreuveID)
        sess, err := scanSession(row)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, nil // pas de session existante
                }
                return nil, fmt.Errorf("query session: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return sess, nil
}

// Create crée une nouvelle session (bypass RLS — étudiant crée sa propre session).
func (r *SessionRepository) Create(ctx context.Context, etudiantID, epreuveID string, propositionMappings json.RawMessage) (*domain.SessionPassation, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // SESSION-RLS-FIX : poser les claims RLS pour activer SessionPassation_modify_etudiant.
        if err := db.SetClaimsTx(ctx, tx, claims); err != nil {
                return nil, fmt.Errorf("set claims: %w", err)
        }

        id := uuid.NewString()
        now := time.Now()
        logEvents := []byte(`[{"type":"SESSION_START","timestamp":"` + now.Format(time.RFC3339) + `"}]`)

        var propMap any
        if len(propositionMappings) > 0 && string(propositionMappings) != "null" {
                propMap = []byte(propositionMappings)
        }

        row := tx.QueryRow(ctx, `
                INSERT INTO "SessionPassation" ("id", "etudiantId", "epreuveId", "statut", "dateDebut",
                        "score", "logEvents", "alertes", "createdAt", "updatedAt",
                        "propositionMappings", "penalite")
                VALUES ($1, $2, $3, 'EN_COURS', $4, NULL, $5, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $6, 0)
                RETURNING `+columnsSession,
                id, etudiantID, epreuveID, now, logEvents, propMap)

        sess, err := scanSession(row)
        if err != nil {
                return nil, fmt.Errorf("create session: %w", err)
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return sess, nil
}

// UpdateStatut met à jour le statut d'une session (bypass RLS).
func (r *SessionRepository) UpdateStatut(ctx context.Context, id string, statut domain.StatutSession, score *float64, dateFin *time.Time) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // SESSION-RLS-FIX : poser les claims RLS.
        if err := db.SetClaimsTx(ctx, tx, claims); err != nil {
                return fmt.Errorf("set claims: %w", err)
        }

        _, err = tx.Exec(ctx, `
                UPDATE "SessionPassation" SET "statut" = $2, "score" = $3, "dateFin" = $4,
                        "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1
        `, id, statut, score, dateFin)
        if err != nil {
                return fmt.Errorf("update session statut: %w", err)
        }

        return tx.Commit(ctx)
}

// SaveReponse upsert une réponse (bypass RLS — étudiant sauvegarde ses réponses).
func (r *SessionRepository) SaveReponse(ctx context.Context, sessionID, questionID, contenu string) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // SESSION-RLS-FIX : poser les claims RLS pour activer Reponse_modify_etudiant.
        if err := db.SetClaimsTx(ctx, tx, claims); err != nil {
                return fmt.Errorf("set claims: %w", err)
        }

        var contenuVal any
        if contenu != "" {
                contenuVal = contenu
        }

        _, err = tx.Exec(ctx, `
                INSERT INTO "Reponse" ("id", "sessionId", "questionId", "contenu")
                VALUES ($1, $2, $3, $4)
                ON CONFLICT ("sessionId", "questionId") DO UPDATE SET "contenu" = $4
        `, uuid.NewString(), sessionID, questionID, contenuVal)
        if err != nil {
                return fmt.Errorf("upsert reponse: %w", err)
        }

        return tx.Commit(ctx)
}

// GetReponses récupère les réponses d'une session (RLS actif).
func (r *SessionRepository) GetReponses(ctx context.Context, sessionID string) ([]domain.Reponse, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var result []domain.Reponse
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(ctx, `
                        SELECT "id", "sessionId", "questionId", "contenu", "score",
                               "commentaire", "noteIA", "justificationIA"
                        FROM "Reponse" WHERE "sessionId" = $1
                `, sessionID)
                if err != nil {
                        return fmt.Errorf("query reponses: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        var rep domain.Reponse
                        if err := rows.Scan(&rep.ID, &rep.SessionID, &rep.QuestionID, &rep.Contenu,
                                &rep.Score, &rep.Commentaire, &rep.NoteIA, &rep.JustificationIA); err != nil {
                                return fmt.Errorf("scan reponse: %w", err)
                        }
                        result = append(result, rep)
                }
                return nil
        })
        if err != nil {
                return nil, err
        }
        return result, nil
}

// UpdateReponseScore met à jour le score d'une réponse (bypass RLS).
func (r *SessionRepository) UpdateReponseScore(ctx context.Context, reponseID string, score float64) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // SESSION-RLS-FIX : poser les claims RLS. UpdateReponseScore est appelé
        // par l'auto-grading (Submit) — l'étudiant a posé ses claims.
        if err := db.SetClaimsTx(ctx, tx, claims); err != nil {
                return fmt.Errorf("set claims: %w", err)
        }

        _, err = tx.Exec(ctx, `UPDATE "Reponse" SET "score" = $2 WHERE "id" = $1`, reponseID, score)
        if err != nil {
                return fmt.Errorf("update reponse score: %w", err)
        }

        return tx.Commit(ctx)
}

// AddAlerte ajoute une alerte à la session (bypass RLS).
func (r *SessionRepository) AddAlerte(ctx context.Context, sessionID string, penalite float64, alerte domain.AlerteInput) error {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return fmt.Errorf("no RLS claims in context")
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // SESSION-RLS-FIX : poser les claims RLS.
        if err := db.SetClaimsTx(ctx, tx, claims); err != nil {
                return fmt.Errorf("set claims: %w", err)
        }

        // Récupérer logEvents actuel + alertes + penalite
        var logEvents []byte
        var currentAlertes int
        var currentPenalite float64
        err = tx.QueryRow(ctx, `SELECT "logEvents", "alertes", "penalite" FROM "SessionPassation" WHERE "id" = $1`, sessionID).Scan(&logEvents, &currentAlertes, &currentPenalite)
        if err != nil {
                return fmt.Errorf("get session for alerte: %w", err)
        }

        // Parse logEvents, append nouvelle alerte
        var events []map[string]any
        if len(logEvents) > 0 {
                _ = json.Unmarshal(logEvents, &events)
        }
        alerteEvent := map[string]any{
                "type":      alerte.Type,
                "timestamp": time.Now().Format(time.RFC3339),
                "details":   alerte.Details,
                "penalite":  alerte.Penalite,
        }
        events = append(events, alerteEvent)
        newLogEvents, _ := json.Marshal(events)

        _, err = tx.Exec(ctx, `
                UPDATE "SessionPassation" SET "logEvents" = $2, "alertes" = $3, "penalite" = $4,
                        "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1
        `, sessionID, newLogEvents, currentAlertes+1, currentPenalite+penalite)
        if err != nil {
                return fmt.Errorf("update session alerte: %w", err)
        }

        return tx.Commit(ctx)
}

// ============================================================
// RESULTAT REPOSITORY
// ============================================================

// ResultatRepository implémente domain.ResultatRepository.
type ResultatRepository struct {
        pool *pgxpool.Pool
}

// NewResultatRepository crée un nouveau ResultatRepository.
func NewResultatRepository(pool *pgxpool.Pool) *ResultatRepository {
        return &ResultatRepository{pool: pool}
}

// FindBySessionID récupère le résultat d'une session (RLS actif).
func (r *ResultatRepository) FindBySessionID(ctx context.Context, sessionID string) (*domain.Resultat, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        var res *domain.Resultat
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(ctx, `
                        SELECT "id", "sessionId", "scoreFinal", "detailParQuestion",
                               "dateCorrection", "dateRetour", "commentaires", "exporte", "totalPossible"
                        FROM "Resultat" WHERE "sessionId" = $1
                `, sessionID)
                r := &domain.Resultat{}
                err := row.Scan(&r.ID, &r.SessionID, &r.ScoreFinal, &r.DetailParQuestion,
                        &r.DateCorrection, &r.DateRetour, &r.Commentaires, &r.Exporte, &r.TotalPossible)
                if err != nil {
                        if err == pgx.ErrNoRows {
                                return nil // pas de résultat
                        }
                        return fmt.Errorf("query resultat: %w", err)
                }
                r.DetailParQuestion = sanitizeRawMessage(r.DetailParQuestion)
                res = r
                return nil
        })
        if err != nil {
                return nil, err
        }
        return res, nil
}

// Upsert crée ou met à jour un résultat (bypass RLS).
func (r *ResultatRepository) Upsert(ctx context.Context, res *domain.Resultat) (*domain.Resultat, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok {
                return nil, fmt.Errorf("no RLS claims in context")
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // SESSION-RLS-FIX : poser les claims RLS pour activer Resultat_modify_etudiant.
        if err := db.SetClaimsTx(ctx, tx, claims); err != nil {
                return nil, fmt.Errorf("set claims: %w", err)
        }

        var detail any
        if len(res.DetailParQuestion) > 0 && string(res.DetailParQuestion) != "null" {
                detail = []byte(res.DetailParQuestion)
        }

        // Vérifier si un résultat existe déjà
        var existingID *string
        err = tx.QueryRow(ctx, `SELECT "id" FROM "Resultat" WHERE "sessionId" = $1`, res.SessionID).Scan(&existingID)
        if err != nil && err != pgx.ErrNoRows {
                return nil, fmt.Errorf("check existing resultat: %w", err)
        }

        if existingID != nil {
                // Update
                _, err = tx.Exec(ctx, `
                        UPDATE "Resultat" SET "scoreFinal" = $2, "detailParQuestion" = $3,
                                "dateCorrection" = $4, "commentaires" = $5, "totalPossible" = $6
                        WHERE "sessionId" = $1
                `, res.SessionID, res.ScoreFinal, detail, res.DateCorrection, nullableStrPtr(res.Commentaires), res.TotalPossible)
                if err != nil {
                        return nil, fmt.Errorf("update resultat: %w", err)
                }
                res.ID = *existingID
        } else {
                // Insert
                id := uuid.NewString()
                _, err = tx.Exec(ctx, `
                        INSERT INTO "Resultat" ("id", "sessionId", "scoreFinal", "detailParQuestion",
                                "dateCorrection", "dateRetour", "commentaires", "exporte", "totalPossible")
                        VALUES ($1, $2, $3, $4, $5, NULL, $6, false, $7)
                `, id, res.SessionID, res.ScoreFinal, detail, res.DateCorrection,
                        nullableStrPtr(res.Commentaires), res.TotalPossible)
                if err != nil {
                        return nil, fmt.Errorf("insert resultat: %w", err)
                }
                res.ID = id
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return res, nil
}

// ListByEtudiant liste les sessions d'un étudiant avec résultats + épreuve +
// réponses (bypass RLS pour self-access). RESULTATS-FIX-1 : enrichi avec
// Epreuve (titre, enseignant, questions), Resultat et Reponses via batch
// queries (évite N+1, compatible pgx Simple Protocol / Neon PgBouncer).
func (r *ResultatRepository) ListByEtudiant(ctx context.Context, etudiantID string) ([]*domain.SessionPassation, error) {
        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // Query 1 : sessions de l'étudiant (SOUMISE/CORRIGEE/RETOURNEE).
        rows, err := tx.Query(ctx, `
                SELECT s."id", s."etudiantId", s."epreuveId", s."statut", s."dateDebut", s."dateFin",
                       s."score", s."logEvents", s."alertes", s."createdAt", s."updatedAt",
                       s."propositionMappings", s."penalite"
                FROM "SessionPassation" s
                WHERE s."etudiantId" = $1 AND s."statut" IN ('SOUMISE','CORRIGEE','RETOURNEE')
                ORDER BY s."createdAt" DESC
        `, etudiantID)
        if err != nil {
                return nil, fmt.Errorf("query sessions by etudiant: %w", err)
        }
        var result []*domain.SessionPassation
        for rows.Next() {
                s, err := scanSession(rows)
                if err != nil {
                        rows.Close()
                        return nil, fmt.Errorf("scan session: %w", err)
                }
                result = append(result, s)
        }
        rows.Close()
        if result == nil {
                result = []*domain.SessionPassation{}
        }
        if len(result) == 0 {
                if err := tx.Commit(ctx); err != nil {
                        return nil, fmt.Errorf("commit: %w", err)
                }
                return result, nil
        }

        // Collecter les IDs distincts pour les batch queries.
        epreuveSet := make(map[string]struct{})
        sessionIDs := make([]string, 0, len(result))
        for _, s := range result {
                epreuveSet[s.EpreuveID] = struct{}{}
                sessionIDs = append(sessionIDs, s.ID)
        }
        distinctEpreuveIDs := make([]string, 0, len(epreuveSet))
        for id := range epreuveSet {
                distinctEpreuveIDs = append(distinctEpreuveIDs, id)
        }

        // Query 2 : épreuves + enseignant (LEFT JOIN User).
        epreuveMap := make(map[string]*domain.SessionEpreuveRef)
        if len(distinctEpreuveIDs) > 0 {
                ph := buildPlaceholders(1, len(distinctEpreuveIDs))
                args := make([]any, 0, len(distinctEpreuveIDs))
                for _, id := range distinctEpreuveIDs {
                        args = append(args, id)
                }
                q := fmt.Sprintf(`
                        SELECT e."id", e."titre", e."description", e."duree", e."noteTotal", e."dateFin",
                               e."enseignantId", u."name"
                        FROM "Epreuve" e
                        LEFT JOIN "User" u ON u."id" = e."enseignantId"
                        WHERE e."id" IN (%s)
                `, ph)
                rows2, err := tx.Query(ctx, q, args...)
                if err != nil {
                        return nil, fmt.Errorf("query epreuves: %w", err)
                }
                for rows2.Next() {
                        e := &domain.SessionEpreuveRef{Questions: []domain.EpreuveQuestionInfo{}}
                        var ensID, ensName *string
                        if err := rows2.Scan(&e.ID, &e.Titre, &e.Desc, &e.Duree, &e.NoteTotal,
                                &e.DateFin, &ensID, &ensName); err != nil {
                                rows2.Close()
                                return nil, fmt.Errorf("scan epreuve: %w", err)
                        }
                        if ensID != nil {
                                e.Enseignant.ID = *ensID
                        }
                        if ensName != nil {
                                e.Enseignant.Name = *ensName
                        }
                        epreuveMap[e.ID] = e
                }
                rows2.Close()
        }

        // Query 3 : questions par épreuve (EpreuveQuestion LEFT JOIN Question).
        if len(distinctEpreuveIDs) > 0 {
                ph := buildPlaceholders(1, len(distinctEpreuveIDs))
                args := make([]any, 0, len(distinctEpreuveIDs))
                for _, id := range distinctEpreuveIDs {
                        args = append(args, id)
                }
                q := fmt.Sprintf(`
                        SELECT eq."id", eq."epreuveId", eq."questionId", eq."bareme", eq."ordre",
                               q."id", q."type"::text, q."enonce", q."difficulte"::text
                        FROM "EpreuveQuestion" eq
                        LEFT JOIN "Question" q ON q."id" = eq."questionId"
                        WHERE eq."epreuveId" IN (%s)
                        ORDER BY eq."epreuveId", eq."ordre"
                `, ph)
                rows3, err := tx.Query(ctx, q, args...)
                if err != nil {
                        return nil, fmt.Errorf("query epreuve questions: %w", err)
                }
                for rows3.Next() {
                        var eqi domain.EpreuveQuestionInfo
                        var epreuveID string
                        var qID, qType, qEnonce, qDiff *string
                        if err := rows3.Scan(&eqi.ID, &epreuveID, &eqi.QuestionID, &eqi.Bareme, &eqi.Ordre,
                                &qID, &qType, &qEnonce, &qDiff); err != nil {
                                rows3.Close()
                                return nil, fmt.Errorf("scan epreuve question: %w", err)
                        }
                        if qID != nil {
                                eqi.Question.ID = *qID
                        }
                        if qType != nil {
                                eqi.Question.Type = *qType
                        }
                        if qEnonce != nil {
                                eqi.Question.Enonce = *qEnonce
                        }
                        if qDiff != nil {
                                eqi.Question.Difficulte = *qDiff
                        }
                        if e, ok := epreuveMap[epreuveID]; ok {
                                e.Questions = append(e.Questions, eqi)
                        }
                }
                rows3.Close()
        }

        // Query 4 : résultats par session.
        resultatMap := make(map[string]*domain.Resultat)
        if len(sessionIDs) > 0 {
                ph := buildPlaceholders(1, len(sessionIDs))
                args := make([]any, 0, len(sessionIDs))
                for _, id := range sessionIDs {
                        args = append(args, id)
                }
                q := fmt.Sprintf(`
                        SELECT "id", "sessionId", "scoreFinal", "detailParQuestion",
                               "dateCorrection", "dateRetour", "commentaires", "exporte", "totalPossible"
                        FROM "Resultat" WHERE "sessionId" IN (%s)
                `, ph)
                rows4, err := tx.Query(ctx, q, args...)
                if err != nil {
                        return nil, fmt.Errorf("query resultats: %w", err)
                }
                for rows4.Next() {
                        res := &domain.Resultat{}
                        if err := rows4.Scan(&res.ID, &res.SessionID, &res.ScoreFinal, &res.DetailParQuestion,
                                &res.DateCorrection, &res.DateRetour, &res.Commentaires, &res.Exporte,
                                &res.TotalPossible); err != nil {
                                rows4.Close()
                                return nil, fmt.Errorf("scan resultat: %w", err)
                        }
                        res.DetailParQuestion = sanitizeRawMessage(res.DetailParQuestion)
                        resultatMap[res.SessionID] = res
                }
                rows4.Close()
        }

        // Query 5 : réponses par session.
        reponsesMap := make(map[string][]domain.Reponse)
        if len(sessionIDs) > 0 {
                ph := buildPlaceholders(1, len(sessionIDs))
                args := make([]any, 0, len(sessionIDs))
                for _, id := range sessionIDs {
                        args = append(args, id)
                }
                q := fmt.Sprintf(`
                        SELECT "id", "sessionId", "questionId", "contenu", "score",
                               "commentaire", "noteIA", "justificationIA"
                        FROM "Reponse" WHERE "sessionId" IN (%s)
                `, ph)
                rows5, err := tx.Query(ctx, q, args...)
                if err != nil {
                        return nil, fmt.Errorf("query reponses: %w", err)
                }
                for rows5.Next() {
                        var rep domain.Reponse
                        if err := rows5.Scan(&rep.ID, &rep.SessionID, &rep.QuestionID, &rep.Contenu,
                                &rep.Score, &rep.Commentaire, &rep.NoteIA, &rep.JustificationIA); err != nil {
                                rows5.Close()
                                return nil, fmt.Errorf("scan reponse: %w", err)
                        }
                        reponsesMap[rep.SessionID] = append(reponsesMap[rep.SessionID], rep)
                }
                rows5.Close()
        }

        // Attacher les relations à chaque session.
        for _, s := range result {
                if e, ok := epreuveMap[s.EpreuveID]; ok {
                        s.Epreuve = e
                }
                if res, ok := resultatMap[s.ID]; ok {
                        s.Resultat = res
                }
                if reps, ok := reponsesMap[s.ID]; ok {
                        s.Reponses = reps
                } else {
                        s.Reponses = []domain.Reponse{}
                }
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return result, nil
}

// ListByEpreuve liste les sessions d'une épreuve avec stats.
//
// BUGFIX (RESULTATS-RLS-1) : l'ancienne implémentation ouvrait une transaction
// avec r.pool.BeginTx SANS poser les claims RLS (SetClaimsTx). Or RLS est activé
// sur SessionPassation avec la policy SessionPassation_select qui exige
// (is_enseignant() AND epreuve_owned_by_me(epreuveId)). Sans claims, is_enseignant()
// retourne false → RLS bloque toutes les lignes → 0 session retournée même si
// l'overview affiche 7 copies corrigées pour la même épreuve.
//
// Correction : on extrait les claims du context (posés par le middleware Auth)
// et on utilise db.WithTx qui pose app.claims.* sur la transaction avant les
// queries. RLS filtre alors correctement : l'enseignant voit les sessions de
// ses propres épreuves.
func (r *ResultatRepository) ListByEpreuve(ctx context.Context, epreuveID string, page, limit int) ([]*domain.SessionPassation, int, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, 0, fmt.Errorf("ListByEpreuve: claims manquants dans le context")
        }

        var total int
        var result []*domain.SessionPassation

        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                // Count total
                err := tx.QueryRow(ctx, `SELECT count(*) FROM "SessionPassation" WHERE "epreuveId" = $1`, epreuveID).Scan(&total)
                if err != nil {
                        return fmt.Errorf("count sessions: %w", err)
                }

                // BUGFIX (RESULTATS-TABS-1) : LEFT JOIN User + Filiere pour peupler
                // etudiant:{id, name, email, filiere} attendu par le frontend.
                // P1-R2 : LEFT JOIN Resultat pour peupler resultat:{id, scoreFinal, detailParQuestion, dateCorrection, dateRetour}
                query := fmt.Sprintf(`
                        SELECT s."id", s."etudiantId", s."epreuveId", s."statut"::text,
                               s."dateDebut", s."dateFin", s."score", s."logEvents",
                               s."alertes", s."createdAt", s."updatedAt",
                               s."propositionMappings", s."penalite",
                               u."id", u."name", u."email", f."nom",
                               r."id", r."scoreFinal", r."detailParQuestion", r."dateCorrection", r."dateRetour"
                        FROM "SessionPassation" s
                        LEFT JOIN "User" u ON u."id" = s."etudiantId"
                        LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
                        LEFT JOIN "Resultat" r ON r."sessionId" = s."id"
                        WHERE s."epreuveId" = $1
                        ORDER BY s."score" DESC NULLS LAST
                `)
                var args []any = []any{epreuveID}
                if page > 0 && limit > 0 {
                        offset := (page - 1) * limit
                        query += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(args)+1, len(args)+2)
                        args = append(args, limit, offset)
                }

                rows, err := tx.Query(ctx, query, args...)
                if err != nil {
                        return fmt.Errorf("query sessions by epreuve: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        s := &domain.SessionPassation{}
                        var statut string
                        var etuID, etuName, etuEmail *string
                        var filiereNom *string
                        // P1-R2 : champs Resultat
                        var rID *string
                        var rScoreFinal *float64
                        var rDetailParQuestion []byte
                        var rDateCorrection, rDateRetour *time.Time
                        if err := rows.Scan(
                                &s.ID, &s.EtudiantID, &s.EpreuveID, &statut,
                                &s.DateDebut, &s.DateFin, &s.Score, &s.LogEvents,
                                &s.Alertes, &s.CreatedAt, &s.UpdatedAt,
                                &s.PropositionMappings, &s.Penalite,
                                &etuID, &etuName, &etuEmail, &filiereNom,
                                &rID, &rScoreFinal, &rDetailParQuestion, &rDateCorrection, &rDateRetour,
                        ); err != nil {
                                return fmt.Errorf("scan session: %w", err)
                        }
                        s.Statut = domain.StatutSession(statut)
                        if etuID != nil && etuName != nil {
                                s.Etudiant = &struct {
                                        ID      string  `json:"id"`
                                        Name    string  `json:"name"`
                                        Email   string  `json:"email"`
                                        Filiere *string `json:"filiere,omitempty"`
                                }{
                                        ID:      *etuID,
                                        Name:    *etuName,
                                        Email:   derefStr(etuEmail),
                                        Filiere: filiereNom,
                                }
                        }
                        // P1-R2 : hydrater Resultat si le LEFT JOIN a matché
                        if rID != nil && rScoreFinal != nil {
                                detail := json.RawMessage(rDetailParQuestion)
                                if len(detail) == 0 || string(detail) == "null" {
                                        detail = nil
                                }
                                s.Resultat = &domain.Resultat{
                                        ID:                *rID,
                                        SessionID:         s.ID,
                                        ScoreFinal:        *rScoreFinal,
                                        DetailParQuestion: detail,
                                        DateCorrection:    rDateCorrection,
                                        DateRetour:        rDateRetour,
                                }
                        }
                        result = append(result, s)
                }
                return nil
        })
        if err != nil {
                return nil, 0, err
        }
        if result == nil {
                result = []*domain.SessionPassation{}
        }
        return result, total, nil
}

// GetOverview — placeholder (sera implémenté avec requêtes agrégées).
func (r *ResultatRepository) GetOverview(ctx context.Context, enseignantID string) (*domain.OverviewResult, error) {
        return &domain.OverviewResult{
                Epreuves:       []domain.OverviewEpreuve{},
                Evolution:      []domain.OverviewEvolution{},
                StudentsAtRisk: []domain.StudentAtRisk{},
                TopQuestions:   []domain.TopQuestion{},
        }, nil
}

// GetEtudiantOverview — stats réelles pour la vue étudiant (RESULTATS-FIX-1).
// Calcule totalEpreuves, totalCorrigees, moyenneGenerale, meilleureNote,
// moinsBonneNote, tauxReussite, tendance, evolution mensuelle,
// performanceParType (depuis detailParQuestion JSON), distribution (4 bins)
// et recentResults (5 dernières sessions). Un seul JOIN query + agrégation Go.
func (r *ResultatRepository) GetEtudiantOverview(ctx context.Context, etudiantID string) (*domain.EtudiantOverviewResult, error) {
        out := &domain.EtudiantOverviewResult{
                Evolution:          []domain.OverviewEvolution{},
                PerformanceParType: []domain.PerformanceParType{},
                Distribution:       []domain.DistributionBin{},
                RecentResults:      []domain.RecentResult{},
        }

        tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        // Single JOIN query : sessions + resultat + epreuve + enseignant.
        // Un seul placeholder $1 → compatible pgx Simple Protocol.
        rows, err := tx.Query(ctx, `
                SELECT s."id", s."epreuveId", s."statut"::text, s."score", s."dateDebut", s."dateFin",
                       s."createdAt",
                       r."scoreFinal", r."totalPossible", r."dateCorrection", r."dateRetour",
                       r."commentaires", r."detailParQuestion",
                       e."titre", e."noteTotal", e."enseignantId",
                       u."name"
                FROM "SessionPassation" s
                LEFT JOIN "Resultat" r ON r."sessionId" = s."id"
                LEFT JOIN "Epreuve" e ON e."id" = s."epreuveId"
                LEFT JOIN "User" u ON u."id" = e."enseignantId"
                WHERE s."etudiantId" = $1 AND s."statut" IN ('SOUMISE','CORRIGEE','RETOURNEE')
                ORDER BY s."createdAt" DESC
        `, etudiantID)
        if err != nil {
                return nil, fmt.Errorf("query etudiant sessions: %w", err)
        }

        type sessionRow struct {
                SessionID      string
                EpreuveID      string
                Statut         string
                Score          *float64
                DateDebut      *time.Time
                DateFin        *time.Time
                CreatedAt      time.Time
                ScoreFinal     *float64
                TotalPossible  *float64
                DateCorrection *time.Time
                DateRetour     *time.Time
                Commentaires   *string
                DetailJSON     []byte
                EpreuveTitre   *string
                EpreuveNoteTot *float64
                EnseignantID   *string
                EnseignantName *string
        }

        var sessions []sessionRow
        for rows.Next() {
                var sr sessionRow
                if err := rows.Scan(&sr.SessionID, &sr.EpreuveID, &sr.Statut, &sr.Score,
                        &sr.DateDebut, &sr.DateFin, &sr.CreatedAt,
                        &sr.ScoreFinal, &sr.TotalPossible, &sr.DateCorrection, &sr.DateRetour,
                        &sr.Commentaires, &sr.DetailJSON,
                        &sr.EpreuveTitre, &sr.EpreuveNoteTot, &sr.EnseignantID,
                        &sr.EnseignantName); err != nil {
                        rows.Close()
                        return nil, fmt.Errorf("scan etudiant session: %w", err)
                }
                sessions = append(sessions, sr)
        }
        rows.Close()

        if len(sessions) == 0 {
                if err := tx.Commit(ctx); err != nil {
                        return nil, fmt.Errorf("commit: %w", err)
                }
                return out, nil
        }

        // scoreOn20 : (resultat.scoreFinal / resultat.totalPossible) * 20, fallback
        // sur (session.score / epreuve.noteTotal) * 20. Retourne false si impossible.
        scoreOn20 := func(sr sessionRow) (float64, bool) {
                if sr.ScoreFinal != nil && sr.TotalPossible != nil && *sr.TotalPossible > 0 {
                        return (*sr.ScoreFinal / *sr.TotalPossible) * 20, true
                }
                if sr.Score != nil && sr.EpreuveNoteTot != nil && *sr.EpreuveNoteTot > 0 {
                        return (*sr.Score / *sr.EpreuveNoteTot) * 20, true
                }
                return 0, false
        }

        // TotalEpreuves : distinct epreuveId.
        epreuveSeen := make(map[string]struct{})
        for _, sr := range sessions {
                epreuveSeen[sr.EpreuveID] = struct{}{}
        }
        out.TotalEpreuves = len(epreuveSeen)

        // TotalCorrigees + collecte des scoresOn20.
        totalCorrigees := 0
        var scores []float64
        for _, sr := range sessions {
                isCorrected := sr.Statut == "CORRIGEE" || sr.Statut == "RETOURNEE" || sr.DateCorrection != nil
                if isCorrected {
                        totalCorrigees++
                }
                if s20, ok := scoreOn20(sr); ok {
                        scores = append(scores, s20)
                }
        }
        out.TotalCorrigees = totalCorrigees

        if len(scores) > 0 {
                sum := 0.0
                minS := scores[0]
                maxS := scores[0]
                reussis := 0
                for _, s := range scores {
                        sum += s
                        if s < minS {
                                minS = s
                        }
                        if s > maxS {
                                maxS = s
                        }
                        if s >= 10 {
                                reussis++
                        }
                }
                out.MoyenneGenerale = round2(sum / float64(len(scores)))
                out.MeilleureNote = round2(maxS)
                out.MoinsBonneNote = round2(minS)
                out.TauxReussite = int(float64(reussis) / float64(len(scores)) * 100)
        }

        // Tendance : moyenne des 3 dernières - moyenne des 3 précédentes.
        // scores est en ordre DESC (createdAt DESC).
        if len(scores) >= 4 {
                recent := avgFloat(scores[:3])
                prev := avgFloat(scores[3:min(6, len(scores))])
                out.Tendance = round2(recent - prev)
        }

        // Evolution mensuelle (YYYY-MM), groupée par dateCorrection ou dateFin.
        monthMap := make(map[string][]float64)
        for _, sr := range sessions {
                var ref time.Time
                if sr.DateCorrection != nil {
                        ref = *sr.DateCorrection
                } else if sr.DateFin != nil {
                        ref = *sr.DateFin
                } else {
                        ref = sr.CreatedAt
                }
                if s20, ok := scoreOn20(sr); ok {
                        month := ref.UTC().Format("2006-01")
                        monthMap[month] = append(monthMap[month], s20)
                }
        }
        for month, vals := range monthMap {
                out.Evolution = append(out.Evolution, domain.OverviewEvolution{
                        Mois:    month,
                        Moyenne: round2(avgFloat(vals)),
                        Count:   len(vals),
                })
        }
        sortEvolutionByMonth(out.Evolution)

        // Distribution : 4 bins [0-5), [5-10), [10-15), [15-20].
        bins := []domain.DistributionBin{
                {Label: "0-5", Count: 0},
                {Label: "5-10", Count: 0},
                {Label: "10-15", Count: 0},
                {Label: "15-20", Count: 0},
        }
        for _, s := range scores {
                switch {
                case s < 5:
                        bins[0].Count++
                case s < 10:
                        bins[1].Count++
                case s < 15:
                        bins[2].Count++
                default:
                        bins[3].Count++
                }
        }
        out.Distribution = bins

        // PerformanceParType : parse detailParQuestion JSON, agrège par type.
        // Gère deux formats : {bareme, score} et {pointsMax, pointsObtenus}.
        type perfAgg struct {
                sum   float64
                count int
        }
        aggMap := make(map[string]*perfAgg)
        for _, sr := range sessions {
                if len(sr.DetailJSON) == 0 {
                        continue
                }
                var entries []struct {
                        Type          string   `json:"type"`
                        Bareme        float64  `json:"bareme"`
                        Score         *float64 `json:"score"`
                        PointsMax     float64  `json:"pointsMax"`
                        PointsObtenus *float64 `json:"pointsObtenus"`
                }
                if err := json.Unmarshal(sr.DetailJSON, &entries); err != nil {
                        continue
                }
                for _, d := range entries {
                        bareme := d.Bareme
                        if bareme == 0 {
                                bareme = d.PointsMax
                        }
                        if bareme <= 0 {
                                continue
                        }
                        sc := d.Score
                        if sc == nil {
                                sc = d.PointsObtenus
                        }
                        if sc == nil {
                                continue
                        }
                        a, ok := aggMap[d.Type]
                        if !ok {
                                a = &perfAgg{}
                                aggMap[d.Type] = a
                        }
                        a.sum += (*sc / bareme) * 20
                        a.count++
                }
        }
        for t, a := range aggMap {
                if a.count == 0 {
                        continue
                }
                out.PerformanceParType = append(out.PerformanceParType, domain.PerformanceParType{
                        Type:    t,
                        Moyenne: round2(a.sum / float64(a.count)),
                        Count:   a.count,
                })
        }
        sortPerfByType(out.PerformanceParType)

        // RecentResults : 5 dernières sessions.
        recentLimit := 5
        if len(sessions) < recentLimit {
                recentLimit = len(sessions)
        }
        for _, sr := range sessions[:recentLimit] {
                score := 0.0
                if sr.ScoreFinal != nil {
                        score = *sr.ScoreFinal
                } else if sr.Score != nil {
                        score = *sr.Score
                }
                noteTotal := 20.0
                if sr.TotalPossible != nil && *sr.TotalPossible > 0 {
                        noteTotal = *sr.TotalPossible
                } else if sr.EpreuveNoteTot != nil && *sr.EpreuveNoteTot > 0 {
                        noteTotal = *sr.EpreuveNoteTot
                }
                s20, _ := scoreOn20(sr)
                pct := 0
                if noteTotal > 0 {
                        pct = int((score / noteTotal) * 100)
                }
                enseignant := ""
                if sr.EnseignantName != nil {
                        enseignant = *sr.EnseignantName
                }
                titre := ""
                if sr.EpreuveTitre != nil {
                        titre = *sr.EpreuveTitre
                }
                out.RecentResults = append(out.RecentResults, domain.RecentResult{
                        ID:          sr.SessionID,
                        EpreuveID:   sr.EpreuveID,
                        Titre:       titre,
                        Enseignant:  enseignant,
                        Statut:      sr.Statut,
                        Score:       round2(score),
                        NoteTotal:   round2(noteTotal),
                        ScoreOn20:   round2(s20),
                        Percentage:  pct,
                        DateFin:     sr.DateFin,
                        DateDebut:   sr.DateDebut,
                        IsCorrected: sr.Statut == "CORRIGEE" || sr.Statut == "RETOURNEE" || sr.DateCorrection != nil,
                        IsReturned:  sr.Statut == "RETOURNEE" || sr.DateRetour != nil,
                })
        }

        if err := tx.Commit(ctx); err != nil {
                return nil, fmt.Errorf("commit: %w", err)
        }
        return out, nil
}

// buildPlaceholders génère "$1, $2, ..., $n" pour les clauses IN (compatible
// pgx Simple Protocol : pas de placeholder réutilisé).
func buildPlaceholders(start, n int) string {
        if n <= 0 {
                return ""
        }
        var b strings.Builder
        for i := 0; i < n; i++ {
                if i > 0 {
                        b.WriteString(", ")
                }
                fmt.Fprintf(&b, "$%d", start+i)
        }
        return b.String()
}

// avgFloat calcule la moyenne d'un slice de float64.
func avgFloat(v []float64) float64 {
        if len(v) == 0 {
                return 0
        }
        sum := 0.0
        for _, x := range v {
                sum += x
        }
        return sum / float64(len(v))
}

// round2 arrondit à 2 décimales.
func round2(f float64) float64 {
        return float64(int(f*100)) / 100
}

// sortEvolutionByMonth trie par mois ascendant (YYYY-MM).
func sortEvolutionByMonth(e []domain.OverviewEvolution) {
        for i := 1; i < len(e); i++ {
                for j := i; j > 0 && e[j-1].Mois > e[j].Mois; j-- {
                        e[j-1], e[j] = e[j], e[j-1]
                }
        }
}

// sortPerfByType trie par type (ordre alphabétique).
func sortPerfByType(p []domain.PerformanceParType) {
        for i := 1; i < len(p); i++ {
                for j := i; j > 0 && p[j-1].Type > p[j].Type; j-- {
                        p[j-1], p[j] = p[j], p[j-1]
                }
        }
}

// GetEpreuveNoteTotal récupère le noteTotal d'une épreuve.
//
// BUGFIX (RESULTATS-RLS-2) : l'ancienne implémentation ouvrait une transaction
// SANS poser les claims RLS (commentaire "RLS off" était faux). Or RLS est activé
// sur Epreuve → la query retournait 0 ligne → err → fallback à 20.0 → les scores
// affichaient "/20" au lieu de "/60" dans l'onglet "Par épreuve".
//
// Correction : utilise db.WithTx avec les claims extraits du context (posés par
// le middleware Auth). RLS permet alors à l'enseignant de lire ses propres épreuves.
func (r *ResultatRepository) GetEpreuveNoteTotal(ctx context.Context, epreuveID string) (float64, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return 20.0, nil // pas de claims → fallback (ne devrait pas arriver)
        }

        var noteTotal float64
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `SELECT "noteTotal" FROM "Epreuve" WHERE "id" = $1 AND "deletedAt" IS NULL`, epreuveID).Scan(&noteTotal)
        })
        if err != nil {
                return 20.0, nil // fallback à 20 si non trouvé
        }
        if noteTotal <= 0 {
                return 20.0, nil
        }
        return noteTotal, nil
}

// GetEpreuveContenuQuestions récupère le contenu JSON de l'épreuve
// (contenu.questions : [{id, type, enonce, bareme, propositions, reponseCorrecte}]).
//
// Utilisé pour enrichir le detailParQuestion avec les énoncés réels des questions
// (le detailParQuestion en DB ne contient que questionId/type/bareme/score, pas
// l'énoncé). Le frontend utilise ce map pour afficher l'énoncé dans le dialog
// de détail d'une session.
//
// BUGFIX (RESULTATS-ENONCE-1) : avant, le dialog "Détail du résultat" affichait
// "Question 1", "Question 2"... au lieu de l'énoncé réel car le backend ne
// fournissait pas le contenu de l'épreuve.
func (r *ResultatRepository) GetEpreuveContenuQuestions(ctx context.Context, epreuveID string) (json.RawMessage, error) {
        claims, ok := db.ClaimsFromContext(ctx)
        if !ok || claims.UserID == "" {
                return nil, fmt.Errorf("GetEpreuveContenuQuestions: claims manquants")
        }

        var contenu []byte
        err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
                return tx.QueryRow(ctx, `SELECT "contenu" FROM "Epreuve" WHERE "id" = $1 AND "deletedAt" IS NULL`, epreuveID).Scan(&contenu)
        })
        if err != nil {
                return nil, err
        }
        return json.RawMessage(contenu), nil
}
