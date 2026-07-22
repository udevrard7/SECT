package emailtpl

import (
	"fmt"
	"strings"
)

// B2BValidatedData contient les données de l'email de validation B2B envoyé
// au RESPONSABLE après que l'admin a validé son établissement (l'essai de 14
// jours démarre). L'email confirme la validation, rappelle la durée de l'essai,
// la date de fin, et guide le responsable pour configurer son établissement.
type B2BValidatedData struct {
	EmailData
	// EtablissementNom : nom de l'établissement validé (ex: "Université Félix Houphouët-Boigny").
	EtablissementNom string
	// EtablissementType : "UNIVERSITE" | "INSTITUT" | "ECOLE" | "FORMATION_PRO".
	EtablissementType string
	// DateFinEssai : date de fin de l'essai formatée (ex: "31 juillet 2026").
	DateFinEssai string
	// LoginURL : URL de la page de connexion.
	LoginURL string
	// CapitationInfo : texte décrivant le modèle capitation (ex: "900 FCFA/étudiant/an, plancher 50").
	CapitationInfo string
}

// b2bTypeLabel convertit le type enum en libellé lisible.
func b2bTypeLabel(t string) string {
	switch t {
	case "UNIVERSITE":
		return "Université"
	case "INSTITUT":
		return "Institut"
	case "ECOLE":
		return "École"
	case "FORMATION_PRO":
		return "Formation Professionnelle"
	default:
		return t
	}
}

// B2BValidatedHTML génère le HTML de l'email de validation B2B.
func B2BValidatedHTML(d B2BValidatedData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	typeLabel := b2bTypeLabel(d.EtablissementType)
	if typeLabel == "" {
		typeLabel = "Établissement"
	}

	// Bandeau succès (vert lime + icône coche)
	successBanner := fmt.Sprintf(
		`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="margin:0 0 24px;background:linear-gradient(135deg,%s 0%%,%s 100%%);border-radius:12px;">
  <tr>
    <td style="padding:20px 24px;text-align:center;">
      <div style="display:inline-block;width:48px;height:48px;background-color:%s;border-radius:50%%;line-height:48px;font-size:24px;font-weight:800;margin-bottom:8px;">✓</div>
      <p style="margin:0;font-size:18px;font-weight:700;color:%s;letter-spacing:-0.2px;">Établissement validé !</p>
      <p style="margin:4px 0 0;font-size:13px;color:rgba(30,27,75,0.7);">Votre période d'essai de 14 jours est active.</p>
    </td>
  </tr>
</table>`,
		ColorLime, ColorLimeDark, ColorNavy, ColorNavy,
	)

	// Carte essai (crème + bordure or) avec dates et capitation
	capitationRow := ""
	if d.CapitationInfo != "" {
		capitationRow = fmt.Sprintf(
			`<tr>
  <td style="padding:10px 0;border-top:1px solid rgba(245,158,11,0.2);font-size:13px;color:%s;">
    <strong style="color:%s;">💼 Modèle tarifaire :</strong> %s
  </td>
</tr>`,
			ColorTextMuted, ColorGold, d.CapitationInfo,
		)
	}

	essaiCard := fmt.Sprintf(
		`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="margin:0 0 24px;background-color:%s;border-radius:12px;border:1px solid rgba(245,158,11,0.25);">
  <tr>
    <td style="padding:20px 24px;">
      <p style="margin:0 0 4px;font-size:12px;color:%s;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;">⏱ Période d'essai</p>
      <p style="margin:0 0 14px;font-size:22px;font-weight:800;color:%s;letter-spacing:-0.3px;">14 jours gratuits</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
        <tr>
          <td style="padding:8px 0;font-size:13px;color:%s;">
            <strong style="color:%s;">🏛 Établissement :</strong> %s
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-top:1px solid rgba(245,158,11,0.2);font-size:13px;color:%s;">
            <strong style="color:%s;">📅 Fin de l'essai :</strong> %s
          </td>
        </tr>
        %s
      </table>
      <p style="margin:14px 0 0;font-size:12px;color:%s;line-height:1.5;">
        À la fin de l'essai, choisissez votre formule de capitation pour activer votre abonnement.
      </p>
    </td>
  </tr>
</table>`,
		ColorCream,
		ColorNavy+"/70", ColorNavy,
		ColorTextMuted, ColorNavy, d.EtablissementNom+" — "+typeLabel,
		ColorTextMuted, ColorNavy, d.DateFinEssai,
		capitationRow,
		ColorTextMuted,
	)

	// Guide de démarrage (étapes)
	stepsHTML := `<div style="margin:0 0 24px;padding:20px 22px;background-color:#F4F4F5;border-radius:10px;">
  <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:` + ColorNavy + `;">🚀 Configurez votre établissement</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">
    <tr>
      <td style="padding:6px 0;font-size:13px;line-height:1.6;color:` + ColorNavy + `;">
        <strong style="color:` + ColorLimeDark + `;">1.</strong> Connectez-vous avec votre email professionnel
      </td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;line-height:1.6;color:` + ColorNavy + `;">
        <strong style="color:` + ColorLimeDark + `;">2.</strong> Complétez la fiche de votre établissement (logo, filières, niveaux)
      </td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;line-height:1.6;color:` + ColorNavy + `;">
        <strong style="color:` + ColorLimeDark + `;">3.</strong> Invitez vos enseignants et créez vos classes
      </td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;line-height:1.6;color:` + ColorNavy + `;">
        <strong style="color:` + ColorLimeDark + `;">4.</strong> Générez votre première épreuve avec l'IA
      </td>
    </tr>
  </table>
</div>`

	// Boîte info support
	supportBox := infoBoxHTML(fmt.Sprintf(
		`<strong style="color:%s;">💡 Besoin d'aide ?</strong><br>
				 Notre équipe support est disponible pour vous accompagner dans la mise en place. Répondez à cet email ou contactez-nous — nous sommes là pour faire de votre déploiement un succès.`,
		ColorGold,
	))

	body := successBanner +
		`<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">Félicitations ` + d.RecipientName + ` ! 🎉</h2>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4B5563;">
  Votre établissement a été validé par notre équipe administrative. Vous pouvez désormais accéder à votre espace et commencer à configurer votre plateforme d'évaluation.
</p>` +
		essaiCard +
		stepsHTML +
		buttonHTML("Accéder à mon espace", d.LoginURL) +
		supportBox +
		`<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:` + ColorTextMuted + `;">
  Cet email confirme la validation de votre inscription. Conservez-le pour référence.
</p>`

	return baseTemplate(d.EmailData, "SECT — Votre établissement est validé ! Essai de 14 jours démarré",
		"Votre établissement a été validé. Profitez de 14 jours d'essai gratuit pour découvrir SECT.", body)
}

