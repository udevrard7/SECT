// Package usecase — logique métier Filieres + UE + EnseignantFiliere + AnneeAcademique.
package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/repository"
)

// ============================================================
// FILIERE
// ============================================================

// FiliereUseCase implémente les cas d'usage des filières.
type FiliereUseCase struct {
	filiereRepo  domain.FiliereRepository
	quotaChecker domain.QuotaChecker // SECT-QUOTA-GUARDS : nil = pas de vérification
}

// NewFiliereUseCase crée un nouveau FiliereUseCase.
// quotaChecker est optionnel (nil = pas de vérification de quota).
func NewFiliereUseCase(filiereRepo domain.FiliereRepository, quotaChecker domain.QuotaChecker) *FiliereUseCase {
	return &FiliereUseCase{filiereRepo: filiereRepo, quotaChecker: quotaChecker}
}

// List liste les filières avec tenant scoping.
func (uc *FiliereUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.FiliereListParams) ([]*domain.Filiere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	// RESPONSABLE : auto-scoped à son établissement
	if role == domain.RoleResponsable || role == domain.RoleEnseignant {
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
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.filiereRepo.FindByID(ctx, id)
}

// Create crée une filière.
func (uc *FiliereUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateFiliereInput) (*domain.Filiere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.Nom == "" {
		return nil, &domain.ValidationError{Field: "nom", Message: "requis"}
	}
	// RESPONSABLE : force etablissementId au sien
	if role == domain.RoleResponsable || role == domain.RoleEnseignant {
		if claims.EtablissementID == "" {
			return nil, &domain.UnauthorizedError{Message: "responsable sans établissement"}
		}
		input.EtablissementID = claims.EtablissementID
	}
	if input.EtablissementID == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "requis"}
	}
	// SECT-QUOTA-GUARDS : vérifier le quota de filières avant création.
	if uc.quotaChecker != nil {
		if err := uc.quotaChecker.CheckFilieresQuota(ctx, input.EtablissementID); err != nil {
			return nil, err
		}
	}
	return uc.filiereRepo.Create(ctx, input)
}

