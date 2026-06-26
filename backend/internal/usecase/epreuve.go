// Package usecase — logique métier Epreuves + Questions.
package usecase

import (
	"context"
	"fmt"
	"strings"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// ============================================================
// QUESTION
// ============================================================

// QuestionUseCase implémente les cas d'usage des questions.
type QuestionUseCase struct {
	questionRepo domain.QuestionRepository
}

// NewQuestionUseCase crée un nouveau QuestionUseCase.
func NewQuestionUseCase(questionRepo domain.QuestionRepository) *QuestionUseCase {
	return &QuestionUseCase{questionRepo: questionRepo}
}

// List liste les questions paginées avec tenant scoping.
func (uc *QuestionUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.QuestionListParams) (*domain.QuestionListResult, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}

	// Tenant scoping
	etabScope := ""
	switch role {
	case domain.RoleEnseignant:
		// ENSEIGNANT : scope à son établissement (ou par userId si fourni)
		etabScope = claims.EtablissementID
	case domain.RoleResponsable:
		etabScope = claims.EtablissementID
		if params.UserID != "" {
			// Le userId doit appartenir à son établissement (vérifié par RLS)
		}
	case domain.RoleAdmin:
		// ADMIN : pas de scope par défaut (RLS filtre via EtablissementAccess)
	}

	return uc.questionRepo.List(ctx, params, etabScope)
}

// GetByID récupère une question par ID.
func (uc *QuestionUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.Question, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.questionRepo.FindByID(ctx, id)
}

// Create crée une question.
func (uc *QuestionUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateQuestionInput) (*domain.Question, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if !domain.ValidTypesQuestion[input.Type] {
		return nil, &domain.ValidationError{Field: "type", Message: "type invalide"}
	}
	if input.Enonce == "" {
		return nil, &domain.ValidationError{Field: "enonce", Message: "requis"}
	}
	if input.Difficulte != "" && !domain.ValidDifficultes[input.Difficulte] {
		return nil, &domain.ValidationError{Field: "difficulte", Message: "difficulté invalide"}
	}

	// AuteurId : ENSEIGNANT force à user.id, RESPONSABLE/ADMIN peuvent spécifier
	auteurID := claims.UserID
	if input.AuteurID != nil && *input.AuteurID != "" && role != domain.RoleEnseignant {
		auteurID = *input.AuteurID
	}

	return uc.questionRepo.Create(ctx, input, auteurID)
}

// Update met à jour une question (general update ou action valider/devalider).
func (uc *QuestionUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateQuestionInput) (*domain.Question, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.Difficulte != nil && !domain.ValidDifficultes[*input.Difficulte] {
		return nil, &domain.ValidationError{Field: "difficulte", Message: "difficulté invalide"}
	}
	return uc.questionRepo.Update(ctx, id, input)
}

// SoftDelete déplace une question vers la corbeille.
func (uc *QuestionUseCase) SoftDelete(ctx context.Context, claims db.SessionClaims, id string) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.questionRepo.SoftDelete(ctx, id)
}

// BatchHardDelete supprime définitivement plusieurs questions.
func (uc *QuestionUseCase) BatchHardDelete(ctx context.Context, claims db.SessionClaims, ids []string) (int, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return 0, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if len(ids) == 0 {
		return 0, &domain.ValidationError{Field: "ids", Message: "non vide requis"}
	}
	return uc.questionRepo.BatchHardDelete(ctx, ids)
}

// ============================================================
// EPREUVE
// ============================================================

// EpreuveUseCase implémente les cas d'usage des épreuves.
type EpreuveUseCase struct {
	epreuveRepo domain.EpreuveRepository
}

// NewEpreuveUseCase crée un nouveau EpreuveUseCase.
func NewEpreuveUseCase(epreuveRepo domain.EpreuveRepository) *EpreuveUseCase {
	return &EpreuveUseCase{epreuveRepo: epreuveRepo}
}

