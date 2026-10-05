package worker

// alerting_worker.go — Worker périodique d'alerting (ADR-0012 §4, P5
// d'ADR-0011 : « alerting externe »).
//
// Toutes les 2 minutes :
//  1. charge les règles persistées (AlertingRule, enabled) ;
//  2. mesure TOUTES les métriques du catalogue (monitoring.CollectMetrics
//     — mêmes sources que /overview, le score réutilise ComputeScore) ;
//  3. pour chaque règle violée :
//     - franchissement NOUVEAU (breachedSince NULL) → date de début +
//       événement in-app (MonitoringEvent, sévérité de la règle — un
//       CRITICAL déclenche en cascade le hook ADR-0011 §6 vers les
//       ADMIN actifs). L'événement n'est créé QUE sur la transition →
//       pas d'auto-amplification du compteur errors_actifs ;
//     - cooldown écoulé (lastNotifiedAt) → canaux activés sur la règle :
//       Discord (DISCORD_WEBHOOK_URL — canal principal SECT-MONITORING-
//       DISCORD-1), Slack (SLACK_WEBHOOK_URL) et email dédié
//       (ALERTING_EMAIL_TO via le mailer Resend > SMTP > Log) →
//       lastNotifiedAt = now(). Les emails d'alerte sont désactivés par
//       défaut (migration 000134, notifyEmail=false) pour préserver le
//       quota Resend pour les transactionnels (reset password,
//       invitations, factures) — réactivables par règle si besoin.
//  4. récupération (breachedSince NON NULL + valeur saine) → message
//     « ✅ récupérée » sur les canaux externes qui avaient été notifiés,
//     breachedSince = NULL (pas d'événement in-app — pas de bruit).
//
// Dégradation honnête (ADR-0012) : un canal non configuré est journalisé
// et exposé via GET /api/monitoring/rules (channels) — jamais de silence
// feint. Worker instrumenté TrackContext (panic-safe, registre Système).

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/mailer"
	"github.com/udevrard7/sect/backend/internal/monitoring"
)

// alertingCheckInterval — cadence d'évaluation des règles.
const alertingCheckInterval = 2 * time.Minute

// AlertingWorker — évalue les règles persistées et dispatch les alertes.
type AlertingWorker struct {
	dbPool   *pgxpool.Pool
	logger   *slog.Logger
	recorder *monitoring.Recorder
	mailer   mailer.Mailer
	cfg      monitoring.AlertingConfig
	reg      *monitoring.WorkerRegistry
	client   *http.Client
}

// NewAlertingWorker crée le worker. recorder/mailer peuvent être nil
// (canaux in-app/email désactivés), cfg porte la config des canaux.
func NewAlertingWorker(dbPool *pgxpool.Pool, logger *slog.Logger, recorder *monitoring.Recorder, mail mailer.Mailer, cfg monitoring.AlertingConfig) *AlertingWorker {
	return &AlertingWorker{
		dbPool:   dbPool,
		logger:   logger,
		recorder: recorder,
		mailer:   mail,
		cfg:      cfg,
		client:   &http.Client{Timeout: 5 * time.Second},
	}
}

// WithRegistry injecte le registre (visibilité onglet Système).
func (w *AlertingWorker) WithRegistry(reg *monitoring.WorkerRegistry) *AlertingWorker {
	w.reg = reg
	return w
}

// Start lance le worker (première évaluation au boot — rattrapage).
func (w *AlertingWorker) Start(ctx context.Context) {
	w.reg.Register("alerting", "Règles d'alerte + canaux externes", "periodique", "2 min")
	w.logger.Info("AlertingWorker started", "interval", alertingCheckInterval,
		"discordConfigured", w.cfg.DiscordWebhookURL != "",
		"slackConfigured", w.cfg.SlackWebhookURL != "",
		"emailTo", w.cfg.AlertingEmailTo, "emailReady", w.cfg.EmailReady)

	go func() {
		w.reg.TrackContext(ctx, "alerting", w.check)

		ticker := time.NewTicker(alertingCheckInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				w.logger.Info("AlertingWorker stopping...")
				return
			case <-ticker.C:
				w.reg.TrackContext(ctx, "alerting", w.check)
			}
		}
	}()
}

// check — une évaluation complète (règles × métriques → dispatch).
func (w *AlertingWorker) check(ctx context.Context) {
	rules, err := monitoring.ListAlertingRules(ctx, w.dbPool, appdb.SystemClaims())
	if err != nil {
		w.logger.Error("AlertingWorker: chargement règles échoué", "error", err.Error())
		return
	}

	metrics := monitoring.CollectMetrics(ctx, w.dbPool, appdb.SystemClaims(), w.reg)

	for i := range rules {
		rule := rules[i]
		if !rule.Enabled {
			continue
		}
		st := monitoring.Evaluate(&rule, metrics)

		if st.Violated {
			w.handleBreach(ctx, rule, st, metrics)
		} else if rule.BreachedSince != nil {
			w.handleRecovery(ctx, rule, st)
		}
	}
}

