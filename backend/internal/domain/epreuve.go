// Package domain — entités Epreuve, Question, EpreuveQuestion.
package domain

import (
	"context"
	"encoding/json"
	"time"
)

// ============================================================
// ENUMS
// ============================================================

// StatutEpreuve — state machine: BROUILLON → PLANIFIEE → EN_COURS → TERMINEE → CLOTUREE
type StatutEpreuve string

const (
	StatutBrouillon StatutEpreuve = "BROUILLON"
	StatutPlanifiee StatutEpreuve = "PLANIFIEE"
	StatutEnCours   StatutEpreuve = "EN_COURS"
	StatutTerminee  StatutEpreuve = "TERMINEE"
	StatutCloturee  StatutEpreuve = "CLOTUREE"
)

// TypeQuestion
type TypeQuestion string

const (
	TypeQCU       TypeQuestion = "QCU"
	TypeQCM       TypeQuestion = "QCM"
	TypeQRC       TypeQuestion = "QRC"
	TypeReflexion TypeQuestion = "REFLEXION"
	TypeTRS       TypeQuestion = "TRS"
	TypeCode      TypeQuestion = "CODE"
)

// Difficulte
type Difficulte string

const (
	DifficulteFacile    Difficulte = "FACILE"
	DifficulteMoyen     Difficulte = "MOYEN"
	DifficulteDifficile Difficulte = "DIFFICILE"
	DifficulteExpert    Difficulte = "EXPERT"
)

// ModeGeneration
type ModeGeneration string

const (
	ModeManuelle   ModeGeneration = "MANUELLE"
	ModeIAAssistee ModeGeneration = "IA_ASSISTEE"
)

// SessionExamen
type SessionExamen string

const (
	SessionNormale        SessionExamen = "NORMALE"
	SessionRattrapage     SessionExamen = "RATTRAPAGE"
	SessionSpeciale       SessionExamen = "SPECIALE"
	SessionExceptionnelle SessionExamen = "EXCEPTIONNELLE"
	SessionDiffere        SessionExamen = "DIFFERE"
)

// ValidStatutsEpreuve valide un statut.
var ValidStatutsEpreuve = map[StatutEpreuve]bool{
	StatutBrouillon: true, StatutPlanifiee: true, StatutEnCours: true,
	StatutTerminee: true, StatutCloturee: true,
}

// ValidTypesQuestion valide un type.
var ValidTypesQuestion = map[TypeQuestion]bool{
	TypeQCU: true, TypeQCM: true, TypeQRC: true,
	TypeReflexion: true, TypeTRS: true, TypeCode: true,
}

// ValidDifficultes valide une difficulté.
var ValidDifficultes = map[Difficulte]bool{
	DifficulteFacile: true, DifficulteMoyen: true,
	DifficulteDifficile: true, DifficulteExpert: true,
}

// ValidModesGeneration valide un mode.
var ValidModesGeneration = map[ModeGeneration]bool{
	ModeManuelle: true, ModeIAAssistee: true,
}

// ValidSessionsExamen valide une session.
var ValidSessionsExamen = map[SessionExamen]bool{
	SessionNormale: true, SessionRattrapage: true, SessionSpeciale: true,
	SessionExceptionnelle: true, SessionDiffere: true,
}

// ============================================================
// QUESTION
// ============================================================

