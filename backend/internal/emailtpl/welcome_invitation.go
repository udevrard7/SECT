package emailtpl

import (
	"fmt"
	"strings"
)

// WelcomeInvitationData contient les données de l'email de bienvenue après
// acceptation d'une invitation (par un étudiant, enseignant ou responsable).
type WelcomeInvitationData struct {
	EmailData
	// Role : "ETUDIANT", "ENSEIGNANT", "RESPONSABLE".
	Role string
	// RoleLabel : libellé français ("Étudiant", "Enseignant", "Responsable pédagogique").
	RoleLabel string
	// EtablissementNom : nom de l'établissement.
	EtablissementNom string
	// FiliereNom : nom de la filière (optionnel, surtout pour les étudiants).
	FiliereNom string
	// InviterName : nom de la personne qui a invité (optionnel).
	InviterName string
	// LoginURL : URL de la page de connexion.
	LoginURL string
	// Avantages : liste des avantages selon le rôle.
	Avantages []string
}

// WelcomeInvitationHTML génère le HTML de l'email de bienvenue après invitation.
func WelcomeInvitationHTML(d WelcomeInvitationData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)
	if d.RoleLabel == "" {
		d.RoleLabel = RoleLabelFR(d.Role)
	}

	// Contexte (étab + filière + invitant)
	contextParts := []string{
		fmt.Sprintf(`<strong style="color:%s;">Votre rôle :</strong> %s`, ColorNavy, d.RoleLabel),
		fmt.Sprintf(`<strong style="color:%s;">Établissement :</strong> %s`, ColorNavy, d.EtablissementNom),
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

	// Liste des avantages
	avantagesHTML := ""
	for _, a := range d.Avantages {
		avantagesHTML += fmt.Sprintf(`<li style="margin-bottom:8px;padding-left:8px;">%s</li>`, a)
	}

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">Bienvenue sur SECT ! 🎓</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
  <br><br>
  Votre compte a été créé avec succès. Vous faites désormais partie de la communauté SECT — la plateforme d'évaluation propulsée par l'IA pour l'enseignement supérieur en Afrique.
</p>

<!-- Carte contexte -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:` + ColorCream + `;border-radius:12px;border:1px solid rgba(245,158,11,0.2);">
  <tr>
    <td style="padding:20px 24px;font-size:14px;line-height:1.8;color:` + ColorNavy + `;">
  ` + contextHTML + `
    </td>
  </tr>
</table>

<!-- Avantages -->
<div style="margin:20px 0;">
  <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:` + ColorNavy + `;">Voici vos accès :</p>
  <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.8;color:` + ColorNavy + `;">
    ` + avantagesHTML + `
  </ul>
</div>

<!-- Guide de démarrage -->
<div style="margin:20px 0;padding:16px 20px;background-color:#F4F4F5;border-radius:8px;">
  <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:` + ColorNavy + `;">🚀 Pour commencer :</p>
  <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;color:` + ColorNavy + `;">
    <li>Connectez-vous avec votre email : <strong>` + d.RecipientName + `</strong></li>
    <li>Complétez votre profil (photo, informations)</li>
    <li>Explorez vos épreuves, classes et ressources</li>
    <li>Participez à vos évaluations ou créez-en de nouvelles</li>
  </ol>
</div>

` + buttonHTML("Accéder à mon espace", d.LoginURL) + `

<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:` + ColorTextMuted + `;">
  Si vous avez des questions, contactez votre établissement ou répondez à cet email.
</p>`

	return baseTemplate(d.EmailData, "Bienvenue sur SECT — Votre compte est prêt",
		"Votre compte SECT est prêt. Découvrez vos accès.", body)
}

// WelcomeInvitationText génère la version texte brut de l'email de bienvenue.
func WelcomeInvitationText(d WelcomeInvitationData) string {
	if d.RoleLabel == "" {
		d.RoleLabel = RoleLabelFR(d.Role)
	}
	var b strings.Builder
	if d.RecipientName != "" {
		fmt.Fprintf(&b, "Bonjour %s,\n\n", d.RecipientName)
	} else {
		b.WriteString("Bonjour,\n\n")
	}
	b.WriteString("Bienvenue sur SECT ! Votre compte a été créé avec succès.\n\n")
	b.WriteString("Vos accès :\n")
	fmt.Fprintf(&b, "  - Rôle : %s\n", d.RoleLabel)
	fmt.Fprintf(&b, "  - Établissement : %s\n", d.EtablissementNom)
	if d.FiliereNom != "" {
		fmt.Fprintf(&b, "  - Filière : %s\n", d.FiliereNom)
	}
	if d.InviterName != "" {
		fmt.Fprintf(&b, "  - Invité par : %s\n", d.InviterName)
	}
	b.WriteString("\nVos avantages :\n")
	for _, a := range d.Avantages {
		fmt.Fprintf(&b, "  - %s\n", a)
	}
	b.WriteString("\nPour commencer :\n")
	b.WriteString("  1. Connectez-vous avec votre email\n")
	b.WriteString("  2. Complétez votre profil\n")
	b.WriteString("  3. Explorez vos épreuves et ressources\n")
	b.WriteString("  4. Participez à vos évaluations\n\n")
	fmt.Fprintf(&b, "Connexion : %s\n\n", d.LoginURL)
	b.WriteString("Si vous avez des questions, contactez votre établissement.\n\n")
	b.WriteString("— L'équipe SECT (Système d'Évaluation Casse-Tête)")
	return b.String()
}
