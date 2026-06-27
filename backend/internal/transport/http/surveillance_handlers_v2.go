// Package http — surveillance handlers réécrits (SURVEILLANCE-FIX-1).
package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// GET /api/surveillance — liste des sessions avec détails de surveillance
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) surveillanceListSessions(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	enseignantID := r.URL.Query().Get("enseignantId")
	if enseignantID == "" && claims.Role == "ENSEIGNANT" {
		enseignantID = claims.UserID
	}

	type survSession struct {
		ID            string   `json:"id"`
		EtudiantID    string   `json:"etudiantId"`
		EtudiantNom   string   `json:"etudiantNom"`
		EpreuveID     string   `json:"epreuveId"`
		EpreuveTitre  string   `json:"epreuveTitre"`
		Statut        string   `json:"statut"`
		DateDebut     *string  `json:"dateDebut,omitempty"`
		DateFin       *string  `json:"dateFin,omitempty"`
		Score         *float64 `json:"score,omitempty"`
		Alertes       int      `json:"alertes"`
		Penalite      float64  `json:"penalite"`
		LogEvents     *string  `json:"logEvents,omitempty"`
	}

	result := []survSession{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		var args []any
		argIdx := 1
		whereClause := ""
		if enseignantID != "" {
			whereClause = fmt.Sprintf(`WHERE e."enseignantId" = $%d`, argIdx)
			args = append(args, enseignantID)
			argIdx++
		}

		query := fmt.Sprintf(`
			SELECT s."id", s."etudiantId", u."name", s."epreuveId", e."titre",
			       s."statut"::text, s."dateDebut", s."dateFin", s."score",
			       s."alertes", s."penalite", s."logEvents"::text
			FROM "SessionPassation" s
			LEFT JOIN "User" u ON u."id" = s."etudiantId"
			LEFT JOIN "Epreuve" e ON e."id" = s."epreuveId"
			%s
			ORDER BY s."createdAt" DESC
			LIMIT 200
		`, whereClause)

		rows, err := tx.Query(r.Context(), query, args...)
		if err != nil {
			return nil
		}
		defer rows.Close()
		for rows.Next() {
			ss := survSession{}
			var dateDebut, dateFin *time.Time
			if err := rows.Scan(&ss.ID, &ss.EtudiantID, &ss.EtudiantNom, &ss.EpreuveID,
				&ss.EpreuveTitre, &ss.Statut, &dateDebut, &dateFin, &ss.Score,
				&ss.Alertes, &ss.Penalite, &ss.LogEvents); err == nil {
				if ss.EtudiantNom == "" {
					ss.EtudiantNom = "—"
				}
				if ss.EpreuveTitre == "" {
					ss.EpreuveTitre = "—"
				}
				if dateDebut != nil {
					ts := dateDebut.UTC().Format(time.RFC3339)
					ss.DateDebut = &ts
				}
				if dateFin != nil {
					ts := dateFin.UTC().Format(time.RFC3339)
					ss.DateFin = &ts
				}
				result = append(result, ss)
			}
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"sessions": result,
		"total":    len(result),
	})
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/surveillance/stats — stats complètes pour AnalysisTab
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) surveillanceStatsV2(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	enseignantID := r.URL.Query().Get("enseignantId")
	if enseignantID == "" && claims.Role == "ENSEIGNANT" {
		enseignantID = claims.UserID
	}

	type kpis struct {
		TotalSessions    int `json:"totalSessions"`
		ActiveSessions   int `json:"activeSessions"`
		SessionsWithAlerts int `json:"sessionsWithAlerts"`
		TotalAlerts      int `json:"totalAlerts"`
		TotalPenalite    float64 `json:"totalPenalite"`
		FlaggedSessions  int `json:"flaggedSessions"`
		Screenshots      int `json:"screenshots"`
	}
	type fraudByTypeItem struct {
		Type  string `json:"type"`
		Count int    `json:"count"`
		Label string `json:"label"`
	}
	type timelineItem struct {
		Date     string `json:"date"`
		Alerts   int    `json:"alerts"`
		Sessions int    `json:"sessions"`
	}
	type topStudent struct {
		ID       string  `json:"id"`
		Name     string  `json:"name"`
		Email    string  `json:"email"`
		Alertes  int     `json:"alertes"`
		Penalite float64 `json:"penalite"`
	}

	result := map[string]any{
		"kpis": kpis{},
		"fraudByType": []fraudByTypeItem{},
		"timeline":    []timelineItem{},
		"topStudents": []topStudent{},
	}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		var args []any
		argIdx := 1
		whereE := ""
		if enseignantID != "" {
			whereE = fmt.Sprintf(`AND e."enseignantId" = $%d`, argIdx)
			args = append(args, enseignantID)
			argIdx++
		}

		// 1. KPIs globaux
		var total, active, withAlerts, totalAlerts, flagged int
		var totalPen float64
		_ = tx.QueryRow(r.Context(), fmt.Sprintf(`
			SELECT count(*),
			       count(*) FILTER (WHERE s."statut" = 'EN_COURS'),
			       count(*) FILTER (WHERE s."alertes" > 0),
			       COALESCE(sum(s."alertes"), 0),
			       COALESCE(sum(s."penalite"), 0),
			       count(*) FILTER (WHERE s."alertes" >= 3)
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE 1=1 %s
		`, whereE), args...).Scan(&total, &active, &withAlerts, &totalAlerts, &totalPen, &flagged)

		result["kpis"] = kpis{
			TotalSessions:    total,
			ActiveSessions:   active,
			SessionsWithAlerts: withAlerts,
			TotalAlerts:      totalAlerts,
			TotalPenalite:    totalPen,
			FlaggedSessions:  flagged,
			Screenshots:      0,
		}

		// 2. Fraud by type (from logEvents JSON)
		rows, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT je->>'type' AS event_type, count(*) AS nb
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			CROSS JOIN LATERAL jsonb_array_elements(s."logEvents"::jsonb) AS je
			WHERE s."logEvents" IS NOT NULL AND s."logEvents" != '[]'
			  AND je->>'type' NOT IN ('SESSION_START','SESSION_END','ANSWER_SAVE')
			  %s
			GROUP BY event_type ORDER BY nb DESC
		`, whereE), args...)
		if err == nil {
			defer rows.Close()
			fraud := []fraudByTypeItem{}
			labels := map[string]string{
				"TAB_SWITCH": "Changement d'onglet",
				"WINDOW_BLUR": "Perte de focus",
				"COPY_PASTE": "Copier-coller",
				"RIGHT_CLICK": "Clic droit",
				"FULLSCREEN_EXIT": "Sortie plein écran",
				"SCREENSHARE": "Partage d'écran",
			}
			for rows.Next() {
				var et string
				var nb int
				if err := rows.Scan(&et, &nb); err == nil {
					fraud = append(fraud, fraudByTypeItem{
						Type:  et,
						Count: nb,
						Label: labels[et],
					})
				}
			}
			result["fraudByType"] = fraud
		}

		// 3. Timeline (7 derniers jours)
		rows2, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT to_char(date_trunc('day', s."createdAt"), 'YYYY-MM-DD') AS jour,
			       count(*) AS sessions,
			       COALESCE(sum(s."alertes"), 0) AS alerts
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE s."createdAt" > now() - interval '7 days'
			  %s
			GROUP BY jour ORDER BY jour ASC
		`, whereE), args...)
		if err == nil {
			defer rows2.Close()
			timeline := []timelineItem{}
			for rows2.Next() {
				ti := timelineItem{}
				if err := rows2.Scan(&ti.Date, &ti.Sessions, &ti.Alerts); err == nil {
					timeline = append(timeline, ti)
				}
			}
			result["timeline"] = timeline
		}

		// 4. Top students by alertes
		rows3, err := tx.Query(r.Context(), fmt.Sprintf(`
			SELECT u."id", u."name", u."email",
			       COALESCE(sum(s."alertes"), 0) AS alertes,
			       COALESCE(sum(s."penalite"), 0) AS penalite
			FROM "SessionPassation" s
			JOIN "User" u ON u."id" = s."etudiantId"
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE s."alertes" > 0 %s
			GROUP BY u."id", u."name", u."email"
			ORDER BY alertes DESC LIMIT 5
		`, whereE), args...)
		if err == nil {
			defer rows3.Close()
			topStu := []topStudent{}
			for rows3.Next() {
				ts := topStudent{}
				if err := rows3.Scan(&ts.ID, &ts.Name, &ts.Email, &ts.Alertes, &ts.Penalite); err == nil {
					topStu = append(topStu, ts)
				}
			}
			result["topStudents"] = topStu
		}

		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}


