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

// ──────────────────────────────────────────────────────────────────────
// SECT-BIBLIO-5 (000137) : visibilité 3 niveaux + statut de modération.
// ──────────────────────────────────────────────────────────────────────

// VisibiliteOuvrage — le périmètre de diffusion d'un ouvrage (000137) :
//
//	PLATEFORME    — déposé par l'ADMIN global : destiné à TOUS les
//	                clients SECT (établissements) ;
//	ETABLISSEMENT — déposé par le RESPONSABLE : son établissement ;
//	CLASSE        — déposé par l'ENSEIGNANT : ses classes uniquement
//	                (ciblage OuvrageClasse, intersection scellée
//	                serveur avec EnseignantFiliere).
//
// Le périmètre est TOUJOURS dérivé du rôle authentifié dans le
// usecase — le client ne choisit jamais sa visibilité (défense
// serveur, miroir des policies RLS Ouvrage_insert 000137).
type VisibiliteOuvrage string

const (
	VisibilitePlateforme    VisibiliteOuvrage = "PLATEFORME"
	VisibiliteEtablissement VisibiliteOuvrage = "ETABLISSEMENT"
	VisibiliteClasse        VisibiliteOuvrage = "CLASSE"
)

// VisibilitesOuvrage — liste exhaustive (validation + UI).
var VisibilitesOuvrage = []VisibiliteOuvrage{
	VisibilitePlateforme,
	VisibiliteEtablissement,
	VisibiliteClasse,
}

// IsValidVisibiliteOuvrage vérifie l'appartenance à l'enum (400 sinon).
func IsValidVisibiliteOuvrage(v VisibiliteOuvrage) bool {
	switch v {
	case VisibilitePlateforme, VisibiliteEtablissement, VisibiliteClasse:
		return true
	}
	return false
}

// StatutOuvrage — le cycle de modération human-in-the-loop (000137) :
// un dépôt ENSEIGNANT naît BROUILLON (invisible des étudiants) et est
// validé par le RESPONSABLE de son établissement ; les dépôts ADMIN et
// RESPONSABLE naissent VALIDE.
type StatutOuvrage string

const (
	StatutOuvrageValide    StatutOuvrage = "VALIDE"
	StatutOuvrageBrouillon StatutOuvrage = "BROUILLON"
)

// OuvrageClasseInput — un ciblage « classe » (filière, niveau) demandé
// à la création/édition. Le usecase INTERSECTE avec les classes
// réelles de l'enseignant (usurpation impossible côté serveur).
type OuvrageClasseInput struct {
	FiliereID string `json:"filiereId"`
	Niveau    string `json:"niveau"` // enum NiveauEtude en DB
}

// OuvrageClasseRef — un ciblage persisté (DTO API).
type OuvrageClasseRef struct {
	FiliereID string             `json:"filiereId"`
	Niveau    string             `json:"niveau"`
	Filiere   *OuvrageFiliereRef `json:"filiere,omitempty"` // LEFT JOIN UI
}

// ──────────────────────────────────────────────────────────────────────
// SECT-BIBLIO-5 (tâche 2) : analyse IA du PDF, pré-remplissage assisté.
// L'IA PROPOSE (valeur + confiance + preuve sourcée par champ),
// l'HUMAIN dispose (valide, complète ou corrige) — jamais d'écriture
// en base sans relecture humaine.
// ──────────────────────────────────────────────────────────────────────

// AnalyseOuvrageField — un champ proposé par l'IA avec son niveau de
// confiance (0-100) et sa preuve (extrait source du document).
type AnalyseOuvrageField struct {
	Valeur    string `json:"valeur"`
	Confiance int    `json:"confiance"`
	Preuve    string `json:"preuve,omitempty"`
}

// AnalyseOuvrageResult — réponse de POST /api/ouvrages/analyze.
// Disponible=false → saisie manuelle (l'IA est une AIDE, son absence
// ne bloque JAMAIS le dépôt : erreur honnête, pattern document.go).
type AnalyseOuvrageResult struct {
	Disponible       bool                `json:"disponible"`
	Raison           string              `json:"raison,omitempty"`
	Titre            AnalyseOuvrageField `json:"titre"`
	Auteurs          AnalyseOuvrageField `json:"auteurs"`
	Editeur          AnalyseOuvrageField `json:"editeur"`
	Edition          AnalyseOuvrageField `json:"edition"`
	AnneePublication AnalyseOuvrageField `json:"anneePublication"`
	ISBN             AnalyseOuvrageField `json:"isbn"`
	// Categorie — suggestion de classification (SECT-BIBLIO-8) :
	// Valeur = l'un des 4 codes de OuvrageCategories (ou "" si
	// indécidable). Toujours une PROPOSITION human-in-the-loop —
	// l'enum final est validé à l'Upload.
	Categorie      AnalyseOuvrageField `json:"categorie"`
	Langue         AnalyseOuvrageField `json:"langue"`
	Themes         AnalyseOuvrageField `json:"themes"`
	Description    AnalyseOuvrageField `json:"description"`
	Modele         string              `json:"modele,omitempty"`
	PagesAnalysees int                 `json:"pagesAnalysees"`
}

