// Package domain — entités Certificat + Correction.
package domain

import (
	"context"
	"time"
)

// ============================================================
// ENUMS
// ============================================================

// TypeCertificat
type TypeCertificat string

const (
	TypeCertificatReussite      TypeCertificat = "REUSSITE"
	TypeCertificatAccompl       TypeCertificat = "ACCOMPLISSEMENT"
	TypeCertificatParticipation TypeCertificat = "PARTICIPATION"
)

// StatutCertificat
type StatutCertificat string

const (
	StatutCertificatActif   StatutCertificat = "ACTIF"
	StatutCertificatRevoque StatutCertificat = "REVOQUE"
	StatutCertificatExpire  StatutCertificat = "EXPIRE"
)

// ValidTypesCertificat valide un type.
var ValidTypesCertificat = map[TypeCertificat]bool{
	TypeCertificatReussite: true, TypeCertificatAccompl: true, TypeCertificatParticipation: true,
}

// ValidStatutsCertificat valide un statut.
var ValidStatutsCertificat = map[StatutCertificat]bool{
	StatutCertificatActif: true, StatutCertificatRevoque: true, StatutCertificatExpire: true,
}

// ============================================================
// CERTIFICAT
// ============================================================

// Certificat représente un certificat émis pour un étudiant.
type Certificat struct {
	ID                 string           `json:"id"`
	CodeVerification   string           `json:"codeVerification"`
	EtudiantID         string           `json:"etudiantId"`
	ValidationUEID     string           `json:"validationUEId"`
	Type               TypeCertificat   `json:"type"`
	Intitule           string           `json:"intitule"`
	Mention            *string          `json:"mention,omitempty"`
	NoteFinale         float64          `json:"noteFinale"`
	EtablissementNom   string           `json:"etablissementNom"`
	EtablissementLogo  *string          `json:"etablissementLogo,omitempty"`
	EtablissementVille *string          `json:"etablissementVille,omitempty"`
	EtablissementPays  *string          `json:"etablissementPays,omitempty"`
	FiliereNom         string           `json:"filiereNom"`
	FiliereCode        *string          `json:"filiereCode,omitempty"`
	UECode             string           `json:"ueCode"`
	UENom              string           `json:"ueNom"`
	CreditsECTS        *int             `json:"creditsECTS,omitempty"`
	EtudiantNom        string           `json:"etudiantNom"`
	EtudiantMatricule  *string          `json:"etudiantMatricule,omitempty"`
	EtudiantNiveau     *string          `json:"etudiantNiveau,omitempty"`
	SessionType        string           `json:"sessionType"`
	AnneeAcademique    *string          `json:"anneeAcademique,omitempty"`
	DateEmission       time.Time        `json:"dateEmission"`
	EmetteParID        string           `json:"emetteParId"`
	PDFUrl             *string          `json:"pdfUrl,omitempty"`
	Statut             StatutCertificat `json:"statut"`
	DateRevocation     *time.Time       `json:"dateRevocation,omitempty"`
	RaisonRevocation   *string          `json:"raisonRevocation,omitempty"`
	CreatedAt          time.Time        `json:"createdAt"`
	UpdatedAt          time.Time        `json:"updatedAt"`
}

// CertificatListParams pour filtrer.
type CertificatListParams struct {
	EtudiantID string
	Type       string
	Statut     string
}

// CreateCertificatInput pour créer un certificat.
type CreateCertificatInput struct {
	ValidationUEID string
	Type           TypeCertificat
}

// CertificatRepository interface.
type CertificatRepository interface {
	FindByID(ctx context.Context, id string) (*Certificat, error)
	FindByCode(ctx context.Context, code string) (*Certificat, error)
	List(ctx context.Context, params CertificatListParams) ([]*Certificat, error)
	Create(ctx context.Context, c *Certificat) (*Certificat, error)
	Revoke(ctx context.Context, id string, raison string) error
}

// ============================================================
// CORRECTION (sessions à corriger pour un enseignant)
// ============================================================

// CorrectionSession représente une session à corriger (vue enseignant).
type CorrectionSession struct {
	SessionID     string              `json:"sessionId"`
	EtudiantID    string              `json:"etudiantId"`
	EtudiantNom   string              `json:"etudiantNom"`
	EtudiantEmail string              `json:"etudiantEmail"`
	EpreuveID     string              `json:"epreuveId"`
	EpreuveTitre  string              `json:"epreuveTitre"`
	Statut        string              `json:"statut"`
	DateFin       *time.Time          `json:"dateFin,omitempty"`
	Score         *float64            `json:"score,omitempty"`
	Reponses      []CorrectionReponse `json:"reponses,omitempty"`
}

// CorrectionReponse représente une réponse à corriger.
type CorrectionReponse struct {
	ID              string   `json:"id"`
	QuestionID      string   `json:"questionId"`
	Contenu         *string  `json:"contenu,omitempty"`
	Score           *float64 `json:"score,omitempty"`
	Commentaire     *string  `json:"commentaire,omitempty"`
	NoteIA          *float64 `json:"noteIA,omitempty"`
	JustificationIA *string  `json:"justificationIA,omitempty"`
}

// CorrectionListParams pour filtrer.
type CorrectionListParams struct {
	EnseignantID string
	EpreuveID    string
}

// UpdateReponseInput pour mettre à jour le score d'une réponse.
type UpdateReponseInput struct {
	Score       *float64 `json:"score,omitempty"`
	Commentaire *string  `json:"commentaire,omitempty"`
}

// CorrectionRepository interface.
type CorrectionRepository interface {
	ListSessions(ctx context.Context, params CorrectionListParams) ([]*CorrectionSession, error)
	UpdateReponse(ctx context.Context, reponseID string, input UpdateReponseInput) error
	RetournerSession(ctx context.Context, sessionID string) error
	RetournerBatch(ctx context.Context, sessionIDs []string) (int, error)
}
