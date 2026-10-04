// Package domain — entité Ouvrage (bibliothèque numérique, ADR-0007 P1).
//
// ÉTAGE 0 du modèle (transposition didactique, Chevallard) : le SAVOIR
// SAVANT / NORMATIF extérieur au cours. Invariants ADR-0007 :
//
//	I1 — un ouvrage NE GÉNÈRE JAMAIS de questions ;
//	I2 — le support enseigne, l'ouvrage référence.
package domain

import (
	"context"
	"time"
)

// CategorieOuvrage — catégorie normative d'un ouvrage (ADR-0007 §Taxonomie).
// Le poids normatif (audit P3) est DÉRIVÉ de la catégorie, jamais stocké.
type CategorieOuvrage string

const (
	// CategorieReferentielOfficiel — normatif pur : la conformité se mesure À lui.
	CategorieReferentielOfficiel CategorieOuvrage = "REFERENTIEL_OFFICIEL"
	// CategorieOuvrageReference — référence normative : conformité croisée.
	CategorieOuvrageReference CategorieOuvrage = "OUVRAGE_REFERENCE"
	// CategorieRechercheAcademique — preuve : enrichit, ne norme pas.
	CategorieRechercheAcademique CategorieOuvrage = "RECHERCHE_ACADEMIQUE"
	// CategoriePratiqueProfessionnelle — contexte : ancre dans le métier.
	CategoriePratiqueProfessionnelle CategorieOuvrage = "PRATIQUE_PROFESSIONNELLE"
)

// OuvrageCategories — liste exhaustive (validation + ordre d'affichage UI).
var OuvrageCategories = []CategorieOuvrage{
	CategorieReferentielOfficiel,
	CategorieOuvrageReference,
	CategorieRechercheAcademique,
	CategoriePratiqueProfessionnelle,
}

// IsValidOuvrageCategorie vérifie l'appartenance à l'enum (400 sinon).
func IsValidOuvrageCategorie(c CategorieOuvrage) bool {
	switch c {
	case CategorieReferentielOfficiel, CategorieOuvrageReference,
		CategorieRechercheAcademique, CategoriePratiqueProfessionnelle:
		return true
	}
	return false
}

// NiveauxEtude — valeurs de l'enum DB "NiveauEtude" (mirroir pour la
// validation Go côté upload : Ouvrage.niveau est TYPÉ enum en DB, jamais
// text — leçon ENUM-SWEEP-1).
var NiveauxEtude = []string{"L1", "L2", "L3", "M1", "M2", "DOCTORAT"}

// IsValidNiveauEtude vérifie l'appartenance à l'enum (400 sinon).
func IsValidNiveauEtude(n string) bool {
	for _, v := range NiveauxEtude {
		if v == n {
			return true
		}
	}
	return false
}

// Ouvrage — un livre de la bibliothèque d'un établissement.
//
// SÉMANTIQUE DES CHAMPS DE SCOPING (ADR-0007) :
//
//	EtablissementID = contrôle d'accès (RLS) ;
//	FiliereID / Niveau = recommandation (filtrage UI) — NULL = « pertinent
//	pour tous », PAS « caché ».
type Ouvrage struct {
	ID                     string           `json:"id"`
	EtablissementID        string           `json:"etablissementId"`
	Titre                  string           `json:"titre"`
	Auteurs                *string          `json:"auteurs,omitempty"` // JSON array
	Categorie              CategorieOuvrage `json:"categorie"`
	Editeur                *string          `json:"editeur,omitempty"`
	Edition                *string          `json:"edition,omitempty"`
	AnneePublication       *int             `json:"anneePublication,omitempty"`
	ISBN                   *string          `json:"isbn,omitempty"`
	Langue                 *string          `json:"langue,omitempty"`
	FiliereID              *string          `json:"filiereId,omitempty"`
	Niveau                 *string          `json:"niveau,omitempty"` // enum NiveauEtude en DB
	Themes                 *string          `json:"themes,omitempty"` // JSON array
	Description            *string          `json:"description,omitempty"`
	LicenceOrigine         string           `json:"licenceOrigine"`
	DateExpirationDroits   *time.Time       `json:"dateExpirationDroits,omitempty"`
	NomFichier             string           `json:"nomFichier"`
	CheminStockage         *string          `json:"cheminStockage,omitempty"` // clé R2
	TailleFichier          int              `json:"tailleFichier"`
	TypeMime               string           `json:"typeMime"`
	TelechargementAutorise bool             `json:"telechargementAutorise"`
	CreatedByID            string           `json:"createdById"`
	CreatedAt              time.Time        `json:"createdAt"`
	UpdatedAt              time.Time        `json:"updatedAt"`
	DeletedAt              *time.Time       `json:"deletedAt,omitempty"`
	// DroitsExpires — dérivé (badge UI ADMIN) ; les lecteurs ne reçoivent
	// jamais ces lignes (auto-masquage policy Ouvrage_select).
	DroitsExpires bool `json:"droitsExpires"`
	// Filiere — ref nested peuplée par LEFT JOIN (UI catalogue).
	Filiere *OuvrageFiliereRef `json:"filiere,omitempty"`
}

