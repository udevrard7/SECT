// Package emailtpl fournit des templates HTML professionnels pour les emails
// transactionnels de SECT "Savane EdTech".
//
// Identité visuelle :
//   - Palette africaine : vert lime (#84CC16), terre cuite (#C2410C),
//     bleu nuit (#1E1B4B / #0A1931), or (#F59E0B)
//   - Motif kente (bandes tricolores + triangles diagonaux + points dorés)
//   - Composants DS unifiés (header, footer, bouton, carte)
//
// Tous les templates sont inline-CSS (compatibilité maximale clients email :
// Gmail, Outlook, Apple Mail, etc.). Aucune dépendance externe.
package emailtpl

// Palette de couleurs "Savane EdTech" (réutilisée dans tous les templates).
const (
	ColorLime      = "#84CC16" // vert lime — accents, boutons primaire
	ColorLimeDark  = "#65A30D" // vert lime foncé — hover
	ColorTerracotta = "#C2410C" // terre cuite — alertes, erreurs
	ColorNavy      = "#1E1B4B" // bleu nuit — fond, titres
	ColorNavyDeep  = "#0A1931" // bleu nuit profond — dégradé
	ColorGold      = "#F59E0B" // or — highlights, étoiles
	ColorCream     = "#FFFBEB" // crème — fond carte
	ColorWhite     = "#FFFFFF"
	ColorTextMuted = "#6B7280" // gris — texte secondaire
)

// EmailData contient les données communes à tous les templates.
type EmailData struct {
	// RecipientName : nom du destinataire (ex: "Ulrich DOUH"). Si vide, "Bonjour"
	// est utilisé.
	RecipientName string
	// AppName : "SECT" (ou "Savane EdTech" pour le sous-titre).
	AppName    string
	AppTagline string // "Système d'Évaluation Casse-Tête"
	// AppURL : URL publique du frontend (pour le logo, les liens).
	AppURL string
	// SupportEmail : email de contact support (footer).
	SupportEmail string
	// Year : année courante pour le copyright footer.
	Year string
}

// DefaultData retourne un EmailData avec les valeurs par défaut de SECT.
func DefaultData(recipientName, appURL string) EmailData {
	return EmailData{
		RecipientName: recipientName,
		AppName:       "SECT",
		AppTagline:    "Savane EdTech — Système d'Évaluation",
		AppURL:        appURL,
		SupportEmail:  "support@sect.ftci.fr",
		Year:          "2026",
	}
}

// greeting retourne "Bonjour Prénom," ou "Bonjour," si le nom est vide.
func (d EmailData) greeting() string {
	if d.RecipientName != "" {
		return "Bonjour " + d.RecipientName + ","
	}
	return "Bonjour,"
}

