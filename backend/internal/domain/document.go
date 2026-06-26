// Package domain — entité Document + storage interface.
package domain

import (
	"context"
	"time"
)

// StatutAnalyse — statut d'analyse IA d'un document.
type StatutAnalyse string

const (
	StatutAnalyseEnAttente StatutAnalyse = "EN_ATTENTE"
	StatutAnalyseEnCours   StatutAnalyse = "EN_COURS"
	StatutAnalyseAnalyse   StatutAnalyse = "ANALYSE"
	StatutAnalyseErreur    StatutAnalyse = "ERREUR"
)

// DocumentRef est une référence légère à un document (ENS-AUDIT-3).
// Utilisé pour inclure le nom du fichier dans les listes de HelpThread sans
// alourdir la réponse avec toute l'entité Document.
type DocumentRef struct {
	ID         string `json:"id"`
	NomFichier string `json:"nomFichier"`
}

// Document représente un fichier uploadé (PDF, DOCX, TXT, etc.).
type Document struct {
	ID                  string        `json:"id"`
	OwnerID             string        `json:"ownerId"`
	NomFichier          string        `json:"nomFichier"`
	CheminStockage      string        `json:"cheminStockage"` // R2 object key
	TailleFichier       *int          `json:"tailleFichier,omitempty"`
	TypeMime            *string       `json:"typeMime,omitempty"`
	StatutAnalyse       StatutAnalyse `json:"statutAnalyse"`
	ThemesDetectes      *string       `json:"themesDetectes,omitempty"` // JSON
	ConceptsCles        *string       `json:"conceptsCles,omitempty"`   // JSON
	VolumeEstime        *string       `json:"volumeEstime,omitempty"`   // JSON
	ContenuTexte        *string       `json:"contenuTexte,omitempty"`
	DateUpload          time.Time     `json:"dateUpload"`
	CreatedAt           time.Time     `json:"createdAt"`
	UpdatedAt           time.Time     `json:"updatedAt"`
	DeletedAt           *time.Time    `json:"deletedAt,omitempty"`
	ErreurAnalyse       *string       `json:"erreurAnalyse,omitempty"`
	ResumeAnalyse       *string       `json:"resumeAnalyse,omitempty"`
	UniteEnseignementID *string       `json:"uniteEnseignementId,omitempty"`
}

// CreateDocumentInput pour créer un document.
type CreateDocumentInput struct {
	OwnerID             string
	NomFichier          string
	CheminStockage      string // R2 object key
	TailleFichier       *int
	TypeMime            *string
	StatutAnalyse       StatutAnalyse
	ContenuTexte        *string
	ErreurAnalyse       *string
	UniteEnseignementID *string
}

// DocumentRepository interface.
type DocumentRepository interface {
	FindByID(ctx context.Context, id string) (*Document, error)
	ListByOwner(ctx context.Context, ownerID string) ([]*Document, error)
	Create(ctx context.Context, input CreateDocumentInput) (*Document, error)
	SoftDelete(ctx context.Context, id string) error
}

// ============================================================
// STORAGE (Cloudflare R2 — S3 compatible)
// ============================================================

// StorageObject représente un objet stocké dans R2.
type StorageObject struct {
	Key           string
	Content       []byte
	ContentType   string
	ContentLength int64
}

// StorageClient interface pour le stockage de fichiers (R2, S3, etc.).
type StorageClient interface {
	// Upload stocke un objet dans R2. Retourne l'URL publique ou la clé.
	Upload(ctx context.Context, obj StorageObject) (key string, err error)

	// Download récupère un objet depuis R2 par sa clé.
	Download(ctx context.Context, key string) ([]byte, error)

	// Delete supprime un objet de R2.
	Delete(ctx context.Context, key string) error

	// PresignURL génère une URL présignée pour télécharger un objet (validité en secondes).
	PresignURL(ctx context.Context, key string, expiresIn int) (string, error)
}

// SupportedFileTypes — types de fichiers supportés pour l'upload.
var SupportedFileTypes = map[string]string{
	".pdf":  "application/pdf",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".doc":  "application/msword",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".txt":  "text/plain",
	".md":   "text/markdown",
}

// MaxFileSize — taille maximale des fichiers (50 MB).
const MaxFileSize = 50 * 1024 * 1024

// IsSupportedFileType vérifie si l'extension du fichier est supportée.
func IsSupportedFileType(filename string) (string, bool) {
	for ext, mime := range SupportedFileTypes {
		if len(filename) >= len(ext) && filename[len(filename)-len(ext):] == ext {
			return mime, true
		}
	}
	return "", false
}
