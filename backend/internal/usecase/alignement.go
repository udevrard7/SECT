// Package usecase — logique métier du paquet enseignant (ADR-0007 §P3) :
// TOC curaté (OuvrageSection, G1 ADMIN), déclaration d'alignement
// (l'IA PROPOSE, l'enseignant DÉCIDE — autorité de la transposition
// didactique), bibliographie automatique et audit de conformité.
//
// Invariants I1/I2 (ADR-0007) : le livre ne génère jamais ; les
// alignements nourrissent bibliographie + conformité, JAMAIS la
// génération d'épreuves.
package usecase

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// maxSuggestions — borne du retrieval (flux P3 : propositions courtes,
// validation en clics ; > 10 = charge cognitive, adoption en baisse).
const maxSuggestions = 10

// AlignementUseCase implémente les cas d'usage P3.
type AlignementUseCase struct {
	alignementRepo domain.AlignementRepository
	sectionRepo    domain.OuvrageSectionRepository
}

// NewAlignementUseCase crée un nouveau AlignementUseCase.
func NewAlignementUseCase(alignementRepo domain.AlignementRepository, sectionRepo domain.OuvrageSectionRepository) *AlignementUseCase {
	return &AlignementUseCase{alignementRepo: alignementRepo, sectionRepo: sectionRepo}
}

// ============================================================
// SECTIONS (TOC curaté — G1 ADMIN)
// ============================================================

// ListSections — TOC d'un ouvrage (tous rôles ; RLS délègue à Ouvrage_select).
func (uc *AlignementUseCase) ListSections(ctx context.Context, claims db.SessionClaims, ouvrageID string) ([]*domain.OuvrageSection, error) {
	return uc.sectionRepo.ListByOuvrage(ctx, ouvrageID)
}

// validateSectionPages — debut/fin cohérents quand les deux fournis.
func validateSectionPages(debut, fin *int) error {
	if debut != nil && *debut < 0 {
		return &domain.ValidationError{Field: "pageDebut", Message: "pageDebut ne peut pas être négatif"}
	}
	if fin != nil && *fin < 0 {
		return &domain.ValidationError{Field: "pageFin", Message: "pageFin ne peut pas être négatif"}
	}
	if debut != nil && fin != nil && *debut > *fin {
		return &domain.ValidationError{Field: "pageDebut", Message: "pageDebut doit précéder pageFin"}
	}
	return nil
}

// CreateSection — G1 : ADMIN seul (defense in depth : RequireRole router +
// ici ; la policy 000126 est la 3e ligne).
func (uc *AlignementUseCase) CreateSection(ctx context.Context, claims db.SessionClaims, input domain.CreateOuvrageSectionInput) (*domain.OuvrageSection, error) {
	if claims.Role != string(domain.RoleAdmin) {
		return nil, &domain.UnauthorizedError{Message: "curation du TOC réservée à l'ADMIN (G1)"}
	}
	if strings.TrimSpace(input.Titre) == "" {
		return nil, &domain.ValidationError{Field: "titre", Message: "titre de section requis"}
	}
	if input.OuvrageID == "" {
		return nil, &domain.ValidationError{Field: "ouvrageId", Message: "ouvrage requis"}
	}
	if err := validateSectionPages(input.PageDebut, input.PageFin); err != nil {
		return nil, err
	}
	return uc.sectionRepo.Create(ctx, input)
}

// UpdateSection — G1 : ADMIN seul. PATCH tri-state.
func (uc *AlignementUseCase) UpdateSection(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateOuvrageSectionInput) (*domain.OuvrageSection, error) {
	if claims.Role != string(domain.RoleAdmin) {
		return nil, &domain.UnauthorizedError{Message: "curation du TOC réservée à l'ADMIN (G1)"}
	}
	if input.Titre != nil && strings.TrimSpace(*input.Titre) == "" {
		return nil, &domain.ValidationError{Field: "titre", Message: "titre de section requis"}
	}
	var debut, fin *int
	if input.UnsetPageDebut {
		debut = nil
	} else {
		debut = input.PageDebut
	}
	if input.UnsetPageFin {
		fin = nil
	} else {
		fin = input.PageFin
	}
	if err := validateSectionPages(debut, fin); err != nil {
		return nil, err
	}
	return uc.sectionRepo.Update(ctx, id, input)
}

// DeleteSection — G1 : ADMIN seul. DELETE réel ; les alignements survécuent
// (FK ON DELETE SET NULL → la déclaration repasse en « ouvrage entier »).
func (uc *AlignementUseCase) DeleteSection(ctx context.Context, claims db.SessionClaims, id string) error {
	if claims.Role != string(domain.RoleAdmin) {
		return &domain.UnauthorizedError{Message: "curation du TOC réservée à l'ADMIN (G1)"}
	}
	return uc.sectionRepo.Delete(ctx, id)
}

