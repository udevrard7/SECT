// Package domain — entités Filieres, UE, EnseignantFiliere, AnneeAcademique.
package domain

import (
	"context"
	"time"
)

// ============================================================
// FILIERE
// ============================================================

// Filiere représente une filière de formation.
type Filiere struct {
	ID              string    `json:"id"`
	Nom             string    `json:"nom"`
	Code            *string   `json:"code,omitempty"`
	EtablissementID string    `json:"etablissementId"`
	ResponsableID   *string   `json:"responsableId,omitempty"`
	Description     *string   `json:"description,omitempty"`
	NbEtudiants     *int      `json:"nbEtudiants,omitempty"`
	Actif           bool      `json:"actif"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
	// Relations optionnelles
	Etablissement *EtablissementRef `json:"etablissement,omitempty"`
	Responsable   *UserRef          `json:"responsable,omitempty"`
	// BUGFIX (FILIERES-CRITICAL-FIX-1) : _count (style Prisma) peuplé par
	// List/FindByID via subquery count sur User(filiereId, role=ETUDIANT,
	// actif=true). Avant c’était countEtudiants *int (top-level, jamais peuplé)
	// — le frontend lisait _count.etudiants → undefined → 0 étudiants affichés.
	Count     *FiliereCount     `json:"_count,omitempty"`
	Etudiants []FiliereEtudiant `json:"etudiants,omitempty"`
}

// FiliereCount est l’objet imbriqué `_count` (style Prisma) attendu par le
// frontend pour afficher le nombre d’étudiants d’une filière dans la liste.
type FiliereCount struct {
	Etudiants int `json:"etudiants"`
}

// FiliereEtudiant est une référence étendue à un étudiant inscrit dans une
// filière (utilisée par Filiere.Etudiants dans FindByID pour le detail dialog).
type FiliereEtudiant struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Actif     bool      `json:"actif"`
	CreatedAt time.Time `json:"createdAt"`
}

// FiliereListParams pour filtrer les filières.
type FiliereListParams struct {
	Search          string
	ResponsableID   string
	Actif           *bool
	EtablissementID string
}

// CreateFiliereInput pour créer une filière.
type CreateFiliereInput struct {
	Nom             string  `json:"nom"`
	Code            *string `json:"code,omitempty"`
	EtablissementID string  `json:"etablissementId"`
	ResponsableID   *string `json:"responsableId,omitempty"`
	Description     *string `json:"description,omitempty"`
	NbEtudiants     *int    `json:"nbEtudiants,omitempty"`
	Actif           *bool   `json:"actif,omitempty"`
}

// UpdateFiliereInput — partial update.
type UpdateFiliereInput struct {
	Nom           *string `json:"nom,omitempty"`
	Code          *string `json:"code,omitempty"`
	ResponsableID *string `json:"responsableId,omitempty"`
	Description   *string `json:"description,omitempty"`
	NbEtudiants   *int    `json:"nbEtudiants,omitempty"`
	Actif         *bool   `json:"actif,omitempty"`
}

// BulkFiliereInput pour bulk activate/deactivate/delete (soft).
type BulkFiliereInput struct {
	IDs    []string `json:"ids"`
	Action string   `json:"action"` // "activate" | "deactivate" | "delete"
}

// FiliereDependencies résume les dépendances actives d’une filière (pour
// l’endpoint GET /api/filieres/{id}/dependencies et le check avant soft-delete).
// CanDelete = (EtudiantsCount == 0 && UEsCount == 0) : on empêche la
// désactivation d’une filière qui a encore des étudiants actifs ou des UEs.
type FiliereDependencies struct {
	EtudiantsCount int  `json:"etudiantsCount"`
	UEsCount       int  `json:"uesCount"`
	EpreuvesCount  int  `json:"epreuvesCount"`
	CanDelete      bool `json:"canDelete"`
}

// FiliereRepository interface.
type FiliereRepository interface {
	FindByID(ctx context.Context, id string) (*Filiere, error)
	List(ctx context.Context, params FiliereListParams) ([]*Filiere, error)
	Create(ctx context.Context, input CreateFiliereInput) (*Filiere, error)
	Update(ctx context.Context, id string, input UpdateFiliereInput) (*Filiere, error)
	SoftDelete(ctx context.Context, id string) (*Filiere, error)
	BulkUpdate(ctx context.Context, ids []string, actif bool, etablissementID string) (int, error)
	CountDependencies(ctx context.Context, id string) (epreuves, etudiants, ues int, err error)
	GetFiliereDependencies(ctx context.Context, id string) (*FiliereDependencies, error)
}

// ============================================================
// UNITE ENSEIGNEMENT
// ============================================================

// UniteEnseignement représente une unité d'enseignement.
type UniteEnseignement struct {
	ID             string    `json:"id"`
	Code           string    `json:"code"`
	Nom            string    `json:"nom"`
	Description    *string   `json:"description,omitempty"`
	FiliereID      string    `json:"filiereId"`
	Niveau         string    `json:"niveau"`
	Niveaux        *string   `json:"niveaux,omitempty"` // JSON array string
	Semestre       *int      `json:"semestre,omitempty"`
	CreditsECTS    *int      `json:"creditsECTS,omitempty"`
	VolumeHeuresCM int       `json:"volumeHeuresCM"`
	VolumeHeuresTD int       `json:"volumeHeuresTD"`
	VolumeHeuresTP int       `json:"volumeHeuresTP"`
	Obligatoire    bool      `json:"obligatoire"`
	Actif          bool      `json:"actif"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
	// Relations
	Filiere       *FiliereRef                `json:"filiere,omitempty"`
	FilieresSuppl []UniteEnseignementFiliere `json:"filieresSuppl,omitempty"`
	// BUGFIX (PROG-ACAD-1) : _count et Affectations peuplés par FindByID
	// pour la page /programme-academique (gestion des UEs).
	Count         *UECount          `json:"_count,omitempty"`
	Affectations  []AffectationRef  `json:"affectations,omitempty"`
}