// Question représente une question de banque.
type Question struct {
	ID              string          `json:"id"`
	DocumentID      *string         `json:"documentId,omitempty"`
	AuteurID        *string         `json:"auteurId,omitempty"`
	Type            TypeQuestion    `json:"type"`
	Enonce          string          `json:"enonce"`
	Propositions    json.RawMessage `json:"propositions,omitempty"`    // JSON (peut être null)
	ReponseCorrecte json.RawMessage `json:"reponseCorrecte,omitempty"` // JSON
	Explication     *string         `json:"explication,omitempty"`
	Difficulte      Difficulte      `json:"difficulte"`
	Themes          json.RawMessage `json:"themes,omitempty"` // JSON array
	Tags            json.RawMessage `json:"tags,omitempty"`   // JSON array
	ScoreQualite    *float64        `json:"scoreQualite,omitempty"`
	Validee         bool            `json:"validee"`
	Langue          string          `json:"langue"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
	DeletedAt       *time.Time      `json:"deletedAt,omitempty"`
}

// CreateQuestionInput pour créer une question.
type CreateQuestionInput struct {
	Type            TypeQuestion    `json:"type"`
	Enonce          string          `json:"enonce"`
	Propositions    json.RawMessage `json:"propositions,omitempty"`
	ReponseCorrecte json.RawMessage `json:"reponseCorrecte,omitempty"`
	Explication     *string         `json:"explication,omitempty"`
	Difficulte      Difficulte      `json:"difficulte"`
	Themes          json.RawMessage `json:"themes,omitempty"`
	DocumentID      *string         `json:"documentId,omitempty"`
	AuteurID        *string         `json:"auteurId,omitempty"`
}

// UpdateQuestionInput — partial update.
type UpdateQuestionInput struct {
	Enonce          *string         `json:"enonce,omitempty"`
	Propositions    json.RawMessage `json:"propositions,omitempty"`
	ReponseCorrecte json.RawMessage `json:"reponseCorrecte,omitempty"`
	Explication     *string         `json:"explication,omitempty"`
	Difficulte      *Difficulte     `json:"difficulte,omitempty"`
	Themes          json.RawMessage `json:"themes,omitempty"`
	Tags            json.RawMessage `json:"tags,omitempty"`
	Validee         *bool           `json:"validee,omitempty"`
}

// QuestionListParams pour filtrer/paginer.
type QuestionListParams struct {
	UserID     string
	DocumentID string
	Type       string
	Difficulte string
	Validee    *bool
	Search     string
	Page       int
	Limit      int
}

// QuestionListResult paginé.
type QuestionListResult struct {
	Questions  []*Question `json:"questions"`
	Total      int         `json:"total"`
	Page       int         `json:"page"`
	Limit      int         `json:"limit"`
	TotalPages int         `json:"totalPages"`
}

// QuestionRepository interface.
type QuestionRepository interface {
	FindByID(ctx context.Context, id string) (*Question, error)
	List(ctx context.Context, params QuestionListParams, etablissementScope string) (*QuestionListResult, error)
	Create(ctx context.Context, input CreateQuestionInput, auteurID string) (*Question, error)
	Update(ctx context.Context, id string, input UpdateQuestionInput) (*Question, error)
	SoftDelete(ctx context.Context, id string) error
	BatchHardDelete(ctx context.Context, ids []string) (int, error)
}

// ============================================================
// EPREUVE
// ============================================================

// Epreuve représente une épreuve/examen.
type Epreuve struct {
	ID                      string          `json:"id"`
	EnseignantID            string          `json:"enseignantId"`
	Titre                   string          `json:"titre"`
	Description             *string         `json:"description,omitempty"`
	Duree                   int             `json:"duree"`
	DateDebut               time.Time       `json:"dateDebut"`
	DateFin                 time.Time       `json:"dateFin"`
	MelangeQuestions        bool            `json:"melangeQuestions"`
	MelangePropositions     bool            `json:"melangePropositions"`
	BlocageRetour           bool            `json:"blocageRetour"`
	Statut                  StatutEpreuve   `json:"statut"`
	GroupesCibles           json.RawMessage `json:"groupesCibles,omitempty"` // JSON {groupes, niveau}
	Contenu                 json.RawMessage `json:"contenu,omitempty"`       // JSONB {questions, consignes, baremeTotal}
	FiliereID               *string         `json:"filiereId,omitempty"`
	UniteEnseignementID     *string         `json:"uniteEnseignementId,omitempty"`
	Niveau                  *string         `json:"niveau,omitempty"`
	SessionExamen           SessionExamen   `json:"sessionExamen"`
	AnneeAcademiqueID       *string         `json:"anneeAcademiqueId,omitempty"`
	CreatedAt               time.Time       `json:"createdAt"`
	UpdatedAt               time.Time       `json:"updatedAt"`
	DeletedAt               *time.Time      `json:"deletedAt,omitempty"`
	ProctoringActif         bool            `json:"proctoringActif"`
	VerificationIdentite    bool            `json:"verificationIdentite"`
	GenerationMode          ModeGeneration  `json:"generationMode"`
	IsTemplate              bool            `json:"isTemplate"`
	NoteTotal               float64         `json:"noteTotal"`
	ClotureeAt              *time.Time      `json:"clotureeAt,omitempty"`
	ClotureeAutomatiquement bool            `json:"clotureeAutomatiquement"`
	RaisonCloture           *string         `json:"raisonCloture,omitempty"`
	ClotureePar             *string         `json:"clotureePar,omitempty"`
	DelaiGrace              int             `json:"delaiGrace"`
	EtudiantsAutorises      json.RawMessage `json:"etudiantsAutorises,omitempty"` // JSON array
	EpreuveOrigineID        *string         `json:"epreuveOrigineId,omitempty"`
	// Champs calculés
	QuestionCount *int     `json:"questionCount,omitempty"`
	TotalPoints   *float64 `json:"totalPoints,omitempty"`
	// BUGFIX (ETU-AUDIT-1) : Sessions peuplées uniquement quand EtudiantID
	// est fourni (vue étudiant /mes-epreuves). PAS de omitempty : un slice
	// nil sérialise en `null` qui fait crasher le frontend
	// (ep.sessions.some → TypeError). Le repo init toujours à []SessionRef{}.
	Sessions []SessionRef `json:"sessions"`
	// BUGFIX (ETU-AUDIT-1b) : Enseignant peuplé par LEFT JOIN User dans List.
	// Le frontend affiche ep.enseignant.name dans /mes-epreuves.
	Enseignant *UserRef `json:"enseignant,omitempty"`
	// BUGFIX (FILIERE-FIX-1b) : Filiere peuplé par LEFT JOIN Filiere dans List.
	// Le frontend affiche ep.filiere.nom + ep.niveau dans /mes-epreuves.
	Filiere *FiliereRef `json:"filiere,omitempty"`
}

// SessionRef est une référence légère à une SessionPassation (pour /mes-epreuves).
// BUGFIX (ETU-AUDIT-1) : permet au frontend d'afficher le statut de passation
// sans crash (ep.sessions.some(s => s.statut === 'SOUMISE')).
type SessionRef struct {
	ID        string        `json:"id"`
	Statut    StatutSession `json:"statut"`
	DateDebut *time.Time    `json:"dateDebut,omitempty"`
	DateFin   *time.Time    `json:"dateFin,omitempty"`
	Score     *float64      `json:"score,omitempty"`
}

// EpreuveQuestion est la liaison épreuve ↔ question (format relationnel legacy).
type EpreuveQuestion struct {
	ID         string  `json:"id"`
	EpreuveID  string  `json:"epreuveId"`
	QuestionID string  `json:"questionId"`
	Bareme     float64 `json:"bareme"`
	Ordre      int     `json:"ordre"`
}

// CreateEpreuveInput pour créer une épreuve.
type CreateEpreuveInput struct {
	EnseignantID        string                 `json:"enseignantId"`
	Titre               string                 `json:"titre"`
	Description         *string                `json:"description,omitempty"`
	Duree               int                    `json:"duree"`
	DateDebut           string                 `json:"dateDebut"` // ISO
	DateFin             string                 `json:"dateFin"`   // ISO
	MelangeQuestions    *bool                  `json:"melangeQuestions,omitempty"`
	MelangePropositions *bool                  `json:"melangePropositions,omitempty"`
	BlocageRetour       *bool                  `json:"blocageRetour,omitempty"`
	GroupesCibles       json.RawMessage        `json:"groupesCibles,omitempty"`
	Contenu             json.RawMessage        `json:"contenu,omitempty"`
	Questions           []EpreuveQuestionInput `json:"questions,omitempty"` // format legacy
	DocumentIDs         []string               `json:"documentIds,omitempty"`
	FiliereID           *string                `json:"filiereId,omitempty"`
	UniteEnseignementID *string                `json:"uniteEnseignementId"`
	NoteTotal           *float64               `json:"noteTotal,omitempty"`
	Niveau              *string                `json:"niveau,omitempty"`
	SessionExamen       SessionExamen          `json:"sessionExamen"`
	AnneeAcademiqueID   *string                `json:"anneeAcademiqueId,omitempty"`
	GenerationMode      ModeGeneration         `json:"generationMode"`
}

// EpreuveQuestionInput pour le format legacy.
type EpreuveQuestionInput struct {
	QuestionID string  `json:"questionId"`
	Bareme     float64 `json:"bareme"`
	Ordre      int     `json:"ordre"`
}

// UpdateEpreuveInput — partial update ou action.
type UpdateEpreuveInput struct {
	// Action discriminator (publier/lancer/terminer/cloturer)
	Action *string `json:"action,omitempty"`
	UserID *string `json:"userId,omitempty"` // pour cloturer (clotureePar)
	// General update fields
	Titre               *string         `json:"titre,omitempty"`
	Description         *string         `json:"description,omitempty"`
	Duree               *int            `json:"duree,omitempty"`
	DateDebut           *string         `json:"dateDebut,omitempty"`
	DateFin             *string         `json:"dateFin,omitempty"`
	MelangeQuestions    *bool           `json:"melangeQuestions,omitempty"`
	MelangePropositions *bool           `json:"melangePropositions,omitempty"`
	BlocageRetour       *bool           `json:"blocageRetour,omitempty"`
	GroupesCibles       json.RawMessage `json:"groupesCibles,omitempty"`
	Statut              *StatutEpreuve  `json:"statut,omitempty"`
	Niveau              *string         `json:"niveau,omitempty"`
	SessionExamen       *SessionExamen  `json:"sessionExamen,omitempty"`
	AnneeAcademiqueID   *string         `json:"anneeAcademiqueId,omitempty"`
	UniteEnseignementID *string         `json:"uniteEnseignementId,omitempty"`
	FiliereID           *string         `json:"filiereId,omitempty"`
	EtudiantsAutorises  json.RawMessage `json:"etudiantsAutorises,omitempty"`
	EpreuveOrigineID    *string         `json:"epreuveOrigineId,omitempty"`
}

// EpreuveListParams pour filtrer.
type EpreuveListParams struct {
	EnseignantID        string
	EtudiantID          string
	FiliereID           string
	ResponsableID       string
	Statuts             []string // multi-statut
	Select              string   // "summary"
	Search              string
	Niveau              string
	SessionExamen       string
	AnneeAcademiqueID   string
	UniteEnseignementID string
}

// EpreuveRepository interface.
type EpreuveRepository interface {
	FindByID(ctx context.Context, id string) (*Epreuve, error)
	List(ctx context.Context, params EpreuveListParams) ([]*Epreuve, error)
	Create(ctx context.Context, input CreateEpreuveInput) (*Epreuve, error)
	Update(ctx context.Context, id string, input UpdateEpreuveInput) (*Epreuve, error)
	SoftDelete(ctx context.Context, id string) error
	ListQuestions(ctx context.Context, epreuveID string) ([]*EpreuveQuestion, error)
}
