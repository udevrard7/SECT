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
        Statut      AccessStatut `json:"statut"`
        ApprouvePar *string      `json:"approuvePar,omitempty"`
        Commentaire *string      `json:"commentaire,omitempty"`
        DateDebut   *time.Time   `json:"dateDebut,omitempty"`
        DateFin     *time.Time   `json:"dateFin,omitempty"`
}

// AccessListParams pour filtrer les demandes d'accès.
type AccessListParams struct {
        AdminID         string
        Statut          string
        EtablissementID string
}

// EtablissementAccessRepository définit l'interface.
type EtablissementAccessRepository interface {
        FindByID(ctx context.Context, id string) (*EtablissementAccess, error)
        List(ctx context.Context, params AccessListParams) ([]*EtablissementAccess, error)
        Create(ctx context.Context, input CreateAccessInput) (*EtablissementAccess, error)
        Update(ctx context.Context, id string, input UpdateAccessInput) (*EtablissementAccess, error)
        // ACCES-ETABLISSEMENTS-FIX-AE1 : suppression d'une demande d'accès (annulation).
        Delete(ctx context.Context, id string) error
        // CheckAccess vérifie si un admin a un accès APPROUVE valide pour un établissement.
        CheckAccess(ctx context.Context, adminID, etablissementID string) (*EtablissementAccess, error)
        // ListAuthorizedEtablissements retourne les établissements autorisés pour un admin.
        ListAuthorizedEtablissements(ctx context.Context, adminID string) ([]*Etablissement, error)
}
