// Package mailer fournit l'envoi d'emails transactionnels pour SECT.
//
// Trois implémentations (priorité de la factory New : Resend > SMTP > Log) :
//   - ResendMailer : envoi réel via l'API REST de Resend (https://api.resend.com).
//     Recommandé — délivrabilité élevée, logs et analytics dans le dashboard Resend.
//     Utilisé quand RESEND_API_KEY est configuré.
//   - SMTPMailer : envoi réel via SMTP (net/smtp). Fallback si Resend absent.
//   - LogMailer : fallback qui journalise l'email (et le lien de reset) sur stdout.
//     Utilisé en dev ou quand ni Resend ni SMTP ne sont configurés. Sur Render,
//     les logs sont visibles dans le dashboard.
package mailer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/smtp"
	"strings"
	"time"
)

// time est utilisé par ResendMailer (Timeout) et SMTPMailer (boundary multipart).

// Email représente un email transactionnel à envoyer.
type Email struct {
	To      string
	Subject string
	Body    string // corps texte (UTF-8)
	HTML    string // corps HTML optionnel (utilisé par Resend si non vide)
}

// Mailer est l'interface d'envoi d'emails.
type Mailer interface {
	Send(e Email) error
}

// SMTPConfig contient les paramètres SMTP nécessaires.
type SMTPConfig struct {
	Host     string // SMTP_HOST (ex: smtp.gmail.com)
	Port     string // SMTP_PORT (ex: 587)
	User     string // SMTP_USER (username)
	Password string // SMTP_PASS (password ou app password)
	From     string // SMTP_FROM (adresse expéditeur)
}

// IsConfigured retourne true si les champs SMTP essentiels sont présents.
func (c SMTPConfig) IsConfigured() bool {
	return c.Host != "" && c.User != "" && c.Password != "" && c.From != ""
}

// Config contient les paramètres d'envoi d'emails.
// La factory New choisit Resend en priorité, puis SMTP, puis Log.
type Config struct {
	SMTP SMTPConfig

	// Resend (recommandé). Si ResendAPIKey est non vide, ResendMailer est utilisé.
	ResendAPIKey string // RESEND_API_KEY (re_xxx)
	ResendFrom   string // RESEND_FROM_EMAIL (ex: "SECT <noreply@domaine.com>")
}

// New retourne un ResendMailer si RESEND_API_KEY est présent, sinon un
// SMTPMailer si SMTP est complet, sinon un LogMailer.
func New(cfg Config, logger *slog.Logger) Mailer {
	if cfg.ResendAPIKey != "" {
		from := cfg.ResendFrom
		if from == "" {
			// Fallback : on tente SMTP_FROM, sinon un défaut d'onboarding Resend.
			from = cfg.SMTP.From
		}
		if from == "" {
			from = "SECT <onboarding@resend.dev>"
		}
		logger.Info("Resend mailer enabled", "from", from)
		return &ResendMailer{apiKey: cfg.ResendAPIKey, from: from, logger: logger}
	}
	if cfg.SMTP.IsConfigured() {
		logger.Info("SMTP mailer enabled", "host", cfg.SMTP.Host, "port", cfg.SMTP.Port, "from", cfg.SMTP.From)
		return &SMTPMailer{cfg: cfg.SMTP}
	}
	logger.Warn("No mailer configured (Resend/SMTP) — using LogMailer (emails logged to stdout, not sent). Configure RESEND_API_KEY/RESEND_FROM_EMAIL on Render for real email delivery.")
	return &LogMailer{logger: logger}
}

// --- ResendMailer ---

// ResendMailer envoie de vrais emails via l'API REST de Resend.
// Doc API : POST https://api.resend.com/emails avec Authorization: Bearer re_xxx
type ResendMailer struct {
	apiKey string
	from   string
	logger *slog.Logger
	client *http.Client
}

// resendRequest est le payload JSON envoyé à l'API Resend.
type resendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Text    string   `json:"text,omitempty"`
	HTML    string   `json:"html,omitempty"`
}

// resendResponse est la réponse de l'API Resend (succès).
type resendResponse struct {
	ID string `json:"id"`
}

// resendErrorResponse est la réponse d'erreur de l'API Resend.
type resendErrorResponse struct {
	Name    string `json:"name"`
	Message string `json:"message"`
}

