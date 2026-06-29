// Package usecase — logique métier Filieres + UE + EnseignantFiliere + AnneeAcademique.
package usecase

import (
	"context"
	"fmt"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// ============================================================
// FILIERE
// ============================================================

// FiliereUseCase implémente les cas d'usage des filières.
type FiliereUseCase struct {
	filiereRepo domain.FiliereRepository
}

// NewFiliereUseCase crée un nouveau FiliereUseCase.
func NewFiliereUseCase(filiereRepo domain.FiliereRepository) *FiliereUseCase {
	return &FiliereUseCase{filiereRepo: filiereRepo}
}

// List liste les filières avec tenant scoping.
func (uc *FiliereUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.FiliereListParams) ([]*domain.Filiere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	// RESPONSABLE : auto-scoped à son établissement
	if role == domain.RoleResponsable {
		if claims.EtablissementID == "" {
			return []*domain.Filiere{}, nil
		}
		params.EtablissementID = claims.EtablissementID
	}
	return uc.filiereRepo.List(ctx, params)
}

// GetByID récupère une filière par ID.
func (uc *FiliereUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.Filiere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.filiereRepo.FindByID(ctx, id)
}

// Create crée une filière.
func (uc *FiliereUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateFiliereInput) (*domain.Filiere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.Nom == "" {
		return nil, &domain.ValidationError{Field: "nom", Message: "requis"}
	}
	// RESPONSABLE : force etablissementId au sien
	if role == domain.RoleResponsable {
		if claims.EtablissementID == "" {
			return nil, &domain.UnauthorizedError{Message: "responsable sans établissement"}
		}
		input.EtablissementID = claims.EtablissementID
	}
	if input.EtablissementID == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "requis"}
	}
	return uc.filiereRepo.Create(ctx, input)
}

// Update met à jour une filière (ownership check).
func (uc *FiliereUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateFiliereInput) (*domain.Filiere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	// Ownership check pour RESPONSABLE
	if role == domain.RoleResponsable {
		existing, err := uc.filiereRepo.FindByID(ctx, id)
		if err != nil {
			return nil, err
		}
		if (existing.ResponsableID == nil || *existing.ResponsableID != claims.UserID) &&
			existing.EtablissementID != claims.EtablissementID {
			return nil, &domain.UnauthorizedError{Message: "vous n'êtes pas responsable de cette filière"}
		}
	}
	return uc.filiereRepo.Update(ctx, id, input)
}

