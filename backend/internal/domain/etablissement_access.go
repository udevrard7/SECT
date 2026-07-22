// Package domain — entités et ports liés à EtablissementAccess.
package domain

import (
        "context"
        "time"
)

// AccessStatut représente le statut d'une demande d'accès.
type AccessStatut string

const (
        AccessEnAttente AccessStatut = "EN_ATTENTE"
        AccessApprouve  AccessStatut = "APPROUVE"
        AccessRefuse    AccessStatut = "REFUSE"
        AccessExpire    AccessStatut = "EXPIRE"
        // Note : plus de statut ANNULE (Option B sécurité) — les demandes annulées
        // ou révoquées sont HARD-DELETED de la table EtablissementAccess. Seul l'audit
        // trail des révocations (APPROUVE → REFUSE) est conservé dans la table AuditLog.
)

// EtablissementAccess représente une autorisation d'accès ADMIN → établissement.
type EtablissementAccess struct {
        ID              string       `json:"id"`
        AdminID         string       `json:"adminId"`
        EtablissementID string       `json:"etablissementId"`
        Motif           string       `json:"motif"`
        Statut          AccessStatut `json:"statut"`
        DateDebut       *time.Time   `json:"dateDebut,omitempty"`
        DateFin         *time.Time   `json:"dateFin,omitempty"`
        ApprouvePar     *string      `json:"approuvePar,omitempty"`
        Commentaire     *string      `json:"commentaire,omitempty"`
        CreatedAt       time.Time    `json:"createdAt"`
        UpdatedAt       time.Time    `json:"updatedAt"`
        // Relations optionnelles
        Admin         *UserRef          `json:"admin,omitempty"`
        Etablissement *EtablissementRef `json:"etablissement,omitempty"`
}

// UserRef est une référence légère à un utilisateur.
type UserRef struct {
        ID    string `json:"id"`
        Name  string `json:"name"`
        Email string `json:"email"`
}

// CreateAccessInput pour créer une demande d'accès.
type CreateAccessInput struct {
        AdminID         string     `json:"adminId"`
        EtablissementID string     `json:"etablissementId"`
        Motif           string     `json:"motif"`
        DateDebut       *time.Time `json:"dateDebut,omitempty"`
        DateFin         *time.Time `json:"dateFin,omitempty"`
        Commentaire     *string    `json:"commentaire,omitempty"`
}

// UpdateAccessInput pour approuver/refuser/révoquer.
type UpdateAccessInput struct {
        Statut          AccessStatut `json:"statut"`
        ApprouvePar     *string      `json:"approuvePar,omitempty"`
        Commentaire     *string      `json:"commentaire,omitempty"`
        DateDebut       *time.Time   `json:"dateDebut,omitempty"`
        DateFin         *time.Time   `json:"dateFin,omitempty"`
        DureeAccesJours *int         `json:"dureeAccesJours,omitempty"` // OPTION-B : durée d'accès en jours (7, 30, 90, 365). Si fourni et statut=APPROUVE, dateFin = now() + duree.
}

// AccessListParams pour filtrer les demandes d'accès.
type AccessListParams struct {
        AdminID         string
        Statut          string
        EtablissementID string
}

// AccessAuditEntry est une entrée d'audit pour la table AuditLog, utilisée lors
// des hard-deletes (Option B sécurité) pour conserver la trace des révocations.
// Les annulations (EN_ATTENTE) et refus (EN_ATTENTE → REFUSE) ne sont pas loggés
// car ils ne concernent que des demandes sans accès effectif.
type AccessAuditEntry struct {
        ActorUserID  *string // ID de l'utilisateur qui effectue l'action (peut être nil pour system-worker)
        ActorIP      string  // adresse IP de l'acteur (vide si inconnue)
        Action       string  // ACCESS_REVOKED, ACCESS_REVOKED_SELF, etc.
        AccessID     *string // ID de la ligne EtablissementAccess supprimée
        DetailsJSON  string  // détails JSON (adminId, etablissementId, motif, dateDebut, dateFin, raison)
}

// Actions d'audit pour EtablissementAccess.
const (
        AuditActionAccessRevoked      = "ACCESS_REVOKED"       // Révocation par un RESPONSABLE (APPROUVE → REFUSE)
        AuditActionAccessRevokedSelf  = "ACCESS_REVOKED_SELF"  // Auto-révocation par l'ADMIN propriétaire
)

// EtablissementAccessRepository définit l'interface.
type EtablissementAccessRepository interface {
        FindByID(ctx context.Context, id string) (*EtablissementAccess, error)
        List(ctx context.Context, params AccessListParams) ([]*EtablissementAccess, error)
        Create(ctx context.Context, input CreateAccessInput) (*EtablissementAccess, error)
        // Update modifie une demande. B-8 : expectedStatut sert de verrou optimiste
        // (WHERE statut = expectedStatut dans le UPDATE) pour empêcher les race conditions
        // (double approbation, transition concurrente).
        Update(ctx context.Context, id string, expectedStatut AccessStatut, input UpdateAccessInput) (*EtablissementAccess, error)
        // Delete hard-supprime une demande d'accès (Option B sécurité). Si auditEntry
        // est non-nil, insère une entrée dans AuditLog dans la même transaction.
        // Utilisé pour : annulation EN_ATTENTE (sans audit), refus EN_ATTENTE→REFUSE
        // (sans audit), révocation APPROUVE→REFUSE (AVEC audit).
        Delete(ctx context.Context, id string, auditEntry *AccessAuditEntry) error
        // CheckAccess vérifie si un admin a un accès APPROUVE valide pour un établissement.
        CheckAccess(ctx context.Context, adminID, etablissementID string) (*EtablissementAccess, error)
        // ListAuthorizedEtablissements retourne les établissements autorisés pour un admin.
        ListAuthorizedEtablissements(ctx context.Context, adminID string) ([]*Etablissement, error)
}