// Update met à jour une filière (ownership check).
func (uc *FiliereUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateFiliereInput) (*domain.Filiere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	// Ownership check pour RESPONSABLE
	if role == domain.RoleResponsable || role == domain.RoleEnseignant {
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
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	existing, err := uc.filiereRepo.FindByID(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	if role == domain.RoleResponsable || role == domain.RoleEnseignant {
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

// HardDelete supprime DÉFINITIVEMENT une filière (DELETE réel en DB).
//
// Safety checks :
//  1. Rôle ADMIN ou RESPONSABLE.
//  2. Ownership (RESPONSABLE doit être responsable ou même établissement).
//  3. canDelete == true (pas d'étudiants actifs, pas d'UEs actives). Sinon
//     retourne ValidationError pour empêcher la suppression de données liées.
//
// Retourne le nom de la filière supprimée (pour le toast frontend).
func (uc *FiliereUseCase) HardDelete(ctx context.Context, claims db.SessionClaims, id string) (string, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return "", &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}

	existing, err := uc.filiereRepo.FindByID(ctx, id)
	if err != nil {
		return "", err
	}

	if role == domain.RoleResponsable || role == domain.RoleEnseignant {
		if (existing.ResponsableID == nil || *existing.ResponsableID != claims.UserID) &&
			existing.EtablissementID != claims.EtablissementID {
			return "", &domain.UnauthorizedError{Message: "vous n'êtes pas responsable de cette filière"}
		}
	}

	// Safety check : empêcher le hard-delete si dépendances actives.
	deps, err := uc.filiereRepo.GetFiliereDependencies(ctx, id)
	if err != nil {
		return "", fmt.Errorf("vérifier dépendances: %w", err)
	}
	if !deps.CanDelete {
		return "", &domain.ValidationError{
			Field:   "filiere",
			Message: fmt.Sprintf("suppression impossible : %d étudiant(s) et %d UE(s) actifs. Désactivez-la d'abord.", deps.EtudiantsCount, deps.UEsCount),
		}
	}

	if err := uc.filiereRepo.HardDelete(ctx, id); err != nil {
		return "", err
	}
	return existing.Nom, nil
}

// GetDependencies récupère les dépendances actives d'une filière (pour
// l'endpoint GET /api/filieres/{id}/dependencies). Le frontend l'utilise dans
// handleOpenDelete pour afficher la preview « N étudiants, M UEs » et bloquer
// la confirmation si !CanDelete. BUGFIX (FILIERES-CRITICAL-FIX-1).
func (uc *FiliereUseCase) GetDependencies(ctx context.Context, claims db.SessionClaims, id string) (*domain.FiliereDependencies, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.filiereRepo.GetFiliereDependencies(ctx, id)
}

// BulkUpdate met à jour le statut de plusieurs filières.
func (uc *FiliereUseCase) BulkUpdate(ctx context.Context, claims db.SessionClaims, input domain.BulkFiliereInput) (int, []*domain.Filiere, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
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
	if role == domain.RoleResponsable || role == domain.RoleEnseignant {
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
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
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
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
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
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.ueRepo.SoftDelete(ctx, id)
}

// HardDelete supprime définitivement une UE (DELETE réel, irréversible).
// Les entités liées en CASCADE (Affectation, Devoir, ValidationUE,
// UniteEnseignementFiliere) seront supprimées automatiquement.
// Idéalement le frontend devrait avertir l'utilisateur via GetDependencies
// avant d'appeler ce endpoint.
func (uc *UEUseCase) HardDelete(ctx context.Context, claims db.SessionClaims, id string) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return &domain.ValidationError{Field: "id", Message: "requis"}
	}
	return uc.ueRepo.HardDelete(ctx, id)
}

// GetDependencies récupère les dépendances d'une UE (avant suppression).
// PROG-ACAD-CRITICAL-FIX-1 (BUG #1).
func (uc *UEUseCase) GetDependencies(ctx context.Context, claims db.SessionClaims, id string) (*domain.UEDependencies, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
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
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
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
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
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
//
// SECT-ANNEE-AUDITLOG-1 : authRepo ajouté pour journaliser chaque mutation
// (Create/Update/SoftDelete/HardDelete) dans AuditLog. Optionnel (nil = pas
// d'audit, pour les tests unitaires qui ne veulent pas de DB AuditLog).
type AnneeUseCase struct {
	anneeRepo domain.AnneeAcademiqueRepository
	authRepo  *repository.AuthRepository
}

// NewAnneeUseCase crée un nouveau usecase.
// authRepo est optionnel (nil = pas de journalisation AuditLog).
func NewAnneeUseCase(anneeRepo domain.AnneeAcademiqueRepository, authRepo *repository.AuthRepository) *AnneeUseCase {
	return &AnneeUseCase{anneeRepo: anneeRepo, authRepo: authRepo}
}

// auditAnnee journalise une mutation d'année académique dans AuditLog.
// Non bloquant : si authRepo est nil OU si CreateAuditLog échoue, on log une
// warning/error mais on ne fait PAS échouer la mutation (la mutation est la
// source de vérité ; l'audit est observabilité).
//
// SECT-ANNEE-AUDITLOG-1.
//
// Param details : map[string]any — sera marshalée en JSON. Les champs id,
// libelle, etablissementId sont auto-ajoutés depuis l'annee s'ils ne sont pas
// déjà présents (pour éviter la redondance côté appelant).
func (uc *AnneeUseCase) auditAnnee(ctx context.Context, claims db.SessionClaims, action string, annee *domain.AnneeAcademique, details map[string]any) {
	if uc.authRepo == nil {
		slog.Warn("AnneeUseCase: authRepo nil, audit annee skip", "action", action, "anneeId", annee.ID)
		return
	}
	if details == nil {
		details = map[string]any{}
	}
	if _, ok := details["id"]; !ok {
		details["id"] = annee.ID
	}
	if _, ok := details["libelle"]; !ok {
		details["libelle"] = annee.Libelle
	}
	if _, ok := details["etablissementId"]; !ok && annee.EtablissementID != "" {
		details["etablissementId"] = annee.EtablissementID
	}
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		slog.Error("AnneeUseCase: marshal audit details failed", "action", action, "anneeId", annee.ID, "error", err)
		return
	}
	userID := claims.UserID
	etabID := claims.EtablissementID
	if etabID == "" && annee.EtablissementID != "" {
		etabID = annee.EtablissementID
	}
	entry := &domain.AuditLogEntry{
		UserID:          &userID,
		Action:          action,
		Entite:          "AnneeAcademique",
		EntiteID:        &annee.ID,
		Details:         string(detailsJSON),
		AdresseIP:       "academique-api",
		EtablissementID: &etabID,
		Reason:          "Mutation d'année académique",
	}
	if err := uc.authRepo.CreateAuditLog(ctx, entry); err != nil {
		slog.Error("AnneeUseCase: audit échec",
			"action", action, "anneeId", annee.ID, "error", err)
	}
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
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.Libelle == "" || input.DateDebut == "" || input.DateFin == "" || input.EtablissementID == "" {
		return nil, &domain.ValidationError{Field: "all", Message: "libelle, dateDebut, dateFin et etablissementId requis"}
	}
	// PROG-ACAD-CRITICAL-FIX-1 (BUG #8) : validation dateDebut < dateFin
	debut, errD := time.Parse("2006-01-02", input.DateDebut[:min(10, len(input.DateDebut))])
	fin, errF := time.Parse("2006-01-02", input.DateFin[:min(10, len(input.DateFin))])
	if errD != nil || errF != nil {
		return nil, &domain.ValidationError{Field: "dates", Message: "format de date invalide (attendu YYYY-MM-DD)"}
	}
	if !fin.After(debut) {
		return nil, &domain.ValidationError{Field: "dateFin", Message: "la date de fin doit être après la date de début"}
	}
	// RESPONSABLE : force etablissementId au sien
	if role == domain.RoleResponsable || role == domain.RoleEnseignant {
		input.EtablissementID = claims.EtablissementID
	}
	annee, err := uc.anneeRepo.Create(ctx, input)
	if err != nil {
		return nil, err
	}
	// SECT-ANNEE-AUDITLOG-1 : journaliser la création (non bloquant).
	uc.auditAnnee(ctx, claims, domain.AuditActionAnneeCreated, annee, map[string]any{
		"libelle":         annee.Libelle,
		"dateDebut":       annee.DateDebut.Format("2006-01-02"),
		"dateFin":         annee.DateFin.Format("2006-01-02"),
		"etablissementId": annee.EtablissementID,
	})
	return annee, nil
}

// FindByID récupère une année académique par ID.
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9).
func (uc *AnneeUseCase) FindByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.AnneeAcademique, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return nil, &domain.ValidationError{Field: "id", Message: "requis"}
	}
	return uc.anneeRepo.FindByID(ctx, id)
}