// ──────────────────────────────────────────────────────────────────────────
// SSE-STREAM-1 : GET /api/surveillance/stream — Server-Sent Events
// ──────────────────────────────────────────────────────────────────────────
//
// Envoie periodiquement (toutes les 10s) les stats de surveillance mises
// a jour via SSE (text/event-stream). Le frontend ecoute avec EventSource
// natif (pas de librairie, pas de WebSocket).
//
// Avantages SSE sur Render Free + Vercel :
// - Passe nativement a travers les CDN et rewrites Vercel (HTTP standard)
// - Pas de timeout WebSocket (Render Free ne supporte pas WS)
// - Reconnexion automatique par EventSource (natif navigateur)
// - Heartbeat toutes les 15s pour garder la connexion sur Render Free
//
// Format SSE :
//   data: {"kpis":{...},"sessions":[...]}


//   : heartbeat

//   (commentaire SSE pour keep-alive)
func (s *Server) surveillanceStream(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	enseignantID := r.URL.Query().Get("enseignantId")
	if enseignantID == "" && claims.Role == "ENSEIGNANT" {
		enseignantID = claims.UserID
	}

	// 1. Configurer les headers SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, "streaming non supporte")
		return
	}

	// 2. Envoie un evenement initial immediat
	stats := s.fetchSurveillanceStats(r, enseignantID)
	if statsJSON, err := json.Marshal(stats); err == nil {
		fmt.Fprintf(w, "data: %s\n\n", statsJSON)
		flusher.Flush()
	}

	// 3. Boucle d'envoi periodique + heartbeat
	ticker := time.NewTicker(10 * time.Second)
	heartbeat := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	defer heartbeat.Stop()

	for {
		select {
			case <-r.Context().Done():
				return
			case <-ticker.C:
				stats := s.fetchSurveillanceStats(r, enseignantID)
				if statsJSON, err := json.Marshal(stats); err == nil {
					fmt.Fprintf(w, "data: %s\n\n", statsJSON)
					flusher.Flush()
				}
			case <-heartbeat.C:
				fmt.Fprintf(w, ": heartbeat\n\n")
				flusher.Flush()
		}
	}
}