// OuvrageFiliereRef — résumé d'une filière pour le DTO Ouvrage.
type OuvrageFiliereRef struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Nom  string `json:"nom"`
}

// OuvrageListParams — filtres + pagination du catalogue (ADR-0007 §API).
type OuvrageListParams struct {
	Search         string
	Categorie      CategorieOuvrage
	FiliereID      string
	Niveau         string
	Page           int
	Limit          int
	IncludeDeleted bool // ADMIN uniquement (corbeille + restore)
}

// OuvrageListResult — réponse paginée du catalogue.
type OuvrageListResult struct {
	Ouvrages []*Ouvrage `json:"ouvrages"`
	Total    int        `json:"total"`
	Page     int        `json:"page"`
	Limit    int        `json:"limit"`
}

// CreateOuvrageInput — création (upload ADMIN, G1).
type CreateOuvrageInput struct {
	// ID — généré par le usecase pour construire la clé R2
	// ouvrages/{id}/… AVANT l'INSERT (ADR-0007 §stockage) ; vide = le
	// repository en génère un.
	ID                     string
	EtablissementID        string
	Titre                  string
	Auteurs                *string
	Categorie              CategorieOuvrage
	Editeur                *string
	Edition                *string
	AnneePublication       *int
	ISBN                   *string
	Langue                 *string
	FiliereID              *string
	Niveau                 *string
	Themes                 *string
	Description            *string
	LicenceOrigine         string
	DateExpirationDroits   *time.Time
	NomFichier             string
	CheminStockage         *string
	TailleFichier          int
	TypeMime               string
	TelechargementAutorise bool
	CreatedByID            string
}

// UpdateOuvrageInput — PATCH : pointeurs, nil = champ inchangé.
// Les booléens UnsetX couvrent le 3e état « mettre NULL en DB », qui a une
// sémantique LÉGITIME pour les nullables (filiereId=NULL = « toutes filières »,
// niveau=NULL = « tous niveaux », dateExpirationDroits=NULL = « pas
// d'expiration » — fréquent lors d'un renouvellement de licence).
type UpdateOuvrageInput struct {
	Titre                  *string
	Auteurs                *string
	Categorie              *CategorieOuvrage
	Editeur                *string
	Edition                *string
	AnneePublication       *int
	ISBN                   *string
	Langue                 *string
	FiliereID              *string
	Niveau                 *string
	Themes                 *string
	Description            *string
	LicenceOrigine         *string
	DateExpirationDroits   *time.Time
	TelechargementAutorise *bool

	UnsetAuteurs          bool
	UnsetEditeur          bool
	UnsetEdition          bool
	UnsetAnneePublication bool
	UnsetISBN             bool
	UnsetLangue           bool
	UnsetFiliere          bool
	UnsetNiveau           bool
	UnsetThemes           bool
	UnsetDescription      bool
	UnsetDateExpiration   bool
}

// OuvrageAuditEntry — ligne d'audit pour les lectures (garde-fou ADR-0007 :
// audit des accès ; policy AuditLog_insert_system TO neondb_owner).
type OuvrageAuditEntry struct {
	OuvrageID       string
	Titre           string
	Categorie       CategorieOuvrage
	ActorUserID     string
	ActorEmail      string
	ActorIP         string
	EtablissementID string
	ExpiresIn       int
}

// OuvrageRepository interface.
type OuvrageRepository interface {
	List(ctx context.Context, params OuvrageListParams) (*OuvrageListResult, error)
	FindByID(ctx context.Context, id string) (*Ouvrage, error)
	Create(ctx context.Context, input CreateOuvrageInput) (*Ouvrage, error)
	Update(ctx context.Context, id string, input UpdateOuvrageInput) (*Ouvrage, error)
	SoftDelete(ctx context.Context, id string) error
	Restore(ctx context.Context, id string) (*Ouvrage, error)
	// SumTaillesByEtablissement — quota stockage bibliothèque (ADR-0007 :
	// cumul tailleFichier par etablissement, soft-deleted inclus).
	SumTaillesByEtablissement(ctx context.Context, etablissementID string) (int64, error)
	// AuditLecture — journalise un accès fichier (ouvrage.lecture).
	AuditLecture(ctx context.Context, entry OuvrageAuditEntry) error
}

// Constantes fichiers ouvrage — P1 : PDF uniquement (cohérent avec le
// lecteur in-browser <iframe> ; d'autres formats = évolution marquée).
const (
	// MaxTailleOuvrage — 100 Mo (un manuel PDF peut dépasser les 50 Mo des
	// documents de cours ; le quota par établissement borne le total).
	MaxTailleOuvrage = 100 * 1024 * 1024
	// OuvrageExtension / OuvrageMime — seul format accepté en P1.
	OuvrageExtension = ".pdf"
	OuvrageMime      = "application/pdf"
)