// Update modifie une année académique.
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9).
// SECT-ANNEE-DATE-FIX-1 : ajout validation dateDebut < dateFin si les deux
// sont fournis (avant, aucune validation sur Update — on pouvait saisir
// dateDebut >= dateFin).
func (uc *AnneeUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateAnneeInput) (*domain.AnneeAcademique, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return nil, &domain.ValidationError{Field: "id", Message: "requis"}
	}
	// Validation des dates si fournies. On doit charger l'année existante pour
	// comparer avec les valeurs non modifiées (ex: si seul dateDebut est fourni,
	// on compare avec le dateFin existant).
	if input.DateDebut != nil || input.DateFin != nil {
		existing, err := uc.anneeRepo.FindByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("Update: load existing: %w", err)
		}
		// existing.DateDebut/DateFin sont des time.Time ; input.DateDebut/DateFin
		// sont des *string (format YYYY-MM-DD depuis le frontend).
		debut := existing.DateDebut
		fin := existing.DateFin
		if input.DateDebut != nil {
			parsed, errD := time.Parse("2006-01-02", (*input.DateDebut)[:min(10, len(*input.DateDebut))])
			if errD != nil {
				return nil, &domain.ValidationError{Field: "dateDebut", Message: "format de date invalide (attendu YYYY-MM-DD)"}
			}
			debut = parsed
		}
		if input.DateFin != nil {
			parsed, errF := time.Parse("2006-01-02", (*input.DateFin)[:min(10, len(*input.DateFin))])
			if errF != nil {
				return nil, &domain.ValidationError{Field: "dateFin", Message: "format de date invalide (attendu YYYY-MM-DD)"}
			}
			fin = parsed
		}
		if !fin.After(debut) {
			return nil, &domain.ValidationError{Field: "dateFin", Message: "la date de fin doit être après la date de début"}
		}
	}
	updated, err := uc.anneeRepo.Update(ctx, id, input)
	if err != nil {
		return nil, err
	}
	// SECT-ANNEE-AUDITLOG-1 : journaliser la modification (non bloquant).
	// details.changes ne contient que les champs réellement fournis dans
	// l'input (les *string/*bool nil sont omis) — c'est le diff coté client.
	changes := map[string]any{}
	if input.Libelle != nil {
		changes["libelle"] = *input.Libelle
	}
	if input.DateDebut != nil {
		changes["dateDebut"] = *input.DateDebut
	}
	if input.DateFin != nil {
		changes["dateFin"] = *input.DateFin
	}
	if input.Actif != nil {
		changes["actif"] = *input.Actif
	}
	uc.auditAnnee(ctx, claims, domain.AuditActionAnneeUpdated, updated, map[string]any{
		"changes": changes,
	})
	return updated, nil
}

