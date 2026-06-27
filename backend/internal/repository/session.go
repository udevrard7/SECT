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

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

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
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
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
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
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
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
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
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
	}

	_, err = tx.Exec(ctx, `UPDATE "Reponse" SET "score" = $2 WHERE "id" = $1`, reponseID, score)
	if err != nil {
		return fmt.Errorf("update reponse score: %w", err)
	}

	return tx.Commit(ctx)
}

// AddAlerte ajoute une alerte à la session (bypass RLS).
func (r *SessionRepository) AddAlerte(ctx context.Context, sessionID string, penalite float64, alerte domain.AlerteInput) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
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
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
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

// ListByEtudiant liste les sessions d'un étudiant avec résultats (bypass RLS pour self-access).
func (r *ResultatRepository) ListByEtudiant(ctx context.Context, etudiantID string) ([]*domain.SessionPassation, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	rows, err := tx.Query(ctx, `
		SELECT s.`+strings.ReplaceAll(columnsSession, `"`, `s."`)+`
		FROM "SessionPassation" s
		WHERE s."etudiantId" = $1 AND s."statut" IN ('SOUMISE','CORRIGEE','RETOURNEE')
		ORDER BY s."createdAt" DESC
	`, etudiantID)
	if err != nil {
		return nil, fmt.Errorf("query sessions by etudiant: %w", err)
	}
	defer rows.Close()

	var result []*domain.SessionPassation
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		result = append(result, s)
	}
	if result == nil {
		result = []*domain.SessionPassation{}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return result, nil
}

// ListByEpreuve liste les sessions d'une épreuve avec stats (bypass RLS).
func (r *ResultatRepository) ListByEpreuve(ctx context.Context, epreuveID string, page, limit int) ([]*domain.SessionPassation, int, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, 0, fmt.Errorf("disable rls: %w", err)
	}

	// Count total
	var total int
	err = tx.QueryRow(ctx, `SELECT count(*) FROM "SessionPassation" WHERE "epreuveId" = $1`, epreuveID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count sessions: %w", err)
	}

	// BUGFIX (RESULTATS-TABS-1) : LEFT JOIN User + Filiere pour peupler
	// etudiant:{id, name, email, filiere} attendu par le frontend.
	query := fmt.Sprintf(`
		SELECT s."id", s."etudiantId", s."epreuveId", s."statut"::text,
		       s."dateDebut", s."dateFin", s."score", s."logEvents",
		       s."alertes", s."createdAt", s."updatedAt",
		       s."propositionMappings", s."penalite",
		       u."id", u."name", u."email", f."nom"
		FROM "SessionPassation" s
		LEFT JOIN "User" u ON u."id" = s."etudiantId"
		LEFT JOIN "Filiere" f ON f."id" = u."filiereId"
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
		return nil, 0, fmt.Errorf("query sessions by epreuve: %w", err)
	}
	defer rows.Close()

	var result []*domain.SessionPassation
	for rows.Next() {
		s := &domain.SessionPassation{}
		var statut string
		var etuID, etuName, etuEmail *string
		var filiereNom *string
		if err := rows.Scan(
			&s.ID, &s.EtudiantID, &s.EpreuveID, &statut,
			&s.DateDebut, &s.DateFin, &s.Score, &s.LogEvents,
			&s.Alertes, &s.CreatedAt, &s.UpdatedAt,
			&s.PropositionMappings, &s.Penalite,
			&etuID, &etuName, &etuEmail, &filiereNom,
		); err != nil {
			return nil, 0, fmt.Errorf("scan session: %w", err)
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
		result = append(result, s)
	}
	if result == nil {
		result = []*domain.SessionPassation{}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, fmt.Errorf("commit: %w", err)
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

// GetEtudiantOverview — placeholder.
func (r *ResultatRepository) GetEtudiantOverview(ctx context.Context, etudiantID string) (*domain.EtudiantOverviewResult, error) {
	return &domain.EtudiantOverviewResult{
		Evolution:          []domain.OverviewEvolution{},
		PerformanceParType: []domain.PerformanceParType{},
		Distribution:       []domain.DistributionBin{},
		RecentResults:      []domain.RecentResult{},
	}, nil
}

// GetEpreuveNoteTotal récupère le noteTotal d'une épreuve (SCORES-NORM-2).
func (r *ResultatRepository) GetEpreuveNoteTotal(ctx context.Context, epreuveID string) (float64, error) {
	var noteTotal float64
	err := r.pool.QueryRow(ctx, `SELECT "noteTotal" FROM "Epreuve" WHERE "id" = $1`, epreuveID).Scan(&noteTotal)
	if err != nil {
		return 20.0, nil // fallback à 20 si non trouvé
	}
	if noteTotal <= 0 {
		return 20.0, nil
	}
	return noteTotal, nil
}