// B2BValidatedText génère la version texte brut de l'email de validation B2B.
// Utilisée comme fallback par le mailer (clients email ne supportant pas le HTML,
// ou pour l'aperçu plain-text dans certains webmails).
func B2BValidatedText(d B2BValidatedData) string {
	var b strings.Builder
	if d.RecipientName != "" {
		fmt.Fprintf(&b, "Bonjour %s,\n\n", d.RecipientName)
	} else {
		b.WriteString("Bonjour,\n\n")
	}
	b.WriteString("✓ Votre établissement a été validé par notre équipe !\n\n")
	fmt.Fprintf(&b, "Établissement : %s (%s)\n", d.EtablissementNom, b2bTypeLabel(d.EtablissementType))
	b.WriteString("Période d'essai : 14 jours gratuits\n")
	if d.DateFinEssai != "" {
		fmt.Fprintf(&b, "Fin de l'essai : %s\n", d.DateFinEssai)
	}
	if d.CapitationInfo != "" {
		fmt.Fprintf(&b, "Modèle tarifaire : %s\n", d.CapitationInfo)
	}
	b.WriteString("\nPour configurer votre établissement :\n")
	b.WriteString("  1. Connectez-vous avec votre email professionnel\n")
	b.WriteString("  2. Complétez la fiche de votre établissement (logo, filières, niveaux)\n")
	b.WriteString("  3. Invitez vos enseignants et créez vos classes\n")
	b.WriteString("  4. Générez votre première épreuve avec l'IA\n\n")
	fmt.Fprintf(&b, "Connexion : %s\n\n", d.LoginURL)
	b.WriteString("Besoin d'aide ? Répondez à cet email, notre équipe support est là pour vous accompagner.\n\n")
	b.WriteString("— L'équipe SECT (Système d'Évaluation Casse-Tête)")
	return b.String()
}
