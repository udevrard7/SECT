// Package usecase — logique métier EtablissementAccess.
package usecase

import (
        "context"
        "fmt"
        "time"

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
//
// E3 (HIGH) : override ownership pour empêcher le forgery :
// - RESPONSABLE : force input.EtablissementID = claims.EtablissementID (ne peut
//   pas créer de demande pour un autre établissement).
// - ADMIN : force input.AdminID = claims.UserID (ne peut pas créer de demande
//   au nom d'un autre admin).
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

        // E3 : override ownership pour empêcher le forgery.
        if role == domain.RoleAdmin {
                input.AdminID = claims.UserID
        } else if role == domain.RoleResponsable {
                input.EtablissementID = claims.EtablissementID
        }

        return uc.accessRepo.Create(ctx, input)
}

// Update approuve/refuse/révoque une demande.
// ADMIN : peut tout faire.
// RESPONSABLE : peut approuver/refuser pour son établissement uniquement.
//
// E4 (HIGH) : approuvePar est TOUJOURS forcé à claims.UserID (avant : seulement
// si nil, ce qui permettait de forger "approuvePar": "user-xyz" dans l'audit trail).
//
// E9 (MEDIUM) : validation des dates — DateFin > DateDebut si les deux sont
// fournis, et auto-set DateDebut = now() si statut=APPROUVE et DateDebut nil
// (évite qu'un accès APPROUVE sans dates soit immédiatement inutilisable).
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

        // E4 : approuvePar TOUJOURS forcé à l'utilisateur courant (anti-forgery).
        ap := claims.UserID
        input.ApprouvePar = &ap

        // E9 : validation des dates.
        // Si les deux sont fournies, DateFin doit être après DateDebut.
        if input.DateDebut != nil && input.DateFin != nil && !input.DateFin.After(*input.DateDebut) {
                return nil, &domain.ValidationError{Field: "dateFin", Message: "doit être après dateDebut"}
        }
        // Si statut=APPROUVE et DateDebut nil, auto-set à now() pour éviter un accès
        // inactif (CheckAccess retournerait nil sans DateDebut dans le passé).
        if input.Statut == domain.AccessApprouve && input.DateDebut == nil {
                now := time.Now()
                input.DateDebut = &now
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
