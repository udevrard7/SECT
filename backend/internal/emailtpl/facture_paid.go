package emailtpl

import (
	"fmt"
)

// FacturePaidData contient les données de l'email de facture payée.
type FacturePaidData struct {
	EmailData
	// Numéro de facture (ex: FAC-2026-00042)
	Numero string
	// PlanNom : "Prof Premium"
	PlanNom string
	// MontantTTC formaté (ex: "4 900 FCFA")
	MontantTTC string
	// Periode : "mensuel" ou "annuel"
	Periode string
	// DateDebut : format JJ/MM/AAAA
	DateDebut string
	// DateFin : format JJ/MM/AAAA
	DateFin string
	// FactureURL : lien de téléchargement PDF
	FactureURL string
	// LoginURL : lien de connexion
	LoginURL string
}

// FacturePaidHTML génère le HTML de l'email de facture payée.
func FacturePaidHTML(d FacturePaidData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">Paiement confirmé ✓</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
  <br><br>
  Votre paiement de <strong style="color:` + ColorLimeDark + `;">` + d.MontantTTC + `</strong> a bien été reçu.
  Votre abonnement est maintenant actif.
</p>

<!-- Détails facture -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:` + ColorCream + `;border-radius:12px;border:1px solid rgba(245,158,11,0.2);">
  <tr>
    <td style="padding:20px 24px;">
      <p style="margin:0 0 8px;font-size:12px;color:` + ColorNavy + `/60;text-transform:uppercase;letter-spacing:1px;">Facture n°</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:` + ColorNavy + `;font-family:monospace;">` + d.Numero + `</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="padding:4px 0;font-size:14px;color:#4B5563;">Plan</td>
          <td style="padding:4px 0;font-size:14px;color:` + ColorNavy + `;font-weight:600;text-align:right;">` + d.PlanNom + ` (` + d.Periode + `)</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:14px;color:#4B5563;">Période</td>
          <td style="padding:4px 0;font-size:14px;color:` + ColorNavy + `;text-align:right;">` + d.DateDebut + ` → ` + d.DateFin + `</td>
        </tr>
        <tr>
          <td style="padding:8px 0 0;font-size:14px;color:#4B5563;border-top:1px solid rgba(245,158,11,0.2);">Montant</td>
          <td style="padding:8px 0 0;font-size:18px;font-weight:700;color:` + ColorLimeDark + `;text-align:right;border-top:1px solid rgba(245,158,11,0.2);">` + d.MontantTTC + ` <span style="font-size:11px;color:` + ColorNavy + `/60;font-weight:400;">(TTC, TVA 20%)</span></td>
        </tr>
      </table>
    </td>
  </tr>
</table>

` + buttonHTML("📄 Télécharger la facture (PDF)", d.FactureURL) + `

<div style="height:12px;"></div>

` + buttonHTML("Se connecter à SECT", d.LoginURL) + `

<p style="margin:20px 0 0;font-size:13px;color:` + ColorNavy + `/60;text-align:center;">
  Merci de votre confiance<br>
  L'équipe SECT
</p>`

	return baseTemplate(d.EmailData, "Votre facture SECT — Paiement confirmé", "Votre paiement a été reçu. Facture "+d.Numero+".", body)
}

// FacturePaidText génère le texte de l'email de facture payée.
func FacturePaidText(d FacturePaidData) string {
	return fmt.Sprintf(`Bonjour %s,

Votre paiement de %s a bien été reçu. Votre abonnement est maintenant actif.

DÉTAILS DE LA FACTURE
─────────────────────
Facture n° : %s
Plan : %s (%s)
Période : %s → %s
Montant : %s (TTC, TVA 20%% incluse)

TÉLÉCHARGER LA FACTURE
──────────────────────
%s

CONNECTEZ-VOUS
──────────────
%s

Merci de votre confiance,
L'équipe SECT`, d.RecipientName, d.MontantTTC, d.Numero, d.PlanNom, d.Periode,
		d.DateDebut, d.DateFin, d.MontantTTC, d.FactureURL, d.LoginURL)
}
