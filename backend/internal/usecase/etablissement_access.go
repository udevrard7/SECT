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

        switch role {
        case domain.RoleResponsable:
                // RESPONSABLE ne voit que les demandes de son établissement
                params.EtablissementID = claims.EtablissementID
        case domain.RoleAdmin:
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
//
// DUREE-VALIDITE-24H : la durée souhaitée est désormais sélectionnée via
// dureeValiditeHeures (1, 2, 4, 6, 8, 12 ou 24 heures). Les champs dateDebut/dateFin
// restent optionnels pour compatibilité, mais le nouveau flow recommande
// l'utilisation de dureeValiditeHeures.
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
        // DUREE-VALIDITE-24H-V2 : validation de dureeValiditeHeures.
        // Ajout de 3h (V2) pour meilleure granularité.
        validHeures := map[int]bool{1: true, 2: true, 3: true, 4: true, 6: true, 8: true, 12: true, 24: true}
        if input.DureeValiditeHeures != nil && !validHeures[*input.DureeValiditeHeures] {
                return nil, &domain.ValidationError{Field: "dureeValiditeHeures", Message: "doit être 1, 2, 3, 4, 6, 8, 12 ou 24 heures"}
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
        switch role {
        case domain.RoleAdmin:
                input.AdminID = claims.UserID
        case domain.RoleResponsable:
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
//   APPROUVE→REFUSE/EXPIRE). Verrou optimiste via repo.Update(ctx, id, existing.Statut, input).
// - B-10 (MEDIUM) : DureeAccesHeures doit être dans {1, 2, 4, 6, 8, 12, 24} (max 24h).
// - E4 (HIGH) : approuvePar est TOUJOURS forcé à claims.UserID (anti-forgery audit).
// - E9 (MEDIUM) : DateFin > DateDebut si les deux fournis, auto-set DateDebut=now()
//   si statut=APPROUVE et DateDebut nil.
//
// OPTION B (sécurité) : si input.Statut == REFUSE, la ligne est HARD-DELETED de
// la table EtablissementAccess au lieu d'être conservée avec statut=REFUSE.
// - Révocation (APPROUVE → REFUSE) : hard-delete AVEC audit trail dans AuditLog
//   (qui avait accès, quand, révoqué par qui, raison).
// - Refus initial (EN_ATTENTE → REFUSE) : hard-delete SANS audit (pas d'accès effectif).
// L'admin peut recréer une demande pour le même établissement après hard-delete
// (l'index partiel 000026 ne contraint que EN_ATTENTE/APPROUVE).
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
        switch role {
        case domain.RoleResponsable:
                if existing.EtablissementID != claims.EtablissementID {
                        return nil, &domain.UnauthorizedError{Message: "cette demande ne concerne pas votre établissement"}
                }
        case domain.RoleAdmin:
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
        //   REFUSE     → (terminal — hard-deleted, Option B)
        //   EXPIRE     → (terminal)
        validTransitions := map[domain.AccessStatut]map[domain.AccessStatut]bool{
                domain.AccessEnAttente: {domain.AccessApprouve: true, domain.AccessRefuse: true},
                domain.AccessApprouve:  {domain.AccessRefuse: true, domain.AccessExpire: true},
        }
        allowedTargets, ok := validTransitions[existing.Statut]
        if !ok || !allowedTargets[input.Statut] {
                return nil, &domain.ValidationError{
                        Field:   "statut",
                        Message: fmt.Sprintf("transition invalide : %s → %s (statuts terminaux : REFUSE, EXPIRE)", existing.Statut, input.Statut),
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
        // DUREE-VALIDITE-24H-V2 : validation de DureeAccesHeures (remplace DureeAccesJours).
        // La durée d'accès est désormais limitée à max 24 heures (accès temporaire
        // assistance/audit/support). Les valeurs valides sont {1, 2, 3, 4, 6, 8, 12, 24}.
        validHeures := map[int]bool{1: true, 2: true, 3: true, 4: true, 6: true, 8: true, 12: true, 24: true}
        if input.DureeAccesHeures != nil && *input.DureeAccesHeures > 0 {
                if !validHeures[*input.DureeAccesHeures] {
                        return nil, &domain.ValidationError{Field: "dureeAccesHeures", Message: "doit être 1, 2, 3, 4, 6, 8, 12 ou 24 heures (max 24h)"}
                }
        }
        // Compatibilité rétroactive : si l'ancien client envoye dureeAccesJours,
        // convertir en DureeAccesHeures (jours * 24) mais limité à max 24h.
        // Si dureeAccesJours=1 → 24h, sinon → erreur (durée > 24h non autorisée).
        if input.DureeAccesJours != nil && *input.DureeAccesJours > 0 && (input.DureeAccesHeures == nil || *input.DureeAccesHeures == 0) {
                if *input.DureeAccesJours > 1 {
                        return nil, &domain.ValidationError{Field: "dureeAccesJours", Message: "obsolète — utilisez dureeAccesHeures (max 24h). Les durées > 1 jour ne sont plus autorisées."}
                }
                // dureeAccesJours=1 → 24h
                h := 24
                input.DureeAccesHeures = &h
        }
        // DUREE-VALIDITE-24H : calculer dateFin = now() + dureeAccesHeures.
        // La fonction admin_has_etablissement_access() vérifie dateFin >= now()
        // → l'accès est automatiquement révoqué quand dateFin expire, sans job cron.
        if input.DureeAccesHeures != nil && *input.DureeAccesHeures > 0 && input.Statut == domain.AccessApprouve {
                fin := time.Now().Add(time.Duration(*input.DureeAccesHeures) * time.Hour)
                input.DateFin = &fin
        }

        // OPTION B (sécurité) : si le statut cible est REFUSE, on hard-delete la ligne
        // au lieu de la garder en DB. Les lignes REFUSE ne sont jamais conservées.
        // - Si existing.Statut == APPROUVE (révocation) → hard-delete AVEC audit trail
        //   dans AuditLog (qui avait accès, quand, révoqué par qui, raison).
        // - Si existing.Statut == EN_ATTENTE (refus initial) → hard-delete SANS audit
        //   car la demande n'a jamais donné lieu à un accès effectif.
        if input.Statut == domain.AccessRefuse {
                var auditEntry *domain.AccessAuditEntry
                if existing.Statut == domain.AccessApprouve {
                        // Révocation d'un accès effectif → audit trail obligatoire.
                        action := domain.AuditActionAccessRevoked
                        if existing.AdminID == claims.UserID {
                                action = domain.AuditActionAccessRevokedSelf
                        }
                        accessID := existing.ID
                        auditEntry = &domain.AccessAuditEntry{
                                ActorUserID: &claims.UserID,
                                Action:      action,
                                AccessID:    &accessID,
                                DetailsJSON: fmt.Sprintf(`{"adminId":"%s","etablissementId":"%s","motif":"%s","dateDebut":"%s","dateFin":"%s","raison":"%s","revokedBy":"%s","revokedAt":"%s"}`,
                                        existing.AdminID, existing.EtablissementID, existing.Motif,
                                        formatTimePtr(existing.DateDebut), formatTimePtr(existing.DateFin),
                                        nilStrSafe(input.Commentaire, "non précisée"),
                                        claims.UserID, time.Now().Format(time.RFC3339)),
                        }
                }
                // Hard-delete la ligne (avec ou sans audit selon le cas).
                if err := uc.accessRepo.Delete(ctx, id, auditEntry); err != nil {
                        return nil, err
                }
                // Retourner une représentation "fantôme" de la demande supprimée pour l'UI.
                // Le frontend n'utilise que statut + commentaire pour afficher le toast.
                commentaire := ""
                if input.Commentaire != nil {
                        commentaire = *input.Commentaire
                }
                return &domain.EtablissementAccess{
                        ID:              id,
                        AdminID:         existing.AdminID,
                        EtablissementID: existing.EtablissementID,
                        Motif:           existing.Motif,
                        Statut:          domain.AccessRefuse,
                        ApprouvePar:     &claims.UserID,
                        Commentaire:     &commentaire,
                        UpdatedAt:       time.Now(),
                }, nil
        }

        // B-8 : verrou optimiste — passe existing.Statut au repo qui ajoute
        // WHERE statut = expectedStatut dans le UPDATE. Si la ligne a changé entre
        // le FindByID et l'Update (race condition), RowsAffected=0 → ConflictError.
        return uc.accessRepo.Update(ctx, id, existing.Statut, input)
}

// formatTimePtr formate un *time.Time en ISO 3339 ou "(nil)" si nil.
// Helper pour AuditEntry.DetailsJSON.
func formatTimePtr(t *time.Time) string {
        if t == nil {
                return "(null)"
        }
        return t.Format(time.RFC3339)
}

// nilStrSafe retourne la string pointée ou fallback si nil.
func nilStrSafe(s *string, fallback string) string {
        if s == nil {
                return fallback
        }
        return *s
}

// Delete annule une demande d'accès EN_ATTENTE (hard-delete, Option B sécurité).
// ACCES-ETABLISSEMENTS-FIX-AE1 : avant, la route DELETE n'existait pas.
//
// OPTION B (sécurité) : les demandes annulées sont HARD-DELETED de la table
// EtablissementAccess. Aucun audit trail n'est conservé pour les annulations
// car la demande n'a jamais donné lieu à un accès effectif (statut EN_ATTENTE).
// L'audit trail est réservé aux RÉVOCATIONS (cf. Update avec APPROUVE → REFUSE).
//
// Règles métier :
// - ADMIN : ne peut annuler que SES propres demandes (adminId == claims.UserID).
// - RESPONSABLE : la demande doit concerner son établissement.
// - La demande doit être en statut EN_ATTENTE (sinon ValidationError).
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
        switch role {
        case domain.RoleAdmin:
                if existing.AdminID != claims.UserID {
                        return &domain.UnauthorizedError{Message: "vous ne pouvez annuler que vos propres demandes"}
                }
        case domain.RoleResponsable:
                if existing.EtablissementID != claims.EtablissementID {
                        return &domain.UnauthorizedError{Message: "cette demande ne concerne pas votre établissement"}
                }
        }

        // Statut check : seul EN_ATTENTE peut être annulé.
        if existing.Statut != domain.AccessEnAttente {
                return &domain.ValidationError{Field: "statut", Message: "seules les demandes en attente peuvent être annulées"}
        }

        // Option B : hard-delete sans audit (demande sans accès effectif).
        // L'index partiel (migration 000026) exclut déjà EN_ATTENTE de la contrainte
        // unique → l'admin peut recréer une demande pour le même établissement.
        return uc.accessRepo.Delete(ctx, id, nil)
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
