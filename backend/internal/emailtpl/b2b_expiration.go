package emailtpl

import (
	"fmt"
)

// B2BExpirationData — email de relance J-7 pour abonnement B2B.
// Envoyé au RESPONSABLE de l'établissement.
type B2BExpirationData struct {
	EmailData
	// EtabNom : nom de l'établissement
	EtabNom string
	// PlanNom : "Institutionnel"
	PlanNom string
	// MontantTTC : montant capitation (ex: "45 000 FCFA")
	MontantTTC string
	// NbEtudiants : nombre d'étudiants facturés
	NbEtudiants string
	// DateFin : format JJ/MM/AAAA
	DateFin string
	// JoursRestants : "7"
	JoursRestants string
	// RenouvellementURL : lien pour renouveler
	RenouvellementURL string
	// LoginURL : lien de connexion
	LoginURL string
}

// B2BExpirationHTML génère le HTML de l'email de relance B2B.
func B2BExpirationHTML(d B2BExpirationData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">⏰ Votre abonnement institutionnel expire bientôt</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
  <br><br>
  L'abonnement <strong style="color:` + ColorNavy + `;">` + d.PlanNom + `</strong> de
  <strong>` + d.EtabNom + `</strong> expire dans
  <strong style="color:` + ColorGold + `;">` + d.JoursRestants + ` jour(s)</strong>, le
  <strong>` + d.DateFin + `</strong>.
</p>

` + infoBoxHTML(fmt.Sprintf(
	`Pour éviter toute interruption de service pour vos %s étudiants, enseignants et évaluations,
	renouvelez votre abonnement. Montant : <strong style="color:%s;">%s/an</strong> (capitation %s étudiants).`,
	d.NbEtudiants, ColorLimeDark, d.MontantTTC, d.NbEtudiants)) + `

` + buttonHTML("🔄 Renouveler l'abonnement", d.RenouvellementURL) + `

<div style="height:12px;"></div>

` + buttonHTML("Se connecter à SECT", d.LoginURL) + `

<p style="margin:20px 0 0;font-size:13px;color:` + ColorNavy + `/60;text-align:center;">
  Si vous avez déjà renouvelé, ignorez cet email.<br>
  L'équipe SECT
</p>`

	return baseTemplate(d.EmailData, "Votre abonnement SECT expire dans "+d.JoursRestants+" jour(s)",
		"Renouvelez avant le "+d.DateFin+".", body)
}

// B2BExpirationText génère le texte de l'email de relance B2B.
func B2BExpirationText(d B2BExpirationData) string {
	return fmt.Sprintf(`Bonjour %s,

L'abonnement %s de %s expire dans %s jour(s), le %s.

Pour éviter toute interruption de service pour vos %s étudiants,
renouvelez votre abonnement. Montant : %s/an (capitation %s étudiants).

RENOUVELER
──────────
%s

CONNECTEZ-VOUS
─────────────
%s

Si vous avez déjà renouvelé, ignorez cet email.

L'équipe SECT`, d.RecipientName, d.PlanNom, d.EtabNom, d.JoursRestants, d.DateFin,
		d.NbEtudiants, d.MontantTTC, d.NbEtudiants,
		d.RenouvellementURL, d.LoginURL)
}