// UECount est l'objet imbriqué _count (style Prisma) pour les UEs.
type UECount struct {
	Affectations int `json:"affectations"`
}

// AffectationRef est une référence légère à une Affectation (enseignant↔UE).
type AffectationRef struct {
	ID               string  `json:"id"`
	EnseignantID     string  `json:"enseignantId"`
	TypeSeance       string  `json:"typeSeance"`
	Groupe           *string `json:"groupe,omitempty"`
	VolumeHeures     float64 `json:"volumeHeures"`
	AnneeUniversitaire string `json:"anneeUniversitaire"`
	Statut           string  `json:"statut"`
	Commentaire      *string `json:"commentaire,omitempty"`
	Enseignant       *UserRef `json:"enseignant,omitempty"`
}

// Affectation représente une affectation enseignant↔UE (table Affectation).
type Affectation struct {
	ID                 string    `json:"id"`
	EnseignantID       string    `json:"enseignantId"`
	UniteEnseignementID string   `json:"uniteEnseignementId"`
	TypeSeance         string    `json:"typeSeance"`
	Groupe             *string   `json:"groupe,omitempty"`
	VolumeHeures       float64   `json:"volumeHeures"`
	AnneeUniversitaire string    `json:"anneeUniversitaire"`
	Statut             string    `json:"statut"`
	Commentaire        *string   `json:"commentaire,omitempty"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
	// Relations
	Enseignant         *UserRef     `json:"enseignant,omitempty"`
	UniteEnseignement  *UERef       `json:"uniteEnseignement,omitempty"`
}

// UERef est une référence légère à une UE (pour les affectations).
type UERef struct {
	ID    string `json:"id"`
	Code  string `json:"code"`
	Nom   string `json:"nom"`
	Niveau string `json:"niveau"`
}

// CreateAffectationInput pour créer une affectation enseignant↔UE.
type CreateAffectationInput struct {
	EnseignantID        string  `json:"enseignantId"`
	UniteEnseignementID string  `json:"uniteEnseignementId"`
	TypeSeance          string  `json:"typeSeance"`
	Groupe              *string `json:"groupe,omitempty"`
	VolumeHeures        float64 `json:"volumeHeures"`
	AnneeUniversitaire  string  `json:"anneeUniversitaire"`
	Statut              string  `json:"statut"`
	Commentaire         *string `json:"commentaire,omitempty"`
}

// UpdateAffectationInput pour mettre à jour une affectation (partial update).
type UpdateAffectationInput struct {
	TypeSeance         *string  `json:"typeSeance,omitempty"`
	Groupe             *string  `json:"groupe,omitempty"`
	VolumeHeures       *float64 `json:"volumeHeures,omitempty"`
	Statut             *string  `json:"statut,omitempty"`
	Commentaire        *string  `json:"commentaire,omitempty"`
}

// UniteEnseignementFiliere est la table de liaison (UE partagée avec d'autres filières).
type UniteEnseignementFiliere struct {
	ID                  string      `json:"id"`
	UniteEnseignementID string      `json:"uniteEnseignementId"`
	FiliereID           string      `json:"filiereId"`
	CreatedAt           time.Time   `json:"createdAt"`
	Filiere             *FiliereRef `json:"filiere,omitempty"`
}

// UEListParams pour filtrer les UEs.
type UEListParams struct {
	FiliereID       string
	Niveau          string
	Semestre        *int
	Actif           *bool
	EtablissementID string
	EnseignantID    string
	Search          string
}

// CreateUEInput pour créer une UE.
type CreateUEInput struct {
	Code            string   `json:"code"`
	Nom             string   `json:"nom"`
	FiliereID       string   `json:"filiereId"`
	Niveau          string   `json:"niveau"`
	Description     *string  `json:"description,omitempty"`
	FiliereIDsSuppl []string `json:"filiereIdsSuppl,omitempty"`
	Niveaux         *string  `json:"niveaux,omitempty"`
	Semestre        *int     `json:"semestre,omitempty"`
	CreditsECTS     *int     `json:"creditsECTS,omitempty"`
	VolumeHeuresCM  *int     `json:"volumeHeuresCM,omitempty"`
	VolumeHeuresTD  *int     `json:"volumeHeuresTD,omitempty"`
	VolumeHeuresTP  *int     `json:"volumeHeuresTP,omitempty"`
	Obligatoire     *bool    `json:"obligatoire,omitempty"`
	Actif           *bool    `json:"actif,omitempty"`
}

// UpdateUEInput — partial update.
type UpdateUEInput struct {
	Code            *string  `json:"code,omitempty"`
	Nom             *string  `json:"nom,omitempty"`
	Description     *string  `json:"description,omitempty"`
	FiliereID       *string  `json:"filiereId,omitempty"`
	FiliereIDsSuppl []string `json:"filiereIdsSuppl,omitempty"`
	Niveau          *string  `json:"niveau,omitempty"`
	Niveaux         *string  `json:"niveaux,omitempty"`
	Semestre        *int     `json:"semestre,omitempty"`
	CreditsECTS     *int     `json:"creditsECTS,omitempty"`
	VolumeHeuresCM  *int     `json:"volumeHeuresCM,omitempty"`
	VolumeHeuresTD  *int     `json:"volumeHeuresTD,omitempty"`
	VolumeHeuresTP  *int     `json:"volumeHeuresTP,omitempty"`
	Obligatoire     *bool    `json:"obligatoire,omitempty"`
	Actif           *bool    `json:"actif,omitempty"`
}

// UERepository interface.
// UEDependencies — comptes d'entités liées à une UE (avant suppression).
// PROG-ACAD-CRITICAL-FIX-1 (BUG #1) : permet d'avertir l'utilisateur
// avant de désactiver une UE qui a des épreuves/affectations/documents.
type UEDependencies struct {
	EpreuvesCount    int  `json:"epreuvesCount"`
	AffectationsCount int `json:"affectationsCount"`
	DocumentsCount   int  `json:"documentsCount"`
	CanDelete        bool `json:"canDelete"`
}

type UERepository interface {
	FindByID(ctx context.Context, id string) (*UniteEnseignement, error)
	List(ctx context.Context, params UEListParams) ([]*UniteEnseignement, error)
	Create(ctx context.Context, input CreateUEInput) (*UniteEnseignement, error)
	Update(ctx context.Context, id string, input UpdateUEInput) (*UniteEnseignement, error)
	SoftDelete(ctx context.Context, id string) (*UniteEnseignement, error)
	// GetUEDependencies retourne les comptes d'entités liées à une UE.
	GetUEDependencies(ctx context.Context, id string) (*UEDependencies, error)
}

// ============================================================
// ENSEIGNANT FILIERE
// ============================================================

// EnseignantFiliere représente une assignation enseignant ↔ filière + niveau.
type EnseignantFiliere struct {
	ID           string    `json:"id"`
	EnseignantID string    `json:"enseignantId"`
	FiliereID    string    `json:"filiereId"`
	Niveau       string    `json:"niveau"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	// Relations
	Enseignant *UserRef    `json:"enseignant,omitempty"`
	Filiere    *FiliereRef `json:"filiere,omitempty"`
}

