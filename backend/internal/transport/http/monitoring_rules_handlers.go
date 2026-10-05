package http

// monitoring_rules_handlers.go — Règles d'alerte configurables persistées
// + percentiles par endpoint (ADR-0012, P5 d'ADR-0011).
//
// 4 endpoints (ADMIN — RequireRole déclaré dans router.go) :
// - GET  /api/monitoring/rules            : règles + statut live (valeur
//   mesurée + franchissement) + config canaux + catalogue métriques ;
// - POST /api/monitoring/rules            : création custom (métrique du
//   catalogue, code généré custom-<uuid8>, isSystem=false) ;
// - PUT  /api/monitoring/rules/{id}       : édition (seuil, comparateur,
//   sévérité, activation, cooldown, canaux, libellé). metric IMMUTABLE.
//   Désactiver une règle clear breachedSince (état worker cohérent) ;
// - DELETE /api/monitoring/rules/{id}     : refusé sur règle système.
//
// + GET /api/monitoring/endpoints?window=1h|24h|7d : p50/p95 par
//   endpoint (RequestLog, ADR-0012 §3).

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/monitoring"
)

// alertingRuleResponse — règle + statut live.
type alertingRuleResponse struct {
	ID              string  `json:"id"`
	Code            string  `json:"code"`
	Label           string  `json:"label"`
	Description     *string `json:"description"`
	Metric          string  `json:"metric"`
	MetricLabel     string  `json:"metricLabel"`
	Unit            string  `json:"unit"`
	Comparator      string  `json:"comparator"`
	Threshold       float64 `json:"threshold"`
	Severite        string  `json:"severite"`
	Enabled         bool    `json:"enabled"`
	CooldownMinutes int     `json:"cooldownMinutes"`
	NotifyInApp     bool    `json:"notifyInApp"`
	NotifySlack     bool    `json:"notifySlack"`
	NotifyEmail     bool    `json:"notifyEmail"`
	IsSystem        bool    `json:"isSystem"`
	BreachedSince   *string `json:"breachedSince"`
	LastNotifiedAt  *string `json:"lastNotifiedAt"`
	CurrentValue    float64 `json:"currentValue"`
	Violated        bool    `json:"violated"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
}

// fmtTimePtr — RFC3339 ou nil.
func fmtTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.UTC().Format(time.RFC3339)
	return &s
}

// monitoringRulesList — GET /api/monitoring/rules
func (s *Server) monitoringRulesList(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	rules, err := monitoring.ListAlertingRules(r.Context(), s.dbPool, claims)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "impossible de charger les règles")
		return
	}

	// Statut live : métriques mesurées backend (mêmes sources que /overview).
	metrics := monitoring.CollectMetrics(r.Context(), s.dbPool, claims, s.workerRegistry)

	out := make([]alertingRuleResponse, 0, len(rules))
	for i := range rules {
		rule := rules[i]
		st := monitoring.Evaluate(&rule, metrics)
		def, _ := monitoring.MetricDefByKey(rule.Metric)
		out = append(out, alertingRuleResponse{
			ID: rule.ID, Code: rule.Code, Label: rule.Label, Description: rule.Description,
			Metric: rule.Metric, MetricLabel: def.Label, Unit: def.Unit,
			Comparator: rule.Comparator, Threshold: rule.Threshold, Severite: rule.Severite,
			Enabled: rule.Enabled, CooldownMinutes: rule.CooldownMinutes,
			NotifyInApp: rule.NotifyInApp, NotifySlack: rule.NotifySlack, NotifyEmail: rule.NotifyEmail,
			IsSystem:       rule.IsSystem,
			BreachedSince:  fmtTimePtr(rule.BreachedSince),
			LastNotifiedAt: fmtTimePtr(rule.LastNotifiedAt),
			CurrentValue:   st.CurrentValue,
			Violated:       st.Violated,
			CreatedAt:      rule.CreatedAt.UTC().Format(time.RFC3339),
			UpdatedAt:      rule.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}

	// Dégradation honnête (ADR-0012) : l'UI sait quoi configurer.
	channels := map[string]any{
		"slackConfigured": s.alertingCfg.SlackWebhookURL != "",
		"emailTo":         s.alertingCfg.AlertingEmailTo,
		"emailReady":      s.alertingCfg.EmailReady,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"rules":       out,
		"channels":    channels,
		"metrics":     monitoring.MetricCatalog,
		"comparators": monitoring.Comparators,
	})
}

// alertingRuleInput — payload POST/PUT (partiel pour PUT).
type alertingRuleInput struct {
	Label           *string  `json:"label"`
	Description     *string  `json:"description"`
	Metric          *string  `json:"metric"`
	Comparator      *string  `json:"comparator"`
	Threshold       *float64 `json:"threshold"`
	Severite        *string  `json:"severite"`
	Enabled         *bool    `json:"enabled"`
	CooldownMinutes *int     `json:"cooldownMinutes"`
	NotifyInApp     *bool    `json:"notifyInApp"`
	NotifySlack     *bool    `json:"notifySlack"`
	NotifyEmail     *bool    `json:"notifyEmail"`
}

// validateRuleInput — validations partagées POST/PUT (ADR-0012 §5).
// metric requis seulement à la création (immutable ensuite).
func validateRuleInput(input *alertingRuleInput, requireMetric bool) string {
	if requireMetric {
		if input.Metric == nil || *input.Metric == "" {
			return "metric requis (catalogue GET /api/monitoring/rules → metrics)"
		}
		if _, ok := monitoring.MetricDefByKey(*input.Metric); !ok {
			return fmt.Sprintf("metric inconnu : %s", *input.Metric)
		}
	}
	if input.Comparator != nil {
		if !monitoring.ComparatorValid(*input.Comparator) {
			return "comparator invalide (SUP, SUP_EGAL, INF, INF_EGAL)"
		}
	}
	if input.Threshold != nil {
		if math.IsNaN(*input.Threshold) || *input.Threshold < 0 {
			return "threshold doit être un nombre ≥ 0"
		}
	}
	if input.Severite != nil {
		if !validSeveritesMonitoring[*input.Severite] {
			return "severite invalide (INFO, WARNING, ERROR, CRITICAL)"
		}
	}
	if input.CooldownMinutes != nil {
		if *input.CooldownMinutes < 1 || *input.CooldownMinutes > 1440 {
			return "cooldownMinutes doit être entre 1 et 1440"
		}
	}
	if input.Label != nil {
		if len(*input.Label) < 3 || len(*input.Label) > 120 {
			return "label doit faire entre 3 et 120 caractères"
		}
	}
	return ""
}

// monitoringRuleCreate — POST /api/monitoring/rules
func (s *Server) monitoringRuleCreate(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input alertingRuleInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if msg := validateRuleInput(&input, true); msg != "" {
		writeJSONError(w, http.StatusBadRequest, msg)
		return
	}
	if input.Label == nil || *input.Label == "" {
		writeJSONError(w, http.StatusBadRequest, "label requis")
		return
	}
	if input.Comparator == nil || input.Threshold == nil {
		writeJSONError(w, http.StatusBadRequest, "comparator et threshold requis")
		return
	}

	// Défauts : WARNING / actif / cooldown 30 / 3 canaux activés.
	severite := "WARNING"
	if input.Severite != nil {
		severite = *input.Severite
	}
	cooldown := 30
	if input.CooldownMinutes != nil {
		cooldown = *input.CooldownMinutes
	}
	notifyInApp, notifySlack, notifyEmail := true, true, true
	if input.NotifyInApp != nil {
		notifyInApp = *input.NotifyInApp
	}
	if input.NotifySlack != nil {
		notifySlack = *input.NotifySlack
	}
	if input.NotifyEmail != nil {
		notifyEmail = *input.NotifyEmail
	}

	rule := &monitoring.AlertingRule{}
	created := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		newID := "rule-" + uuid.NewString()[:8]
		code := "custom-" + uuid.NewString()[:8]
		createdByID := claims.UserID
		row := tx.QueryRow(r.Context(), fmt.Sprintf(`
                        INSERT INTO "AlertingRule" ("id", "code", "label", "description", "metric", "comparator",
                                "threshold", "severite", "enabled", "cooldownMinutes", "notifyInApp", "notifySlack",
                                "notifyEmail", "isSystem", "breachedSince", "lastNotifiedAt", "createdById", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, true, $9, $10, $11, $12, false, NULL, NULL, $13, now(), now())
                        RETURNING %s
                `, monitoring.AlertingRuleColumns),
			newID, code, *input.Label, derefString(input.Description), *input.Metric, *input.Comparator,
			*input.Threshold, severite, cooldown, notifyInApp, notifySlack, notifyEmail, createdByID)
		e, err := monitoring.ScanAlertingRule(row)
		if err == nil {
			rule = e
			created = true
		}
		return nil
	})
	if !created {
		writeJSONError(w, http.StatusForbidden, "création non autorisée")
		return
	}

	// Réponse avec statut live immédiat.
	metrics := monitoring.CollectMetrics(r.Context(), s.dbPool, claims, s.workerRegistry)
	st := monitoring.Evaluate(rule, metrics)
	def, _ := monitoring.MetricDefByKey(rule.Metric)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"rule": alertingRuleResponse{
		ID: rule.ID, Code: rule.Code, Label: rule.Label, Description: rule.Description,
		Metric: rule.Metric, MetricLabel: def.Label, Unit: def.Unit,
		Comparator: rule.Comparator, Threshold: rule.Threshold, Severite: rule.Severite,
		Enabled: rule.Enabled, CooldownMinutes: rule.CooldownMinutes,
		NotifyInApp: rule.NotifyInApp, NotifySlack: rule.NotifySlack, NotifyEmail: rule.NotifyEmail,
		IsSystem: rule.IsSystem, BreachedSince: fmtTimePtr(rule.BreachedSince),
		LastNotifiedAt: fmtTimePtr(rule.LastNotifiedAt),
		CurrentValue:   st.CurrentValue, Violated: st.Violated,
		CreatedAt: rule.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt: rule.UpdatedAt.UTC().Format(time.RFC3339),
	}})
}

// derefString — déréférence ou "".
func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// monitoringRuleUpdate — PUT /api/monitoring/rules/{id}
func (s *Server) monitoringRuleUpdate(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	var input alertingRuleInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if msg := validateRuleInput(&input, false); msg != "" {
		writeJSONError(w, http.StatusBadRequest, msg)
		return
	}
	if input.Metric != nil {
		writeJSONError(w, http.StatusBadRequest, "metric immuable (supprimer et recréer la règle)")
		return
	}

	// Construire le SET dynamique (partiel).
	sets := []string{}
	args := []any{id}
	add := func(col string, val any) {
		args = append(args, val)
		sets = append(sets, fmt.Sprintf(`"%s" = $%d`, col, len(args)))
	}
	if input.Label != nil {
		add("label", *input.Label)
	}
	if input.Description != nil {
		add("description", derefString(input.Description))
	}
	if input.Comparator != nil {
		add("comparator", *input.Comparator)
	}
	if input.Threshold != nil {
		add("threshold", *input.Threshold)
	}
	if input.Severite != nil {
		add("severite", *input.Severite)
	}
	if input.CooldownMinutes != nil {
		add("cooldownMinutes", *input.CooldownMinutes)
	}
	if input.NotifyInApp != nil {
		add("notifyInApp", *input.NotifyInApp)
	}
	if input.NotifySlack != nil {
		add("notifySlack", *input.NotifySlack)
	}
	if input.NotifyEmail != nil {
		add("notifyEmail", *input.NotifyEmail)
	}
	if input.Enabled != nil {
		add("enabled", *input.Enabled)
		// Désactiver une règle = plus de franchissement en cours (état
		// worker cohérent, pas de breachedSince fantôme à la réactivation).
		if !*input.Enabled {
			sets = append(sets, `"breachedSince" = NULL`)
		}
	}
	if len(sets) == 0 {
		writeJSONError(w, http.StatusBadRequest, "aucun champ à mettre à jour")
		return
	}
	query := fmt.Sprintf(`UPDATE "AlertingRule" SET %s, "updatedAt" = now() WHERE "id" = $1 RETURNING %s`,
		strings.Join(sets, ", "), monitoring.AlertingRuleColumns)

	rule := &monitoring.AlertingRule{}
	updated := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(r.Context(), query, args...)
		e, err := monitoring.ScanAlertingRule(row)
		if err == nil {
			rule = e
			updated = true
		}
		return nil
	})
	if !updated {
		writeJSONError(w, http.StatusNotFound, "règle non trouvée ou non autorisée")
		return
	}

	metrics := monitoring.CollectMetrics(r.Context(), s.dbPool, claims, s.workerRegistry)
	st := monitoring.Evaluate(rule, metrics)
	def, _ := monitoring.MetricDefByKey(rule.Metric)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"rule": alertingRuleResponse{
		ID: rule.ID, Code: rule.Code, Label: rule.Label, Description: rule.Description,
		Metric: rule.Metric, MetricLabel: def.Label, Unit: def.Unit,
		Comparator: rule.Comparator, Threshold: rule.Threshold, Severite: rule.Severite,
		Enabled: rule.Enabled, CooldownMinutes: rule.CooldownMinutes,
		NotifyInApp: rule.NotifyInApp, NotifySlack: rule.NotifySlack, NotifyEmail: rule.NotifyEmail,
		IsSystem: rule.IsSystem, BreachedSince: fmtTimePtr(rule.BreachedSince),
		LastNotifiedAt: fmtTimePtr(rule.LastNotifiedAt),
		CurrentValue:   st.CurrentValue, Violated: st.Violated,
		CreatedAt: rule.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt: rule.UpdatedAt.UTC().Format(time.RFC3339),
	}})
}

// monitoringRuleDelete — DELETE /api/monitoring/rules/{id}
func (s *Server) monitoringRuleDelete(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id requis")
		return
	}

	deleted := false
	systemRefused := false
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// Refuser les règles système (lisible avant le DELETE).
		var isSystem bool
		if err := tx.QueryRow(r.Context(), `SELECT "isSystem" FROM "AlertingRule" WHERE "id" = $1`, id).Scan(&isSystem); err != nil {
			return nil // non trouvé → 404
		}
		if isSystem {
			systemRefused = true
			return nil
		}
		tag, err := tx.Exec(r.Context(), `DELETE FROM "AlertingRule" WHERE "id" = $1`, id)
		if err == nil && tag.RowsAffected() > 0 {
			deleted = true
		}
		return nil
	})

	if systemRefused {
		writeJSONError(w, http.StatusForbidden, "les règles système ne sont pas supprimables (désactivables et éditables uniquement)")
		return
	}
	if !deleted {
		writeJSONError(w, http.StatusNotFound, "règle non trouvée ou non autorisée")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "règle supprimée"})
}

// endpointStat — agrégat par endpoint (ADR-0012 §3).
type endpointStat struct {
	Method    string  `json:"method"`
	Route     string  `json:"route"`
	Total     int     `json:"total"`
	Errors    int     `json:"errors"`
	ErrorRate float64 `json:"errorRate"`
	P50Ms     int     `json:"p50Ms"`
	P95Ms     int     `json:"p95Ms"`
	AvgMs     int     `json:"avgMs"`
	MaxMs     int     `json:"maxMs"`
}

// monitoringEndpointsStats — GET /api/monitoring/endpoints?window=1h|24h|7d
func (s *Server) monitoringEndpointsStats(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// Fenêtre : 1h (défaut 24h) / 24h / 7d → heures.
	windowHours := 24
	switch r.URL.Query().Get("window") {
	case "", "24h":
		windowHours = 24
	case "1h":
		windowHours = 1
	case "7d":
		windowHours = 168
	default:
		writeJSONError(w, http.StatusBadRequest, "window invalide (1h, 24h, 7d)")
		return
	}

	stats := []endpointStat{}
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(r.Context(), `
                        SELECT "method", "route",
                                count(*)::int AS total,
                                count(*) FILTER (WHERE "status" >= 500)::int AS errors,
                                COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs"), 0)::int,
                                COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs"), 0)::int,
                                COALESCE(avg("durationMs"), 0)::int,
                                COALESCE(max("durationMs"), 0)::int
                        FROM "RequestLog"
                        WHERE "createdAt" > now() - make_interval(hours => $1::int)
                        GROUP BY "method", "route"
                        ORDER BY total DESC
                        LIMIT 100
                `, windowHours)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var e endpointStat
			if err := rows.Scan(&e.Method, &e.Route, &e.Total, &e.Errors, &e.P50Ms, &e.P95Ms, &e.AvgMs, &e.MaxMs); err == nil {
				if e.Total > 0 {
					e.ErrorRate = float64(e.Errors) / float64(e.Total)
				}
				stats = append(stats, e)
			}
		}
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"window":      r.URL.Query().Get("window"),
		"windowHours": windowHours,
		"endpoints":   stats,
		"generatedAt": time.Now().UTC().Format(time.RFC3339),
	})
}