// handleBreach — franchissement : transition (in-app) + cooldown (externe).
func (w *AlertingWorker) handleBreach(ctx context.Context, rule monitoring.AlertingRule, st monitoring.RuleStatus, metrics monitoring.MetricsSnapshot) {
	def, _ := monitoring.MetricDefByKey(rule.Metric)
	now := time.Now().UTC()

	// 1. Transition NULL → breachedSince : début de franchissement +
	//    événement in-app (unique — pas d'auto-amplification).
	isNewBreach := rule.BreachedSince == nil
	if isNewBreach {
		if err := w.setBreachedSince(ctx, rule.ID, &now); err != nil {
			w.logger.Error("AlertingWorker: update breachedSince échoué", "rule", rule.Code, "error", err.Error())
		}
		if rule.NotifyInApp && w.recorder != nil {
			details, _ := json.Marshal(map[string]any{
				"ruleCode": rule.Code, "metric": rule.Metric,
				"value": st.CurrentValue, "threshold": rule.Threshold,
				"comparator": rule.Comparator, "severite": rule.Severite,
			})
			w.recorder.Record(monitoring.Event{
				Type:     "SYSTEM",
				Severite: rule.Severite,
				Message: fmt.Sprintf("Règle « %s » franchie : %s %s %s",
					rule.Label, formatRuleValue(def, st.CurrentValue),
					comparatorSymbol(rule.Comparator), formatThreshold(rule.Threshold)),
				Source:  "alerting:" + rule.Code,
				Details: string(details),
			})
		}
	}

	// 2. Cooldown : notification externe au plus une fois par fenêtre.
	cooldownElapsed := rule.LastNotifiedAt == nil ||
		time.Since(*rule.LastNotifiedAt) >= time.Duration(rule.CooldownMinutes)*time.Minute
	if !cooldownElapsed {
		return
	}

	alertLine := fmt.Sprintf("Règle « %s » franchie : %s %s %s",
		rule.Label, formatRuleValue(def, st.CurrentValue),
		comparatorSymbol(rule.Comparator), formatThreshold(rule.Threshold))
	body := fmt.Sprintf("%s\nValeur mesurée : %s — score santé plateforme : %d/100.\n→ %s/monitoring",
		alertLine, formatRuleValue(def, st.CurrentValue), metrics.ScoreSante, strings.TrimSuffix(w.cfg.AppBaseURL, "/"))

	if rule.NotifyDiscord {
		w.sendDiscord("🚨 [SECT Monitoring] Alerte : "+rule.Label, body, severityColor(rule.Severite))
	}
	if rule.NotifySlack {
		w.sendSlack("🚨 [SECT Monitoring] " + body)
	}
	if rule.NotifyEmail {
		w.sendEmail("[SECT Monitoring] Alerte : "+rule.Label, body)
	}

	if err := w.setLastNotifiedAt(ctx, rule.ID, now); err != nil {
		w.logger.Error("AlertingWorker: update lastNotifiedAt échoué", "rule", rule.Code, "error", err.Error())
	}
	w.logger.Warn("AlertingWorker: règle franchie",
		"rule", rule.Code, "value", st.CurrentValue, "threshold", rule.Threshold,
		"newBreach", isNewBreach, "notifiedDiscord", rule.NotifyDiscord,
		"notifiedSlack", rule.NotifySlack, "notifiedEmail", rule.NotifyEmail)
}

// handleRecovery — retour à la normale : message externe (si notifiée
// pendant l'incident), pas d'événement in-app (anti-bruit).
func (w *AlertingWorker) handleRecovery(ctx context.Context, rule monitoring.AlertingRule, st monitoring.RuleStatus) {
	def, _ := monitoring.MetricDefByKey(rule.Metric)

	if rule.LastNotifiedAt != nil {
		body := fmt.Sprintf("Règle « %s » revenue à la normale : %s (seuil %s %s).",
			rule.Label, formatRuleValue(def, st.CurrentValue),
			comparatorSymbol(rule.Comparator), formatThreshold(rule.Threshold))
		if rule.NotifyDiscord {
			w.sendDiscord("✅ [SECT Monitoring] Résolu : "+rule.Label, body, colorDiscordGreen)
		}
		if rule.NotifySlack {
			w.sendSlack("✅ [SECT Monitoring] " + body)
		}
		if rule.NotifyEmail {
			w.sendEmail("[SECT Monitoring] Résolu : "+rule.Label, body)
		}
	}

	if err := w.setBreachedSince(ctx, rule.ID, nil); err != nil {
		w.logger.Error("AlertingWorker: clear breachedSince échoué", "rule", rule.Code, "error", err.Error())
	}
	w.logger.Info("AlertingWorker: règle revenue à la normale", "rule", rule.Code)
}