// ============================================================
// ALIGNEMENTS (la déclaration des 5 minutes)
// ============================================================

// ListAlignements — déclarations d'un support + ouvrages + sections.
// ENS/RESP/ADMIN (RLS etab-scopée ; la vue étudiant passe par la
// bibliographie, qui formate les mêmes données).
func (uc *AlignementUseCase) ListAlignements(ctx context.Context, claims db.SessionClaims, documentID string) ([]*domain.AlignementOuvrage, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.alignementRepo.ListByDocument(ctx, documentID)
}

// gateOwnerDocument — le support doit être visible ET (pour un non-ADMIN)
// possédé par l'appelant : la déclaration est l'acte de l'enseignant sur
// SON support (ADR-0007). Le materiau (requête Document+User sous RLS)
// sert de contrôle honnête : invisible → 404, d'autrui → 403.
func (uc *AlignementUseCase) gateOwnerDocument(claims db.SessionClaims, mat *domain.AlignementMateriau) error {
	if domain.Role(claims.Role) != domain.RoleAdmin && mat.OwnerID != claims.UserID {
		return &domain.UnauthorizedError{Message: "seul l'enseignant propriétaire du support peut déclarer ses alignements"}
	}
	return nil
}

// CreateAlignement — POST : l'enseignant valide une proposition (ou déclare
// manuellement). Doublon → 409 (UNIQUE NULLS NOT DISTINCT 000126).
func (uc *AlignementUseCase) CreateAlignement(ctx context.Context, claims db.SessionClaims, documentID string, input domain.CreateAlignementInput) (*domain.AlignementOuvrage, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "déclaration réservée à l'enseignant (owner) ou à l'ADMIN"}
	}
	if input.OuvrageID == "" {
		return nil, &domain.ValidationError{Field: "ouvrageId", Message: "ouvrage requis"}
	}
	if input.Note != nil && len(*input.Note) > 2000 {
		return nil, &domain.ValidationError{Field: "note", Message: "note trop longue (2000 caractères max)"}
	}

	mat, err := uc.alignementRepo.MateriauPourSuggestions(ctx, documentID)
	if err != nil {
		return nil, err // 404 si support invisible (auto-masquage RLS)
	}
	if err := uc.gateOwnerDocument(claims, mat); err != nil {
		return nil, err
	}

	// La section (optionnelle) doit appartenir à l'ouvrage déclaré.
	if input.OuvrageSectionID != nil && *input.OuvrageSectionID != "" {
		sec, err := uc.sectionRepo.FindByID(ctx, *input.OuvrageSectionID)
		if err != nil {
			return nil, &domain.ValidationError{Field: "ouvrageSectionId", Message: "section introuvable"}
		}
		if sec.OuvrageID != input.OuvrageID {
			return nil, &domain.ValidationError{Field: "ouvrageSectionId", Message: "la section n'appartient pas à l'ouvrage déclaré"}
		}
	}

	return uc.alignementRepo.Create(ctx, documentID, input, claims.UserID)
}

// DeleteAlignement — owner/admin (policy delete 000126 re-vérifie).
func (uc *AlignementUseCase) DeleteAlignement(ctx context.Context, claims db.SessionClaims, documentID, alignementID string) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleEnseignant {
		return &domain.UnauthorizedError{Message: "suppression réservée à l'enseignant (owner) ou à l'ADMIN"}
	}
	return uc.alignementRepo.Delete(ctx, documentID, alignementID)
}

// ============================================================
// SUGGESTIONS (flux P3 §1 : l'IA propose — retrieval déterministe)
// ============================================================

// recoupementTextuel — P3 v1 : contenance mutuelle, casse ignorée
// (même règle que la fonction SQL conformite_referentiels_etablissement —
// dupliquée volontairement : une règle Go pour le retrieval, une règle SQL
// pour l'agrégat, documentées ensemble).
func recoupementTextuel(a, b string) bool {
	la, lb := strings.ToLower(strings.TrimSpace(a)), strings.ToLower(strings.TrimSpace(b))
	if la == "" || lb == "" {
		return false
	}
	return strings.Contains(la, lb) || strings.Contains(lb, la)
}

