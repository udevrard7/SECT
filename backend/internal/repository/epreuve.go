// Package repository — implémentation EpreuveRepository.
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

// EpreuveRepository implémente domain.EpreuveRepository.
type EpreuveRepository struct {
	pool *pgxpool.Pool
}

// NewEpreuveRepository crée un nouveau EpreuveRepository.
func NewEpreuveRepository(pool *pgxpool.Pool) *EpreuveRepository {
	return &EpreuveRepository{pool: pool}
}

const columnsEpreuve = `"id", "enseignantId", "titre", "description", "duree", "dateDebut", "dateFin",
        "melangeQuestions", "melangePropositions", "blocageRetour", "statut", "groupesCibles", "contenu",
        "filiereId", "uniteEnseignementId", "niveau", "sessionExamen", "anneeAcademiqueId",
        "createdAt", "updatedAt", "deletedAt", "proctoringActif", "verificationIdentite",
        "generationMode", "isTemplate", "noteTotal", "clotureeAt", "clotureeAutomatiquement",
        "raisonCloture", "clotureePar", "delaiGrace", "etudiantsAutorises", "epreuveOrigineId"`

func scanEpreuve(s scanner) (*domain.Epreuve, error) {
	e := &domain.Epreuve{}
	err := s.Scan(
		&e.ID, &e.EnseignantID, &e.Titre, &e.Description, &e.Duree, &e.DateDebut, &e.DateFin,
		&e.MelangeQuestions, &e.MelangePropositions, &e.BlocageRetour, &e.Statut,
		&e.GroupesCibles, &e.Contenu,
		&e.FiliereID, &e.UniteEnseignementID, &e.Niveau, &e.SessionExamen, &e.AnneeAcademiqueID,
		&e.CreatedAt, &e.UpdatedAt, &e.DeletedAt,
		&e.ProctoringActif, &e.VerificationIdentite,
		&e.GenerationMode, &e.IsTemplate, &e.NoteTotal,
		&e.ClotureeAt, &e.ClotureeAutomatiquement, &e.RaisonCloture, &e.ClotureePar,
		&e.DelaiGrace, &e.EtudiantsAutorises, &e.EpreuveOrigineID,
	)
	if err != nil {
		return nil, err
	}
	// Sanitize json.RawMessage fields
	e.GroupesCibles = sanitizeEpreuveRawMessage(e.GroupesCibles)
	e.Contenu = sanitizeEpreuveRawMessage(e.Contenu)
	e.EtudiantsAutorises = sanitizeEpreuveRawMessage(e.EtudiantsAutorises)
	return e, nil
}

// sanitizeEpreuveRawMessage identique à sanitizeRawMessage du package question.
func sanitizeEpreuveRawMessage(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil
	}
	return raw
}

// FindByID récupère une épreuve par ID (RLS actif, exclut deletedAt).
func (r *EpreuveRepository) FindByID(ctx context.Context, id string) (*domain.Epreuve, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var e *domain.Epreuve
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Epreuve" WHERE "id" = $1 AND "deletedAt" IS NULL`, columnsEpreuve), id)
		ep, err := scanEpreuve(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return &domain.NotFoundError{Entity: "Epreuve", ID: id}
			}
			return fmt.Errorf("query epreuve: %w", err)
		}
		e = ep
		return nil
	})
	if err != nil {
		return nil, err
	}
	return e, nil
}