// EnseignantFiliereListParams pour filtrer.
type EnseignantFiliereListParams struct {
	EnseignantID    string
	FiliereID       string
	EtablissementID string
	Niveau          string // PROG-ACAD-CRITICAL-FIX-1 (BUG #7)
}

// CreateAssignmentInput — single ou bulk.
type CreateAssignmentInput struct {
	EnseignantID string `json:"enseignantId"`
	FiliereID    string `json:"filiereId"`
	Niveau       string `json:"niveau"`
}

// CreateAssignmentsInput — bulk.
type CreateAssignmentsInput struct {
	Assignments []CreateAssignmentInput `json:"assignments"`
}

// DeleteAssignmentInput — by id ou by composite key.
type DeleteAssignmentInput struct {
	ID           *string `json:"id,omitempty"`
	EnseignantID *string `json:"enseignantId,omitempty"`
	FiliereID    *string `json:"filiereId,omitempty"`
	Niveau       *string `json:"niveau,omitempty"`
}

// EnseignantFiliereRepository interface.
type EnseignantFiliereRepository interface {
	List(ctx context.Context, params EnseignantFiliereListParams) ([]*EnseignantFiliere, error)
	Create(ctx context.Context, input CreateAssignmentInput) (*EnseignantFiliere, error)
	DeleteByID(ctx context.Context, id string) error
	DeleteByComposite(ctx context.Context, enseignantID, filiereID, niveau string) error
}

