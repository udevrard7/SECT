// Package domain — bibliothèque numérique P4 : dimension sociale
// (ADR-0008, exécution de l'ADR-0007 §P4).
//
// Trois entités : OuvrageAnnotation (annotations de page à visibilité
// PRIVEE/FILIERE/ETABLISSEMENT), OuvrageProposition (file G1
// RESPONSABLE→ADMIN), OuvrageVeille (veille thématique sur la
// recherche). Plus les types du badge « lecteur assidu » — le premier
// badge décerné par le backend Go (le writer BadgeProgression
// n'existait pas avant P4, cf. ADR-0008 §3).
package domain

import (
	"context"
	"time"
)

// ──────────────────────────────────────────────────────────────────────
// Annotations (ADR-0008 §1)
// ──────────────────────────────────────────────────────────────────────

// VisibiliteAnnotation — visibilité d'une annotation (enum 000127).
type VisibiliteAnnotation string

const (
	VisibiliteAnnotationPrivee        VisibiliteAnnotation = "PRIVEE"
	VisibiliteAnnotationFiliere       VisibiliteAnnotation = "FILIERE"
	VisibiliteAnnotationEtablissement VisibiliteAnnotation = "ETABLISSEMENT"
)

// IsValidVisibiliteAnnotation valide la valeur de l'enum.
func IsValidVisibiliteAnnotation(v VisibiliteAnnotation) bool {
	switch v {
	case VisibiliteAnnotationPrivee, VisibiliteAnnotationFiliere, VisibiliteAnnotationEtablissement:
		return true
	}
	return false
}

// Bornes des annotations (défense en profondeur — la longueur est aussi
// bornée côté UI).
const (
	MaxPageAnnotation    = MaxPageOuvrage // 1..100000 (même espace que la lecture P2)
	MaxContenuAnnotation = 2000
	MinContenuAnnotation = 1
)

// OuvrageAnnotation — une annotation de page sur un ouvrage visible.
// UserNom/FiliereNom sont hydratés au listage (JOIN User — autorisé pour
// les queries du repo, seules les policies ne doivent pas JOIN).
type OuvrageAnnotation struct {
	ID         string               `json:"id"`
	OuvrageID  string               `json:"ouvrageId"`
	UserID     string               `json:"userId"`
	UserNom    string               `json:"userNom"`
	FiliereID  *string              `json:"filiereId"`
	Page       int                  `json:"page"`
	Contenu    string               `json:"contenu"`
	Visibilite VisibiliteAnnotation `json:"visibilite"`
	CreatedAt  time.Time            `json:"createdAt"`
	UpdatedAt  time.Time            `json:"updatedAt"`
}

// CreateAnnotationInput — POST /api/ouvrages/{id}/annotations.
type CreateAnnotationInput struct {
	OuvrageID  string
	UserID     string
	FiliereID  *string // snapshot de la filière de l'auteur
	Page       int
	Contenu    string
	Visibilite VisibiliteAnnotation
}

// UpdateAnnotationInput — PATCH (champs optionnels ; absent = inchangé).
type UpdateAnnotationInput struct {
	Contenu    *string
	Visibilite *VisibiliteAnnotation
}

// OuvrageAnnotationRepository — implémenté par repository/ouvrage_annotation.go.
// Toutes les méthodes passent par db.WithTx avec les claims du context ;
// le scoping (propriétaire, visibilité, ouvrage visible) est fait par les
// policies OuvrageAnnotation_* (000127).
type OuvrageAnnotationRepository interface {
	// ListByOuvrage — annotations visibles de l'appelant (page 0 = toutes).
	ListByOuvrage(ctx context.Context, ouvrageID string, page int) ([]OuvrageAnnotation, error)
	// Create — RLS WITH CHECK : propriétaire + ouvrage visible.
	Create(ctx context.Context, input CreateAnnotationInput) (*OuvrageAnnotation, error)
	// Update — propriétaire seul (RLS UPDATE) ; 0 ligne → NotFoundError.
	Update(ctx context.Context, annotationID string, input UpdateAnnotationInput) (*OuvrageAnnotation, error)
	// Delete — propriétaire seul (RLS DELETE) ; 0 ligne → NotFoundError.
	Delete(ctx context.Context, annotationID string) error
}

// ──────────────────────────────────────────────────────────────────────
// Propositions (ADR-0008 §2) — file G1 RESPONSABLE → ADMIN
// ──────────────────────────────────────────────────────────────────────

