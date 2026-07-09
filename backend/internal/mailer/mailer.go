// Package mailer fournit l'envoi d'emails transactionnels pour SECT.
//
// Deux implémentations :
//   - SMTPMailer : envoi réel via SMTP (net/smtp). Utilisé quand SMTP_HOST est configuré.
//   - LogMailer : fallback qui journalise l'email (et le lien de reset) sur stdout.
//     Utilisé en dev ou quand SMTP n'est pas configuré. Sur Render, les logs sont
//     visibles dans le dashboard → permet de tester le flot reset immédiatement,
//     sans attendre la configuration SMTP.
package mailer

import (
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
)

// Email représente un email transactionnel à envoyer.
type Email struct {
	To      string
	Subject string
	Body    string // corps texte (UTF-8)
}

// Mailer est l'interface d'envoi d'emails.
type Mailer interface {
	Send(e Email) error
}

// Config contient les paramètres SMTP nécessaires.
type Config struct {
	Host     string // SMTP_HOST (ex: smtp.gmail.com)
	Port     string // SMTP_PORT (ex: 587)
	User     string // SMTP_USER (username)
	Password string // SMTP_PASS (password ou app password)
	From     string // SMTP_FROM (adresse expéditeur)
}

// IsConfigured retourne true si les champs SMTP essentiels sont présents.
func (c Config) IsConfigured() bool {
	return c.Host != "" && c.User != "" && c.Password != "" && c.From != ""
}

// New retourne un SMTPMailer si Config est complète, sinon un LogMailer.
func New(cfg Config, logger *slog.Logger) Mailer {
	if cfg.IsConfigured() {
		logger.Info("SMTP mailer enabled", "host", cfg.Host, "port", cfg.Port, "from", cfg.From)
		return &SMTPMailer{cfg: cfg}
	}
	logger.Warn("SMTP not configured — using LogMailer (emails logged to stdout, not sent). Configure SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM on Render for real email delivery.")
	return &LogMailer{logger: logger}
}

// --- SMTPMailer ---

// SMTPMailer envoie de vrais emails via SMTP (STARTTLS par défaut sur port 587).
type SMTPMailer struct {
	cfg Config
}

// Send envoie l'email via net/smtp.
func (m *SMTPMailer) Send(e Email) error {
	addr := fmt.Sprintf("%s:%s", m.cfg.Host, m.cfg.Port)
	auth := smtp.PlainAuth("", m.cfg.User, m.cfg.Password, m.cfg.Host)

	// En-têtes MIME minimales (UTF-8 pour les accents français).
	msg := strings.Join([]string{
		fmt.Sprintf("From: %s", m.cfg.From),
		fmt.Sprintf("To: %s", e.To),
		fmt.Sprintf("Subject: %s", e.Subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
		"",
		e.Body,
	}, "\r\n")

	return smtp.SendMail(addr, auth, m.cfg.From, []string{e.To}, []byte(msg))
}

// --- LogMailer ---

// LogMailer journalise l'email au lieu de l'envoyer. Fallback quand SMTP
// n'est pas configuré. Le corps (et donc le lien de reset) est visible dans
// les logs serveur (Render dashboard / stdout).
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
