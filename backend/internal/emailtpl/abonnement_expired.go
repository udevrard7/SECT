package emailtpl

import (
	"fmt"
)

// AbonnementExpiredData contient les données de l'email "abonnement expiré".
type AbonnementExpiredData struct {
	EmailData
	// PlanNom : "Prof Premium" (l'ancien plan)
	PlanNom string
	// MontantTTC formaté (ex: "4 900 FCFA")
	MontantTTC string
	// DateFin : format JJ/MM/AAAA (date d'expiration)
	DateFin string
	// RenouvellementURL : lien pour renouveler
	RenouvellementURL string
	// DowngradeURL : lien pour rétrograder en Prof Solo gratuit
	DowngradeURL string
	// LoginURL : lien de connexion
	LoginURL string
}

// AbonnementExpiredHTML génère le HTML de l'email d'expiration.
func AbonnementExpiredHTML(d AbonnementExpiredData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">⏸️ Votre abonnement a expiré</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
  <br><br>
  Votre abonnement <strong style="color:` + ColorNavy + `;">` + d.PlanNom + `</strong> a expiré le
  <strong>` + d.DateFin + `</strong>.
  L'accès à votre espace est temporairement suspendu.
</p>

` + infoBoxHTML(fmt.Sprintf(
	`Pour continuer à profiter de l'IA illimitée, de la correction automatique et de
	l'export PDF, renouvelez votre abonnement pour <strong style="color:%s;">%s/mois</strong>.`,
	ColorLimeDark, d.MontantTTC)) + `

<!-- CTA Renouveler -->
` + buttonHTML("🔄 Renouveler mon abonnement", d.RenouvellementURL) + `

<div style="height:16px;"></div>

<!-- Alternative : rétrograder -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
  <tr>
    <td style="padding:20px 24px;text-align:center;">
      <p style="margin:0 0 12px;font-size:14px;color:#475569;">
        Préférez-vous continuer gratuitement ?
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#64748b;line-height:1.5;">
        Rétrogradez en <strong>Prof Solo</strong> : 2 classes, 40 étudiants,
        3 épreuves IA/mois. Gratuit, sans carte bancaire.
      </p>
      <a href="` + d.DowngradeURL + `" style="display:inline-block;background-color:#64748b;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
        Continuer en gratuit (Prof Solo)
      </a>
    </td>
  </tr>
</table>

<p style="margin:20px 0 0;font-size:13px;color:` + ColorNavy + `/60;text-align:center;">
  Vous pouvez changer d'avis à tout moment et revenir à Premium.<br>
  L'équipe SECT
</p>`

	return baseTemplate(d.EmailData, "Votre abonnement SECT a expiré", "Renouvelez ou continuez en gratuit.", body)
}

// AbonnementExpiredText génère le texte de l'email d'expiration.
func AbonnementExpiredText(d AbonnementExpiredData) string {
	return fmt.Sprintf(`Bonjour %s,

Votre abonnement %s a expiré le %s.
L'accès à votre espace est temporairement suspendu.

RENOUVELER (Prof Premium — %s/mois)
────────────────────────────────────
%s

OU CONTINUER EN GRATUIT (Prof Solo)
───────────────────────────────────
Rétrogradez en Prof Solo : 2 classes, 40 étudiants, 3 épreuves IA/mois.
Gratuit, sans carte bancaire.
%s

Vous pouvez changer d'avis à tout moment et revenir à Premium.

L'équipe SECT`, d.RecipientName, d.PlanNom, d.DateFin, d.MontantTTC,
		d.RenouvellementURL, d.DowngradeURL)
}
