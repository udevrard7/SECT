package emailtpl

import (
	"fmt"
	"strings"
)

// PasswordResetData contient les données spécifiques au template reset password.
type PasswordResetData struct {
	EmailData
	// ResetLink : URL complète du lien de reset (avec ?token=...).
	ResetLink string
	// TTLMinutes : durée de validité du lien en minutes (30 par défaut).
	TTLMinutes int
}

// PasswordResetHTML génère le HTML complet de l'email "mot de passe oublié".
//
// Structure :
//   - Header DS (logo + bande kente)
//   - Titre "Réinitialisation de votre mot de passe"
//   - Salutation personnalisée
//   - Corps explicatif
//   - Bouton CTA "Réinitialiser mon mot de passe"
//   - Boîte info (TTL + sécurité)
//   - Lien de secours (texte brut)
//   - Footer DS
func PasswordResetHTML(d PasswordResetData) string {
	if d.TTLMinutes <= 0 {
		d.TTLMinutes = 30
	}
	if d.RecipientName == "" {
		d.RecipientName = ""
	}
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">Réinitialisation de votre mot de passe</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  Vous avez demandé la réinitialisation de votre mot de passe sur <strong style="color:` + ColorNavy + `;">` + d.AppName + `</strong>.
  Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.
</p>
` + buttonHTML("Réinitialiser mon mot de passe", d.ResetLink) + `
` + infoBoxHTML(fmt.Sprintf(
		`<strong style="color:`+ColorTerracotta+`;">⏱ Valable %d minutes</strong><br>
				Pour des raisons de sécurité, ce lien ne peut être utilisé qu'<strong>une seule fois</strong> et expire après %d minutes. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email — votre mot de passe restera inchangé.`,
		d.TTLMinutes, d.TTLMinutes)) + `
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:` + ColorTextMuted + `;">
  Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
</p>
<p style="margin:8px 0 0;padding:12px 16px;background-color:#F4F4F5;border-radius:8px;font-size:12px;color:` + ColorNavy + `;word-break:break-all;font-family:monospace;">
  ` + d.ResetLink + `
</p>`

	return baseTemplate(d.EmailData, "SECT — Réinitialisation de votre mot de passe",
		"Réinitialisez votre mot de passe SECT en un clic.", body)
}

// PasswordResetText génère la version texte brut de l'email (pour clients
// email qui ne supportent pas le HTML, et pour le champ "text" de Resend).
func PasswordResetText(d PasswordResetData) string {
	if d.TTLMinutes <= 0 {
		d.TTLMinutes = 30
	}
	var b strings.Builder
	if d.RecipientName != "" {
		fmt.Fprintf(&b, "Bonjour %s,\n\n", d.RecipientName)
	} else {
		b.WriteString("Bonjour,\n\n")
	}
	b.WriteString("Vous avez demandé la réinitialisation de votre mot de passe sur SECT.\n\n")
	fmt.Fprintf(&b, "Cliquez sur le lien suivant pour définir un nouveau mot de passe (valable %d minutes) :\n", d.TTLMinutes)
	b.WriteString("\n")
	b.WriteString(d.ResetLink)
	b.WriteString("\n\n")
	b.WriteString("Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email — votre mot de passe restera inchangé.\n\n")
	b.WriteString("— L'équipe SECT (Savane EdTech)")
	return b.String()
}
