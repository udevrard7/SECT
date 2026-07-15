package emailtpl

import (
	"fmt"
)

// B2BContractData contient les données du contrat B2B envoyé par email.
type B2BContractData struct {
	EmailData
	// Établissement
	EtabNom    string
	EtabVille  string
	EtabPays   string
	EtabTel    string
	// Responsable
	RespName  string
	RespEmail string
	// Abonnement
	PlanNom       string
	DateDebut     string // JJ/MM/AAAA
	DateFin       string // JJ/MM/AAAA
	NbEtudiants   int
	PrixEtudiant  string // "900 FCFA/an"
	MontantTotal  string // "45 000 FCFA/an"
	ModePaiement  string // "virement bancaire"
	ReferenceTx   string // "VIR-2026-001"
	// Légal
	ContractNum   string // "CTR-2026-001"
	LoginURL      string
}

// B2BContractHTML génère le HTML du contrat B2B.
func B2BContractHTML(d B2BContractData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">📄 Contrat d'abonnement SECT</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
  <br><br>
  Veuillez trouver ci-joint votre contrat d'abonnement <strong style="color:` + ColorNavy + `;">` + d.PlanNom + `</strong>
  pour <strong>` + d.EtabNom + `</strong>. Ce contrat fait foi entre votre établissement et SECT.
</p>

<!-- Numéro de contrat -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:` + ColorCream + `;border-radius:12px;border:1px solid rgba(245,158,11,0.2);">
  <tr>
    <td style="padding:20px 24px;">
      <p style="margin:0 0 4px;font-size:12px;color:` + ColorNavy + `/60;text-transform:uppercase;letter-spacing:1px;">Contrat n°</p>
      <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:` + ColorNavy + `;font-family:monospace;">` + d.ContractNum + `</p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding:6px 0;font-size:14px;color:#4B5563;">Établissement</td><td style="padding:6px 0;font-size:14px;color:` + ColorNavy + `;font-weight:600;text-align:right;">` + d.EtabNom + `</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#4B5563;">Responsable</td><td style="padding:6px 0;font-size:14px;color:` + ColorNavy + `;text-align:right;">` + d.RespName + `</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#4B5563;">Email</td><td style="padding:6px 0;font-size:14px;color:` + ColorNavy + `;text-align:right;">` + d.RespEmail + `</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#4B5563;">Ville</td><td style="padding:6px 0;font-size:14px;color:` + ColorNavy + `;text-align:right;">` + d.EtabVille + `, ` + d.EtabPays + `</td></tr>
        <tr><td style="padding:8px 0;font-size:14px;color:#4B5563;border-top:1px solid rgba(245,158,11,0.2);">Plan</td><td style="padding:8px 0;font-size:14px;color:` + ColorNavy + `;font-weight:600;text-align:right;border-top:1px solid rgba(245,158,11,0.2);">` + d.PlanNom + `</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#4B5563;">Période</td><td style="padding:6px 0;font-size:14px;color:` + ColorNavy + `;text-align:right;">` + d.DateDebut + ` → ` + d.DateFin + `</td></tr>
      </table>
    </td>
  </tr>
</table>

<!-- Conditions financières -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#f0fdf4;border-radius:12px;border:1px solid rgba(132,204,22,0.3);">
  <tr>
    <td style="padding:20px 24px;">
      <p style="margin:0 0 12px;font-size:12px;color:#166534;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Conditions financières (modèle capitation)</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding:4px 0;font-size:14px;color:#166534;">Nombre d'étudiants</td><td style="padding:4px 0;font-size:14px;color:#166534;font-weight:600;text-align:right;">` + fmt.Sprintf("%d", d.NbEtudiants) + `</td></tr>
        <tr><td style="padding:4px 0;font-size:14px;color:#166534;">Tarif unitaire</td><td style="padding:4px 0;font-size:14px;color:#166534;font-weight:600;text-align:right;">` + d.PrixEtudiant + `</td></tr>
        <tr><td style="padding:8px 0;font-size:16px;color:#166534;font-weight:700;border-top:1px solid rgba(132,204,22,0.3);">Montant annuel TTC</td><td style="padding:8px 0;font-size:18px;color:` + ColorLimeDark + `;font-weight:700;text-align:right;border-top:1px solid rgba(132,204,22,0.3);">` + d.MontantTotal + `</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#166534;">Mode de paiement</td><td style="padding:4px 0;font-size:13px;color:#166534;text-align:right;">` + d.ModePaiement + `</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#166534;">Référence</td><td style="padding:4px 0;font-size:13px;color:#166534;text-align:right;font-family:monospace;">` + d.ReferenceTx + `</td></tr>
      </table>
    </td>
  </tr>
</table>

<!-- Conditions générales -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
  <tr>
    <td style="padding:20px 24px;">
      <p style="margin:0 0 8px;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Conditions générales</p>
      <p style="margin:0 0 6px;font-size:13px;color:#475569;line-height:1.5;">
        • L'abonnement est valable 1 an à compter de la date de début.
      </p>
      <p style="margin:0 0 6px;font-size:13px;color:#475569;line-height:1.5;">
        • Le nombre d'étudiants est limité au nombre facturé. Au-delà, une régularisation est due.
      </p>
      <p style="margin:0 0 6px;font-size:13px;color:#475569;line-height:1.5;">
        • L'accès à la plateforme est suspendu en cas de non-renouvellement à l'expiration.
      </p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">
        • Les fonctionnalités IA (génération + correction) sont illimitées durant la période d'abonnement.
      </p>
    </td>
  </tr>
</table>

` + buttonHTML("Accéder à votre espace SECT", d.LoginURL) + `

<p style="margin:20px 0 0;font-size:13px;color:` + ColorNavy + `/60;text-align:center;">
  Ce contrat fait foi entre ` + d.EtabNom + ` et SECT.<br>
  Conservez ce document. La facture vous sera envoyée séparément.<br>
  L'équipe SECT
</p>`

	return baseTemplate(d.EmailData, "Contrat d'abonnement SECT — "+d.EtabNom+" — "+d.ContractNum,
		"Contrat "+d.ContractNum+" — "+d.PlanNom, body)
}

// B2BContractText génère le texte du contrat B2B.
func B2BContractText(d B2BContractData) string {
	return fmt.Sprintf(`Bonjour %s,

Veuillez trouver ci-joint votre contrat d'abonnement SECT.

CONTRAT N° %s
═══════════════════════════════════════

ÉTABLISSEMENT
  Nom          : %s
  Ville        : %s, %s
  Téléphone    : %s

RESPONSABLE
  Nom          : %s
  Email        : %s

ABONNEMENT
  Plan         : %s
  Période      : %s → %s
  Nb étudiants : %d

CONDITIONS FINANCIÈRES (CAPITATION)
  Tarif unitaire   : %s
  Montant annuel   : %s (TTC)
  Mode de paiement : %s
  Référence        : %s

CONDITIONS GÉNÉRALES
  • L'abonnement est valable 1 an à compter de la date de début.
  • Le nombre d'étudiants est limité au nombre facturé.
  • L'accès est suspendu en cas de non-renouvellement.
  • Les fonctionnalités IA sont illimitées durant l'abonnement.

Ce contrat fait foi entre %s et SECT.
Conservez ce document. La facture vous sera envoyée séparément.

ACCÉDER À VOTRE ESPACE
  %s

L'équipe SECT`,
		d.RecipientName,
		d.ContractNum,
		d.EtabNom, d.EtabVille, d.EtabPays, d.EtabTel,
		d.RespName, d.RespEmail,
		d.PlanNom, d.DateDebut, d.DateFin, d.NbEtudiants,
		d.PrixEtudiant, d.MontantTotal, d.ModePaiement, d.ReferenceTx,
		d.EtabNom,
		d.LoginURL)
}
