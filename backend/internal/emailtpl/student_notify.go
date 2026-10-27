// Package emailtpl — templates des notifications étudiantes multi-canaux
// (SECT-NOTIF-STUDENT-1).
//
// Trois annonces pédagogiques destinées aux ÉTUDIANTS d'une filière :
//   - Évaluation disponible (épreuve publiée : BROUILLON → PLANIFIEE) ;
//   - Nouveau document (support de cours déposé par un enseignant) ;
//   - Nouvel ouvrage en bibliothèque (lié à la filière).
//
// Ces emails transitent par le dispatcher (canal email, préférence
// emailEnabled) ; les mêmes contenus alimentent le message Telegram
// (canal 7, version courte construite par Dispatcher.sendTelegram) et la notification
// in-app (titre + message courts). Un seul template générique suffit : la
// structure (titre + intro + carte contexte + bouton d'action) est commune.
package emailtpl

import (
	"fmt"
	"strings"
)

// StudentAnnouncementData contient les données d'une annonce étudiante.
//
// Les champs Details sont des lignes « label : valeur » affichées dans la
// carte contexte (couleur crème, pattern affectation_published).
type StudentAnnouncementData struct {
	EmailData
	// Titre : titre humain de l'annonce (ex: "Une évaluation est disponible").
	Titre string
	// Intro : phrase d'introduction (déjà rédigée par l'appelant).
	Intro string
	// Details : lignes de contexte [][2]string{{label, valeur}, ...}.
	Details [][2]string
	// ActionLabel : libellé du bouton (ex: "Voir mes épreuves").
	ActionLabel string
	// ActionPath : chemin frontend (ex: "/mes-epreuves") — concaténé à AppURL.
	ActionPath string
}

// StudentAnnouncementSubject génère l'objet de l'email.
func StudentAnnouncementSubject(d StudentAnnouncementData) string {
	return "SECT — " + d.Titre
}

// StudentAnnouncementText génère le corps texte de l'email.
func StudentAnnouncementText(d StudentAnnouncementData) string {
	var b strings.Builder
	b.WriteString(d.greeting() + "\n\n")
	b.WriteString(d.Intro + "\n")
	if len(d.Details) > 0 {
		b.WriteString("\n")
		for _, kv := range d.Details {
			fmt.Fprintf(&b, "  - %s : %s\n", kv[0], kv[1])
		}
	}
	if d.ActionPath != "" {
		url := strings.TrimRight(d.AppURL, "/") + d.ActionPath
		if d.ActionLabel == "" {
			d.ActionLabel = "Consulter"
		}
		fmt.Fprintf(&b, "\n%s : %s\n", d.ActionLabel, url)
	}
	b.WriteString("\n— L'équipe SECT\n")
	return b.String()
}

// StudentAnnouncementHTML génère le corps HTML de l'email (baseTemplate DS).
func StudentAnnouncementHTML(d StudentAnnouncementData) string {
	d.EmailData = DefaultData(d.RecipientName, d.AppURL)

	// Carte contexte (fond crème) : lignes label → valeur.
	contextParts := make([]string, 0, len(d.Details))
	for _, kv := range d.Details {
		contextParts = append(contextParts,
			fmt.Sprintf(`<strong style="color:%s;">%s :</strong> %s`, ColorNavy, kv[0], kv[1]))
	}
	contextHTML := strings.Join(contextParts, "<br>\n  ")

	// Bouton d'action (lime, pattern invitation).
	actionHTML := ""
	if d.ActionPath != "" {
		url := strings.TrimRight(d.AppURL, "/") + d.ActionPath
		if d.ActionLabel == "" {
			d.ActionLabel = "Consulter"
		}
		actionHTML = fmt.Sprintf(`
<!-- Bouton d'action -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
  <tr>
    <td style="background-color:%s;border-radius:10px;">
      <a href="%s" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">%s</a>
    </td>
  </tr>
</table>`, ColorLime, url, d.ActionLabel)
	}

	fullBody := fmt.Sprintf(`<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:%s;letter-spacing:-0.3px;">%s</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  %s
</p>

<!-- Carte contexte (fond crème) -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="margin:0 0 20px;background-color:%s;border-radius:12px;border:1px solid rgba(245,158,11,0.2);">
  <tr>
    <td style="padding:20px 24px;font-size:14px;line-height:1.8;color:%s;">
      %s
    </td>
  </tr>
</table>
%s
<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:%s;">
  Vous recevez cet email car vous êtes inscrit(e) à cette filière.
  Gérez vos préférences depuis votre profil SECT.
</p>`,
		ColorNavy, d.Titre, d.greeting()+" "+d.Intro,
		ColorCream, ColorNavy, contextHTML,
		actionHTML, ColorTextMuted)

	return baseTemplate(d.EmailData, StudentAnnouncementSubject(d), d.Titre, fullBody)
}
