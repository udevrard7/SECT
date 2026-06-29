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
//
// ACCES-ETABLISSEMENTS-FIX-AE4 : pour ADMIN, params.AdminID est forcé à
// claims.UserID (anti-IDOR). Avant, un ADMIN pouvait passer ?adminId=other
// pour voir les demandes d'un autre admin.
func (uc *AccessUseCase) List(ctx context.Context, claims db.SessionClaims, params domain.AccessListParams) ([]*domain.EtablissementAccess, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        if role == domain.RoleResponsable {
                // RESPONSABLE ne voit que les demandes de son établissement
                params.EtablissementID = claims.EtablissementID
        } else if role == domain.RoleAdmin {
                // AE4 : forcer adminId à l'utilisateur courant (anti-IDOR).
                params.AdminID = claims.UserID
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

// Delete annule (supprime) une demande d'accès.
// ACCES-ETABLISSEMENTS-FIX-AE1 : avant, la route DELETE n'existait pas → le
// bouton "Annuler" du frontend retournait 405.
//
// Règles métier :
// - ADMIN : ne peut annuler que SES propres demandes (adminId == claims.UserID).
// - La demande doit être en statut EN_ATTENTE (on ne peut pas annuler une
//   demande déjà APPROUVE/REFUSE/EXPIRE — utiliser PATCH pour révoquer).
// - Hard-delete (la demande EN_ATTENTE n'a pas de valeur d'audit).
func (uc *AccessUseCase) Delete(ctx context.Context, claims db.SessionClaims, id string) error {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // Récupérer la demande existante pour vérifier ownership + statut.
        existing, err := uc.accessRepo.FindByID(ctx, id)
        if err != nil {
                return err
        }

        // Ownership check :
        // - ADMIN : doit être le propriétaire de la demande (adminId == claims.UserID).
        // - RESPONSABLE : la demande doit concerner son établissement.
        if role == domain.RoleAdmin {
                if existing.AdminID != claims.UserID {
                        return &domain.UnauthorizedError{Message: "vous ne pouvez annuler que vos propres demandes"}
                }
        } else if role == domain.RoleResponsable {
                if existing.EtablissementID != claims.EtablissementID {
                        return &domain.UnauthorizedError{Message: "cette demande ne concerne pas votre établissement"}
                }
        }

        // Statut check : seul EN_ATTENTE peut être annulé.
        if existing.Statut != domain.AccessEnAttente {
                return &domain.ValidationError{Field: "statut", Message: "seules les demandes en attente peuvent être annulées"}
        }

        return uc.accessRepo.Delete(ctx, id)
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