// StatutProposition — statut d'une proposition (enum 000127).
type StatutProposition string

const (
	PropositionEnAttente StatutProposition = "EN_ATTENTE"
	PropositionAcceptee  StatutProposition = "ACCEPTEE"
	PropositionRefusee   StatutProposition = "REFUSEE"
)

// OuvrageProposition — demande d'ajout d'ouvrage (métadonnées SANS
// fichier : le dépôt du PDF reste un acte ADMIN, G1 inchangé).
// ProposantNom/OuvrageTitre hydratés au listage.
type OuvrageProposition struct {
	ID               string            `json:"id"`
	EtablissementID  string            `json:"etablissementId"`
	ProposantID      string            `json:"proposantId"`
	ProposantNom     string            `json:"proposantNom"`
	Titre            string            `json:"titre"`
	Auteurs          *string           `json:"auteurs"`
	Categorie        CategorieOuvrage  `json:"categorie"`
	Editeur          *string           `json:"editeur"`
	AnneePublication *int              `json:"anneePublication"`
	ISBN             *string           `json:"isbn"`
	Langue           *string           `json:"langue"`
	FiliereID        *string           `json:"filiereId"`
	Niveau           *string           `json:"niveau"`
	Themes           *string           `json:"themes"`
	Description      *string           `json:"description"`
	LicenceOrigine   string            `json:"licenceOrigine"`
	Statut           StatutProposition `json:"statut"`
	MotifRefus       *string           `json:"motifRefus"`
	TrancheParID     *string           `json:"trancheParId"`
	TrancheAt        *time.Time        `json:"trancheAt"`
	OuvrageID        *string           `json:"ouvrageId"`
	OuvrageTitre     *string           `json:"ouvrageTitre"`
	CreatedAt        time.Time         `json:"createdAt"`
	UpdatedAt        time.Time         `json:"updatedAt"`
}

// CreatePropositionInput — POST /api/ouvrages/propositions (RESPONSABLE).
type CreatePropositionInput struct {
	EtablissementID  string
	ProposantID      string
	Titre            string
	Auteurs          *string
	Categorie        CategorieOuvrage
	Editeur          *string
	AnneePublication *int
	ISBN             *string
	Langue           *string
	FiliereID        *string
	Niveau           *string
	Themes           *string
	Description      *string
	LicenceOrigine   string
}

// TranchePropositionInput — POST /api/ouvrages/propositions/{id}/trancher
// (ADMIN). decision ACCEPTEE ou REFUSEE ; motifRefus requis si REFUSEE.
type TranchePropositionInput struct {
	Decision   StatutProposition `json:"decision"`
	MotifRefus *string           `json:"motifRefus"`
}

// PropositionListParams — GET (statut vide = tous ; l'ADMIN voit tout,
// le RESPONSABLE voit ses propositions — scoping RLS).
type PropositionListParams struct {
	Statut StatutProposition
	Page   int
	Limit  int
}

// PropositionListResult — page + total (pagination normalisée).
type PropositionListResult struct {
	Propositions []OuvrageProposition `json:"propositions"`
	Total        int                  `json:"total"`
	Page         int                  `json:"page"`
	Limit        int                  `json:"limit"`
}

// OuvragePropositionRepository — implémenté par repository/ouvrage_proposition.go.
type OuvragePropositionRepository interface {
	List(ctx context.Context, params PropositionListParams) (*PropositionListResult, error)
	// FindByID — 0 ligne → NotFoundError (RLS : l'appelant ne voit que
	// ses propositions, l'ADMIN voit tout).
	FindByID(ctx context.Context, id string) (*OuvrageProposition, error)
	// Create — RLS WITH CHECK : RESPONSABLE, son etab.
	Create(ctx context.Context, input CreatePropositionInput) (*OuvrageProposition, error)
	// Trancher — transition EN_ATTENTE → ACCEPTEE/REFUSEE (ADMIN, RLS
	// UPDATE) ; déjà tranchée → ConflictError.
	Trancher(ctx context.Context, id string, statut StatutProposition, motifRefus *string, trancheParID string) (*OuvrageProposition, error)
	// LinkOuvrage — pose ouvrageId sur une proposition ACCEPTEE (dépôt
	// ADMIN via POST /api/ouvrages?propositionId) ; 0 ligne → NotFoundError.
	LinkOuvrage(ctx context.Context, id, ouvrageID string) error
	// Delete — ADMIN ∨ retrait du proposant EN_ATTENTE (RLS DELETE).
	Delete(ctx context.Context, id string) error
}

