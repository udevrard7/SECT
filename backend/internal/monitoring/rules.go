// Package monitoring — règles d'alerte configurables (ADR-0012, P5
// d'ADR-0011).
//
// SECT-MONITORING-P5-1 : les 6 seuils de l'onglet Alertes étaient
// dérivés côté client, en lecture seule, perdus au rechargement.
// Désormais les règles vivent en base (table AlertingRule, migration
// 000133), sont évaluées par le BACKEND contre un catalogue de
// métriques mesurées (CollectMetrics — mêmes requêtes que /overview,
// score réutilise ComputeScore), et sont consommées par :
//   - GET /api/monitoring/rules (statut live : currentValue, violated) ;
//   - l'AlertingWorker (dispatch in-app/Slack/email + cooldown).
package monitoring

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appdb "github.com/udevrard7/sect/backend/internal/db"
)

// AlertingConfig — configuration des canaux externes (ADR-0012 §4).
// Portée par main.go (env SLACK_WEBHOOK_URL / ALERTING_EMAIL_TO /
// DISCORD_WEBHOOK_URL + mailer réel configuré) et exposée par GET
// /api/monitoring/rules (channels) pour que l'UI indique quoi
// configurer — jamais de silence feint.
// SECT-MONITORING-DISCORD-1 : Discord est le canal principal de
// l'alerting ; l'email dédié est optionnel (quota transactionnel).
type AlertingConfig struct {
	SlackWebhookURL   string
	AlertingEmailTo   string
	EmailReady        bool   // un mailer réel (Resend/SMTP) est configuré
	AppBaseURL        string // pour le lien /monitoring dans les messages
	DiscordWebhookURL string // SECT-MONITORING-DISCORD-1
}

// ─── Catalogue des métriques évaluables (ADR-0012 §2) ───

// MetricDef — une métrique du catalogue (clé stable, libellé, unité).
type MetricDef struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Unit        string `json:"unit"`
	Description string `json:"description"`
}

// MetricCatalog — les métriques évaluables. Une règle ne peut référencer
// QUE ces clés (400 sinon) — pas de règle orpheline.
var MetricCatalog = []MetricDef{
	{"score_sante", "Score santé plateforme", "/100", "Score 0-100 (formule ADR-0011, même valeur que la carte dashboard)"},
	{"critical_actifs", "Événements critiques actifs", "", "MonitoringEvent ACTIF sévérité CRITICAL"},
	{"errors_actifs", "Erreurs actives", "", "MonitoringEvent ACTIF sévérité ERROR"},
	{"warnings_actifs", "Avertissements actifs", "", "MonitoringEvent ACTIF sévérité WARNING"},
	{"backlog_autorisations", "Backlog autorisations", "", "EtablissementAccess EN_ATTENTE"},
	{"db_latency_ms", "Latence base de données", " ms", "Ping DB mesuré à l'évaluation"},
	{"db_down", "Base de données indisponible", "0/1", "1 = ping DB en échec"},
	{"providers_ia_actifs", "Fournisseurs IA actifs", "", "AIProviderConfig isActive"},
	{"workers_en_erreur", "Workers en erreur", "", "Workers dont la dernière exécution a échoué"},
	{"p95_api_ms", "Latence p95 API (1 h)", " ms", "Percentile 95 des requêtes API (RequestLog, fenêtre 1 h)"},
	{"erreurs_5xx_24h", "Erreurs 5xx (24 h)", "", "Réponses API ≥ 500 sur les dernières 24 h (RequestLog)"},
}

// metricDefs — index du catalogue par clé.
var metricDefs = func() map[string]MetricDef {
	m := make(map[string]MetricDef, len(MetricCatalog))
	for _, d := range MetricCatalog {
		m[d.Key] = d
	}
	return m
}()

// MetricDefByKey retourne la définition (ok=false si inconnue).
func MetricDefByKey(key string) (MetricDef, bool) {
	d, ok := metricDefs[key]
	return d, ok
}

// ComparatorDef — un comparateur de seuil.
type ComparatorDef struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

// Comparators — les 4 comparateurs supportés.
var Comparators = []ComparatorDef{
	{"SUP", "> seuil"},
	{"SUP_EGAL", "≥ seuil"},
	{"INF", "< seuil"},
	{"INF_EGAL", "≤ seuil"},
}

// ComparatorValid — true si le comparateur est connu.
func ComparatorValid(c string) bool {
	switch c {
	case "SUP", "SUP_EGAL", "INF", "INF_EGAL":
		return true
	}
	return false
}

