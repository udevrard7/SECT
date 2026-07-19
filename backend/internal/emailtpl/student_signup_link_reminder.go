package emailtpl

import (
	"fmt"
	"html"
	"strings"
	"time"
)

// student_signup_link_reminder.go — SECT-REG-LINK-PHASE3-BACKEND-1
//
// Email de rappel envoyé au créateur d'un StudentSignupLink 24h avant expiration.
// Rappel : un StudentSignupLink a une TTL de 30 jours (cf. SECT-REG-LINK-B2C-MVP-1),
// partagé manuellement (WhatsApp, QR code, etc.). L'étudiant saisit son email au
// moment de l'inscription — il n'y a pas d'email automatique à la création du lien.
//
// Ce reminder aide le créateur à :
//   - partager le lien une dernière fois avant qu'il n'expire,
//   - savoir combien d'étudiants se sont inscrits (UseCount vs MaxUses),
//   - créer un nouveau lien si nécessaire (via le dashboard /etudiants).
//
// Le reminder est envoyé UNE SEULE FOIS par lien (flag expiryReminderSent=true
// côté DB, vérifié par le worker). Évite le spam si le worker tourne plusieurs
// fois dans la fenêtre 24h.
//
// Le worker appelle ce template via ExpireWorker.sendSignupLinkReminderEmail.

// StudentSignupLinkReminderData contient les données du reminder 24h.
type StudentSignupLinkReminderData struct {
	EmailData
	// Label : libellé du lien ("Sans libellé" si NULL côté DB).
	Label string
	// ExpiresAt : date d'expiration (formatée dans le template).
	ExpiresAt time.Time
	// UseCount : nombre d'étudiants inscrits via ce lien.
	UseCount int
	// MaxUses : limite max d'inscriptions (nil = illimité).
	MaxUses *int
	// EtabNom : nom de l'établissement du lien (pour contexte).
	EtabNom string
	// EtabType : type de l'établissement ("PERSONNEL" B2C ou type B2B).
	EtabType string
	// LinkURL : URL du dashboard /etudiants (PAS le lien d'inscription —
	// ce dernier est un secret, on ne l'inclut pas dans l'email pour éviter
	// les fuites si l'email est transféré).
	LinkURL string
}

// StudentSignupLinkReminderHTML génère le HTML de l'email de reminder 24h.
//
// Structure :
//   - Header DS unifié (logo + bande kente) via baseTemplate
//   - Titre "Votre lien d'inscription expire bientôt" ⏰
//   - Phrase d'intro avec libellé + date d'expiration
//   - InfoBox "Statistiques" : UseCount sur MaxUses
//   - Note "Une fois expiré, les étudiants ne pourront plus s'inscrire"
//   - Bouton "Gérer mes liens" (vert lime)
//   - Footer DS unifié
func StudentSignupLinkReminderHTML(d StudentSignupLinkReminderData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	// Texte statistiques : "X inscription(s) effectuée(s)" (+ " sur Y" si maxUses).
	usesText := fmt.Sprintf("%d inscription(s) effectuée(s)", d.UseCount)
	if d.MaxUses != nil {
		usesText += fmt.Sprintf(" sur %d", *d.MaxUses)
	}

	// Contexte établissement (optionnel — utile pour B2B).
	etabContext := ""
	if d.EtabNom != "" {
		etabContext = fmt.Sprintf(`<br>Établissement : <strong>%s</strong>`,
			html.EscapeString(d.EtabNom))
	}

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">⏰ Votre lien d'inscription expire bientôt</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
  <br><br>
  Votre lien d'inscription étudiante <strong style="color:` + ColorNavy + `;">« ` + html.EscapeString(d.Label) + ` »</strong> expire le
  <strong>` + d.ExpiresAt.Format("02/01/2006 à 15:04") + `</strong> (dans moins de 24h).
  ` + etabContext + `
</p>

` + infoBoxHTML(fmt.Sprintf(
		`<strong style="color:%s;display:block;margin-bottom:4px;">Statistiques</strong>%s`,
		ColorNavy, html.EscapeString(usesText))) + `

<p style="margin:16px 0;font-size:14px;line-height:1.6;color:#4B5563;">
  Une fois expiré, les étudiants ne pourront plus s'inscrire via ce lien. Les comptes déjà créés restent actifs.
</p>

` + buttonHTML("Gérer mes liens", d.LinkURL) + `

<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:` + ColorTextMuted + `;">
  Si vous avez déjà partagé ce lien à vos étudiants, pensez à les relancer ou à en créer un nouveau avant expiration.
</p>`

	return baseTemplate(d.EmailData, "SECT — Lien d'inscription expire bientôt",
		"Votre lien d'inscription expire dans moins de 24h.", body)
}

// StudentSignupLinkReminderText génère la version texte brut du reminder 24h.
func StudentSignupLinkReminderText(d StudentSignupLinkReminderData) string {
	var b strings.Builder
	b.WriteString("SECT — Lien d'inscription expire bientôt\n\n")
	if d.RecipientName != "" {
		fmt.Fprintf(&b, "Bonjour %s,\n\n", d.RecipientName)
	} else {
		b.WriteString("Bonjour,\n\n")
	}
	fmt.Fprintf(&b, "Votre lien d'inscription étudiante « %s » expire le %s (dans moins de 24h).\n",
		d.Label, d.ExpiresAt.Format("02/01/2006 à 15:04"))
	if d.EtabNom != "" {
		fmt.Fprintf(&b, "Établissement : %s\n", d.EtabNom)
	}
	b.WriteString("\nStatistiques :\n")
	fmt.Fprintf(&b, "  Inscriptions effectuées : %d", d.UseCount)
	if d.MaxUses != nil {
		fmt.Fprintf(&b, " sur %d", *d.MaxUses)
	}
	b.WriteString("\n\nUne fois expiré, les étudiants ne pourront plus s'inscrire via ce lien. Les comptes déjà créés restent actifs.\n\n")
	fmt.Fprintf(&b, "Gérez vos liens : %s\n\n", d.LinkURL)
	b.WriteString("Si vous avez déjà partagé ce lien à vos étudiants, pensez à les relancer ou à en créer un nouveau avant expiration.\n\n")
	b.WriteString("— L'équipe SECT (Système d'Évaluation Casse-Tête)")
	return b.String()
}
