// Package domain — entités et ports liés aux établissements.
package domain

import (
        "context"
        "time"

        "github.com/jackc/pgx/v5"
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
        // anneeAcademiqueCouranteId (migration 000017) — FK nullable vers
        // AnneeAcademique. Désigne l'année académique "en cours" pour cet
        // établissement. Null si non définie. Permet aux modules /affectations,
        // /epreuves, /rapports d'avoir un default cohérent au lieu d'une
        // heuristique date système.
        AnneeAcademiqueCouranteID *string `json:"anneeAcademiqueCouranteId,omitempty"`
        // anneeCourante : objet enrichi (libelle + dates) inclus uniquement par
        // les endpoints detail/GET annee-courante. Non peuplé sur la liste.
        AnneeCourante *AnneeAcademiqueRef `json:"anneeCourante,omitempty"`
        // Champs optionnels enrichis (selon endpoint)
        Count          *EtablissementCount `json:"_count,omitempty"`
        AdminHasAccess *bool               `json:"adminHasAccess,omitempty"`
        // Filieres inclus uniquement sur l'endpoint detail (FindByIDWithRelations).
        Filieres []*FiliereRef `json:"filieres,omitempty"`
        // Access inclus uniquement par ListAuthorizedEtablissements (info d'accès
        // admin pour un établissement autorisé). BUGFIX (ADMIN-AUDIT-4b).
        Access *AccessSummary `json:"access,omitempty"`
}

// AnneeAcademiqueRef est une référence légère à une année académique (pour
// l'enrichissement de Etablissement). On évite d'importer le type complet
// AnneeAcademique du domain academique pour limiter le couplage.
type AnneeAcademiqueRef struct {
        ID         string    `json:"id"`
        Libelle    string    `json:"libelle"`
        DateDebut  time.Time `json:"dateDebut"`
        DateFin    time.Time `json:"dateFin"`
        Actif      bool      `json:"actif"`
}

// EtablissementCount est l'objet imbriqué `_count` (style Prisma) attendu par
// le frontend pour afficher le nombre de filières et d'utilisateurs d'un
// établissement dans la liste.
type EtablissementCount struct {
        Filieres int `json:"filieres"`
        Users    int `json:"users"`
}

// AccessSummary est un résumé de la demande d'accès EtablissementAccess,
// retourné par ListAuthorizedEtablissements pour permettre au frontend admin
// d'afficher la date d'expiration d'accès (etab.access.dateFin) sans crash.
// BUGFIX (ADMIN-AUDIT-4b).
type AccessSummary struct {
        ID          string     `json:"id"`
        Motif       string     `json:"motif"`
        DateDebut   *time.Time `json:"dateDebut,omitempty"`
        DateFin     *time.Time `json:"dateFin,omitempty"`
        Commentaire *string    `json:"commentaire,omitempty"`
        CreatedAt   time.Time  `json:"createdAt"`
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
        // ABONNEMENTS-FIX-A3 : champs wizard de souscription (optionnels).
        // Si ResponsableEmail + PlanID sont fournis, le usecase Create crée en plus
        // un responsable (direct ou invitation) + un abonnement, le tout en une
        // transaction atomique. Avant, ces champs étaient envoyés par le frontend
        // mais silencieusement ignorés → seul l'établissement était créé.
        ResponsableNom        *string `json:"responsableNom,omitempty"`
        ResponsableEmail      *string `json:"responsableEmail,omitempty"`
        ResponsableTelephone  *string `json:"responsableTelephone,omitempty"`
        ResponsableMode       *string `json:"responsableMode,omitempty"` // "direct" | "invitation"
        PlanID                *string `json:"planId,omitempty"`
        PeriodeFacturation    *string `json:"periodeFacturation,omitempty"` // "mensuel" | "annuel"
        // SECT-ABONNEMENTS-B2B-B2C : nb d'étudiants estimé pour le modèle capitation
        // (B2B). Plancher 50 étudiants. Si non fourni, 50 est utilisé par défaut.
        NbEtudiantsEstime     *int    `json:"nbEtudiantsEstime,omitempty"`
}

// UpdateEtablissementInput — partial update.
//
// E5 (HIGH) : le champ Logo a été retiré. Le logo doit être mis à jour
// via l'endpoint dédié POST /api/etablissements/upload-logo qui valide
// MIME (png/jpeg/webp/svg) + limite 2MB. Avant ce fix, un PATCH avec
// {"logo": "data:..."} arbitraire contournait ces protections (DB bloat,
// risque XSS si SVG rendu inline).
type UpdateEtablissementInput struct {
        Nom              *string `json:"nom,omitempty"`
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
        // ABONNEMENTS-FIX-A3 : CreateInTx pour transaction atomique wizard.
        CreateInTx(ctx context.Context, tx pgx.Tx, input CreateEtablissementInput) (*Etablissement, error)
        Update(ctx context.Context, id string, input UpdateEtablissementInput) (*Etablissement, error)
        UpdateLogo(ctx context.Context, id string, logoData string) (*Etablissement, error)
        // ClearLogo met le logo à NULL (suppression). Distinct d'UpdateLogo qui
        // exige des données valides (data URL base64 non vide).
        ClearLogo(ctx context.Context, id string) (*Etablissement, error)
        // SetCurrentAnnee définit l'année académique courante (migration 000017).
        SetCurrentAnnee(ctx context.Context, etablissementID, anneeID string) (*Etablissement, error)
        // GetCurrentAnnee récupère l'année courante (nil si non définie).
        GetCurrentAnnee(ctx context.Context, etablissementID string) (*AnneeAcademiqueRef, error)
        UpdateWatermark(ctx context.Context, id string, cfg WatermarkConfig) (*Etablissement, error)
        GetWatermark(ctx context.Context, id string) (*WatermarkConfig, error)
        Delete(ctx context.Context, id string) error
}
