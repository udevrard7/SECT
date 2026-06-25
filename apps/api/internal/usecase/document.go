// Package usecase — logique métier Documents + R2 storage.
package usecase

import (
	"context"
	"fmt"
	"strings"

	"github.com/udevrard7/sect/apps/api/internal/db"
	"github.com/udevrard7/sect/apps/api/internal/domain"
	"github.com/udevrard7/sect/apps/api/internal/storage"
)

// DocumentUseCase implémente les cas d'usage des documents.
type DocumentUseCase struct {
	docRepo    domain.DocumentRepository
	storage    domain.StorageClient
}

// NewDocumentUseCase crée un nouveau DocumentUseCase.
func NewDocumentUseCase(docRepo domain.DocumentRepository, storageClient domain.StorageClient) *DocumentUseCase {
	return &DocumentUseCase{docRepo: docRepo, storage: storageClient}
}

// UploadResult est le résultat d'un upload.
type UploadResult struct {
	Document  *domain.Document `json:"document"`
	Message   string           `json:"message"`
	WordCount int              `json:"wordCount"`
}

// Upload traite l'upload d'un fichier vers R2 + création en DB.
//
// Flux :
// 1. Valider le type de fichier (PDF, DOCX, TXT, MD, etc.)
// 2. Valider la taille (max 50 MB)
// 3. Uploader le fichier vers R2
// 4. Extraire le texte (TXT/MD en v1 — PDF/DOCX plus tard)
// 5. Créer le document en DB avec cheminStockage = clé R2
func (uc *DocumentUseCase) Upload(ctx context.Context, claims db.SessionClaims, filename string, content []byte, uniteEnseignementID *string) (*UploadResult, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleEnseignant && role != domain.RoleAdmin {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}

	// 1. Valider le type
	mimeType, supported := domain.IsSupportedFileType(filename)
	if !supported {
		return nil, &domain.ValidationError{Field: "file", Message: "format non supporté. Formats acceptés : PDF, DOCX, DOC, PPTX, TXT, MD"}
	}

	// 2. Valider la taille
	fileSize := len(content)
	if int64(fileSize) > domain.MaxFileSize {
		return nil, &domain.ValidationError{Field: "file", Message: "fichier trop volumineux. Taille maximale : 50 Mo"}
	}

	// 3. Upload vers R2
	objectKey := storage.GenerateObjectKey(claims.UserID, filename)
	if uc.storage != nil {
		_, err := uc.storage.Upload(ctx, domain.StorageObject{
			Key:         objectKey,
			Content:     content,
			ContentType: mimeType,
			ContentLength: int64(fileSize),
		})
		if err != nil {
			return nil, fmt.Errorf("upload to R2: %w", err)
		}
	}

	// 4. Extraire le texte (v1: TXT/MD uniquement)
	var contenuTexte *string
	var statutAnalyse domain.StatutAnalyse
	var erreurAnalyse *string
	wordCount := 0

	text, extracted := extractText(filename, content)
	if extracted {
		contenuTexte = &text
		wordCount = countWords(text)
		if wordCount > 0 {
			statutAnalyse = domain.StatutAnalyseEnCours
		} else {
			statutAnalyse = domain.StatutAnalyseErreur
			errMsg := "aucun texte exploitable extrait du document"
			erreurAnalyse = &errMsg
		}
	} else {
		// PDF/DOCX : texte non extrait en v1, mais le fichier est stocké dans R2
		statutAnalyse = domain.StatutAnalyseEnAttente
		errMsg := "extraction de texte non disponible pour ce format en Go (fichier stocké dans R2)"
		erreurAnalyse = &errMsg
	}

	// 5. Créer en DB
	sizeInt := fileSize
	doc, err := uc.docRepo.Create(ctx, domain.CreateDocumentInput{
		OwnerID:             claims.UserID,
		NomFichier:          filename,
		CheminStockage:      objectKey,
		TailleFichier:       &sizeInt,
		TypeMime:            &mimeType,
		StatutAnalyse:       statutAnalyse,
		ContenuTexte:        contenuTexte,
		ErreurAnalyse:       erreurAnalyse,
		UniteEnseignementID: uniteEnseignementID,
	})
	if err != nil {
		// Best-effort: supprimer le fichier de R2 si la DB échoue
		if uc.storage != nil {
			_ = uc.storage.Delete(ctx, objectKey)
		}
		return nil, fmt.Errorf("create document: %w", err)
	}

	message := "Document uploadé avec succès"
	if contenuTexte != nil && wordCount > 0 {
		message = "Document uploadé et texte extrait avec succès"
	} else if erreurAnalyse != nil {
		message = "Document uploadé mais extraction du texte impossible"
	}

	return &UploadResult{
		Document:  doc,
		Message:   message,
		WordCount: wordCount,
	}, nil
}

// List liste les documents de l'utilisateur courant.
func (uc *DocumentUseCase) List(ctx context.Context, claims db.SessionClaims) ([]*domain.Document, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleEnseignant && role != domain.RoleAdmin {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.docRepo.ListByOwner(ctx, claims.UserID)
}

// GetByID récupère un document par ID.
func (uc *DocumentUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.Document, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleEnseignant && role != domain.RoleAdmin {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.docRepo.FindByID(ctx, id)
}

// SoftDelete déplace un document vers la corbeille + supprime de R2.
func (uc *DocumentUseCase) SoftDelete(ctx context.Context, claims db.SessionClaims, id string) error {
	role := domain.Role(claims.Role)
	if role != domain.RoleEnseignant && role != domain.RoleAdmin {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}

	// Récupérer le document pour avoir la clé R2
	doc, err := uc.docRepo.FindByID(ctx, id)
	if err != nil {
		return err
	}

	// Soft delete en DB
	if err := uc.docRepo.SoftDelete(ctx, id); err != nil {
		return err
	}

	// Best-effort: supprimer de R2 (le fichier reste accessible si besoin via corbeille)
	if uc.storage != nil && doc.CheminStockage != "" {
		_ = uc.storage.Delete(ctx, doc.CheminStockage)
	}

	return nil
}

// GetDownloadURL génère une URL présignée pour télécharger un document.
func (uc *DocumentUseCase) GetDownloadURL(ctx context.Context, claims db.SessionClaims, id string, expiresIn int) (string, error) {
	role := domain.Role(claims.Role)
	if role != domain.RoleEnseignant && role != domain.RoleAdmin {
		return "", &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}

	doc, err := uc.docRepo.FindByID(ctx, id)
	if err != nil {
		return "", err
	}

	if uc.storage == nil {
		return "", fmt.Errorf("storage client not configured")
	}

	return uc.storage.PresignURL(ctx, doc.CheminStockage, expiresIn)
}

// --- Text extraction helpers ---

// extractText extrait le texte d'un fichier (v1: TXT/MD uniquement).
func extractText(filename string, content []byte) (string, bool) {
	lower := strings.ToLower(filename)
	if strings.HasSuffix(lower, ".txt") || strings.HasSuffix(lower, ".md") {
		return string(content), true
	}
	// PDF, DOCX, etc. — non supporté en v1 (nécessite librairies externes)
	return "", false
}

// countWords compte le nombre de mots dans un texte.
func countWords(text string) int {
	return len(strings.Fields(text))
}
