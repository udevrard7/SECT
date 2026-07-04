// Package http — surveillance handlers réécrits (SURVEILLANCE-FIX-1 + SURVEILLANCE-FIX-2).
package http

import (
        "encoding/json"
        "fmt"
        "net/http"
        "strings"
        "time"

        "github.com/go-chi/chi/v5"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// GET /api/surveillance — liste des sessions avec détails de surveillance
//
// SURVEILLANCE-FIX-2 (P1) :
//   - DTO aligné sur le type frontend `SurveillanceSession` (etudiant/epreuve
//     nested, logEvents en tableau parsé, totalPenalite, riskScore, riskLevel,
//     flagged).
//   - Partition logEvents → fraudEvents / screenshotEvents / submissionEvents
//     côté backend (le frontend n'a plus qu'à consommer).
//   - Filtres query params appliqués : epreuveId, severity, type, search.
//   - epreuves[] renvoyé dans la réponse pour alimenter le dropdown filtre.
//   - Erreurs SQL propagées (500 au lieu de 200 silencieux).
//   - RequireRole géré au niveau router (ENSEIGNANT/ADMIN/RESPONSABLE).
// ──────────────────────────────────────────────────────────────────────────

// survEtudiantRef — sous-objet etudiant imbriqué (cf. SurveillanceSession.etudiant).
type survEtudiantRef struct {
        ID    string `json:"id"`
        Name  string `json:"name"`
        Email string `json:"email,omitempty"`
}

// survEpreuveRef — sous-objet epreuve imbriqué (cf. SurveillanceSession.epreuve).
type survEpreuveRef struct {
        ID               string  `json:"id"`
        Titre            string  `json:"titre"`
        Statut           string  `json:"statut"`
        DateDebut        *string `json:"dateDebut,omitempty"`
        DateFin          *string `json:"dateFin,omitempty"`
        ProctoringActif bool    `json:"proctoringActif"`
}

// survLogEvent — un événement du log (1:1 avec frontend LogEvent).
type survLogEvent struct {
        Type        string  `json:"type"`
        Timestamp   string  `json:"timestamp"`
        Details     string  `json:"details,omitempty"`
        Penalite    float64 `json:"penalite,omitempty"`
        ImageLength int     `json:"imageLength,omitempty"`
        Thumbnail   string  `json:"thumbnail,omitempty"`
}

// survSession — DTO aligné sur frontend SurveillanceSession.
type survSession struct {
        ID               string            `json:"id"`
        Statut           string            `json:"statut"`
        DateDebut        *string           `json:"dateDebut,omitempty"`
        DateFin          *string           `json:"dateFin,omitempty"`
        Score            *float64          `json:"score,omitempty"`
        Penalite         float64           `json:"penalite"`
        Alertes          int               `json:"alertes"`
        Etudiant         survEtudiantRef   `json:"etudiant"`
        Epreuve          survEpreuveRef    `json:"epreuve"`
        LogEvents        []survLogEvent    `json:"logEvents"`
        FraudEvents      []survLogEvent    `json:"fraudEvents"`
        ScreenshotEvents []survLogEvent    `json:"screenshotEvents"`
        SubmissionEvents []survLogEvent    `json:"submissionEvents"`
        TotalPenalite    float64           `json:"totalPenalite"`
        RiskScore        int               `json:"riskScore"`
        RiskLevel        string            `json:"riskLevel"`
        Flagged          bool              `json:"flagged"`
}

// survEpreuveOption — DTO aligné sur frontend EpreuveOption (dropdown filtre).
type survEpreuveOption struct {
        ID                 string  `json:"id"`
        Titre              string  `json:"titre"`
        Statut             string  `json:"statut"`
        DateDebut          *string `json:"dateDebut,omitempty"`
        DateFin            *string `json:"dateFin,omitempty"`
        ProctoringActif   bool    `json:"proctoringActif"`
        TotalAlerts        int     `json:"totalAlerts"`
        SessionsWithAlerts int     `json:"sessionsWithAlerts"`
        TotalSessions      int     `json:"totalSessions"`
}

// screenshotEventTypes — événements considérés comme captures d'écran.
var screenshotEventTypes = map[string]bool{
        "SCREEN_CAPTURE":      true,
        "PRINTSCREEN_ATTEMPT": true,
}

// submissionEventTypes — événements de soumission.
var submissionEventTypes = map[string]bool{
        "AUTO_SUBMIT":   true,
        "MANUAL_SUBMIT": true,
        "FORCE_SUBMIT":  true,
        "SESSION_END":   true,
}

// benignEventTypes — événements non-fraude à exclure de fraudEvents.
var benignEventTypes = map[string]bool{
        "SESSION_START": true,
        "ANSWER_SAVE":   true,
}

// computeSurvRiskScore — calcule un score 0-100 à partir des métriques.
// Formule : min(100, alertes*8 + pénalité*2 + bonus par événements critiques).
func computeSurvRiskScore(alertes int, penalite float64, fraudEvents []survLogEvent) int {
        criticalCount := 0
        for _, e := range fraudEvents {
                switch e.Type {
                case "FULLSCREEN_EXIT", "TAB_SWITCH", "DEVTOOLS_ATTEMPT":
                        criticalCount++
                }
        }
        score := alertes*8 + int(penalite)*2 + criticalCount*5
        if score > 100 {
                score = 100
        }
        if score < 0 {
                score = 0
        }
        return score
}

// riskLevelFromScore — dérive le niveau de risque depuis le score.
func riskLevelFromScore(score int) string {
        switch {
        case score >= 70:
                return "critical"
        case score >= 40:
                return "high"
        case score >= 15:
                return "moderate"
        default:
                return "safe"
        }
}

func (s *Server) surveillanceListSessions(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        // Scope enseignant : un ENSEIGNANT ne voit que ses sessions ; un ADMIN/RESPONSABLE
        // peut explicitement filtrer via ?enseignantId=.
        enseignantID := r.URL.Query().Get("enseignantId")
        if enseignantID == "" && claims.Role == "ENSEIGNANT" {
                enseignantID = claims.UserID
        }

        // Filtres UI (SURVEILLANCE-FIX-2 S5) : epreuveId, severity, type, search.
        // UX-IMPROVE : ajout dateDebut/dateFin pour filtrer par date d'épreuve.
        epreuveFilter := r.URL.Query().Get("epreuveId")
        severityFilter := r.URL.Query().Get("severity")
        typeFilter := r.URL.Query().Get("type")
        searchFilter := r.URL.Query().Get("search")
        dateDebutFilter := r.URL.Query().Get("dateDebut")
        dateFinFilter := r.URL.Query().Get("dateFin")

        type rawSession struct {
                ID              string
                EtudiantID      string
                EtudiantNom     string
                EtudiantEmail   string
                EpreuveID       string
                EpreuveTitre    string
                EpreuveStatut   string
                EpreuveDebut    *time.Time
                EpreuveFin      *time.Time
                ProctoringActif bool
                SessionStatut   string
                DateDebut       *time.Time
                DateFin         *time.Time
                Score           *float64
                Alertes         int
                Penalite        float64
                LogEventsRaw    []byte // logEvents TEXT parsé en []byte
                Flagged         bool   // EXISTS Alerte FRAUDE
        }

        var rawSessions []rawSession
        var epreuveOptions []survEpreuveOption
        var txErr error

        txErr = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                var where []string
                var args []any
                argIdx := 1

                if enseignantID != "" {
                        where = append(where, fmt.Sprintf(`e."enseignantId" = $%d`, argIdx))
                        args = append(args, enseignantID)
                        argIdx++
                }
                if epreuveFilter != "" {
                        where = append(where, fmt.Sprintf(`s."epreuveId" = $%d`, argIdx))
                        args = append(args, epreuveFilter)
                        argIdx++
                }
                if searchFilter != "" {
                        where = append(where, fmt.Sprintf(`(u."name" ILIKE $%d OR u."email" ILIKE $%d)`, argIdx, argIdx))
                        args = append(args, "%"+searchFilter+"%")
                        argIdx++
                }
                // UX-IMPROVE : filtre par date d'épreuve (dateDebut/dateFin).
                // Permet à l'enseignant de cibler une session spécifique dans le temps
                // au lieu de charger toutes les sessions d'un coup.
                if dateDebutFilter != "" {
                        where = append(where, fmt.Sprintf(`e."dateDebut" >= $%d`, argIdx))
                        args = append(args, dateDebutFilter)
                        argIdx++
                }
                if dateFinFilter != "" {
                        where = append(where, fmt.Sprintf(`e."dateFin" <= $%d`, argIdx))
                        args = append(args, dateFinFilter)
                        argIdx++
                }

                whereClause := ""
                if len(where) > 0 {
                        whereClause = "WHERE " + strings.Join(where, " AND ")
                }

                query := fmt.Sprintf(`
                        SELECT s."id", s."etudiantId",
                               COALESCE(u."name", '') AS etudiant_nom,
                               COALESCE(u."email", '') AS etudiant_email,
                               s."epreuveId",
                               COALESCE(e."titre", '') AS epreuve_titre,
                               COALESCE(e."statut"::text, '') AS epreuve_statut,
                               e."dateDebut" AS epreuve_debut,
                               e."dateFin" AS epreuve_fin,
                               COALESCE(e."proctoringActif", false) AS proctoring,
                               s."statut"::text AS session_statut,
                               s."dateDebut", s."dateFin", s."score",
                               COALESCE(s."alertes", 0), COALESCE(s."penalite", 0),
                               COALESCE(s."logEvents"::text, '[]')::bytea AS log_events,
                               EXISTS(
                                 SELECT 1 FROM "Alerte" a
                                 WHERE a."epreuveId" = s."epreuveId"
                                   AND a."userId" = s."etudiantId"
                                   AND a."type" = 'FRAUDE'
                               ) AS flagged
                        FROM "SessionPassation" s
                        LEFT JOIN "User" u ON u."id" = s."etudiantId"
                        LEFT JOIN "Epreuve" e ON e."id" = s."epreuveId"
                        %s
                        ORDER BY s."createdAt" DESC
                        LIMIT 200
                `, whereClause)

                rows, err := tx.Query(r.Context(), query, args...)
                if err != nil {
                        return fmt.Errorf("query sessions: %w", err)
                }
                defer rows.Close()

                for rows.Next() {
                        rs := rawSession{}
                        if err := rows.Scan(
                                &rs.ID, &rs.EtudiantID, &rs.EtudiantNom, &rs.EtudiantEmail,
                                &rs.EpreuveID, &rs.EpreuveTitre, &rs.EpreuveStatut,
                                &rs.EpreuveDebut, &rs.EpreuveFin, &rs.ProctoringActif,
                                &rs.SessionStatut, &rs.DateDebut, &rs.DateFin, &rs.Score,
                                &rs.Alertes, &rs.Penalite, &rs.LogEventsRaw, &rs.Flagged,
                        ); err != nil {
                                return fmt.Errorf("scan session: %w", err)
                        }
                        rawSessions = append(rawSessions, rs)
                }
                if err := rows.Err(); err != nil {
                        return fmt.Errorf("rows iteration: %w", err)
                }

                // Récupération des épreuves pour le dropdown filtre (S4).
                var eArgs []any
                eIdx := 1
                eWhere := ""
                if enseignantID != "" {
                        eWhere = fmt.Sprintf(`WHERE e."enseignantId" = $%d`, eIdx)
                        eArgs = append(eArgs, enseignantID)
                        eIdx++
                }
                epreuvesQuery := fmt.Sprintf(`
                        SELECT e."id", e."titre", e."statut"::text, e."dateDebut", e."dateFin",
                               COALESCE(e."proctoringActif", false),
                               COALESCE(sum(s."alertes"), 0) AS total_alerts,
                               count(*) FILTER (WHERE s."alertes" > 0) AS sessions_with_alerts,
                               count(*) AS total_sessions
                        FROM "Epreuve" e
                        LEFT JOIN "SessionPassation" s ON s."epreuveId" = e."id"
                        %s
                        GROUP BY e."id", e."titre", e."statut", e."dateDebut", e."dateFin", e."proctoringActif"
                        ORDER BY e."titre" ASC
                        LIMIT 100
                `, eWhere)
                epRows, err := tx.Query(r.Context(), epreuvesQuery, eArgs...)
                if err != nil {
                        return fmt.Errorf("query epreuves: %w", err)
                }
                defer epRows.Close()
                for epRows.Next() {
                        eo := survEpreuveOption{}
                        var debut, fin *time.Time
                        if err := epRows.Scan(&eo.ID, &eo.Titre, &eo.Statut, &debut, &fin,
                                &eo.ProctoringActif, &eo.TotalAlerts, &eo.SessionsWithAlerts, &eo.TotalSessions); err != nil {
                                return fmt.Errorf("scan epreuve: %w", err)
                        }
                        if debut != nil {
                                ts := debut.UTC().Format(time.RFC3339)
                                eo.DateDebut = &ts
                        }
                        if fin != nil {
                                ts := fin.UTC().Format(time.RFC3339)
                                eo.DateFin = &ts
                        }
                        epreuveOptions = append(epreuveOptions, eo)
                }
                if err := epRows.Err(); err != nil {
                        return fmt.Errorf("epreuves rows: %w", err)
                }

                return nil
        })

        if txErr != nil {
                // SURVEILLANCE-FIX-2 S12 : propager l'erreur SQL au lieu de renvoyer 200 vide.
                http.Error(w, `{"error":"`+txErr.Error()+`"}`, http.StatusInternalServerError)
                return
        }

        // Mapping rawSession → survSession avec partition logEvents.
        sessions := make([]survSession, 0, len(rawSessions))
        for _, rs := range rawSessions {
                // Parse logEvents JSON → []survLogEvent.
                var logEvents []survLogEvent
                if len(rs.LogEventsRaw) > 0 && string(rs.LogEventsRaw) != "[]" {
                        if err := json.Unmarshal(rs.LogEventsRaw, &logEvents); err != nil {
                                // logEvents corrompu : on ne crash pas, on logge et continue avec tableau vide.
                                logEvents = []survLogEvent{}
                        }
                } else {
                        logEvents = []survLogEvent{}
                }

                // Partition : fraudEvents / screenshotEvents / submissionEvents.
                fraudEvents := make([]survLogEvent, 0)
                screenshotEvents := make([]survLogEvent, 0)
                submissionEvents := make([]survLogEvent, 0)
                for _, evt := range logEvents {
                        switch {
                        case screenshotEventTypes[evt.Type]:
                                screenshotEvents = append(screenshotEvents, evt)
                        case submissionEventTypes[evt.Type]:
                                submissionEvents = append(submissionEvents, evt)
                        case benignEventTypes[evt.Type]:
                                // ignoré
                        default:
                                fraudEvents = append(fraudEvents, evt)
                        }
                }

                // Filtre severity (post-fetch) : high/medium/low/info selon getSeverityLevel.
                if severityFilter != "" && severityFilter != "all" {
                        keep := false
                        for _, evt := range logEvents {
                                if severityOfEvent(evt.Type) == severityFilter {
                                        keep = true
                                        break
                                }
                        }
                        if !keep {
                                continue
                        }
                }

                // Filtre type (post-fetch) : au moins un événement de ce type dans la session.
                if typeFilter != "" && typeFilter != "all" {
                        keep := false
                        for _, evt := range logEvents {
                                if evt.Type == typeFilter {
                                        keep = true
                                        break
                                }
                        }
                        if !keep {
                                continue
                        }
                }

                // Calcul riskScore / riskLevel / totalPenalite (S6).
                totalPenalite := rs.Penalite
                for _, evt := range logEvents {
                        totalPenalite += evt.Penalite
                }
                riskScore := computeSurvRiskScore(rs.Alertes, totalPenalite, fraudEvents)
                riskLevel := riskLevelFromScore(riskScore)

                ss := survSession{
                        ID:     rs.ID,
                        Statut: rs.SessionStatut,
                        Score:  rs.Score,
                        Penalite: rs.Penalite,
                        Alertes:  rs.Alertes,
                        Etudiant: survEtudiantRef{
                                ID:    rs.EtudiantID,
                                Name:  rs.EtudiantNom,
                                Email: rs.EtudiantEmail,
                        },
                        Epreuve: survEpreuveRef{
                                ID:               rs.EpreuveID,
                                Titre:            rs.EpreuveTitre,
                                Statut:           rs.EpreuveStatut,
                                ProctoringActif:  rs.ProctoringActif,
                        },
                        LogEvents:        logEvents,
                        FraudEvents:      fraudEvents,
                        ScreenshotEvents: screenshotEvents,
                        SubmissionEvents: submissionEvents,
                        TotalPenalite:    totalPenalite,
                        RiskScore:        riskScore,
                        RiskLevel:        riskLevel,
                        Flagged:          rs.Flagged,
                }
                if rs.DateDebut != nil {
                        ts := rs.DateDebut.UTC().Format(time.RFC3339)
                        ss.DateDebut = &ts
                }
                if rs.DateFin != nil {
                        ts := rs.DateFin.UTC().Format(time.RFC3339)
                        ss.DateFin = &ts
                }
                if rs.EpreuveDebut != nil {
                        ts := rs.EpreuveDebut.UTC().Format(time.RFC3339)
                        ss.Epreuve.DateDebut = &ts
                }
                if rs.EpreuveFin != nil {
                        ts := rs.EpreuveFin.UTC().Format(time.RFC3339)
                        ss.Epreuve.DateFin = &ts
                }
                sessions = append(sessions, ss)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "sessions": sessions,
                "epreuves": epreuveOptions,
                "total":    len(sessions),
        })
}