// Send envoie l'email via l'API REST de Resend.
func (m *ResendMailer) Send(e Email) error {
	if m.client == nil {
		m.client = &http.Client{Timeout: 15 * time.Second}
	}

	html := e.HTML
	if html == "" {
		// Version HTML minimale : échappe le corps texte dans un <pre>.
		html = "<pre style=\"font-family: sans-serif; white-space: pre-wrap;\">" + escapeHTML(e.Body) + "</pre>"
	}

	payload := resendRequest{
		From:    m.from,
		To:      []string{e.To},
		Subject: e.Subject,
		Text:    e.Body,
		HTML:    html,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("resend marshal payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("resend build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+m.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("resend http call: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errResp resendErrorResponse
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		m.logger.Error("Resend API error",
			"status", resp.StatusCode,
			"to", e.To,
			"subject", e.Subject,
			"error_name", errResp.Name,
			"error_message", errResp.Message,
		)
		if errResp.Message != "" {
			return fmt.Errorf("resend API error %d: %s — %s", resp.StatusCode, errResp.Name, errResp.Message)
		}
		return fmt.Errorf("resend API error: HTTP %d", resp.StatusCode)
	}

	var ok resendResponse
	if err := json.NewDecoder(resp.Body).Decode(&ok); err != nil {
		// L'email est envoyé (2xx) mais la réponse est illisible — on ne bloque pas.
		m.logger.Info("Resend email sent (response unparseable)", "to", e.To, "subject", e.Subject)
		return nil
	}
	m.logger.Info("Resend email sent", "to", e.To, "subject", e.Subject, "message_id", ok.ID)
	return nil
}

// escapeHTML échappe les caractères HTML pour une inclusion sûre dans le corps.
func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

// --- SMTPMailer ---

// SMTPMailer envoie de vrais emails via SMTP (STARTTLS par défaut sur port 587).
type SMTPMailer struct {
	cfg SMTPConfig
}

// Send envoie l'email via net/smtp. Si e.HTML est non vide, envoie un
// multipart/alternative (text + HTML) pour la compatibilité clients email.
func (m *SMTPMailer) Send(e Email) error {
	addr := fmt.Sprintf("%s:%s", m.cfg.Host, m.cfg.Port)
	auth := smtp.PlainAuth("", m.cfg.User, m.cfg.Password, m.cfg.Host)

	var msg string
	if e.HTML != "" {
		// multipart/alternative : le client choisit text ou HTML selon ses capacités.
		boundary := "sect-" + fmt.Sprintf("%d", time.Now().UnixNano())
		msg = strings.Join([]string{
			fmt.Sprintf("From: %s", m.cfg.From),
			fmt.Sprintf("To: %s", e.To),
			fmt.Sprintf("Subject: %s", e.Subject),
			"MIME-Version: 1.0",
			fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"", boundary),
			"",
			"--" + boundary,
			"Content-Type: text/plain; charset=UTF-8",
			"Content-Transfer-Encoding: 8bit",
			"",
			e.Body,
			"",
			"--" + boundary,
			"Content-Type: text/html; charset=UTF-8",
			"Content-Transfer-Encoding: 8bit",
			"",
			e.HTML,
			"",
			"--" + boundary + "--",
		}, "\r\n")
	} else {
		// Texte seul (fallback simple).
		msg = strings.Join([]string{
			fmt.Sprintf("From: %s", m.cfg.From),
			fmt.Sprintf("To: %s", e.To),
			fmt.Sprintf("Subject: %s", e.Subject),
			"MIME-Version: 1.0",
			"Content-Type: text/plain; charset=UTF-8",
			"Content-Transfer-Encoding: 8bit",
			"",
			e.Body,
		}, "\r\n")
	}

	return smtp.SendMail(addr, auth, m.cfg.From, []string{e.To}, []byte(msg))
}

// --- LogMailer ---

// LogMailer journalise l'email au lieu de l'envoyer. Fallback quand ni Resend
// ni SMTP ne sont configurés. Le corps (et donc le lien de reset) est visible
// dans les logs serveur (Render dashboard / stdout).
type LogMailer struct {
	logger *slog.Logger
}

// Send journalise l'email en INFO.
func (m *LogMailer) Send(e Email) error {
	m.logger.Info("email (LogMailer — not actually sent)",
		"to", e.To,
		"subject", e.Subject,
		"body", e.Body,
	)
	return nil
}