// Ouvrage — un livre de la bibliothèque (000137 : périmètre 3 niveaux).
//
// SÉMANTIQUE DES CHAMPS DE SCOPING (évolution ADR-0007/000137) :
//
//	Visibility = contrôle d'accès principal (RLS) :
//	  PLATEFORME (tous les clients SECT) / ETABLISSEMENT (le sien) /
//	  CLASSE (ciblage OuvrageClasse) ;
//	EtablissementID = NULL pour un dépôt PLATEFORME de l'ADMIN
//	  global ; sinon l'établissement d'appartenance (conservé en
//	  provenance après une promotion PLATEFORME — retour possible) ;
//	FiliereID / Niveau = recommandation (filtrage UI) — NULL =
//	  « pertinent pour tous », PAS « caché ».
type Ouvrage struct {
	ID                     string            `json:"id"`
	EtablissementID        string            `json:"etablissementId"` // "" = ouvrage PLATEFORME sans établissement
	Titre                  string            `json:"titre"`
	Auteurs                *string           `json:"auteurs,omitempty"` // JSON array
	Categorie              CategorieOuvrage  `json:"categorie"`
	Editeur                *string           `json:"editeur,omitempty"`
	Edition                *string           `json:"edition,omitempty"`
	AnneePublication       *int              `json:"anneePublication,omitempty"`
	ISBN                   *string           `json:"isbn,omitempty"`
	Langue                 *string           `json:"langue,omitempty"`
	FiliereID              *string           `json:"filiereId,omitempty"`
	Niveau                 *string           `json:"niveau,omitempty"` // enum NiveauEtude en DB
	Themes                 *string           `json:"themes,omitempty"` // JSON array
	Description            *string           `json:"description,omitempty"`
	LicenceOrigine         string            `json:"licenceOrigine"`
	DateExpirationDroits   *time.Time        `json:"dateExpirationDroits,omitempty"`
	NomFichier             string            `json:"nomFichier"`
	CheminStockage         *string           `json:"cheminStockage,omitempty"` // clé R2
	TailleFichier          int               `json:"tailleFichier"`
	TypeMime               string            `json:"typeMime"`
	TelechargementAutorise bool              `json:"telechargementAutorise"`
	Visibility             VisibiliteOuvrage `json:"visibility"`
	Statut                 StatutOuvrage     `json:"statut"`
	CreatedByID            string            `json:"createdById"`
	CreatedAt              time.Time         `json:"createdAt"`
	UpdatedAt              time.Time         `json:"updatedAt"`
	DeletedAt              *time.Time        `json:"deletedAt,omitempty"`
	// Classes — ciblage « classe » (visibility=CLASSE uniquement).
	Classes []OuvrageClasseRef `json:"classes"`
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
	Visibilite     VisibiliteOuvrage // filtre provenance (000137)
	Statut         StatutOuvrage     // filtre modération (brouillons)
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

// CreateOuvrageInput — création (upload ADMIN/RESPONSABLE/ENSEIGNANT,
// 000137 : le périmètre est DÉRIVÉ DU RÔLE par le usecase, jamais pris
// du client).
type CreateOuvrageInput struct {
	// ID — généré par le usecase pour construire la clé R2
	// ouvrages/{id}/… AVANT l'INSERT (ADR-0007 §stockage) ; vide = le
	// repository en génère un.
	ID                     string
	EtablissementID        string // "" → NULL (dépôt PLATEFORME de l'ADMIN global)
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
	Visibility             VisibiliteOuvrage
	Statut                 StatutOuvrage
	Classes                []OuvrageClasseInput // visibility=CLASSE (intersection scellée serveur)
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
	// Visibility — promotion/démotion de périmètre : ADMIN SEUL (le
	// usecase le refuse sinon ; la policy Ouvrage_update 000137 fige
	// la visibilité des non-admin en 2e ligne de défense).
	Visibility *VisibiliteOuvrage
	// Statut — modération (BROUILLON→VALIDE) : RESPONSABLE de
	// l'établissement ou ADMIN (jamais l'enseignant déposant).
	Statut *StatutOuvrage
	// Classes — remplacement du ciblage CLASSE (l'intersection avec
	// les classes réelles de l'enseignant est scellée serveur).
	Classes      []OuvrageClasseInput
	UnsetClasses bool

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
	// SumTaillesPlateforme — quota du catalogue commun (ouvrages
	// PLATEFORME, 000137) ; soft-deleted inclus.
	SumTaillesPlateforme(ctx context.Context) (int64, error)
	// MesClassesEnseignant — les classes (filière, niveau) de
	// l'enseignant courant (EnseignantFiliere, RLS : ses lignes).
	MesClassesEnseignant(ctx context.Context) ([]OuvrageClasseRef, error)
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