// Suggestions — retrieval sur les thèmes : score = 2×thèmes du support
// recoupés + 1×sujets de chapitres recoupés. Score 0 = non proposé ;
// déjà aligné = marqué (l'UI le distingue sans le re-proposer en actif).
func (uc *AlignementUseCase) Suggestions(ctx context.Context, claims db.SessionClaims, documentID string) ([]*domain.OuvrageSuggestion, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "propositions réservées à l'enseignant (owner) ou à l'ADMIN"}
	}

	mat, err := uc.alignementRepo.MateriauPourSuggestions(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if err := uc.gateOwnerDocument(claims, mat); err != nil {
		return nil, err
	}

	dejaAligne := make(map[string]bool, len(mat.DejaAligneIDs))
	for _, id := range mat.DejaAligneIDs {
		dejaAligne[id] = true
	}

	var out []*domain.OuvrageSuggestion
	for _, o := range mat.Ouvrages {
		themesOuvrage := parseThemesOuvrage(o.Themes)
		if len(themesOuvrage) == 0 {
			continue // rien à recouper — pas de fausse « IA qui devine »
		}
		score := 0
		var communs []string
		for _, theme := range mat.ThemesSupport {
			for _, th := range themesOuvrage {
				if recoupementTextuel(theme, th) {
					score += 2
					communs = append(communs, theme)
					break
				}
			}
		}
		for _, sujet := range mat.SujetsSupport {
			for _, th := range themesOuvrage {
				if recoupementTextuel(sujet, th) {
					score++
					break
				}
			}
		}
		if score <= 0 {
			continue
		}
		if communs == nil {
			communs = []string{}
		}
		out = append(out, &domain.OuvrageSuggestion{
			Ouvrage:       o,
			Score:         score,
			ThemesCommuns: communs,
			DejaAligne:    dejaAligne[o.ID],
		})
	}

	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Score != out[j].Score {
			return out[i].Score > out[j].Score
		}
		return out[i].Ouvrage.Titre < out[j].Ouvrage.Titre
	})
	if len(out) > maxSuggestions {
		out = out[:maxSuggestions]
	}
	if out == nil {
		out = []*domain.OuvrageSuggestion{}
	}
	return out, nil
}

// parseThemesOuvrage — Themes TEXT-JSON → []string (tolérant, pattern
// parseJSONArrayText du repo ; dupliqué côté usecase pour la clarté).
func parseThemesOuvrage(raw *string) []string {
	if raw == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(trimmed), &out); err != nil {
		return nil
	}
	return out
}

// ============================================================
// BIBLIOGRAPHIE (flux P3 §3 : bénéfice immédiat et personnel)
// ============================================================

// Bibliographie — générée depuis les alignements du support. Tous rôles
// etab : le materiau (RLS Document_select) contrôle la visibilité du
// support — owner / RESP etab / ADMIN / étudiant dont la filière couvre
// l'UE du support.
func (uc *AlignementUseCase) Bibliographie(ctx context.Context, claims db.SessionClaims, documentID string) (*domain.BibliographieResult, error) {
	mat, err := uc.alignementRepo.MateriauPourSuggestions(ctx, documentID)
	if err != nil {
		return nil, err // 404 si invisible
	}

	alignements, err := uc.alignementRepo.ListByDocument(ctx, documentID)
	if err != nil {
		return nil, err
	}

	result := &domain.BibliographieResult{
		DocumentID: documentID,
		NomFichier: mat.NomFichier,
		References: []domain.BibliographieReference{},
	}
	for _, a := range alignements {
		if a.Ouvrage == nil {
			continue // ouvrage masqué : la référence ne peut pas être citée
		}
		result.References = append(result.References, domain.BibliographieReference{
			AlignementID: a.ID,
			Note:         a.Note,
			Ouvrage:      a.Ouvrage,
			Section:      a.Section,
			CreeLe:       a.CreatedAt,
		})
	}
	return result, nil
}

// ============================================================
// CONFORMITÉ (flux P3 §4 : audit de direction)
// ============================================================

// ConformiteEtablissement — RESP/ADMIN ; un non-ADMIN ne sonde que SON
// établissement (pattern ActiviteEtablissement P2 ; la fonction SQL
// re-vérifie sur les claims — defense in depth).
func (uc *AlignementUseCase) ConformiteEtablissement(ctx context.Context, claims db.SessionClaims, etablissementID string) ([]*domain.ConformiteSupport, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleResponsable && role != domain.RoleAdmin {
		return nil, &domain.UnauthorizedError{Message: "audit de conformité réservé aux RESPONSABLE et ADMIN"}
	}
	if role != domain.RoleAdmin && claims.EtablissementID != etablissementID {
		return nil, &domain.UnauthorizedError{Message: "audit limité à votre établissement"}
	}
	if etablissementID == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "établissement requis"}
	}
	return uc.alignementRepo.ConformiteEtablissement(ctx, etablissementID)
}