// fetchSurveillanceStats — recupere les stats de surveillance pour le SSE.
// Version simplifiee des KPIs essentiels (suffisant pour le streaming temps reel).
func (s *Server) fetchSurveillanceStats(r *http.Request, enseignantID string) map[string]any {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		return map[string]any{"error": "no claims"}
	}

	result := map[string]any{
		"totalSessions":   0,
		"activeSessions":  0,
		"withAlerts":      0,
		"flagged":         0,
		"timestamp":       time.Now().UTC().Format(time.RFC3339),
	}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		var args []any
		whereE := ""
		if enseignantID != "" {
			whereE = `AND e."enseignantId" = $1`
			args = append(args, enseignantID)
		}

		var total, active, alerts, flagged int
		query := fmt.Sprintf(`
			SELECT count(*),
			count(*) FILTER (WHERE s."statut" = 'EN_COURS'),
			count(*) FILTER (WHERE s."alertes" > 0),
			count(*) FILTER (WHERE s."alertes" >= 3)
			FROM "SessionPassation" s
			JOIN "Epreuve" e ON e."id" = s."epreuveId"
			WHERE 1=1 %s`, whereE)
		_ = tx.QueryRow(r.Context(), query, args...).Scan(&total, &active, &alerts, &flagged)

		result["totalSessions"] = total
		result["activeSessions"] = active
		result["withAlerts"] = alerts
		result["flagged"] = flagged
		return nil
	})

	return result
}