// ============================================================
// ANNEE ACADEMIQUE
// ============================================================

// AnneeAcademique représente une année académique d'un établissement.
type AnneeAcademique struct {
	ID              string    `json:"id"`
	Libelle         string    `json:"libelle"`
	DateDebut       time.Time `json:"dateDebut"`
	DateFin         time.Time `json:"dateFin"`
	EtablissementID string    `json:"etablissementId"`
	Actif           bool      `json:"actif"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
	CountEpreuves   *int      `json:"countEpreuves,omitempty"`
}

// CreateAnneeInput pour créer une année académique.
type CreateAnneeInput struct {
	Libelle         string `json:"libelle"`
	DateDebut       string `json:"dateDebut"` // ISO string
	DateFin         string `json:"dateFin"`   // ISO string
	EtablissementID string `json:"etablissementId"`
}

// UpdateAnneeInput pour modifier une année académique (tous optionnels).
// PROG-ACAD-CRITICAL-FIX-1 (BUG #9) : CRUD AnneeAcademique complet.
type UpdateAnneeInput struct {
	Libelle   *string `json:"libelle,omitempty"`
	DateDebut *string `json:"dateDebut,omitempty"` // ISO string
	DateFin   *string `json:"dateFin,omitempty"`   // ISO string
	Actif     *bool   `json:"actif,omitempty"`
}

// AnneeAcademiqueRepository interface.
type AnneeAcademiqueRepository interface {
	List(ctx context.Context, etablissementID string, actif *bool) ([]*AnneeAcademique, error)
	FindByID(ctx context.Context, id string) (*AnneeAcademique, error)
	Create(ctx context.Context, input CreateAnneeInput) (*AnneeAcademique, error)
	Update(ctx context.Context, id string, input UpdateAnneeInput) (*AnneeAcademique, error)
	SoftDelete(ctx context.Context, id string) (*AnneeAcademique, error)
}

// Validation helpers

// ValidNiveaux liste les niveaux valides.
var ValidNiveaux = map[string]bool{
	"L1": true, "L2": true, "L3": true,
	"M1": true, "M2": true, "DOCTORAT": true,
}

// IsValidNiveau vérifie qu'un niveau est valide.
func IsValidNiveau(n string) bool {
	return ValidNiveaux[n]
}