// Compare applique le comparateur (value comparator threshold).
func Compare(value float64, comparator string, threshold float64) bool {
	switch comparator {
	case "SUP":
		return value > threshold
	case "SUP_EGAL":
		return value >= threshold
	case "INF":
		return value < threshold
	case "INF_EGAL":
		return value <= threshold
	}
	return false
}

// ─── Métriques mesurées (une seule source backend) ───

// MetricsSnapshot — toutes les métriques du catalogue, mesurées.
type MetricsSnapshot struct {
	ScoreSante           int
	CriticalActifs       int
	ErrorActifs          int
	WarningActifs        int
	BacklogAutorisations int
	DBDown               bool
	DBLatencyMs          int64
	ProvidersIAActifs    int
	WorkersEnErreur      int
	P95ApiMs             int
	Erreurs5xx24h        int
}

// Value retourne la valeur numérique d'une métrique du catalogue
// (ok=false si clé inconnue). db_down est exposé 0/1 pour SUP_EGAL 1.
func (m MetricsSnapshot) Value(metric string) (float64, bool) {
	switch metric {
	case "score_sante":
		return float64(m.ScoreSante), true
	case "critical_actifs":
		return float64(m.CriticalActifs), true
	case "errors_actifs":
		return float64(m.ErrorActifs), true
	case "warnings_actifs":
		return float64(m.WarningActifs), true
	case "backlog_autorisations":
		return float64(m.BacklogAutorisations), true
	case "db_latency_ms":
		return float64(m.DBLatencyMs), true
	case "db_down":
		if m.DBDown {
			return 1, true
		}
		return 0, true
	case "providers_ia_actifs":
		return float64(m.ProvidersIAActifs), true
	case "workers_en_erreur":
		return float64(m.WorkersEnErreur), true
	case "p95_api_ms":
		return float64(m.P95ApiMs), true
	case "erreurs_5xx_24h":
		return float64(m.Erreurs5xx24h), true
	}
	return 0, false
}

// CollectMetrics mesure TOUTES les métriques du catalogue côté backend.
// claims : claims de l'appelant (ADMIN via handler, ou SystemClaims pour
// le worker — les policies AlertingRule/RequestLog/MonitoringEvent
// acceptent les deux). reg : registre de workers (métrique
// workers_en_erreur ; nil-safe). Best-effort : une requête qui échoue
// laisse la métrique à sa valeur zéro (jamais de blocage).
func CollectMetrics(ctx context.Context, pool *pgxpool.Pool, claims appdb.SessionClaims, reg *WorkerRegistry) MetricsSnapshot {
	var m MetricsSnapshot

	if pool == nil {
		return m
	}

	_ = appdb.WithTx(ctx, pool, claims, func(tx pgx.Tx) error {
		_ = tx.QueryRow(ctx, `
                        SELECT
                                count(*) FILTER (WHERE "statut" = 'ACTIF' AND "severite" = 'CRITICAL'),
                                count(*) FILTER (WHERE "statut" = 'ACTIF' AND "severite" = 'ERROR'),
                                count(*) FILTER (WHERE "statut" = 'ACTIF' AND "severite" = 'WARNING')
                        FROM "MonitoringEvent"
                `).Scan(&m.CriticalActifs, &m.ErrorActifs, &m.WarningActifs)

		_ = tx.QueryRow(ctx, `
                        SELECT count(*) FROM "EtablissementAccess" WHERE "statut" = 'EN_ATTENTE'
                `).Scan(&m.BacklogAutorisations)

		_ = tx.QueryRow(ctx, `
                        SELECT count(*) FROM "AIProviderConfig" WHERE "isActive" = true
                `).Scan(&m.ProvidersIAActifs)

		// p95 API (fenêtre 1 h) — RequestLog (ADR-0012 §3).
		_ = tx.QueryRow(ctx, `
                        SELECT COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs"), 0)::int
                        FROM "RequestLog"
                        WHERE "createdAt" > now() - INTERVAL '1 hour'
                `).Scan(&m.P95ApiMs)

		// Erreurs 5xx sur 24 h — RequestLog.
		_ = tx.QueryRow(ctx, `
                        SELECT count(*) FROM "RequestLog"
                        WHERE "status" >= 500 AND "createdAt" > now() - INTERVAL '24 hours'
                `).Scan(&m.Erreurs5xx24h)
		return nil
	})

	// DB : ping réel (hors tx — mesure le pool, pas une transaction).
	pingStart := time.Now()
	if err := pool.Ping(ctx); err != nil {
		m.DBDown = true
	} else {
		m.DBLatencyMs = time.Since(pingStart).Milliseconds()
	}

	// Workers en erreur (registre in-memory, nil-safe).
	for _, w := range reg.Snapshot() {
		if w.LastError != "" {
			m.WorkersEnErreur++
		}
	}

	// Score santé — MÊME formule que /overview (ADR-0011 §1). NB :
	// EtablissementsProteges est informatif (pénalité nulle) → le score
	// d'une règle score_sante ne peut pas diverger de la carte dashboard.
	score := ComputeScore(ScoreInputs{
		CriticalActifs:         m.CriticalActifs,
		ErrorActifs:            m.ErrorActifs,
		WarningActifs:          m.WarningActifs,
		AutorisationsEnAttente: m.BacklogAutorisations,
		DBIndisponible:         m.DBDown,
		DBLatencyMs:            m.DBLatencyMs,
		ProvidersIAActifs:      m.ProvidersIAActifs,
	})
	m.ScoreSante = score.Score

	return m
}

