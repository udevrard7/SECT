package emailtpl

import (
	"fmt"
	"strings"
)

// AffectationPublishedData contient les données du template « affectation publiée ».
//
// SECT-AFFECTATION-PUBLISH-ENRICH-1 : email envoyé à l'enseignant quand
// son responsable pédagogique publie une de ses affectations. Le corps
// contient le code + nom de l'UE, le type de séance (CM/TD/TP), le volume
// horaire, l'année universitaire et le groupe éventuel.
type AffectationPublishedData struct {
	EmailData
	// EnseignantNom : nom de l'enseignant destinataire (ex: "Ulrich DOUH").
	EnseignantNom string
	// UECode : code de l'UE (ex: "INFO301").
	UECode string
	// UENom : nom de l'UE (ex: "Bases de données").
	UENom string
	// TypeSeance : type de séance (CM, TD, TP).
	TypeSeance string
	// TypeSeanceLabel : libellé humain (Cours magistral, Travaux dirigés, Travaux pratiques).
	TypeSeanceLabel string
	// Groupe : groupe concerné (ex: "Groupe A") — vide si non applicable.
	Groupe string
	// VolumeHeures : volume horaire de l'affectation (ex: 24).
	VolumeHeures float64
	// AnneeUniversitaire : année universitaire (ex: "2025-2026").
	AnneeUniversitaire string
	// PubliePar : nom du responsable qui a publié l'affectation.
	PubliePar string
	// EtablissementNom : nom de l'établissement (optionnel).
	EtablissementNom string
	// FiliereNom : nom de la filière (optionnel).
	FiliereNom string
}

// typeSeanceLabelFR convertit un type de séance technique en libellé lisible.
func typeSeanceLabelFR(t string) string {
	switch strings.ToUpper(t) {
	case "CM":
		return "Cours magistral"
	case "TD":
		return "Travaux dirigés"
	case "TP":
		return "Travaux pratiques"
	default:
		return t
	}
}

// AffectationPublishedHTML génère le HTML de l'email « Votre affectation est publiée ».
func AffectationPublishedHTML(d AffectationPublishedData) string {
	if d.TypeSeanceLabel == "" {
		d.TypeSeanceLabel = typeSeanceLabelFR(d.TypeSeance)
	}
	d.EmailData = DefaultData(d.EnseignantNom, d.AppURL)

	// Bloc contexte (carte crème) : code+nom UE, type, groupe, volume, année, par qui.
	contextParts := []string{
		fmt.Sprintf(`<strong style="color:%s;">Unité d'enseignement :</strong> %s — %s`, ColorNavy, d.UECode, d.UENom),
		fmt.Sprintf(`<strong style="color:%s;">Type de séance :</strong> %s`, ColorNavy, d.TypeSeanceLabel),
	}
	if d.Groupe != "" {
		contextParts = append(contextParts,
			fmt.Sprintf(`<strong style="color:%s;">Groupe :</strong> %s`, ColorNavy, d.Groupe))
	}
	contextParts = append(contextParts,
		fmt.Sprintf(`<strong style="color:%s;">Volume horaire :</strong> %.0f h`, ColorNavy, d.VolumeHeures),
		fmt.Sprintf(`<strong style="color:%s;">Année universitaire :</strong> %s`, ColorNavy, d.AnneeUniversitaire))
	if d.EtablissementNom != "" {
		contextParts = append(contextParts,
			fmt.Sprintf(`<strong style="color:%s;">Établissement :</strong> %s`, ColorNavy, d.EtablissementNom))
	}
	if d.FiliereNom != "" {
		contextParts = append(contextParts,
			fmt.Sprintf(`<strong style="color:%s;">Filière :</strong> %s`, ColorNavy, d.FiliereNom))
	}
	if d.PubliePar != "" {
		contextParts = append(contextParts,
			fmt.Sprintf(`<strong style="color:%s;">Publiée par :</strong> %s`, ColorNavy, d.PubliePar))
	}
	contextHTML := strings.Join(contextParts, "<br>\n  ")

	body := `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:` + ColorNavy + `;letter-spacing:-0.3px;">Votre affectation est publiée</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4B5563;">
  ` + d.greeting() + `
</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4B5563;">
  Votre responsable pédagogique vient de publier une de vos affectations sur
  <strong style="color:` + ColorNavy + `;">SECT</strong>. Elle est désormais visible par les
  étudiants de la filière concernée. Voici les détails :
</p>

<!-- Carte contexte (fond crème) -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;background-color:` + ColorCream + `;border-radius:12px;border:1px solid rgba(245,158,11,0.2);">
  <tr>
    <td style="padding:20px 24px;font-size:14px;line-height:1.8;color:` + ColorNavy + `;">
  ` + contextHTML + `
    </td>
  </tr>
</table>

` + infoBoxHTML(
		`<strong style="color:`+ColorTerracotta+`;">📌 Affectation verrouillée</strong><br>
						Une fois publiée, cette affectation ne peut plus être modifiée tant qu'elle reste au statut <em>Publiée</em>. Si vous constatez une erreur, contactez votre responsable pédagogique pour la repasser en statut <em>Provisoire</em> ou <em>Validée</em>.`) + `
<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#4B5563;">
  Vous pouvez dès à présent créer vos épreuves et séances d'évaluation pour cette UE
  depuis votre espace enseignant.
</p>`

	return baseTemplate(d.EmailData, "SECT — Votre affectation est publiée",
		"Votre affectation vient d'être publiée.", body)
}

// AffectationPublishedText génère la version texte brut de l'email.
func AffectationPublishedText(d AffectationPublishedData) string {
	if d.TypeSeanceLabel == "" {
		d.TypeSeanceLabel = typeSeanceLabelFR(d.TypeSeance)
	}
	var b strings.Builder
	if d.EnseignantNom != "" {
		fmt.Fprintf(&b, "Bonjour %s,\n\n", d.EnseignantNom)
	} else {
		b.WriteString("Bonjour,\n\n")
	}
	b.WriteString("Votre responsable pédagogique vient de publier une de vos affectations\n")
	b.WriteString("sur SECT. Elle est désormais visible par les étudiants de la filière.\n\n")
	b.WriteString("Détails de l'affectation :\n")
	fmt.Fprintf(&b, "  - Unité d'enseignement : %s — %s\n", d.UECode, d.UENom)
	fmt.Fprintf(&b, "  - Type de séance : %s\n", d.TypeSeanceLabel)
	if d.Groupe != "" {
		fmt.Fprintf(&b, "  - Groupe : %s\n", d.Groupe)
	}
	fmt.Fprintf(&b, "  - Volume horaire : %.0f h\n", d.VolumeHeures)
	fmt.Fprintf(&b, "  - Année universitaire : %s\n", d.AnneeUniversitaire)
	if d.EtablissementNom != "" {
		fmt.Fprintf(&b, "  - Établissement : %s\n", d.EtablissementNom)
	}
	if d.FiliereNom != "" {
		fmt.Fprintf(&b, "  - Filière : %s\n", d.FiliereNom)
	}
	if d.PubliePar != "" {
		fmt.Fprintf(&b, "  - Publiée par : %s\n", d.PubliePar)
	}
	b.WriteString("\n")
	b.WriteString("Une fois publiée, cette affectation ne peut plus être modifiée tant qu'elle\n")
	b.WriteString("reste au statut Publiée. Si vous constatez une erreur, contactez votre\n")
	b.WriteString("responsable pédagogique pour la repasser en statut Provisoire ou Validée.\n\n")
	b.WriteString("— L'équipe SECT (Système d'Évaluation Casse-Tête)")
	return b.String()
}