// SoftDelete désactive une filière.
func (uc *FiliereUseCase) SoftDelete(ctx context.Context, claims db.SessionClaims, id string) (*domain.Filiere, *domain.Filiere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	existing, err := uc.filiereRepo.FindByID(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	if role == domain.RoleResponsable {
		if (existing.ResponsableID == nil || *existing.ResponsableID != claims.UserID) &&
			existing.EtablissementID != claims.EtablissementID {
			return nil, nil, &domain.UnauthorizedError{Message: "vous n'êtes pas responsable de cette filière"}
		}
	}
	updated, err := uc.filiereRepo.SoftDelete(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	return existing, updated, nil
}

// GetDependencies récupère les dépendances actives d'une filière (pour
// l'endpoint GET /api/filieres/{id}/dependencies). Le frontend l'utilise dans
// handleOpenDelete pour afficher la preview « N étudiants, M UEs » et bloquer
// la confirmation si !CanDelete. BUGFIX (FILIERES-CRITICAL-FIX-1).
func (uc *FiliereUseCase) GetDependencies(ctx context.Context, claims db.SessionClaims, id string) (*domain.FiliereDependencies, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.filiereRepo.GetFiliereDependencies(ctx, id)
}

// BulkUpdate met à jour le statut de plusieurs filières.
func (uc *FiliereUseCase) BulkUpdate(ctx context.Context, claims db.SessionClaims, input domain.BulkFiliereInput) (int, []*domain.Filiere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return 0, nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if len(input.IDs) == 0 {
		return 0, nil, &domain.ValidationError{Field: "ids", Message: "non vide requis"}
	}
	actif := input.Action == "activate"
	if input.Action == "delete" {
		actif = false
	}
	if input.Action != "activate" && input.Action != "deactivate" && input.Action != "delete" {
		return 0, nil, &domain.ValidationError{Field: "action", Message: "doit être activate, deactivate ou delete"}
	}

	// RESPONSABLE : scoped à son établissement
	etabScope := ""
	if role == domain.RoleResponsable {
		etabScope = claims.EtablissementID
	}

	count, err := uc.filiereRepo.BulkUpdate(ctx, input.IDs, actif, etabScope)
	if err != nil {
		return 0, nil, err
	}

	// Re-fetch les filières mises à jour
	filieres, err := uc.filiereRepo.List(ctx, domain.FiliereListParams{})
	if err != nil {
		return count, nil, err
	}
	// Filtrer pour ne garder que les IDs demandés
	idSet := make(map[string]bool)
	for _, id := range input.IDs {
		idSet[id] = true
	}
	var updated []*domain.Filiere
	for _, f := range filieres {
		if idSet[f.ID] {
			updated = append(updated, f)
		}
	}
	return count, updated, nil
}

// ============================================================
// UNITE ENSEIGNEMENT
// ============================================================

// UEUseCase implémente les cas d'usage des UEs.
type UEUseCase struct {
	ueRepo domain.UERepository
}

// NewUEUseCase crée un nouveau UEUseCase.
func NewUEUseCase(ueRepo domain.UERepository) *UEUseCase {
	return &UEUseCase{ueRepo: ueRepo}
}

// List liste les UEs (ADMIN/RESPONSABLE/ENSEIGNANT).
func (uc *UEUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.UEListParams) ([]*domain.UniteEnseignement, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.ueRepo.List(ctx, params)
}

// GetByID récupère une UE par ID.
func (uc *UEUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.UniteEnseignement, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.ueRepo.FindByID(ctx, id)
}

// Create crée une UE (ADMIN/RESPONSABLE).
func (uc *UEUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateUEInput) (*domain.UniteEnseignement, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.Code == "" {
		return nil, &domain.ValidationError{Field: "code", Message: "requis"}
	}
	if input.Nom == "" {
		return nil, &domain.ValidationError{Field: "nom", Message: "requis"}
	}
	if input.FiliereID == "" {
		return nil, &domain.ValidationError{Field: "filiereId", Message: "requis"}
	}
	if !domain.IsValidNiveau(input.Niveau) {
		return nil, &domain.ValidationError{Field: "niveau", Message: "niveau invalide"}
	}
	if input.Semestre != nil && *input.Semestre != 1 && *input.Semestre != 2 {
		return nil, &domain.ValidationError{Field: "semestre", Message: "doit être 1 ou 2"}
	}
	return uc.ueRepo.Create(ctx, input)
}

// Update met à jour une UE.
func (uc *UEUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateUEInput) (*domain.UniteEnseignement, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.Niveau != nil && !domain.IsValidNiveau(*input.Niveau) {
		return nil, &domain.ValidationError{Field: "niveau", Message: "niveau invalide"}
	}
	if input.Semestre != nil && *input.Semestre != 1 && *input.Semestre != 2 {
		return nil, &domain.ValidationError{Field: "semestre", Message: "doit être 1 ou 2"}
	}
	return uc.ueRepo.Update(ctx, id, input)
}

// SoftDelete désactive une UE.
func (uc *UEUseCase) SoftDelete(ctx context.Context, claims db.SessionClaims, id string) (*domain.UniteEnseignement, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.ueRepo.SoftDelete(ctx, id)
}

// GetDependencies récupère les dépendances d'une UE (avant suppression).
// PROG-ACAD-CRITICAL-FIX-1 (BUG #1).
func (uc *UEUseCase) GetDependencies(ctx context.Context, claims db.SessionClaims, id string) (*domain.UEDependencies, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return nil, &domain.ValidationError{Field: "id", Message: "requis"}
	}
	return uc.ueRepo.GetUEDependencies(ctx, id)
}

// ============================================================
// ENSEIGNANT FILIERE
// ============================================================

// EnseignantFiliereUseCase implémente les cas d'usage.
type EnseignantFiliereUseCase struct {
	efRepo domain.EnseignantFiliereRepository
}

// NewEnseignantFiliereUseCase crée un nouveau usecase.
func NewEnseignantFiliereUseCase(efRepo domain.EnseignantFiliereRepository) *EnseignantFiliereUseCase {
	return &EnseignantFiliereUseCase{efRepo: efRepo}
}

// List liste les assignations.
func (uc *EnseignantFiliereUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.EnseignantFiliereListParams) ([]*domain.EnseignantFiliere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	// ENSEIGNANT : ne voit que ses propres assignations
	if role == domain.RoleEnseignant {
		params.EnseignantID = claims.UserID
	}
	return uc.efRepo.List(ctx, params)
}

// Create crée une ou plusieurs assignations (supporte single + bulk).
func (uc *EnseignantFiliereUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateAssignmentInput) (*domain.EnseignantFiliere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.EnseignantID == "" {
		return nil, &domain.ValidationError{Field: "enseignantId", Message: "requis"}
	}
	if input.FiliereID == "" {
		return nil, &domain.ValidationError{Field: "filiereId", Message: "requis"}
	}
	if !domain.IsValidNiveau(input.Niveau) {
		return nil, &domain.ValidationError{Field: "niveau", Message: "niveau invalide"}
	}
	return uc.efRepo.Create(ctx, input)
}

// Delete supprime une assignation.
func (uc *EnseignantFiliereUseCase) Delete(ctx context.Context, claims db.SessionClaims, input domain.DeleteAssignmentInput) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.ID != nil && *input.ID != "" {
		return uc.efRepo.DeleteByID(ctx, *input.ID)
	}
	if input.EnseignantID != nil && input.FiliereID != nil && input.Niveau != nil {
		if !domain.IsValidNiveau(*input.Niveau) {
			return &domain.ValidationError{Field: "niveau", Message: "niveau invalide"}
		}
		return uc.efRepo.DeleteByComposite(ctx, *input.EnseignantID, *input.FiliereID, *input.Niveau)
	}
	return &domain.ValidationError{Field: "id", Message: "fournir {id} ou {enseignantId, filiereId, niveau}"}
}

