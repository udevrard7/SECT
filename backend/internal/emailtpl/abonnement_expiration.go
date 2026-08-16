package emailtpl

import (
	"fmt"
)

// AbonnementExpirationData contient les données de l'email de relance J-7.
type AbonnementExpirationData struct {
	EmailData
	// PlanNom : "Prof Premium"
	PlanNom string
	// MontantTTC formaté (ex: "4 900 FCFA")
	MontantTTC string
	// Periode : "mensuel" ou "annuel"
	Periode string
	// DateFin : format JJ/MM/AAAA
	DateFin string
	// JoursRestants : "7" (calculé par le worker)
	JoursRestants string
	// RenouvellementURL : lien pour renouveler
	RenouvellementURL string
	// LoginURL : lien de connexion
	LoginURL string
}

// AbonnementExpirationHTML génère le HTML de l'email de relance.
func AbonnementExpirationHTML(d AbonnementExpirationData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">⏰ Votre abonnement expire bientôt</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
  <br><br>
  Votre abonnement <strong style="color:` + ColorNavy + `;">` + d.PlanNom + `</strong> expire dans
  <strong style="color:` + ColorGold + `;">` + d.JoursRestants + ` jour(s)</strong>, le
  <strong>` + d.DateFin + `</strong>.
</p>

` + infoBoxHTML(fmt.Sprintf(
	`Pour éviter toute interruption de service (génération IA, correction automatique, export PDF),
	renouvelez votre abonnement dès maintenant. Un paiement de <strong style="color:%s;">%s</strong>
	vous donnera accès à votre plan pour une nouvelle période.`,
	ColorLimeDark, d.MontantTTC)) + `

<!-- CTA Renouveler -->
` + buttonHTML("🔄 Renouveler mon abonnement", d.RenouvellementURL) + `

<div style="height:12px;"></div>

` + buttonHTML("Se connecter à SECT", d.LoginURL) + `

<p style="margin:20px 0 0;font-size:13px;color:` + ColorNavy + `/60;text-align:center;">
  Si vous avez déjà renouvelé, ignorez cet email.<br>
  L'équipe SECT
</p>`

	return baseTemplate(d.EmailData, "Votre abonnement SECT expire dans "+d.JoursRestants+" jour(s)", "Renouvelez avant le "+d.DateFin+".", body)
}

// AbonnementExpirationText génère le texte de l'email de relance.
func AbonnementExpirationText(d AbonnementExpirationData) string {
	return fmt.Sprintf(`Bonjour %s,

Votre abonnement %s expire dans %s jour(s), le %s.

Pour éviter toute interruption de service (génération IA, correction automatique,
export PDF), renouvelez votre abonnement dès maintenant.

Un paiement de %s vous donnera accès à votre plan pour une nouvelle période.

RENOUVELER
──────────
%s

CONNECTEZ-VOUS
─────────────
%s

Si vous avez déjà renouvelé, ignorez cet email.

L'équipe SECT`, d.RecipientName, d.PlanNom, d.JoursRestants, d.DateFin,
		d.MontantTTC, d.RenouvellementURL, d.LoginURL)
}