// List liste les épreuves (RLS actif).
func (r *EpreuveRepository) List(ctx context.Context, params domain.EpreuveListParams) ([]*domain.Epreuve, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.Epreuve
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		var where []string
		var args []any
		argIdx := 1

		where = append(where, `"deletedAt" IS NULL`)

		if params.EnseignantID != "" {
			where = append(where, fmt.Sprintf(`"enseignantId" = $%d`, argIdx))
			args = append(args, params.EnseignantID)
			argIdx++
		}
		if params.FiliereID != "" {
			where = append(where, fmt.Sprintf(`"filiereId" = $%d`, argIdx))
			args = append(args, params.FiliereID)
			argIdx++
		}
		if len(params.Statuts) > 0 {
			placeholders := make([]string, len(params.Statuts))
			for i, st := range params.Statuts {
				placeholders[i] = fmt.Sprintf("$%d", argIdx)
				args = append(args, st)
				argIdx++
			}
			where = append(where, fmt.Sprintf(`"statut" IN (%s)`, strings.Join(placeholders, ",")))
		}
		if params.Search != "" {
			where = append(where, fmt.Sprintf(`("titre" ILIKE $%d OR "description" ILIKE $%d)`, argIdx, argIdx))
			args = append(args, "%"+params.Search+"%")
			argIdx++
		}
		if params.Niveau != "" {
			where = append(where, fmt.Sprintf(`"niveau" = $%d`, argIdx))
			args = append(args, params.Niveau)
			argIdx++
		}
		if params.SessionExamen != "" {
			where = append(where, fmt.Sprintf(`"sessionExamen" = $%d`, argIdx))
			args = append(args, params.SessionExamen)
			argIdx++
		}
		if params.AnneeAcademiqueID != "" {
			where = append(where, fmt.Sprintf(`"anneeAcademiqueId" = $%d`, argIdx))
			args = append(args, params.AnneeAcademiqueID)
			argIdx++
		}
		if params.UniteEnseignementID != "" {
			where = append(where, fmt.Sprintf(`"uniteEnseignementId" = $%d`, argIdx))
			args = append(args, params.UniteEnseignementID)
			argIdx++
		}
		// EtudiantID : épreuves où l'étudiant a une session
		if params.EtudiantID != "" {
			where = append(where, fmt.Sprintf(`EXISTS (SELECT 1 FROM "SessionPassation" sp WHERE sp."epreuveId" = "Epreuve"."id" AND sp."etudiantId" = $%d)`, argIdx))
			args = append(args, params.EtudiantID)
			argIdx++
		}

		whereClause := "WHERE " + strings.Join(where, " AND ")

		var query string
		if params.Select == "summary" {
			// Format léger pour les dropdowns
			query = fmt.Sprintf(`SELECT "id", "titre", "dateDebut", "dateFin", "statut", "noteTotal" FROM "Epreuve" %s ORDER BY "dateDebut" DESC`, whereClause)
			rows, err := tx.Query(ctx, query, args...)
			if err != nil {
				return fmt.Errorf("query epreuves summary: %w", err)
			}
			defer rows.Close()
			for rows.Next() {
				e := &domain.Epreuve{}
				var filiereNom *string
				_ = filiereNom
				if err := rows.Scan(&e.ID, &e.Titre, &e.DateDebut, &e.DateFin, &e.Statut, &e.NoteTotal); err != nil {
					return fmt.Errorf("scan epreuve summary: %w", err)
				}
				result = append(result, e)
			}
		} else {
			query = fmt.Sprintf(`SELECT %s FROM "Epreuve" %s ORDER BY "dateDebut" DESC`, columnsEpreuve, whereClause)
			rows, err := tx.Query(ctx, query, args...)
			if err != nil {
				return fmt.Errorf("query epreuves: %w", err)
			}
			defer rows.Close()
			for rows.Next() {
				e, err := scanEpreuve(rows)
				if err != nil {
					return fmt.Errorf("scan epreuve: %w", err)
				}
				result = append(result, e)
			}
		}
		if result == nil {
			result = []*domain.Epreuve{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// Create crée une épreuve (bypass RLS). Statut forcé à BROUILLON.
func (r *EpreuveRepository) Create(ctx context.Context, input domain.CreateEpreuveInput) (*domain.Epreuve, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	// Parser les dates
	dateDebut, err := time.Parse(time.RFC3339, input.DateDebut)
	if err != nil {
		return nil, &domain.ValidationError{Field: "dateDebut", Message: "format ISO invalide"}
	}
	dateFin, err := time.Parse(time.RFC3339, input.DateFin)
	if err != nil {
		return nil, &domain.ValidationError{Field: "dateFin", Message: "format ISO invalide"}
	}

	id := uuid.NewString()
	noteTotal := 20.0
	if input.NoteTotal != nil && *input.NoteTotal > 0 {
		noteTotal = *input.NoteTotal
	}
	melangeQ := true
	if input.MelangeQuestions != nil {
		melangeQ = *input.MelangeQuestions
	}
	melangeP := true
	if input.MelangePropositions != nil {
		melangeP = *input.MelangePropositions
	}
	blocageR := false
	if input.BlocageRetour != nil {
		blocageR = *input.BlocageRetour
	}
	genMode := input.GenerationMode
	if !domain.ValidModesGeneration[genMode] {
		genMode = domain.ModeManuelle
	}
	sessExam := input.SessionExamen
	if !domain.ValidSessionsExamen[sessExam] {
		sessExam = domain.SessionNormale
	}

	var contenu, groupesCibles any
	if len(input.Contenu) > 0 && string(input.Contenu) != "null" {
		contenu = []byte(input.Contenu)
	}
	if len(input.GroupesCibles) > 0 && string(input.GroupesCibles) != "null" {
		groupesCibles = []byte(input.GroupesCibles)
	}

	row := tx.QueryRow(ctx, `
                INSERT INTO "Epreuve" ("id", "enseignantId", "titre", "description", "duree", "dateDebut", "dateFin",
                        "melangeQuestions", "melangePropositions", "blocageRetour", "statut", "groupesCibles", "contenu",
                        "filiereId", "uniteEnseignementId", "niveau", "sessionExamen", "anneeAcademiqueId",
                        "createdAt", "updatedAt", "deletedAt", "proctoringActif", "verificationIdentite",
                        "generationMode", "isTemplate", "noteTotal", "clotureeAt", "clotureeAutomatiquement",
                        "raisonCloture", "clotureePar", "delaiGrace", "etudiantsAutorises", "epreuveOrigineId")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'BROUILLON', $11, $12,
                        $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, false, false,
                        $18, false, $19, NULL, false, NULL, NULL, 3, NULL, NULL)
                RETURNING `+columnsEpreuve,
		id, input.EnseignantID, input.Titre, nullableStrPtr(input.Description), input.Duree, dateDebut, dateFin,
		melangeQ, melangeP, blocageR, groupesCibles, contenu,
		nullableStrPtr(input.FiliereID), nullableStrPtr(input.UniteEnseignementID), nullableStrPtr(input.Niveau),
		sessExam, nullableStrPtr(input.AnneeAcademiqueID),
		genMode, noteTotal)

	e, err := scanEpreuve(row)
	if err != nil {
		return nil, fmt.Errorf("create epreuve: %w", err)
	}

	// Créer les liaisons EpreuveQuestion (format legacy) si fournies
	if len(input.Questions) > 0 {
		for i, eq := range input.Questions {
			bareme := eq.Bareme
			if bareme == 0 {
				bareme = 1.0
			}
			_, err := tx.Exec(ctx, `
                                INSERT INTO "EpreuveQuestion" ("id", "epreuveId", "questionId", "bareme", "ordre")
                                VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT DO NOTHING
                        `, uuid.NewString(), id, eq.QuestionID, bareme, i)
			if err != nil {
				return nil, fmt.Errorf("create epreuve question: %w", err)
			}
		}
	}

	// Créer les liaisons EpreuveDocument si fournies
	if len(input.DocumentIDs) > 0 {
		for _, docID := range input.DocumentIDs {
			_, err := tx.Exec(ctx, `
                                INSERT INTO "EpreuveDocument" ("id", "epreuveId", "documentId")
                                VALUES ($1, $2, $3)
                                ON CONFLICT DO NOTHING
                        `, uuid.NewString(), id, docID)
			if err != nil {
				return nil, fmt.Errorf("create epreuve document: %w", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return e, nil
}

// Update met à jour une épreuve (partial update ou action state machine).
func (r *EpreuveRepository) Update(ctx context.Context, id string, input domain.UpdateEpreuveInput) (*domain.Epreuve, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	// Gérer les actions (state machine)
	if input.Action != nil {
		action := *input.Action
		var newStatut domain.StatutEpreuve
		var message string
		now := time.Now()

		switch action {
		case "publier":
			newStatut = domain.StatutPlanifiee
			message = "Épreuve publiée"
		case "lancer":
			newStatut = domain.StatutEnCours
			message = "Épreuve lancée"
		case "terminer":
			newStatut = domain.StatutTerminee
			message = "Épreuve terminée"
		case "cloturer":
			newStatut = domain.StatutCloturee
			message = "Épreuve clôturée"
			clotureePar := ""
			if input.UserID != nil {
				clotureePar = *input.UserID
			}
			_, err := tx.Exec(ctx, `
                                UPDATE "Epreuve" SET "statut" = $2, "clotureeAt" = $3, "clotureeAutomatiquement" = false,
                                        "clotureePar" = $4, "updatedAt" = CURRENT_TIMESTAMP
                                WHERE "id" = $1 AND "deletedAt" IS NULL
                        `, id, newStatut, now, nullableStr(&clotureePar))
			if err != nil {
				return nil, fmt.Errorf("cloturer epreuve: %w", err)
			}
			if err := tx.Commit(ctx); err != nil {
				return nil, fmt.Errorf("commit: %w", err)
			}
			return r.FindByID(ctx, id)
		default:
			return nil, &domain.ValidationError{Field: "action", Message: "action invalide (publier, lancer, terminer, cloturer)"}
		}

		_, err := tx.Exec(ctx, `
                        UPDATE "Epreuve" SET "statut" = $2, "updatedAt" = CURRENT_TIMESTAMP
                        WHERE "id" = $1 AND "deletedAt" IS NULL
                `, id, newStatut)
		if err != nil {
			return nil, fmt.Errorf("update statut epreuve: %w", err)
		}
		_ = message
		if err := tx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("commit: %w", err)
		}
		return r.FindByID(ctx, id)
	}

	// General update
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
	if input.Description != nil {
		addSet("description", nullableStrPtr(input.Description))
	}
	if input.Duree != nil {
		addSet("duree", *input.Duree)
	}
	if input.DateDebut != nil {
		d, err := time.Parse(time.RFC3339, *input.DateDebut)
		if err != nil {
			return nil, &domain.ValidationError{Field: "dateDebut", Message: "format ISO invalide"}
		}
		addSet("dateDebut", d)
	}
	if input.DateFin != nil {
		d, err := time.Parse(time.RFC3339, *input.DateFin)
		if err != nil {
			return nil, &domain.ValidationError{Field: "dateFin", Message: "format ISO invalide"}
		}
		addSet("dateFin", d)
	}
	if input.MelangeQuestions != nil {
		addSet("melangeQuestions", *input.MelangeQuestions)
	}
	if input.MelangePropositions != nil {
		addSet("melangePropositions", *input.MelangePropositions)
	}
	if input.BlocageRetour != nil {
		addSet("blocageRetour", *input.BlocageRetour)
	}
	if input.GroupesCibles != nil {
		addSet("groupesCibles", jsonRawOrNull(input.GroupesCibles))
	}
	if input.Statut != nil {
		addSet("statut", *input.Statut)
	}
	if input.Niveau != nil {
		addSet("niveau", nullableStrPtr(input.Niveau))
	}
	if input.SessionExamen != nil {
		addSet("sessionExamen", *input.SessionExamen)
	}
	if input.AnneeAcademiqueID != nil {
		addSet("anneeAcademiqueId", nullableStrPtr(input.AnneeAcademiqueID))
	}
	if input.UniteEnseignementID != nil {
		addSet("uniteEnseignementId", nullableStrPtr(input.UniteEnseignementID))
	}
	if input.FiliereID != nil {
		addSet("filiereId", nullableStrPtr(input.FiliereID))
	}
	if input.EtudiantsAutorises != nil {
		addSet("etudiantsAutorises", jsonRawOrNull(input.EtudiantsAutorises))
	}
	if input.EpreuveOrigineID != nil {
		addSet("epreuveOrigineId", nullableStrPtr(input.EpreuveOrigineID))
	}

	if len(setClauses) == 0 {
		row := tx.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM "Epreuve" WHERE "id" = $1 AND "deletedAt" IS NULL`, columnsEpreuve), id)
		e, err := scanEpreuve(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return nil, &domain.NotFoundError{Entity: "Epreuve", ID: id}
			}
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return e, nil
	}

	setClauses = append(setClauses, `"updatedAt" = CURRENT_TIMESTAMP`)
	args = append(args, id)
	updateSQL := fmt.Sprintf(`UPDATE "Epreuve" SET %s WHERE "id" = $%d AND "deletedAt" IS NULL RETURNING %s`,
		strings.Join(setClauses, ", "), argIdx, columnsEpreuve)

	row := tx.QueryRow(ctx, updateSQL, args...)
	e, err := scanEpreuve(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, &domain.NotFoundError{Entity: "Epreuve", ID: id}
		}
		return nil, fmt.Errorf("update epreuve: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return e, nil
}

// SoftDelete désactive une épreuve (deletedAt = now). Refuse si EN_COURS.
func (r *EpreuveRepository) SoftDelete(ctx context.Context, id string) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return fmt.Errorf("disable rls: %w", err)
	}

	// Vérifier statut (pas EN_COURS)
	var statut string
	err = tx.QueryRow(ctx, `SELECT "statut" FROM "Epreuve" WHERE "id" = $1 AND "deletedAt" IS NULL`, id).Scan(&statut)
	if err != nil {
		if err == pgx.ErrNoRows {
			return &domain.NotFoundError{Entity: "Epreuve", ID: id}
		}
		return fmt.Errorf("check statut: %w", err)
	}
	if statut == string(domain.StatutEnCours) {
		return &domain.ValidationError{Field: "statut", Message: "impossible de supprimer une épreuve en cours"}
	}

	_, err = tx.Exec(ctx, `UPDATE "Epreuve" SET "deletedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, id)
	if err != nil {
		return fmt.Errorf("soft delete epreuve: %w", err)
	}

	return tx.Commit(ctx)
}

// ListQuestions liste les EpreuveQuestion d'une épreuve (RLS actif).
func (r *EpreuveRepository) ListQuestions(ctx context.Context, epreuveID string) ([]*domain.EpreuveQuestion, error) {
	claims, ok := db.ClaimsFromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no RLS claims in context")
	}

	var result []*domain.EpreuveQuestion
	err := db.WithTx(ctx, r.pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT "id", "epreuveId", "questionId", "bareme", "ordre"
                        FROM "EpreuveQuestion" WHERE "epreuveId" = $1 ORDER BY "ordre" ASC
                `, epreuveID)
		if err != nil {
			return fmt.Errorf("query epreuve questions: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			eq := &domain.EpreuveQuestion{}
			if err := rows.Scan(&eq.ID, &eq.EpreuveID, &eq.QuestionID, &eq.Bareme, &eq.Ordre); err != nil {
				return fmt.Errorf("scan epreuve question: %w", err)
			}
			result = append(result, eq)
		}
		if result == nil {
			result = []*domain.EpreuveQuestion{}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// nullableStr convertit une string en *string (NULL si vide).
func nullableStr(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}
