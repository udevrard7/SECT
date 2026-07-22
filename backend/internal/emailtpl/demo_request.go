package emailtpl

import (
        "fmt"
        "strings"
)

// DemoRequestData contient les données d'une demande de démo B2B.
type DemoRequestData struct {
        EmailData
        // Nom : nom du contact (directeur, DG, responsable pédagogique).
        Nom string
        // Email : email du contact.
        Email string
        // Telephone : téléphone (optionnel).
        Telephone string
        // EtablissementNom : nom de l'établissement.
        EtablissementNom string
        // Ville : ville de l'établissement (optionnel).
        Ville string
        // NbEtudiants : nombre d'étudiants estimé.
        NbEtudiants string
        // Message : message libre du prospect (optionnel).
        Message string
}

// escapeHTMLLocal échappe les caractères HTML (copie locale — le package mailer
// a sa propre version non exportée).
func escapeHTMLLocal(s string) string {
        s = strings.ReplaceAll(s, "&", "&amp;")
        s = strings.ReplaceAll(s, "<", "&lt;")
        s = strings.ReplaceAll(s, ">", "&gt;")
        s = strings.ReplaceAll(s, "\"", "&quot;")
        return s
}

// DemoRequestHTML génère le HTML de l'email de demande de démo (envoyé à l'admin).
func DemoRequestHTML(d DemoRequestData) string {
        d.EmailData = EmailData{
                RecipientName: "Équipe SECT",
                AppName:       "SECT",
                AppTagline:    "Système d'Évaluation Casse-Tête",
                AppURL:        d.AppURL,
                SupportEmail:  "support@sect.ftci.fr",
                Year:          "2026",
        }

        contextParts := []string{
                fmt.Sprintf(`<strong style="color:%s;">Contact :</strong> %s`, ColorNavy, d.Nom),
                fmt.Sprintf(`<strong style="color:%s;">Email :</strong> %s`, ColorNavy, d.Email),
        }
        if d.Telephone != "" {
                contextParts = append(contextParts,
                        fmt.Sprintf(`<strong style="color:%s;">Téléphone :</strong> %s`, ColorNavy, d.Telephone))
        }
        contextParts = append(contextParts,
                fmt.Sprintf(`<strong style="color:%s;">Établissement :</strong> %s`, ColorNavy, d.EtablissementNom))
        if d.Ville != "" {
                contextParts = append(contextParts,
                        fmt.Sprintf(`<strong style="color:%s;">Ville :</strong> %s`, ColorNavy, d.Ville))
        }
        contextParts = append(contextParts,
                fmt.Sprintf(`<strong style="color:%s;">Étudiants estimés :</strong> %s`, ColorNavy, d.NbEtudiants))
        contextHTML := strings.Join(contextParts, "<br>\n  ")

        messageHTML := ""
        if d.Message != "" {
                messageHTML = `<div style="margin-top:16px;padding:12px 16px;background-color:#F4F4F5;border-radius:8px;font-size:14px;color:#1E1B4B;line-height:1.6;">
  <strong style="color:#1E1B4B;">Message du prospect :</strong><br>
  ` + escapeHTMLLocal(d.Message) + `
</div>`
        }

        body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">Nouvelle demande de démo B2B</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  Un prospect institutionnel a demandé une démonstration de SECT. Contactez-le dans les 24h pour planifier un rendez-vous.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:` + ColorCream + `;border-radius:12px;border:1px solid rgba(245,158,11,0.2);">
  <tr>
    <td style="padding:20px 24px;font-size:14px;line-height:1.8;color:` + ColorNavy + `;">
  ` + contextHTML + `
    </td>
  </tr>
</table>
` + messageHTML + `
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:` + ColorTextMuted + `;">
  Cette demande a été envoyée depuis le formulaire "Demander une démo" du landing page SECT.
</p>`

        return baseTemplate(d.EmailData, "SECT — Nouvelle demande de démo B2B",
                "Nouvelle demande de démo B2B institutionnelle.", body)
}

// DemoRequestText génère la version texte brut de l'email de demande de démo.
func DemoRequestText(d DemoRequestData) string {
        var b strings.Builder
        b.WriteString("Nouvelle demande de démo B2B\n\n")
        b.WriteString("Un prospect institutionnel a demandé une démonstration de SECT.\n\n")
        b.WriteString("Détails du prospect :\n")
        fmt.Fprintf(&b, "  - Contact : %s\n", d.Nom)
        fmt.Fprintf(&b, "  - Email : %s\n", d.Email)
        if d.Telephone != "" {
                fmt.Fprintf(&b, "  - Téléphone : %s\n", d.Telephone)
        }
        fmt.Fprintf(&b, "  - Établissement : %s\n", d.EtablissementNom)
        if d.Ville != "" {
                fmt.Fprintf(&b, "  - Ville : %s\n", d.Ville)
        }
        fmt.Fprintf(&b, "  - Étudiants estimés : %s\n", d.NbEtudiants)
        if d.Message != "" {
                b.WriteString("\nMessage du prospect :\n")
                b.WriteString(d.Message)
                b.WriteString("\n")
        }
        b.WriteString("\n— L'équipe SECT (Système d'Évaluation Casse-Tête)")
        return b.String()
}