// baseTemplate wrappe le contenu HTML dans la structure DS unifiée :
// header (logo + bande kente), corps (carte crème), footer (copyright + liens).
//
// Le motif kente est reproduit en CSS inline (bandes verticales tricolores +
// triangles diagonaux) — fidèle à l'UI web sans dépendre d'images externes.
func baseTemplate(d EmailData, title, preheader, bodyHTML string) string {
	// Le preheader est le texte d'aperçu affiché par les clients email après
	// l'objet. Caché visuellement mais présent pour les crawlers.
	return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="support-color-scheme" content="light only">
  <title>` + title + `</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1E1B4B;">
  <!-- Preheader (aperçu après l'objet) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">
    ` + preheader + `
    &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;
  </div>

  <!-- Wrapper exterieur -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F4F4F5;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <!-- Conteneur principal (600px max) -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:` + ColorWhite + `;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(30,27,75,0.12);">

          <!-- ═══ HEADER : bandeau bleu nuit + motif kente ═══ -->
          <tr>
            <td style="background:linear-gradient(135deg,` + ColorNavyDeep + ` 0%,` + ColorNavy + ` 100%);padding:0;position:relative;">
              <!-- Bande kente supérieure (4 couleurs) -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="height:6px;background:linear-gradient(90deg,` + ColorLime + ` 0%,` + ColorLime + ` 25%,` + ColorTerracotta + ` 25%,` + ColorTerracotta + ` 50%,` + ColorGold + ` 50%,` + ColorGold + ` 75%,` + ColorNavy + ` 75%,` + ColorNavy + ` 100%);font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Logo + nom appli -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:32px 40px 28px;">
                <tr>
                  <td align="center">
                    <!-- Badge logo (carré arrondi vert lime avec initiale) -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background:linear-gradient(135deg,` + ColorLime + ` 0%,` + ColorLimeDark + ` 100%);border-radius:16px;width:64px;height:64px;vertical-align:middle;">
                          <span style="font-size:30px;font-weight:800;color:` + ColorNavy + `;letter-spacing:-1px;line-height:64px;">S</span>
                        </td>
                      </tr>
                    </table>
                    <h1 style="margin:16px 0 4px;font-size:28px;font-weight:800;color:` + ColorWhite + `;letter-spacing:-0.5px;">` + d.AppName + `</h1>
                    <p style="margin:0;font-size:12px;color:` + ColorGold + `;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;">` + d.AppTagline + `</p>
                  </td>
                </tr>
              </table>

              <!-- Bande kente inférieure -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="height:4px;background:linear-gradient(90deg,` + ColorNavy + ` 0%,` + ColorNavy + ` 33%,` + ColorGold + ` 33%,` + ColorGold + ` 66%,` + ColorTerracotta + ` 66%,` + ColorTerracotta + ` 100%);font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ CORPS : carte contenu ═══ -->
          <tr>
            <td style="background-color:` + ColorWhite + `;padding:40px 40px 32px;">
              ` + bodyHTML + `
            </td>
          </tr>

          <!-- ═══ FOOTER ═══ -->
          <tr>
            <td style="background-color:` + ColorNavy + `;padding:32px 40px;">
              <!-- Bande kente footer -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,` + ColorLime + ` 0%,` + ColorLime + ` 25%,` + ColorTerracotta + ` 25%,` + ColorTerracotta + ` 50%,` + ColorGold + ` 50%,` + ColorGold + ` 75%,` + ColorNavy + ` 75%);font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:0 0 8px;text-align:center;font-size:13px;color:rgba(255,255,255,0.7);">
                © ` + d.Year + ` ` + d.AppName + ` — Savane EdTech
              </p>
              <p style="margin:0 0 16px;text-align:center;font-size:12px;color:rgba(255,255,255,0.5);">
                Plateforme d'évaluation propulsée par l'IA pour l'enseignement supérieur en Afrique.
              </p>
              <p style="margin:0;text-align:center;font-size:11px;color:rgba(255,255,255,0.4);">
                Si vous n'êtes pas à l'origine de cet email, vous pouvez l'ignorer.<br>
                Contact : <a href="mailto:` + d.SupportEmail + `" style="color:` + ColorGold + `;text-decoration:none;">` + d.SupportEmail + `</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- Fin conteneur -->

      </td>
    </tr>
  </table>
</body>
</html>`
}

// buttonHTML génère un bouton CTA inline-CSS (compatible tous clients email).
// Utilisé pour les liens primaires (reset password, confirmation, etc.).
func buttonHTML(label, href string) string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;">
  <tr>
    <td align="center">
      <a href="` + href + `" target="_blank" style="display:inline-block;background:linear-gradient(135deg,` + ColorLime + ` 0%,` + ColorLimeDark + ` 100%);color:` + ColorNavy + `;font-weight:700;font-size:16px;text-decoration:none;padding:16px 40px;border-radius:12px;box-shadow:0 6px 20px rgba(132,204,22,0.35);letter-spacing:0.3px;">
        ` + label + `
      </a>
    </td>
  </tr>
</table>`
}

// infoBoxHTML génère une boîte d'information (fond crème, bordure or).
func infoBoxHTML(content string) string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;background-color:` + ColorCream + `;border-left:4px solid ` + ColorGold + `;border-radius:8px;">
  <tr>
    <td style="padding:16px 20px;font-size:14px;line-height:1.6;color:` + ColorNavy + `;">
      ` + content + `
    </td>
  </tr>
</table>`
}