// ──────────────────────────────────────────────────────────────────────
// Veilles (ADR-0008 §4)
// ──────────────────────────────────────────────────────────────────────

// Bornes des veilles.
const (
	MinTermeVeille = 2
	MaxTermeVeille = 100
)

// OuvrageVeille — une recherche sauvegardée ; le dépôt d'un ouvrage
// matchant le terme notifie l'abonné (même établissement).
type OuvrageVeille struct {
	ID              string            `json:"id"`
	UserID          string            `json:"userId"`
	EtablissementID string            `json:"etablissementId"`
	Terme           string            `json:"terme"`
	Categorie       *CategorieOuvrage `json:"categorie"`
	CreatedAt       time.Time         `json:"createdAt"`
	UpdatedAt       time.Time         `json:"updatedAt"`
}

// CreateVeilleInput — POST /api/ouvrages/veilles.
type CreateVeilleInput struct {
	UserID          string
	EtablissementID string
	Terme           string
	Categorie       *CategorieOuvrage
}

// OuvrageVeilleRepository — implémenté par repository/ouvrage_veille.go.
type OuvrageVeilleRepository interface {
	// ListByUser — les veilles de l'appelant (RLS propriétaire).
	ListByUser(ctx context.Context, userID string) ([]OuvrageVeille, error)
	// Create — UNIQUE(userId, terme) → ConflictError (23505).
	Create(ctx context.Context, input CreateVeilleInput) (*OuvrageVeille, error)
	// Delete — propriétaire (RLS) ; 0 ligne → NotFoundError.
	Delete(ctx context.Context, id, userID string) error
	// MatchingAbonnes — les veilles d'un établissement dont le terme
	// matche l'ouvrage (ILIKE titre/auteurs/themes/description + filtre
	// catégorie). S'exécute sous claims SYSTEM (le déposant ADMIN ne
	// voit pas les veilles des lecteurs — policy select is_system).
	MatchingAbonnes(ctx context.Context, etablissementID string, o *Ouvrage) ([]OuvrageVeille, error)
}

// ──────────────────────────────────────────────────────────────────────
// Badge « lecteur assidu » (ADR-0008 §3) — premier writer Go
// ──────────────────────────────────────────────────────────────────────

// LecteurAssiduCle — la clé de la BadgeDefinition seedée en 000128.
const LecteurAssiduCle = "lecteur_assidu"

// Paliers du badge, en SECONDES de lecture cumulées (ADR-0008 §3).
const (
	LecteurAssiduBronzeSeuil  = 1800  // 30 minutes
	LecteurAssiduArgentSeuil  = 7200  // 2 heures
	LecteurAssiduOrSeuil      = 21600 // 6 heures
	LecteurAssiduDiamantSeuil = 72000 // 20 heures
)

// BadgeProgressionSnapshot — l'état courant d'une progression (lecture
// avant upsert, pour détecter les nouvelles obtentions).
type BadgeProgressionSnapshot struct {
	NiveauActuel   string
	ValeurActuelle int
	Debloque       bool
	DateObtention  *time.Time
}

// BadgeProgressionUpsert — les valeurs à écrire (l'upsert résout la
// définition par cle ; ON CONFLICT (userId, badgeDefinitionId)).
type BadgeProgressionUpsert struct {
	NiveauActuel   string     // "BRONZE"|"ARGENT"|"OR"|"DIAMANT" (texte de l'enum)
	ValeurActuelle int        // secondes cumulées
	ValeurPalier   int        // seuil du prochain niveau (ou du niveau max)
	ValeurProchain *int       // idem palier si un prochain niveau existe, nil au max
	Debloque       bool       // niveauActuel atteint
	DateObtention  *time.Time // date du niveau courant
}

// BadgeProgressionRepository — implémenté par repository/badge_progression.go.
// Lecteur (GetByCle) sous les claims de l'appelant (self) ; l'upsert
// fonctionne sous claims du lecteur (userId = self) comme sous claims
// system (policy modify is_system OR self — 000128).
type BadgeProgressionRepository interface {
	// GetByCle — (nil, nil) si aucune progression.
	GetByCle(ctx context.Context, userID, cle string) (*BadgeProgressionSnapshot, error)
	// UpsertByCle — insert ou update (dernier écrivain gagne ; la
	// métrique est recomputée depuis OuvrageLecture, donc idempotente).
	UpsertByCle(ctx context.Context, userID, cle string, in BadgeProgressionUpsert) error
}
