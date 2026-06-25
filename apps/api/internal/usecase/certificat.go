// Package usecase — logique métier Certificats + Correction.
package usecase

import (
	"context"
	"fmt"

	"github.com/udevrard7/sect/apps/api/internal/db"
	"github.com/udevrard7/sect/apps/api/internal/domain"
)

// ============================================================
// CERTIFICAT USECASE
// ============================================================

// CertificatUseCase implémente les cas d'usage des certificats.
type CertificatUseCase struct {
	certRepo domain.CertificatRepository
}

// NewCertificatUseCase crée un nouveau CertificatUseCase.
func NewCertificatUseCase(certRepo domain.CertificatRepository) *CertificatUseCase {
	return &CertificatUseCase{certRepo: certRepo}
}

// List liste les certificats (ETUDIANT: own only, autres: par etudiantId).
func (uc *CertificatUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.CertificatListParams) ([]*domain.Certificat, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant && role != domain.RoleEtudiant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	// ETUDIANT : force etudiantId = user.id
	if role == domain.RoleEtudiant {
		params.EtudiantID = claims.UserID
	}
	return uc.certRepo.List(ctx, params)
}

// GetByID récupère un certificat par ID.
func (uc *CertificatUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.Certificat, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant && role != domain.RoleEtudiant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.certRepo.FindByID(ctx, id)
}

// Verify vérifie un certificat par code (public, pas d'auth requise).
func (uc *CertificatUseCase) Verify(ctx context.Context, code string) (*domain.Certificat, error) {
	return uc.certRepo.FindByCode(ctx, code)
}

// Revoke révoque un certificat (ENSEIGNANT émetteur, RESPONSABLE, ADMIN).
func (uc *CertificatUseCase) Revoke(ctx context.Context, claims db.SessionClaims, id string, raison string) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if raison == "" {
		return &domain.ValidationError{Field: "raison", Message: "requis"}
	}
	return uc.certRepo.Revoke(ctx, id, raison)
}

// ============================================================
// CORRECTION USECASE
// ============================================================

// CorrectionUseCase implémente les cas d'usage de correction.
type CorrectionUseCase struct {
	correctionRepo domain.CorrectionRepository
}

// NewCorrectionUseCase crée un nouveau CorrectionUseCase.
func NewCorrectionUseCase(correctionRepo domain.CorrectionRepository) *CorrectionUseCase {
	return &CorrectionUseCase{correctionRepo: correctionRepo}
}

// ListSessions liste les sessions à corriger (ENSEIGNANT: own only).
func (uc *CorrectionUseCase) ListSessions(ctx context.Context, claims db.SessionClaims, params domain.CorrectionListParams) ([]*domain.CorrectionSession, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	// ENSEIGNANT : force enseignantId = user.id
	if role == domain.RoleEnseignant {
		params.EnseignantID = claims.UserID
	}
	if params.EnseignantID == "" {
		return nil, &domain.ValidationError{Field: "enseignantId", Message: "requis"}
	}
	return uc.correctionRepo.ListSessions(ctx, params)
}

// UpdateReponse met à jour le score d'une réponse (correction manuelle).
func (uc *CorrectionUseCase) UpdateReponse(ctx context.Context, claims db.SessionClaims, reponseID string, input domain.UpdateReponseInput) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.Score != nil && (*input.Score < 0) {
		return &domain.ValidationError{Field: "score", Message: "doit être positif"}
	}
	return uc.correctionRepo.UpdateReponse(ctx, reponseID, input)
}

// RetournerSession retourne une session à l'étudiant.
func (uc *CorrectionUseCase) RetournerSession(ctx context.Context, claims db.SessionClaims, sessionID string) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.correctionRepo.RetournerSession(ctx, sessionID)
}

// RetournerBatch retourne plusieurs sessions.
func (uc *CorrectionUseCase) RetournerBatch(ctx context.Context, claims db.SessionClaims, sessionIDs []string) (int, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
		return 0, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if len(sessionIDs) == 0 {
		return 0, &domain.ValidationError{Field: "sessionIds", Message: "non vide requis"}
	}
	return uc.correctionRepo.RetournerBatch(ctx, sessionIDs)
}

// Suppress unused warning
var _ = fmt.Sprintf
