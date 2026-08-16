package emailtpl

import (
	"fmt"
	"strings"
)

// InvitationData contient les données spécifiques au template d'invitation.
type InvitationData struct {
	EmailData
	// AcceptLink : URL complète de la page d'acceptation (avec ?token=...).
	AcceptLink string
	// TTLDays : durée de validité en jours (7 par défaut).
	TTLDays int
	// Role : rôle invité ("ENSEIGNANT", "ETUDIANT", "RESPONSABLE").
	Role string
	// RoleLabel : libellé humain du rôle ("Enseignant", "Étudiant", "Responsable").
	RoleLabel string
	// EtablissementNom : nom de l'établissement invitant (optionnel).
	EtablissementNom string
	// FiliereNom : nom de la filière (optionnel, pour les étudiants).
	FiliereNom string
	// InviterName : nom de la personne qui invite (optionnel).
	InviterName string
}

// RoleLabelFR convertit un rôle technique en libellé français lisible.
// Exporté pour réutilisation côté usecase (invitation, etc.).
func RoleLabelFR(role string) string {
	switch strings.ToUpper(role) {
	case "ENSEIGNANT":
		return "Enseignant"
	case "ETUDIANT":
		return "Étudiant"
	case "RESPONSABLE":
		return "Responsable pédagogique"
	case "ADMIN":
		return "Administrateur"
	default:
		return role
	}
}

// InvitationHTML génère le HTML complet de l'email d'invitation.
//
// Structure :
//   - Header DS (logo + bande kente)
//   - Titre "Vous êtes invité à rejoindre SECT"
//   - Salutation personnalisée
//   - Contexte (rôle + établissement + filière + invitant)
//   - Bouton CTA "Accepter l'invitation"
//   - Boîte info (TTL + sécurité)
//   - Lien de secours
//   - Footer DS
func InvitationHTML(d InvitationData) string {
	if d.TTLDays <= 0 {
		d.TTLDays = 7
	}
	if d.RoleLabel == "" {
		d.RoleLabel = RoleLabelFR(d.Role)
	}
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	// Bloc contexte : rôle + établissement + filière + invitant
	contextParts := []string{
		fmt.Sprintf(`<strong style="color:%s;">Rôle :</strong> %s`, ColorNavy, d.RoleLabel),
	}
	if d.EtablissementNom != "" {
		contextParts = append(contextParts,
			fmt.Sprintf(`<strong style="color:%s;">Établissement :</strong> %s`, ColorNavy, d.EtablissementNom))
	}
	if d.FiliereNom != "" {
		contextParts = append(contextParts,
			fmt.Sprintf(`<strong style="color:%s;">Filière :</strong> %s`, ColorNavy, d.FiliereNom))
	}
	if d.InviterName != "" {
		contextParts = append(contextParts,
			fmt.Sprintf(`<strong style="color:%s;">Invité par :</strong> %s`, ColorNavy, d.InviterName))
	}
	contextHTML := strings.Join(contextParts, "<br>\n  ")

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">Vous êtes invité à rejoindre SECT</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4B5563;">
  Vous avez été invité à rejoindre la plateforme <strong style="color:` + ColorNavy + `;">SECT</strong> —
  le système d'évaluation propulsé par l'IA pour l'enseignement supérieur en Afrique.
  Voici les détails de votre invitation :
</p>

<!-- Carte contexte (fond crème) -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:` + ColorCream + `;border-radius:12px;border:1px solid rgba(245,158,11,0.2);">
  <tr>
    <td style="padding:20px 24px;font-size:14px;line-height:1.8;color:` + ColorNavy + `;">
  ` + contextHTML + `
    </td>
  </tr>
</table>

<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4B5563;">
  Cliquez sur le bouton ci-dessous pour créer votre compte et définir votre mot de passe :
</p>
` + buttonHTML("Accepter l'invitation", d.AcceptLink) + `
` + infoBoxHTML(fmt.Sprintf(
		`<strong style="color:`+ColorTerracotta+`;">⏱ Valable %d jours</strong><br>
                                Pour des raisons de sécurité, ce lien ne peut être utilisé qu'<strong>une seule fois</strong> et expire après %d jours. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.`,
		d.TTLDays, d.TTLDays)) + `
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:` + ColorTextMuted + `;">
  Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
</p>
<p style="margin:8px 0 0;padding:12px 16px;background-color:#F4F4F5;border-radius:8px;font-size:12px;color:` + ColorNavy + `;word-break:break-all;font-family:monospace;">
  ` + d.AcceptLink + `
</p>`

	return baseTemplate(d.EmailData, "SECT — Invitation à rejoindre la plateforme",
		"Acceptez votre invitation SECT en un clic.", body)
}

// InvitationText génère la version texte brut de l'email d'invitation.
func InvitationText(d InvitationData) string {
	if d.TTLDays <= 0 {
		d.TTLDays = 7
	}
	if d.RoleLabel == "" {
		d.RoleLabel = RoleLabelFR(d.Role)
	}
	var b strings.Builder
	if d.RecipientName != "" {
		fmt.Fprintf(&b, "Bonjour %s,\n\n", d.RecipientName)
	} else {
		b.WriteString("Bonjour,\n\n")
	}
	b.WriteString("Vous avez été invité à rejoindre la plateforme SECT — le système\n")
	b.WriteString("d'évaluation propulsé par l'IA pour l'enseignement supérieur en Afrique.\n\n")
	b.WriteString("Détails de votre invitation :\n")
	fmt.Fprintf(&b, "  - Rôle : %s\n", d.RoleLabel)
	if d.EtablissementNom != "" {
		fmt.Fprintf(&b, "  - Établissement : %s\n", d.EtablissementNom)
	}
	if d.FiliereNom != "" {
		fmt.Fprintf(&b, "  - Filière : %s\n", d.FiliereNom)
	}
	if d.InviterName != "" {
		fmt.Fprintf(&b, "  - Invité par : %s\n", d.InviterName)
	}
	b.WriteString("\n")
	fmt.Fprintf(&b, "Cliquez sur le lien suivant pour créer votre compte (valable %d jours) :\n", d.TTLDays)
	b.WriteString("\n")
	b.WriteString(d.AcceptLink)
	b.WriteString("\n\n")
	b.WriteString("Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.\n\n")
	b.WriteString("— L'équipe SECT (Système d'Évaluation Casse-Tête)")
	return b.String()
}
