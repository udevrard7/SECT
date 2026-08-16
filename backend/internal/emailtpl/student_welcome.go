package emailtpl

import (
	"fmt"
	"html"
	"strings"
)

// StudentWelcomeData contient les données de l'email de bienvenue envoyé à un
// étudiant après inscription via un lien d'inscription direct (SECT-REG-LINK-B2C-MVP-1).
//
// Contrairement à WelcomeInvitation (qui couvre 3 rôles), ce template est
// dédié aux étudiants B2C : il est plus court, met en avant le matricule (si
// filière assignée), et rappelle le nom de l'enseignant/établissement qui a
// partagé le lien (effet "bouche-à-oreille" / confiance).
//
// SECT-REG-LINK-PHASE3-BACKEND-1 : ajout de 2 champs pour personnaliser l'email :
//   - EtablissementType : "PERSONNEL" (B2C) vs "UNIVERSITE"/"INSTITUT"/"ECOLE" (B2B).
//     Permet de varier le ton de l'intro ("Bienvenue chez votre enseignant X"
//     vs "Bienvenue dans votre établissement Y").
//   - CustomMessage : message optionnel du créateur (max 500 chars côté usecase).
//     Affiché dans une infoBoxHTML "Message de votre enseignant" SI non vide.
//     Le HTML est échappé via html.EscapeString pour prévenir XSS (un créateur
//     ne peut pas injecter du HTML arbitraire dans l'email).
type StudentWelcomeData struct {
	EmailData
	// EtablissementNom : nom de l'établissement (étab B2B ou étab PERSONNEL B2C).
	EtablissementNom string
	// EtablissementType : type de l'établissement ("PERSONNEL" pour B2C, sinon
	// "UNIVERSITE" / "INSTITUT" / "ECOLE" / "AUTRE" pour B2B). Phase 3.
	EtablissementType string
	// FiliereNom : nom de la filière ("—" si non assignée — cas prof B2C global).
	FiliereNom string
	// EnseignantNom : nom du créateur du lien (optionnel — peut être vide si
	// l'utilisateur a été supprimé entretemps).
	EnseignantNom string
	// LoginURL : URL de la page de connexion.
	LoginURL string
	// Matricule : matricule SECT généré (ex: "INF/LJ/26/001"). Vide si pas de
	// filière assignée (cas prof B2C global).
	Matricule string
	// CustomMessage : message optionnel du créateur injecté dans l'email (Phase 3).
	// Vide = pas de message. HTML-échappé dans le template via html.EscapeString.
	CustomMessage string
}

// StudentWelcomeHTML génère le HTML de l'email de bienvenue étudiant.
//
// Structure :
//   - Header DS unifié (logo + bande kente) via baseTemplate
//   - Titre "Bienvenue sur SECT !" + carte établissement/filière
//   - Variant B2C vs B2B dans l'intro (Phase 3) :
//     * B2C (EtablissementType == "PERSONNEL") : "Bienvenue chez votre enseignant {EnseignantNom}"
//     * B2B (sinon) : "Bienvenue dans votre établissement {EtablissementNom}"
//   - Bloc message personnalisé du créateur (Phase 3) si CustomMessage != ""
//   - Bloc matricule (si présent)
//   - Bouton "Se connecter" (vert lime)
//   - Footer DS unifié
//
// Le template est inline-CSS pour la compatibilité maximale clients email.
func StudentWelcomeHTML(d StudentWelcomeData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)
	if d.FiliereNom == "" {
		d.FiliereNom = "—"
	}

	// Variant d'intro B2C vs B2B (Phase 3).
	// B2C : EtablissementType == "PERSONNEL" → ton plus chaleureux, centré enseignant.
	// B2B : sinon → ton institutionnel, centré établissement.
	intro := "Votre compte étudiant a été créé avec succès. Vous pouvez dès maintenant accéder à vos épreuves, examens en ligne et ressources pédagogiques."
	if d.EtablissementType == "PERSONNEL" && d.EnseignantNom != "" {
		intro = fmt.Sprintf("Bienvenue chez votre enseignant <strong style=\"color:%s;\">%s</strong>. %s",
			ColorNavy, html.EscapeString(d.EnseignantNom), intro)
	} else if d.EtablissementNom != "" {
		intro = fmt.Sprintf("Bienvenue dans votre établissement <strong style=\"color:%s;\">%s</strong>. %s",
			ColorNavy, html.EscapeString(d.EtablissementNom), intro)
	}

	// Carte contexte (étab + filière + enseignant + matricule)
	contextParts := []string{
		fmt.Sprintf(`<strong style="color:%s;">Établissement :</strong> %s`, ColorNavy, html.EscapeString(d.EtablissementNom)),
		fmt.Sprintf(`<strong style="color:%s;">Filière :</strong> %s`, ColorNavy, html.EscapeString(d.FiliereNom)),
	}
	if d.EnseignantNom != "" {
		contextParts = append(contextParts,
			fmt.Sprintf(`<strong style="color:%s;">Invité par :</strong> %s`, ColorNavy, html.EscapeString(d.EnseignantNom)))
	}
	if d.Matricule != "" {
		contextParts = append(contextParts,
			fmt.Sprintf(`<strong style="color:%s;">Votre matricule :</strong> <code style="background-color:%s;color:%s;padding:2px 8px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;">%s</code>`,
				ColorNavy, ColorCream, ColorTerracotta, html.EscapeString(d.Matricule)))
	}
	contextHTML := strings.Join(contextParts, "<br>\n  ")

	// Bloc message personnalisé (Phase 3) — uniquement si non vide.
	// HTML-échappé pour prévenir XSS (un créateur ne peut pas injecter du HTML).
	customMsgHTML := ""
	if d.CustomMessage != "" {
		customMsgHTML = infoBoxHTML(fmt.Sprintf(
			`<strong style="color:%s;display:block;margin-bottom:6px;">✉️ Message de votre enseignant</strong>%s`,
			ColorNavy, html.EscapeString(d.CustomMessage)))
	}

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">Bienvenue sur SECT ! 🎓</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
  <br><br>
  ` + intro + `