// List liste les épreuves.
func (uc *EpreuveUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.EpreuveListParams) ([]*domain.Epreuve, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant && role != domain.RoleEtudiant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}

	// Multi-statut: ?statut=TERMINEE,CLOTUREE
	if len(params.Statuts) == 0 && params.Search != "" {
		// search peut contenir des statuts séparés par virgule si passé directement
	}

	// ENSEIGNANT : force enseignantId = user.id
	if role == domain.RoleEnseignant && params.EnseignantID == "" {
		params.EnseignantID = claims.UserID
	}
	// ETUDIANT : force etudiantId = user.id
	if role == domain.RoleEtudiant && params.EtudiantID == "" {
		params.EtudiantID = claims.UserID
	}

	return uc.epreuveRepo.List(ctx, params)
}

// GetByID récupère une épreuve par ID.
func (uc *EpreuveUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.Epreuve, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant && role != domain.RoleEtudiant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.epreuveRepo.FindByID(ctx, id)
}

// Create crée une épreuve (statut forcé BROUILLON).
func (uc *EpreuveUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateEpreuveInput) (*domain.Epreuve, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.EnseignantID == "" {
		return nil, &domain.ValidationError{Field: "enseignantId", Message: "requis"}
	}
	if input.Titre == "" {
		return nil, &domain.ValidationError{Field: "titre", Message: "requis"}
	}
	if input.Duree <= 0 {
		return nil, &domain.ValidationError{Field: "duree", Message: "doit être positif"}
	}
	if input.DateDebut == "" || input.DateFin == "" {
		return nil, &domain.ValidationError{Field: "dates", Message: "dateDebut et dateFin requises"}
	}
	if input.UniteEnseignementID == nil || *input.UniteEnseignementID == "" {
		return nil, &domain.ValidationError{Field: "uniteEnseignementId", Message: "requis"}
	}
	// ENSEIGNANT : force enseignantId = user.id
	if role == domain.RoleEnseignant && input.EnseignantID != claims.UserID {
		return nil, &domain.UnauthorizedError{Message: "vous ne pouvez créer une épreuve que pour vous-même"}
	}
	// Validation enums
	if input.SessionExamen != "" && !domain.ValidSessionsExamen[input.SessionExamen] {
		return nil, &domain.ValidationError{Field: "sessionExamen", Message: "session invalide"}
	}
	if input.GenerationMode != "" && !domain.ValidModesGeneration[input.GenerationMode] {
		input.GenerationMode = domain.ModeManuelle
	}

	return uc.epreuveRepo.Create(ctx, input)
}

// Update met à jour une épreuve (action state machine ou general update).
func (uc *EpreuveUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateEpreuveInput) (*domain.Epreuve, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	// Validation enums si fournis
	if input.SessionExamen != nil && !domain.ValidSessionsExamen[*input.SessionExamen] {
		return nil, &domain.ValidationError{Field: "sessionExamen", Message: "session invalide"}
	}
	if input.Statut != nil && !domain.ValidStatutsEpreuve[*input.Statut] {
		return nil, &domain.ValidationError{Field: "statut", Message: "statut invalide"}
	}
	return uc.epreuveRepo.Update(ctx, id, input)
}

// SoftDelete déplace une épreuve vers la corbeille (refuse si EN_COURS).
func (uc *EpreuveUseCase) SoftDelete(ctx context.Context, claims db.SessionClaims, id string) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.epreuveRepo.SoftDelete(ctx, id)
}

// ListQuestions liste les questions d'une épreuve.
func (uc *EpreuveUseCase) ListQuestions(ctx context.Context, claims db.SessionClaims, epreuveID string) ([]*domain.EpreuveQuestion, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant && role != domain.RoleEtudiant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.epreuveRepo.ListQuestions(ctx, epreuveID)
}

// ParseMultiStatut parse un paramètre ?statut=A,B,C en slice.
func ParseMultiStatut(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	var result []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

// ValidateAccessForEtablissement helper (placeholder, étendu plus tard).
func ValidateEtablissementAccess(claims db.SessionClaims, etablissementID string) error {
	if claims.Role == "ADMIN" {
		return nil
	}
	if claims.EtablissementID != etablissementID {
		return fmt.Errorf("hors de votre établissement")
	}
	return nil
}
