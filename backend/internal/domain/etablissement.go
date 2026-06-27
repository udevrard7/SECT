// Package domain — entités et ports liés aux établissements.
package domain

import (
	"context"
	"time"
)

// Etablissement représente un établissement scolaire.
//
// BUGFIX (ADMIN-AUDIT-2) : le champ `_count` est maintenant un objet imbriqué
// `*EtablissementCount` (style Prisma) pour matcher ce que le frontend attend
// (`etab._count.filieres`, `etab._count.users`). Avant ce fix, c'était un
// simple `*int` sérialisé en `_count: N` (nombre plat) → le frontend accédait
// à `etab._count.filieres` sur un nombre → TypeError: Cannot read properties
// of undefined (reading 'filieres') → crash de /etablissements.
type Etablissement struct {
	ID                   string    `json:"id"`
	Nom                  string    `json:"nom"`
	Type                 *string   `json:"type,omitempty"`
	Ville                *string   `json:"ville,omitempty"`
	Pays                 string    `json:"pays"`
	Adresse              *string   `json:"adresse,omitempty"`
	Telephone            *string   `json:"telephone,omitempty"`
	Email                *string   `json:"email,omitempty"`
	SiteWeb              *string   `json:"siteWeb,omitempty"`
	Logo                 *string   `json:"logo,omitempty"` // data URL base64
	Actif                bool      `json:"actif"`
	ExempleMatricule     *string   `json:"exempleMatricule,omitempty"`
	FormatMatricule      *string   `json:"formatMatricule,omitempty"`
	RegexMatricule       *string   `json:"regexMatricule,omitempty"`
	CertWatermarkText    *string   `json:"certWatermarkText,omitempty"`
	CertWatermarkEnabled bool      `json:"certWatermarkEnabled"`
	CertWatermarkOpacity float64   `json:"certWatermarkOpacity"`
	CertWatermarkColor   *string   `json:"certWatermarkColor,omitempty"`
	CertWatermarkPattern *string   `json:"certWatermarkPattern,omitempty"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
	// Champs optionnels enrichis (selon endpoint)
	Count          *EtablissementCount `json:"_count,omitempty"`
	AdminHasAccess *bool               `json:"adminHasAccess,omitempty"`
	// Filieres inclus uniquement sur l'endpoint detail (FindByIDWithRelations).
	Filieres []*FiliereRef `json:"filieres,omitempty"`
}

// EtablissementCount est l'objet imbriqué `_count` (style Prisma) attendu par
// le frontend pour afficher le nombre de filières et d'utilisateurs d'un
// établissement dans la liste.
type EtablissementCount struct {
	Filieres int `json:"filieres"`
	Users    int `json:"users"`
}

// EtablissementListParams contient les paramètres de filtrage.
type EtablissementListParams struct {
	Search string // sur nom, ville, email
	Type   string
	Actif  *bool
}

// CreateEtablissementInput contient les données pour créer un établissement.
type CreateEtablissementInput struct {
	Nom              string  `json:"nom"`
	Type             *string `json:"type,omitempty"`
	Ville            *string `json:"ville,omitempty"`
	Pays             *string `json:"pays,omitempty"`
	Adresse          *string `json:"adresse,omitempty"`
	Telephone        *string `json:"telephone,omitempty"`
	Email            *string `json:"email,omitempty"`
	SiteWeb          *string `json:"siteWeb,omitempty"`
	Actif            *bool   `json:"actif,omitempty"`
	FormatMatricule  *string `json:"formatMatricule,omitempty"`
	ExempleMatricule *string `json:"exempleMatricule,omitempty"`
	RegexMatricule   *string `json:"regexMatricule,omitempty"`
}

// UpdateEtablissementInput — partial update.
type UpdateEtablissementInput struct {
	Nom              *string `json:"nom,omitempty"`
	Type             *string `json:"type,omitempty"`
	Ville            *string `json:"ville,omitempty"`
	Pays             *string `json:"pays,omitempty"`
	Adresse          *string `json:"adresse,omitempty"`
	Telephone        *string `json:"telephone,omitempty"`
	Email            *string `json:"email,omitempty"`
	SiteWeb          *string `json:"siteWeb,omitempty"`
	Logo             *string `json:"logo,omitempty"`
	Actif            *bool   `json:"actif,omitempty"`
	FormatMatricule  *string `json:"formatMatricule,omitempty"`
	ExempleMatricule *string `json:"exempleMatricule,omitempty"`
	RegexMatricule   *string `json:"regexMatricule,omitempty"`
}

// WatermarkConfig représente la config de watermark des certificats.
type WatermarkConfig struct {
	CertWatermarkText    string  `json:"certWatermarkText"`
	CertWatermarkEnabled bool    `json:"certWatermarkEnabled"`
	CertWatermarkOpacity float64 `json:"certWatermarkOpacity"`
	CertWatermarkColor   string  `json:"certWatermarkColor"`
	CertWatermarkPattern string  `json:"certWatermarkPattern"`
}

// EtablissementRepository définit l'interface d'accès aux établissements.
type EtablissementRepository interface {
	FindByID(ctx context.Context, id string) (*Etablissement, error)
	List(ctx context.Context, params EtablissementListParams) ([]*Etablissement, error)
	Create(ctx context.Context, input CreateEtablissementInput) (*Etablissement, error)
	Update(ctx context.Context, id string, input UpdateEtablissementInput) (*Etablissement, error)
	UpdateLogo(ctx context.Context, id string, logoData string) (*Etablissement, error)
	UpdateWatermark(ctx context.Context, id string, cfg WatermarkConfig) (*Etablissement, error)
	GetWatermark(ctx context.Context, id string) (*WatermarkConfig, error)
	Delete(ctx context.Context, id string) error
}
