// Package usecase — logique métier des établissements.
package usecase

import (
	"context"
	"fmt"

	"github.com/udevrard7/sect/apps/api/internal/db"
	"github.com/udevrard7/sect/apps/api/internal/domain"
)

// EtablissementUseCase implémente les cas d'usage liés aux établissements.
type EtablissementUseCase struct {
	etabRepo domain.EtablissementRepository
}

// NewEtablissementUseCase crée un nouveau EtablissementUseCase.
func NewEtablissementUseCase(etabRepo domain.EtablissementRepository) *EtablissementUseCase {
	return &EtablissementUseCase{etabRepo: etabRepo}
}

// List liste les établissements avec tenant scoping.
// - ADMIN : voit tous les établissements (RLS filtrera via EtablissementAccess)
// - RESPONSABLE : voit uniquement son établissement
func (uc *EtablissementUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.EtablissementListParams) ([]*domain.Etablissement, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.etabRepo.List(ctx, params)
}

// GetByID récupère un établissement par ID.
func (uc *EtablissementUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.Etablissement, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	// RLS filtre : ADMIN ne voit que s'il a accès, RESPONSABLE voit le sien
	return uc.etabRepo.FindByID(ctx, id)
}

// Create crée un établissement (ADMIN only).
func (uc *EtablissementUseCase) Create(ctx context.Context, claims db.SessionClaims, input domain.CreateEtablissementInput) (*domain.Etablissement, error) {
	if claims.Role != string(domain.RoleAdmin) {
		return nil, &domain.UnauthorizedError{Message: "seul un ADMIN peut créer un établissement"}
	}
	if input.Nom == "" {
		return nil, &domain.ValidationError{Field: "nom", Message: "requis"}
	}
	return uc.etabRepo.Create(ctx, input)
}

// Update met à jour un établissement.
// ADMIN : peut tout modifier (y compris pays, actif).
// RESPONSABLE : peut modifier son établissement uniquement (pas pays/actif).
func (uc *EtablissementUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateEtablissementInput) (*domain.Etablissement, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}

	// RESPONSABLE : restrictions
	if role == domain.RoleResponsable {
		if claims.EtablissementID != id {
			return nil, &domain.UnauthorizedError{Message: "vous ne pouvez modifier que votre établissement"}
		}
		// RESPONSABLE ne peut pas modifier pays ni actif
		if input.Pays != nil || input.Actif != nil {
			return nil, &domain.UnauthorizedError{Message: "RESPONSABLE ne peut pas modifier pays ou actif"}
		}
	}

	return uc.etabRepo.Update(ctx, id, input)
}

// UpdateLogo met à jour le logo (ADMIN ou RESPONSABLE propriétaire).
func (uc *EtablissementUseCase) UpdateLogo(ctx context.Context, claims db.SessionClaims, id string, logoData string) (*domain.Etablissement, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if role == domain.RoleResponsable && claims.EtablissementID != id {
		return nil, &domain.UnauthorizedError{Message: "vous ne pouvez modifier que votre établissement"}
	}
	if logoData == "" {
		return nil, &domain.ValidationError{Field: "logo", Message: "données logo requises"}
	}
	return uc.etabRepo.UpdateLogo(ctx, id, logoData)
}

// GetWatermark récupère la config watermark.
func (uc *EtablissementUseCase) GetWatermark(ctx context.Context, claims db.SessionClaims, id string) (*domain.WatermarkConfig, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.etabRepo.GetWatermark(ctx, id)
}

// UpdateWatermark met à jour la config watermark.
func (uc *EtablissementUseCase) UpdateWatermark(ctx context.Context, claims db.SessionClaims, id string, cfg domain.WatermarkConfig) (*domain.WatermarkConfig, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if role == domain.RoleResponsable && claims.EtablissementID != id {
		return nil, &domain.UnauthorizedError{Message: "vous ne pouvez modifier que votre établissement"}
	}
	// Validation : opacity entre 0 et 0.5
	if cfg.CertWatermarkOpacity < 0 || cfg.CertWatermarkOpacity > 0.5 {
		return nil, &domain.ValidationError{Field: "opacity", Message: "doit être entre 0 et 0.5"}
	}
	_, err := uc.etabRepo.UpdateWatermark(ctx, id, cfg)
	if err != nil {
		return nil, err
	}
	return uc.etabRepo.GetWatermark(ctx, id)
}

// Delete supprime un établissement (ADMIN only).
func (uc *EtablissementUseCase) Delete(ctx context.Context, claims db.SessionClaims, id string) error {
	if claims.Role != string(domain.RoleAdmin) {
		return &domain.UnauthorizedError{Message: "seul un ADMIN peut supprimer un établissement"}
	}
	return uc.etabRepo.Delete(ctx, id)
}

// Helper pour vérifier qu'une string n'est pas vide
func requireNonEmptyStr(s string) error {
	if s == "" {
		return fmt.Errorf("champ requis")
	}
	return nil
}