// SoftDelete désactive une année académique (actif=false).
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9).
func (uc *AnneeUseCase) SoftDelete(ctx context.Context, claims db.SessionClaims, id string) (*domain.AnneeAcademique, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return nil, &domain.ValidationError{Field: "id", Message: "requis"}
	}
	annee, err := uc.anneeRepo.SoftDelete(ctx, id)
	if err != nil {
		return nil, err
	}
	// SECT-ANNEE-AUDITLOG-1 : journaliser la désactivation (non bloquant).
	uc.auditAnnee(ctx, claims, domain.AuditActionAnneeSoftDeleted, annee, map[string]any{
		"id":      annee.ID,
		"libelle": annee.Libelle,
	})
	return annee, nil
}

// HardDelete supprime définitivement une année académique (DELETE réel,
// irréversible). Les FKs CASCADE sur Inscription/ValidationUE/PromotionBatch
// DÉTRUIRONT ces lignes (depuis migrations 000086 + 000087). Les FKs SET NULL
// sur Epreuve/Etablissement.anneeAcademiqueCouranteId perdront leur référence.
//
// SECT-ANNEE-HARDDELETE-SAFE-1 : avant de supprimer, on vérifie les dépendances
// via GetDependencies. Si AU MOINS UNE dépendance est non nulle, on renvoie un
// *domain.ConflictError (HTTP 409) listant les counts dans le message — pour
// empêcher la perte catastrophique de données (inscriptions étudiantes,
// validations, historique des clôtures). Le frontend peut appeler
// GET /api/annees-academiques/{id}/dependencies pour prévisualiser les counts
// et afficher un avertissement avant que l'utilisateur ne confirme.
//
// Si toutes les dépendances sont nulles (CanHardDelete=true), on procède au
// DELETE réel via anneeRepo.HardDelete.
func (uc *AnneeUseCase) HardDelete(ctx context.Context, claims db.SessionClaims, id string) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return &domain.ValidationError{Field: "id", Message: "requis"}
	}

	// Safety check : empêcher le hard-delete si dépendances non nulles.
	deps, err := uc.anneeRepo.GetDependencies(ctx, id)
	if err != nil {
		return fmt.Errorf("HardDelete: vérifier dépendances: %w", err)
	}
	if !deps.CanHardDelete {
		return &domain.ConflictError{
			Message: fmt.Sprintf(
				"Impossible de supprimer cette année : elle possède %d inscription(s), "+
					"%d validation(s) UE, %d batch(s) de clôture, %d épreuve(s), "+
					"%d établissement(s) l'utilisant comme année courante. "+
					"Désactivez-la (actif=false) au lieu de la supprimer.",
				deps.Inscriptions, deps.ValidationsUE, deps.PromotionBatches,
				deps.Epreuves, deps.Etablissements,
			),
		}
	}

	// SECT-ANNEE-AUDITLOG-1 : on charge l'année AVANT la suppression pour
	// récupérer son libelle (après le DELETE, FindByID ne renverrait plus
	// rien). Le check deps ci-dessus garantit que les counts ci-dessous
	// sont tous 0 (CanHardDelete=true), mais on les inclut quand même
	// dans le details pour attester formellement qu'aucune dépendance
	// n'a été détruite.
	annee, err := uc.anneeRepo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("HardDelete: load existing: %w", err)
	}
	if err := uc.anneeRepo.HardDelete(ctx, id); err != nil {
		return err
	}
	uc.auditAnnee(ctx, claims, domain.AuditActionAnneeHardDeleted, annee, map[string]any{
		"id":      annee.ID,
		"libelle": annee.Libelle,
		"dependenciesDestroyed": map[string]int{
			"inscriptions":     deps.Inscriptions,
			"validationsUE":    deps.ValidationsUE,
			"promotionBatches": deps.PromotionBatches,
			"epreuves":         deps.Epreuves,
			"etablissements":   deps.Etablissements,
		},
	})
	return nil
}

// GetDependencies récupère les dépendances d'une année académique (5 counts +
// flag CanHardDelete) pour l'endpoint GET /api/annees-academiques/{id}/dependencies.
// SECT-ANNEE-HARDDELETE-SAFE-1.
func (uc *AnneeUseCase) GetDependencies(ctx context.Context, claims db.SessionClaims, id string) (*domain.AnneeDependencies, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if id == "" {
		return nil, &domain.ValidationError{Field: "id", Message: "requis"}
	}
	return uc.anneeRepo.GetDependencies(ctx, id)
}