// ─── Règles persistées (table AlertingRule, migration 000133) ───

// AlertingRule — une règle d'alerte persistée.
type AlertingRule struct {
	ID              string     `json:"id"`
	Code            string     `json:"code"`
	Label           string     `json:"label"`
	Description     *string    `json:"description"`
	Metric          string     `json:"metric"`
	Comparator      string     `json:"comparator"`
	Threshold       float64    `json:"threshold"`
	Severite        string     `json:"severite"`
	Enabled         bool       `json:"enabled"`
	CooldownMinutes int        `json:"cooldownMinutes"`
	NotifyInApp     bool       `json:"notifyInApp"`
	NotifyDiscord   bool       `json:"notifyDiscord"` // SECT-MONITORING-DISCORD-1 — canal principal
	NotifySlack     bool       `json:"notifySlack"`
	NotifyEmail     bool       `json:"notifyEmail"`
	IsSystem        bool       `json:"isSystem"`
	BreachedSince   *time.Time `json:"breachedSince"`
	LastNotifiedAt  *time.Time `json:"lastNotifiedAt"`
	CreatedByID     *string    `json:"createdById"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

// AlertingRuleColumns — SELECT/RETURNING partagé (handler + worker).
const AlertingRuleColumns = `"id", "code", "label", "description", "metric", "comparator",
        "threshold", "severite", "enabled", "cooldownMinutes", "notifyInApp", "notifyDiscord",
        "notifySlack", "notifyEmail", "isSystem", "breachedSince", "lastNotifiedAt", "createdById",
        "createdAt", "updatedAt"`

// ScanAlertingRule scanne une ligne selon AlertingRuleColumns.
func ScanAlertingRule(row interface {
	Scan(dest ...any) error
}) (*AlertingRule, error) {
	r := &AlertingRule{}
	if err := row.Scan(&r.ID, &r.Code, &r.Label, &r.Description, &r.Metric, &r.Comparator,
		&r.Threshold, &r.Severite, &r.Enabled, &r.CooldownMinutes, &r.NotifyInApp, &r.NotifyDiscord,
		&r.NotifySlack, &r.NotifyEmail, &r.IsSystem, &r.BreachedSince, &r.LastNotifiedAt, &r.CreatedByID,
		&r.CreatedAt, &r.UpdatedAt); err != nil {
		return nil, err
	}
	return r, nil
}

// ListAlertingRules — toutes les règles (claims ADMIN via handler, ou
// SystemClaims via worker — la policy select accepte les deux).
func ListAlertingRules(ctx context.Context, pool *pgxpool.Pool, claims appdb.SessionClaims) ([]AlertingRule, error) {
	rules := []AlertingRule{}
	err := appdb.WithTx(ctx, pool, claims, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
                        SELECT `+AlertingRuleColumns+`
                        FROM "AlertingRule"
                        ORDER BY "isSystem" DESC, "code" ASC
                `)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			r, err := ScanAlertingRule(rows)
			if err != nil {
				return err
			}
			rules = append(rules, *r)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return rules, nil
}

// EvaluateRule — statut live d'une règle contre un snapshot.
type RuleStatus struct {
	Rule         *AlertingRule
	CurrentValue float64
	Violated     bool
}

// Evaluate retourne le statut live (valeur mesurée + franchissement).
// Une métrique inconnue (ne peut plus arriver : validée à la création)
// rend Violated=false avec CurrentValue 0.
func Evaluate(rule *AlertingRule, m MetricsSnapshot) RuleStatus {
	v, ok := m.Value(rule.Metric)
	if !ok {
		return RuleStatus{Rule: rule, CurrentValue: 0, Violated: false}
	}
	return RuleStatus{Rule: rule, CurrentValue: v, Violated: Compare(v, rule.Comparator, rule.Threshold)}
}
