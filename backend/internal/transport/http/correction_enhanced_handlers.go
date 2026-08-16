// Package http — handlers enrichis pour /api/correction (P1b-CORRECTION).
//
// Complète les routes correction pour matcher le frontend use-correction.ts :
//   PATCH /api/correction/{sessionId}/ai-grade  — save grade OU finalize (dispatch body)
//   POST  /api/correction/{sessionId}/ai-grade-batch — batch IA grade pour toute la session
package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/worker"
)

// ──────────────────────────────────────────────────────────────────────────
// P1b : PATCH /api/correction/{sessionId}/ai-grade — save grade OU finalize
// ──────────────────────────────────────────────────────────────────────────
//
// Le frontend use-correction.ts envoie 2 formes de body sur cette route :
//   1. { questionId, score, commentaire } → save grade pour une question
//   2. { finalizeAll: true }               → finalize session (CORRIGEE + recompute)
//
// On dispatche selon la présence de "finalizeAll" ou "questionId".

func (s *Server) saveGradeOrFinalize(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ENSEIGNANT" && claims.Role != "RESPONSABLE" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle enseignant requis")
		return
	}
	sessionID := chi.URLParam(r, "sessionId")
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "sessionId requis")
		return
	}

	var body map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "corps de requête invalide")
		return
	}

	// Cas 1 : finalizeAll
	if rawFinalize, ok := body["finalizeAll"]; ok {
		var finalize bool
		if err := json.Unmarshal(rawFinalize, &finalize); err != nil || !finalize {
			writeJSONError(w, http.StatusBadRequest, "finalizeAll doit être true")
			return
		}
		s.finalizeSession(w, r, claims, sessionID)
		return
	}

	// Cas 2 : save grade (questionId + score + commentaire)
	rawQID, ok := body["questionId"]
	if !ok {
		writeJSONError(w, http.StatusBadRequest, "body doit contenir 'finalizeAll' ou 'questionId'")
		return
	}
	var questionID string
	if err := json.Unmarshal(rawQID, &questionID); err != nil || questionID == "" {
		writeJSONError(w, http.StatusBadRequest, "questionId invalide")
		return
	}

	var score *float64
	if rawScore, ok := body["score"]; ok {
		var sc float64
		if err := json.Unmarshal(rawScore, &sc); err == nil {
			score = &sc
		}
	}

	var commentaire *string
	if rawComment, ok := body["commentaire"]; ok {
		var c string
		if err := json.Unmarshal(rawComment, &c); err == nil {
			commentaire = &c
		}
	}

	// Trouver la Reponse correspondant à (sessionId, questionId) + vérifier ownership
	var reponseID string
	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			SELECT r."id"
			FROM "Reponse" r
			JOIN "SessionPassation" sp ON sp."id" = r."sessionId"
			JOIN "Epreuve" e ON e."id" = sp."epreuveId"
			WHERE r."sessionId" = $1 AND r."questionId" = $2 AND e."enseignantId" = $3
		`, sessionID, questionID, claims.UserID).Scan(&reponseID)
		if err == nil {
			found = true
		}
		return err
	})
	if !found {
		writeJSONError(w, http.StatusNotFound, "réponse introuvable ou accès refusé")
		return
	}

	// Update la Reponse
	input := domain.UpdateReponseInput{Score: score, Commentaire: commentaire}
	if err := s.correctionUC.UpdateReponse(r.Context(), claims, reponseID, input); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// P1d : après update, recompute needsCorrectionCount pour la réponse
	needsCorrection := 0
	allCorrected := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		_ = tx.QueryRow(r.Context(), `
			SELECT count(*) FROM "Reponse" WHERE "sessionId" = $1 AND "score" IS NULL
		`, sessionID).Scan(&needsCorrection)
		allCorrected = needsCorrection == 0
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":             "Note sauvegardée",
		"needsCorrectionCount": needsCorrection,
		"allCorrected":         allCorrected,
	})
}

// finalizeSession transition la session vers CORRIGEE + recompute Resultat.
func (s *Server) finalizeSession(w http.ResponseWriter, r *http.Request, claims appdb.SessionClaims, sessionID string) {
	// Vérifier ownership + récupérer l'epreuveId
	var epreuveID string
	var currentStatut string
	found := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		err := tx.QueryRow(r.Context(), `
			SELECT sp."epreuveId", sp."statut"::text
			FROM "SessionPassation" sp
			JOIN "Epreuve" e ON e."id" = sp."epreuveId"
			WHERE sp."id" = $1 AND e."enseignantId" = $2
		`, sessionID, claims.UserID).Scan(&epreuveID, &currentStatut)
		if err == nil {
			found = true
		}
		return err
	})
	if !found {
		writeJSONError(w, http.StatusNotFound, "session introuvable ou accès refusé")
		return
	}

	// Recompute score = sum(reponse.score) pour cette session
	var totalScore float64
	var totalPossible float64
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		_ = tx.QueryRow(r.Context(), `
			SELECT COALESCE(sum(r."score"), 0)
			FROM "Reponse" r WHERE r."sessionId" = $1
		`, sessionID).Scan(&totalScore)

		// totalPossible = sum(bareme) depuis EpreuveQuestion
		_ = tx.QueryRow(r.Context(), `
			SELECT COALESCE(sum(eq."bareme"), 0)
			FROM "EpreuveQuestion" eq WHERE eq."epreuveId" = $1
		`, epreuveID).Scan(&totalPossible)
		return nil
	})

	if totalPossible == 0 {
		totalPossible = 20 // fallback
	}
	percentage := 0.0
	if totalPossible > 0 {
		percentage = (totalScore / totalPossible) * 100
	}

	// Transition statut → CORRIGEE + update Resultat
	now := time.Now()
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `
			UPDATE "SessionPassation"
			SET "statut" = 'CORRIGEE', "score" = $1, "updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = $2
		`, totalScore, sessionID)
		if err != nil {
			return err
		}

		// Upsert Resultat
		_, err = tx.Exec(r.Context(), `
			INSERT INTO "Resultat" ("id", "sessionId", "scoreFinal", "totalPossible", "dateCorrection", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
			ON CONFLICT ("sessionId") DO UPDATE SET
				"scoreFinal" = $3, "totalPossible" = $4, "dateCorrection" = $5, "updatedAt" = CURRENT_TIMESTAMP
		`, fmt.Sprintf("res-%s", sessionID[:8]), sessionID, totalScore, totalPossible, now)
		return err
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":       "Session finalisée",
		"score":         totalScore,
		"totalPossible": totalPossible,
		"percentage":    percentage,
		"statut":        "CORRIGEE",
	})
}

// ──────────────────────────────────────────────────────────────────────────
// P1b : POST /api/correction/{sessionId}/ai-grade-batch — batch IA grade
// ──────────────────────────────────────────────────────────────────────────
//
// Queue toutes les réponses QRC/CODE/REFLEXION sans noteIA de la session
// dans CorrectionQueue. Retourne 202 Accepted avec le count.

func (s *Server) batchAiGrade(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ENSEIGNANT" && claims.Role != "RESPONSABLE" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle enseignant requis")
		return
	}
	sessionID := chi.URLParam(r, "sessionId")
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "sessionId requis")
		return
	}

	// Vérifier ownership + récupérer les réponses à grader
	var epreuveID string
	type pendingRep struct {
		ID, QuestionID string
	}
	var pending []pendingRep

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// Vérifier ownership
		err := tx.QueryRow(r.Context(), `
			SELECT sp."epreuveId"
			FROM "SessionPassation" sp
			JOIN "Epreuve" e ON e."id" = sp."epreuveId"
			WHERE sp."id" = $1 AND e."enseignantId" = $2
		`, sessionID, claims.UserID).Scan(&epreuveID)
		if err != nil {
			return err
		}

		// Récupérer toutes les réponses QRC/CODE/REFLEXION sans noteIA
		rows, err := tx.Query(r.Context(), `
			SELECT r."id", r."questionId"
			FROM "Reponse" r
			JOIN "Question" q ON q."id" = r."questionId"
			WHERE r."sessionId" = $1
			  AND r."noteIA" IS NULL
			  AND r."contenu" IS NOT NULL
			  AND q."type" IN ('QRC', 'CODE', 'REFLEXION')
		`, sessionID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var rep pendingRep
			if err := rows.Scan(&rep.ID, &rep.QuestionID); err == nil {
				pending = append(pending, rep)
			}
		}
		return nil
	})

	// Queue les jobs (non-blocking send)
	pushed := 0
	for _, rep := range pending {
		job := worker.CorrectionJob{
			ReponseID:    rep.ID,
			SessionID:    sessionID,
			QuestionID:   rep.QuestionID,
			EnseignantID: claims.UserID,
		}
		select {
		case worker.CorrectionQueue <- job:
			pushed++
		default:
			// Queue pleine — on continue
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":  "EN_COURS",
		"graded":  pushed,
		"total":   len(pending),
		"message": fmt.Sprintf("%d réponses envoyées à l'IA", pushed),
	})
}
