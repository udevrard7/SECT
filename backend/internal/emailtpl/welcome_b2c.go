package emailtpl

import (
	"fmt"
	"strings"
)

// WelcomeB2CData contient les données de l'email de bienvenue B2C.
type WelcomeB2CData struct {
	EmailData
	// PlanNom : "Prof Solo" ou "Prof Premium".
	PlanNom string
	// PlanPrix : "Gratuit" ou "4 900 FCFA/mois".
	PlanPrix string
	// IsPremium : true si Prof Premium (affiche section paiement + avantages Premium).
	IsPremium bool
	// LoginURL : URL de la page de connexion.
	LoginURL string
	// Avantages : liste des avantages du plan (adaptée selon Solo/Premium).
	Avantages []string
}

// WelcomeB2CHTML génère le HTML de l'email de bienvenue B2C.
func WelcomeB2CHTML(d WelcomeB2CData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	// Section paiement (Premium only)
	paymentSection := ""
	if d.IsPremium {
		paymentSection = infoBoxHTML(fmt.Sprintf(
			`<strong style="color:%s;">💎 Abonnement Premium actif</strong><br>
					Votre abonnement Prof Premium est actif. Profitez de l'IA illimitée pour générer et corriger vos épreuves en quelques secondes.`,
			ColorLimeDark,
		))
	}

	// Liste des avantages
	avantagesHTML := ""
	for _, a := range d.Avantages {
		avantagesHTML += fmt.Sprintf(`<li style="margin-bottom:8px;padding-left:8px;">%s</li>`, a)
	}

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">Bienvenue sur SECT ! 🎓</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
  <br><br>
  Votre compte enseignant a été créé avec succès. Vous faites désormais partie de la communauté SECT — la plateforme d'évaluation propulsée par l'IA pour l'enseignement supérieur en Afrique.
</p>

<!-- Carte plan -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:` + ColorCream + `;border-radius:12px;border:1px solid rgba(245,158,11,0.2);">
  <tr>
    <td style="padding:20px 24px;">
      <p style="margin:0 0 8px;font-size:12px;color:` + ColorNavy + `/60;text-transform:uppercase;letter-spacing:1px;">Votre plan</p>
      <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:` + ColorNavy + `;">` + d.PlanNom + `</p>
      <p style="margin:0;font-size:14px;color:` + ColorGold + `;">` + d.PlanPrix + `</p>
    </td>
  </tr>
</table>

` + paymentSection + `

<!-- Avantages -->
<div style="margin:20px 0;">
  <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:` + ColorNavy + `;">Voici vos avantages :</p>
  <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.8;color:` + ColorNavy + `;">
    ` + avantagesHTML + `
  </ul>
</div>

<!-- Guide de démarrage -->
<div style="margin:20px 0;padding:16px 20px;background-color:#F4F4F5;border-radius:8px;">
  <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:` + ColorNavy + `;">🚀 Pour commencer :</p>
  <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;color:` + ColorNavy + `;">
    <li>Connectez-vous avec votre email : <strong>` + d.RecipientName + `</strong></li>
    <li>Créez votre première classe ou filière</li>
    <li>Ajoutez vos étudiants (manuellement ou via invitation)</li>
    <li>Générez votre première épreuve avec l'IA</li>
  </ol>
</div>

` + buttonHTML("Accéder à mon espace", d.LoginURL) + `

<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:` + ColorTextMuted + `;">
  Si vous avez des questions, notre équipe est à votre écoute. Répondez simplement à cet email.
</p>`

	return baseTemplate(d.EmailData, "Bienvenue sur SECT — Votre compte est prêt",
		"Votre compte enseignant SECT est prêt. Découvrez vos avantages.", body)
}

// WelcomeB2CText génère la version texte brut de l'email de bienvenue B2C.
func WelcomeB2CText(d WelcomeB2CData) string {
	var b strings.Builder
	if d.RecipientName != "" {
		fmt.Fprintf(&b, "Bonjour %s,\n\n", d.RecipientName)
	} else {
		b.WriteString("Bonjour,\n\n")
	}
	b.WriteString("Bienvenue sur SECT ! Votre compte enseignant a été créé avec succès.\n\n")
	fmt.Fprintf(&b, "Votre plan : %s (%s)\n\n", d.PlanNom, d.PlanPrix)
	if d.IsPremium {
		b.WriteString("💎 Abonnement Premium actif — IA illimitée pour générer et corriger vos épreuves.\n\n")
	}
	b.WriteString("Vos avantages :\n")
	for _, a := range d.Avantages {
		fmt.Fprintf(&b, "  - %s\n", a)
	}
	b.WriteString("\nPour commencer :\n")
	b.WriteString("  1. Connectez-vous avec votre email\n")
	b.WriteString("  2. Créez votre première classe ou filière\n")
	b.WriteString("  3. Ajoutez vos étudiants\n")
	b.WriteString("  4. Générez votre première épreuve avec l'IA\n\n")
	fmt.Fprintf(&b, "Connexion : %s\n\n", d.LoginURL)
	b.WriteString("Si vous avez des questions, répondez à cet email.\n\n")
	b.WriteString("— L'équipe SECT (Système d'Évaluation Casse-Tête)")
	return b.String()
}