</p>

<!-- Carte contexte -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:` + ColorCream + `;border-radius:12px;border:1px solid rgba(245,158,11,0.2);">
  <tr>
    <td style="padding:20px 24px;font-size:14px;line-height:1.9;color:` + ColorNavy + `;">
  ` + contextHTML + `
    </td>
  </tr>
</table>

` + customMsgHTML + `

<!-- Avantages étudiant -->
<div style="margin:20px 0;">
  <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:` + ColorNavy + `;">Ce que vous pouvez faire sur SECT :</p>
  <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.9;color:` + ColorNavy + `;">
    <li style="margin-bottom:6px;">Accéder à vos épreuves et examens en ligne</li>
    <li style="margin-bottom:6px;">Passer vos évaluations avec surveillance anti-fraude</li>
    <li style="margin-bottom:6px;">Consulter vos notes et relevés en temps réel</li>
    <li style="margin-bottom:6px;">Réviser avec l'IA (exam-prep, flashcards)</li>
    <li style="margin-bottom:6px;">Recevoir vos certificats numériques</li>
    <li>Échanger avec vos enseignants via la messagerie</li>
  </ul>
</div>

<!-- Guide de démarrage -->
<div style="margin:20px 0;padding:16px 20px;background-color:#F4F4F5;border-radius:8px;">
  <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:` + ColorNavy + `;">🚀 Pour commencer :</p>
  <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.9;color:` + ColorNavy + `;">
    <li>Connectez-vous avec votre email : <strong>` + html.EscapeString(d.RecipientName) + `</strong></li>
    <li>Complétez votre profil si demandé</li>
    <li>Explorez vos épreuves à venir dans le tableau de bord</li>
    <li>Participez à vos évaluations aux dates prévues</li>
  </ol>
</div>

` + buttonHTML("Se connecter", d.LoginURL) + `

<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:` + ColorTextMuted + `;">
  Si vous avez des questions, contactez votre enseignant ou répondez à cet email.
</p>`

	return baseTemplate(d.EmailData, "SECT — Votre compte étudiant est prêt",
		"Votre compte étudiant SECT est prêt. Connectez-vous pour accéder à vos épreuves.", body)
}

// StudentWelcomeText génère la version texte brut de l'email de bienvenue étudiant.
func StudentWelcomeText(d StudentWelcomeData) string {
	if d.FiliereNom == "" {
		d.FiliereNom = "—"
	}
	var b strings.Builder
	if d.RecipientName != "" {
		fmt.Fprintf(&b, "Bonjour %s,\n\n", d.RecipientName)
	} else {
		b.WriteString("Bonjour,\n\n")
	}

	// Variant B2C vs B2B (Phase 3) — texte brut.
	if d.EtablissementType == "PERSONNEL" && d.EnseignantNom != "" {
		fmt.Fprintf(&b, "Bienvenue chez votre enseignant %s. ", d.EnseignantNom)
	} else if d.EtablissementNom != "" {
		fmt.Fprintf(&b, "Bienvenue dans votre établissement %s. ", d.EtablissementNom)
	}
	b.WriteString("Votre compte étudiant a été créé avec succès.\n\n")

	b.WriteString("Vos accès :\n")
	fmt.Fprintf(&b, "  - Établissement : %s\n", d.EtablissementNom)
	fmt.Fprintf(&b, "  - Filière : %s\n", d.FiliereNom)
	if d.EnseignantNom != "" {
		fmt.Fprintf(&b, "  - Invité par : %s\n", d.EnseignantNom)
	}
	if d.Matricule != "" {
		fmt.Fprintf(&b, "  - Matricule : %s\n", d.Matricule)
	}

	// Message personnalisé (Phase 3).
	if d.CustomMessage != "" {
		b.WriteString("\nMessage de votre enseignant :\n")
		// Indent each line of the custom message for readability.
		for _, line := range strings.Split(d.CustomMessage, "\n") {
			fmt.Fprintf(&b, "  %s\n", line)
		}
	}

	b.WriteString("\nCe que vous pouvez faire sur SECT :\n")
	b.WriteString("  - Accéder à vos épreuves et examens en ligne\n")
	b.WriteString("  - Passer vos évaluations avec surveillance anti-fraude\n")
	b.WriteString("  - Consulter vos notes et relevés en temps réel\n")
	b.WriteString("  - Réviser avec l'IA (exam-prep, flashcards)\n")
	b.WriteString("  - Recevoir vos certificats numériques\n")
	b.WriteString("  - Échanger avec vos enseignants via la messagerie\n\n")
	b.WriteString("Pour commencer :\n")
	b.WriteString("  1. Connectez-vous avec votre email\n")
	b.WriteString("  2. Complétez votre profil si demandé\n")
	b.WriteString("  3. Explorez vos épreuves à venir\n")
	b.WriteString("  4. Participez à vos évaluations\n\n")
	fmt.Fprintf(&b, "Connexion : %s\n\n", d.LoginURL)
	b.WriteString("Si vous avez des questions, contactez votre enseignant.\n\n")
	b.WriteString("— L'équipe SECT (Système d'Évaluation Casse-Tête)")
	return b.String()
}