// ─── Mises à jour d'état (claims system — tracking uniquement) ───

func (w *AlertingWorker) setBreachedSince(ctx context.Context, ruleID string, t *time.Time) error {
	return appdb.WithSystemTx(ctx, w.dbPool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `UPDATE "AlertingRule" SET "breachedSince" = $2 WHERE "id" = $1`, ruleID, t)
		return err
	})
}

func (w *AlertingWorker) setLastNotifiedAt(ctx context.Context, ruleID string, t time.Time) error {
	return appdb.WithSystemTx(ctx, w.dbPool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `UPDATE "AlertingRule" SET "lastNotifiedAt" = $2 WHERE "id" = $1`, ruleID, t)
		return err
	})
}

// ─── Canaux externes (best-effort, dégradation honnête) ───

func (w *AlertingWorker) sendSlack(text string) {
	if w.cfg.SlackWebhookURL == "" {
		w.logger.Warn("AlertingWorker: Slack non configuré (SLACK_WEBHOOK_URL) — message journalisé seulement", "text", text)
		return
	}
	payload, _ := json.Marshal(map[string]string{"text": text})
	resp, err := w.client.Post(w.cfg.SlackWebhookURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		w.logger.Error("AlertingWorker: envoi Slack échoué", "error", err.Error())
		return
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		w.logger.Error("AlertingWorker: Slack a répondu", "status", resp.StatusCode)
	}
}

// sendDiscord — webhook Discord (SECT-MONITORING-DISCORD-1). Canal
// PRINCIPAL de l'alerting externe : embed coloré selon la sévérité,
// timestamp ISO, footer SECT. Best-effort + dégradation honnête (un
// canal non configuré est journalisé, jamais silencieux).
func (w *AlertingWorker) sendDiscord(title, description string, color int) {
	if w.cfg.DiscordWebhookURL == "" {
		w.logger.Warn("AlertingWorker: Discord non configuré (DISCORD_WEBHOOK_URL) — message journalisé seulement", "title", title)
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"embeds": []map[string]any{{
			"title":       title,
			"description": description,
			"color":       color,
			"footer":      map[string]string{"text": "SECT Monitoring"},
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		}},
	})
	resp, err := w.client.Post(w.cfg.DiscordWebhookURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		w.logger.Error("AlertingWorker: envoi Discord échoué", "error", err.Error())
		return
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		w.logger.Error("AlertingWorker: Discord a répondu", "status", resp.StatusCode)
	}
}

// Couleurs d'embed Discord (décimal) selon la sévérité.
const (
	colorDiscordRed    = 0xED4245 // CRITICAL
	colorDiscordOrange = 0xE67E22 // ERROR
	colorDiscordYellow = 0xF1C40F // WARNING
	colorDiscordGrey   = 0x95A5A6 // INFO
	colorDiscordGreen  = 0x57F287 // récupération
)

// severityColor — couleur d'embed selon la sévérité de la règle.
func severityColor(severite string) int {
	switch severite {
	case "CRITICAL":
		return colorDiscordRed
	case "ERROR":
		return colorDiscordOrange
	case "WARNING":
		return colorDiscordYellow
	}
	return colorDiscordGrey
}

func (w *AlertingWorker) sendEmail(subject, body string) {
	if w.cfg.AlertingEmailTo == "" {
		w.logger.Warn("AlertingWorker: email dédié non configuré (ALERTING_EMAIL_TO) — message journalisé seulement", "subject", subject)
		return
	}
	if w.mailer == nil {
		return
	}
	if err := w.mailer.Send(mailer.Email{
		To:      w.cfg.AlertingEmailTo,
		Subject: subject,
		Body:    body,
	}); err != nil {
		w.logger.Error("AlertingWorker: envoi email échoué", "error", err.Error(), "to", w.cfg.AlertingEmailTo)
	}
}

// ─── Helpers de formatage ───

// comparatorSymbol — symbole lisible du comparateur.
func comparatorSymbol(c string) string {
	switch c {
	case "SUP":
		return ">"
	case "SUP_EGAL":
		return "≥"
	case "INF":
		return "<"
	case "INF_EGAL":
		return "≤"
	}
	return "?"
}

// formatRuleValue — valeur + unité de la métrique (« 1000 ms »).
func formatRuleValue(def monitoring.MetricDef, value float64) string {
	s := formatThreshold(value)
	if def.Unit != "" && !strings.HasPrefix(def.Unit, "/") {
		return s + def.Unit
	}
	return s
}

// formatThreshold — float sans zéros traînants (70, 0.5, 3000).
func formatThreshold(f float64) string {
	return fmt.Sprintf("%g", f)
}
