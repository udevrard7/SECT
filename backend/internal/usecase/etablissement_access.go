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
//
// Anti-IDOR (AE4) :
// - ADMIN : params.AdminID est TOUJOURS forcé à claims.UserID (le paramètre
//   client ?adminId= est ignoré). Un admin ne voit que ses propres demandes.
// - RESPONSABLE : params.EtablissementID est TOUJOURS forcé à claims.EtablissementID.
//   Un responsable ne voit que les demandes de son établissement.
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
        // B-13 : validation des dates si les deux sont fournies.
        if input.DateDebut != nil && input.DateFin != nil && !input.DateFin.After(*input.DateDebut) {
                return nil, &domain.ValidationError{Field: "dateFin", Message: "doit être après dateDebut"}
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
//
// Sécurité :
// - B-2 (CRITICAL) : un ADMIN ne peut PAS approuver sa PROPRE demande
//   (auto-approbation = escalation de privilèges). Le usecase FetchByID
//   systématiquement (pour ADMIN et RESPONSABLE) et vérifie
//   existing.AdminID != claims.UserID pour le rôle ADMIN.
// - B-8 (HIGH) : validation des transitions de statut (EN_ATTENTE→APPROUVE/REFUSE,
//   APPROUVE→REFUSE/EXPIRE). REFUSE/EXPIRE/ANNULE sont terminaux. Verrou optimiste
//   via repo.Update(ctx, id, existing.Statut, input) — deux PATCH concurrents ne
//   peuvent pas tous deux réussir.
// - B-10 (MEDIUM) : DureeAccesJours doit être dans {7, 30, 90, 365}.
// - E4 (HIGH) : approuvePar est TOUJOURS forcé à claims.UserID (anti-forgery audit).
// - E9 (MEDIUM) : DateFin > DateDebut si les deux fournis, auto-set DateDebut=now()
//   si statut=APPROUVE et DateDebut nil.
//
// RESPONSABLE : ne peut agir que sur les demandes de SON établissement.
func (uc *AccessUseCase) Update(ctx context.Context, claims db.SessionClaims, id string, input domain.UpdateAccessInput) (*domain.EtablissementAccess, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // Valider le statut cible
        validStatuts := map[domain.AccessStatut]bool{
                domain.AccessApprouve: true,
                domain.AccessRefuse:   true,
                domain.AccessExpire:   true,
        }
        if !validStatuts[input.Statut] {
                return nil, &domain.ValidationError{Field: "statut", Message: "doit être APPROUVE, REFUSE ou EXPIRE"}
        }

        // B-2 + B-8 : FetchByID systématique (pour ADMIN aussi).
        // Avant, seul RESPONSABLE faisait un FindByID → l'ADMIN pouvait s'auto-approuver.
        existing, err := uc.accessRepo.FindByID(ctx, id)
        if err != nil {
                return nil, err
        }

        // Ownership check
        if role == domain.RoleResponsable {
                if existing.EtablissementID != claims.EtablissementID {
                        return nil, &domain.UnauthorizedError{Message: "cette demande ne concerne pas votre établissement"}
                }
        } else if role == domain.RoleAdmin {
                // B-2 (CRITICAL) : un ADMIN ne peut pas approuver SA PROPRE demande
                // (auto-approbation = escalation de privilèges). Le workflow de validation
                // par RESPONSABLE doit être respecté.
                //
                // EXCEPTION (B-2-refine) : l'ADMIN peut RÉVOQUER son propre accès
                // (APPROUVE → REFUSE). C'est un cas d'usage légitime (un ADMIN veut
                // renoncer volontairement à un accès). La transition APPROUVE→REFUSE
                // par le propriétaire est donc autorisée.
                if existing.AdminID == claims.UserID && input.Statut == domain.AccessApprouve {
                        return nil, &domain.UnauthorizedError{Message: "vous ne pouvez pas approuver votre propre demande d'accès — un responsable doit la valider"}
                }
        }

        // B-8 : validation de la transition de statut.
        // Transitions valides :
        //   EN_ATTENTE → APPROUVE | REFUSE  (approbation/refus initial)
        //   APPROUVE   → REFUSE | EXPIRE    (révocation/expiration)
        //   REFUSE     → (terminal)
        //   EXPIRE     → (terminal)
        //   ANNULE     → (terminal)
        validTransitions := map[domain.AccessStatut]map[domain.AccessStatut]bool{
                domain.AccessEnAttente: {domain.AccessApprouve: true, domain.AccessRefuse: true},
                domain.AccessApprouve:  {domain.AccessRefuse: true, domain.AccessExpire: true},
        }
        allowedTargets, ok := validTransitions[existing.Statut]
        if !ok || !allowedTargets[input.Statut] {
                return nil, &domain.ValidationError{
                        Field:   "statut",
                        Message: fmt.Sprintf("transition invalide : %s → %s (statuts terminaux : REFUSE, EXPIRE, ANNULE)", existing.Statut, input.Statut),
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
        // B-10 : validation de DureeAccesJours contre l'énumération documentée.
        if input.DureeAccesJours != nil && *input.DureeAccesJours > 0 {
                validDurees := map[int]bool{7: true, 30: true, 90: true, 365: true}
                if !validDurees[*input.DureeAccesJours] {
                        return nil, &domain.ValidationError{Field: "dureeAccesJours", Message: "doit être 7, 30, 90 ou 365 jours"}
                }
        }
        // OPTION-B : auto-révocation. Si DureeAccesJours fourni et statut=APPROUVE,
        // calculer dateFin = now() + duree. La fonction admin_has_etablissement_access()
        // vérifie déjà dateFin >= now() → l'accès est automatiquement révoqué quand
        // dateFin expire, sans besoin de job cron.
        if input.DureeAccesJours != nil && *input.DureeAccesJours > 0 && input.Statut == domain.AccessApprouve {
                fin := time.Now().Add(time.Duration(*input.DureeAccesJours) * 24 * time.Hour)
                input.DateFin = &fin
        }

        // B-8 : verrou optimiste — passe existing.Statut au repo qui ajoute
        // WHERE statut = expectedStatut dans le UPDATE. Si la ligne a changé entre
        // le FindByID et l'Update (race condition), RowsAffected=0 → ConflictError.
        return uc.accessRepo.Update(ctx, id, existing.Statut, input)
}

// Delete annule une demande d'accès EN_ATTENTE (soft-delete).
// ACCES-ETABLISSEMENTS-FIX-AE1 : avant, la route DELETE n'existait pas.
//
// B-11 (MEDIUM) : soft-delete via statut=ANNULE (avant : hard-delete sans audit
// trail). La ligne reste en DB avec statut=ANNULE pour l'historique. L'index
// unique partiel (migration 000026) exclut ANNULE → l'admin peut recréer une
// demande pour le même établissement après annulation.
//
// Règles métier :
// - ADMIN : ne peut annuler que SES propres demandes (adminId == claims.UserID).
// - RESPONSABLE : la demande doit concerner son établissement (peut annuler
//   les demandes EN_ATTENTE d'autres admins ciblant son établissement — le
//   soft-delete conserve l'audit trail, l'admin voit sa demande comme ANNULE).
// - La demande doit être en statut EN_ATTENTE.
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

        // B-11 : soft-delete via Update avec statut=ANNULE. Conserve l'audit trail
        // (qui a annulé, quand) et permet à l'admin de voir sa demande comme ANNULE.
        commentaire := "Demande annulée par l'admin"
        if role == domain.RoleResponsable {
                commentaire = "Demande annulée par le responsable"
        }
        input := domain.UpdateAccessInput{
                Statut:      domain.AccessAnnule,
                Commentaire: &commentaire,
        }
        // B-8 : verrou optimiste (existing.Statut = EN_ATTENTE, vérifié ci-dessus).
        _, err = uc.accessRepo.Update(ctx, id, existing.Statut, input)
        return err
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
