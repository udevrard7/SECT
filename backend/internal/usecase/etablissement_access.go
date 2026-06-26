// Package usecase — logique métier EtablissementAccess.
package usecase

import (
	"context"
	"fmt"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// AccessUseCase implémente les cas d'usage liés aux accès établissements.
type AccessUseCase struct {
	accessRepo domain.EtablissementAccessRepository
}

// NewAccessUseCase crée un nouveau AccessUseCase.
func NewAccessUseCase(accessRepo domain.EtablissementAccessRepository) *AccessUseCase {
	return &AccessUseCase{accessRepo: accessRepo}
}

// List liste les demandes d'accès.
// ADMIN : voit ses propres demandes (filtrées par adminId si fourni).
// RESPONSABLE : voit les demandes de son établissement.
func (uc *AccessUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.AccessListParams) ([]*domain.EtablissementAccess, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}

	if role == domain.RoleResponsable {
		// RESPONSABLE ne voit que les demandes de son établissement
		params.EtablissementID = claims.EtablissementID
	}

	return uc.accessRepo.List(ctx, params)
}

// Create crée une demande d'accès.
func (uc *AccessUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateAccessInput) (*domain.EtablissementAccess, error) {
	// Validation
	if input.AdminID == "" {
		return nil, &domain.ValidationError{Field: "adminId", Message: "requis"}
	}
	if input.EtablissementID == "" {
		return nil, &domain.ValidationError{Field: "etablissementId", Message: "requis"}
	}
	if input.Motif == "" {
		return nil, &domain.ValidationError{Field: "motif", Message: "requis"}
	}

	// Auth check : ADMIN ou RESPONSABLE peut créer
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}

	return uc.accessRepo.Create(ctx, input)
}

// Update approuve/refuse/révoque une demande.
// ADMIN : peut tout faire.
// RESPONSABLE : peut approuver/refuser pour son établissement uniquement.
func (uc *AccessUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateAccessInput) (*domain.EtablissementAccess, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}

	// Valider le statut
	validStatuts := map[domain.AccessStatut]bool{
		domain.AccessApprouve: true,
		domain.AccessRefuse:   true,
		domain.AccessExpire:   true,
	}
	if !validStatuts[input.Statut] {
		return nil, &domain.ValidationError{Field: "statut", Message: "doit être APPROUVE, REFUSE ou EXPIRE"}
	}

	// RESPONSABLE : vérifier que la demande concerne son établissement
	if role == domain.RoleResponsable {
		existing, err := uc.accessRepo.FindByID(ctx, id)
		if err != nil {
			return nil, err
		}
		if existing.EtablissementID != claims.EtablissementID {
			return nil, &domain.UnauthorizedError{Message: "cette demande ne concerne pas votre établissement"}
		}
	}

	// ApprouvePar : default = current user
	if input.ApprouvePar == nil {
		ap := claims.UserID
		input.ApprouvePar = &ap
	}

	return uc.accessRepo.Update(ctx, id, input)
}

// CheckAccess vérifie si l'ADMIN courant a accès à un établissement.
func (uc *AccessUseCase) CheckAccess(ctx context.Context, claims db.SessionClaims, etablissementID string) (*domain.EtablissementAccess, error) {
	if claims.Role != string(domain.RoleAdmin) {
		return nil, &domain.UnauthorizedError{Message: "réservé aux ADMIN"}
	}
	// IDOR guard : un admin ne peut vérifier que son propre accès
	return uc.accessRepo.CheckAccess(ctx, claims.UserID, etablissementID)
}

// ListAuthorizedEtablissements retourne les établissements autorisés pour l'ADMIN courant.
func (uc *AccessUseCase) ListAuthorizedEtablissements(ctx context.Context, claims db.SessionClaims) ([]*domain.Etablissement, error) {
	if claims.Role != string(domain.RoleAdmin) {
		return nil, &domain.UnauthorizedError{Message: "réservé aux ADMIN"}
	}
	return uc.accessRepo.ListAuthorizedEtablissements(ctx, claims.UserID)
}

// ValidateAccessForEtablissement helper : vérifie qu'un admin a accès, sinon erreur.
func (uc *AccessUseCase) ValidateAccessForEtablissement(ctx context.Context, claims db.SessionClaims, etablissementID string) error {
	if claims.Role != string(domain.RoleAdmin) {
		return nil // non-admin : pas de check ici (RLS gère)
	}
	access, err := uc.accessRepo.CheckAccess(ctx, claims.UserID, etablissementID)
	if err != nil {
		return fmt.Errorf("check access: %w", err)
	}
	if access == nil {
		return &domain.UnauthorizedError{Message: "aucun accès autorisé à cet établissement"}
	}
	return nil
}