// severityOfEvent — map un type d'événement à un niveau de sévérité
// (cohérent avec frontend getSeverityLevel).
func severityOfEvent(eventType string) string {
        switch eventType {
        case "FULLSCREEN_EXIT", "TAB_SWITCH", "DEVTOOLS_ATTEMPT":
                return "high"
        case "COPY_ATTEMPT", "PASTE_ATTEMPT", "PRINTSCREEN_ATTEMPT", "PRINT_ATTEMPT", "ALT_TAB":
                return "medium"
        case "INACTIVITY":
                return "low"
        }
        return "info"
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
                TotalSessions      int     `json:"totalSessions"`
                ActiveSessions     int     `json:"activeSessions"`
                SessionsWithAlerts int     `json:"sessionsWithAlerts"`
                TotalAlerts        int     `json:"totalAlerts"`
                TotalPenalite      float64 `json:"totalPenalite"`
                FlaggedSessions    int     `json:"flaggedSessions"`
                Screenshots        int     `json:"screenshots"`
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
                "kpis":        kpis{},
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

                // Compter les screenshots (SCREEN_CAPTURE + PRINTSCREEN_ATTEMPT) dans logEvents.
                var screenshots int
                _ = tx.QueryRow(r.Context(), fmt.Sprintf(`
                        SELECT count(*) FROM (
                          SELECT je->>'type' AS t
                          FROM "SessionPassation" s
                          JOIN "Epreuve" e ON e."id" = s."epreuveId"
                          CROSS JOIN LATERAL jsonb_array_elements(s."logEvents"::jsonb) AS je
                          WHERE s."logEvents" IS NOT NULL AND s."logEvents" != '[]'
                            AND je->>'type' IN ('SCREEN_CAPTURE','PRINTSCREEN_ATTEMPT')
                            %s
                        ) sub
                `, whereE), args...).Scan(&screenshots)

                result["kpis"] = kpis{
                        TotalSessions:      total,
                        ActiveSessions:     active,
                        SessionsWithAlerts: withAlerts,
                        TotalAlerts:        totalAlerts,
                        TotalPenalite:      totalPen,
                        FlaggedSessions:    flagged,
                        Screenshots:        screenshots,
                }

                // 2. Fraud by type (from logEvents JSON) — labels synchronisés avec frontend.
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
                        // SURVEILLANCE-FIX-2 S15 : labels synchronisés avec frontend EVENT_LABELS.
                        labels := map[string]string{
                                "FULLSCREEN_EXIT":    "Sortie plein écran",
                                "TAB_SWITCH":         "Changement d'onglet",
                                "COPY_ATTEMPT":       "Tentative de copie",
                                "PASTE_ATTEMPT":      "Tentative de collage",
                                "DEVTOOLS_ATTEMPT":   "Outils de développement",
                                "PRINTSCREEN_ATTEMPT": "Capture d'écran",
                                "PRINT_ATTEMPT":      "Tentative d'impression",
                                "ALT_TAB":            "Alt+Tab détecté",
                                "INACTIVITY":         "Inactivité détectée",
                                "SCREEN_CAPTURE":     "Capture périodique",
                                "AUTO_SUBMIT":        "Soumission automatique",
                                "MANUAL_SUBMIT":      "Soumission manuelle",
                                "FORCE_SUBMIT":       "Soumission forcée",
                        }
                        for rows.Next() {
                                var et string
                                var nb int
                                if err := rows.Scan(&et, &nb); err == nil {
                                        label, ok := labels[et]
                                        if !ok {
                                                label = et
                                        }
                                        fraud = append(fraud, fraudByTypeItem{
                                                Type:  et,
                                                Count: nb,
                                                Label: label,
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
// POST /api/surveillance/{id}/flag — signale une session (crée une Alerte FRAUDE)
//
// SURVEILLANCE-FIX-2 S2 :
//   - Route manquante implémentée.
//   - Body optionnel : { reason?: string }
//   - Vérifie ownership (enseignant = propriétaire de l'épreuve).
//   - 409 si déjà signalée (EXISTS Alerte FRAUDE).
//   - Crée une ligne dans "Alerte" (titre, description, severity=WARNING,
//     type=FRAUDE, epreuveId, userId=etudiantId).
// ──────────────────────────────────────────────────────────────────────────

func (s *Server) surveillanceFlagSession(w http.ResponseWriter, r *http.Request) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return
        }

        sessionID := chi.URLParam(r, "id")
        if sessionID == "" {
                writeJSONError(w, http.StatusBadRequest, "session id required")
                return
        }

        var body struct {
                Reason string `json:"reason"`
        }
        _ = json.NewDecoder(r.Body).Decode(&body)

        var alerteID string
        txErr := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // 1. Récupérer la session + vérifier ownership (enseignant = propriétaire épreuve).
                var epreuveID, etudiantID, epreuveTitre, etudiantNom string
                var alertes int
                var penalite float64
                err := tx.QueryRow(r.Context(), `
                        SELECT s."epreuveId", s."etudiantId",
                               COALESCE(e."titre", 'Épreuve'), COALESCE(u."name", 'Étudiant'),
                               COALESCE(s."alertes", 0), COALESCE(s."penalite", 0)
                        FROM "SessionPassation" s
                        LEFT JOIN "Epreuve" e ON e."id" = s."epreuveId"
                        LEFT JOIN "User" u ON u."id" = s."etudiantId"
                        WHERE s."id" = $1
                `, sessionID).Scan(&epreuveID, &etudiantID, &epreuveTitre, &etudiantNom, &alertes, &penalite)
                if err != nil {
                        return &domain.NotFoundError{Entity: "SessionPassation", ID: sessionID}
                }

                // Ownership : ENSEIGNANT doit être propriétaire de l'épreuve.
                if claims.Role == "ENSEIGNANT" {
                        var ownerID string
                        err = tx.QueryRow(r.Context(), `SELECT "enseignantId" FROM "Epreuve" WHERE "id" = $1`, epreuveID).Scan(&ownerID)
                        if err != nil {
                                return &domain.NotFoundError{Entity: "Epreuve", ID: epreuveID}
                        }
                        if ownerID != claims.UserID {
                                return &domain.UnauthorizedError{Message: "accès refusé à cette session"}
                        }
                }

                // 2. Vérifier si déjà signalée (EXISTS Alerte FRAUDE).
                var alreadyFlagged bool
                err = tx.QueryRow(r.Context(), `
                        SELECT EXISTS(
                          SELECT 1 FROM "Alerte"
                          WHERE "epreuveId" = $1 AND "userId" = $2 AND "type" = 'FRAUDE'
                        )
                `, epreuveID, etudiantID).Scan(&alreadyFlagged)
                if err != nil {
                        return fmt.Errorf("check existing alerte: %w", err)
                }
                if alreadyFlagged {
                        return &domain.ConflictError{Message: "Cette session a déjà été signalée."}
                }

                // 3. Construire titre + description.
                shortID := sessionID
                if len(shortID) > 8 {
                        shortID = shortID[:8]
                }
                titre := fmt.Sprintf("Session signalée — %s (%s)", etudiantNom, epreuveTitre)
                description := fmt.Sprintf("Session %s signalée par %s. %d alerte(s), pénalité %.2f.",
                        shortID, claims.UserID, alertes, penalite)
                if body.Reason != "" {
                        description += " Motif : " + body.Reason
                }

                // 4. Insérer l'alerte.
                err = tx.QueryRow(r.Context(), `
                        INSERT INTO "Alerte" ("titre", "description", "severity", "type", "epreuveId", "userId", "lue", "resolu", "createdAt")
                        VALUES ($1, $2, 'WARNING', 'FRAUDE', $3, $4, false, false, now())
                        RETURNING "id"
                `, titre, description, epreuveID, etudiantID).Scan(&alerteID)
                if err != nil {
                        return fmt.Errorf("insert alerte: %w", err)
                }
                return nil
        })

        if txErr != nil {
                // MapDomainError fait le type switch : NotFound→404, Unauthorized→403,
                // Conflict→409, Validation→400, default→500.
                middleware.MapDomainError(w, txErr)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{
                "alerte": map[string]string{
                        "id":       alerteID,
                        "titre":    "Session signalée",
                        "severity": "WARNING",
                        "type":     "FRAUDE",
                },
                "message": "Session signalée — alerte fraude créée",
        })
}

// ──────────────────────────────────────────────────────────────────────────
// SSE-STREAM-1 : GET /api/surveillance/stream — Server-Sent Events
// ──────────────────────────────────────────────────────────────────────────

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

        w.Header().Set("Content-Type", "text/event-stream")
        w.Header().Set("Cache-Control", "no-cache")
        w.Header().Set("Connection", "keep-alive")
        w.Header().Set("X-Accel-Buffering", "no")

        flusher, _ := w.(http.Flusher)
        flushIfNeeded := func() {
                if flusher != nil {
                        flusher.Flush()
                }
        }

        stats := s.fetchSurveillanceStats(r, enseignantID)
        if statsJSON, err := json.Marshal(stats); err == nil {
                fmt.Fprintf(w, "data: %s\n\n", statsJSON)
                flushIfNeeded()
        }

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
                                flushIfNeeded()
                        }
                case <-heartbeat.C:
                        fmt.Fprintf(w, ": heartbeat\n\n")
                        flushIfNeeded()
                }
        }
}

// fetchSurveillanceStats — recupere les stats de surveillance pour le SSE.
func (s *Server) fetchSurveillanceStats(r *http.Request, enseignantID string) map[string]any {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok {
                return map[string]any{"error": "no claims"}
        }

        result := map[string]any{
                "totalSessions":  0,
                "activeSessions": 0,
                "withAlerts":     0,
                "flagged":        0,
                "timestamp":      time.Now().UTC().Format(time.RFC3339),
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