// ============================================================
// ANNEE ACADEMIQUE
// ============================================================

// AnneeUseCase implémente les cas d'usage des années académiques.
type AnneeUseCase struct {
	anneeRepo domain.AnneeAcademiqueRepository
}

// NewAnneeUseCase crée un nouveau usecase.
func NewAnneeUseCase(anneeRepo domain.AnneeAcademiqueRepository) *AnneeUseCase {
	return &AnneeUseCase{anneeRepo: anneeRepo}
}

// List liste les années académiques d'un établissement.
func (uc *AnneeUseCase) List(ctx context.Context, claims db.SessionClaims, etablissementID string, actif *bool) ([]*domain.AnneeAcademique, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if etablissementID == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "requis"}
	}
	// RESPONSABLE/ENSEIGNANT : doit être leur établissement
	if role == domain.RoleResponsable || role == domain.RoleEnseignant {
		if etablissementID != claims.EtablissementID {
			return nil, &domain.UnauthorizedError{Message: "hors de votre établissement"}
		}
	}
	return uc.anneeRepo.List(ctx, etablissementID, actif)
}

// Create crée une année académique (ADMIN/RESPONSABLE).
func (uc *AnneeUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateAnneeInput) (*domain.AnneeAcademique, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.Libelle == "" || input.DateDebut == "" || input.DateFin == "" || input.EtablissementID == "" {
		return nil, &domain.ValidationError{Field: "all", Message: "libelle, dateDebut, dateFin et etablissementId requis"}
	}
	// RESPONSABLE : force etablissementId au sien
	if role == domain.RoleResponsable {
		input.EtablissementID = claims.EtablissementID
	}
	return uc.anneeRepo.Create(ctx, input)
}

// FindByID récupère une année académique par ID.
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9).
func (uc *AnneeUseCase) FindByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.AnneeAcademique, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return nil, &domain.ValidationError{Field: "id", Message: "requis"}
	}
	return uc.anneeRepo.FindByID(ctx, id)
}

// Update modifie une année académique.
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9).
func (uc *AnneeUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateAnneeInput) (*domain.AnneeAcademique, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return nil, &domain.ValidationError{Field: "id", Message: "requis"}
	}
	return uc.anneeRepo.Update(ctx, id, input)
}

// SoftDelete désactive une année académique (actif=false).
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9).
func (uc *AnneeUseCase) SoftDelete(ctx context.Context, claims db.SessionClaims, id string) (*domain.AnneeAcademique, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return nil, &domain.ValidationError{Field: "id", Message: "requis"}
	}
	return uc.anneeRepo.SoftDelete(ctx, id)
}

// ValidateAccessForEtablissement helper (sera étendu avec EtablissementAccess).
func ValidateAccessForEtablissement(claims db.SessionClaims, etablissementID string) error {
	if claims.Role == "ADMIN" {
		// TODO: check EtablissementAccess via repository
		return nil
	}
	if claims.EtablissementID != etablissementID {
		return fmt.Errorf("hors de votre établissement")
	}
	return nil
}
