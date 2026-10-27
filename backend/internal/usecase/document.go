// Package usecase — logique métier Documents + R2 storage.
package usecase

import (
        "context"
        "fmt"
        "strings"

        "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/domain"
        "github.com/udevrard7/sect/backend/internal/storage"
        "github.com/udevrard7/sect/backend/internal/worker"
)

// DocumentUseCase implémente les cas d'usage des documents.
type DocumentUseCase struct {
        docRepo domain.DocumentRepository
        storage domain.StorageClient
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
//  1. Valider le type de fichier (PDF, DOCX, TXT, MD, etc.)
//  2. Valider la taille (max 50 MB)
//  3. Extraire le texte (SECT-DOC-IA-1 v2 : PDF via pdftotext, DOCX/PPTX
//     pur Go — avant : TXT/MD seulement, donc TOUT PDF uploadé restait
//     EN_ATTENTE sans analyse IA possible)
//  4. Uploader le fichier vers R2
//  5. Créer le document en DB avec cheminStockage = clé R2
//  6. Déclencher l'analyse IA en arrière-plan
func (uc *DocumentUseCase) Upload(ctx context.Context, claims db.SessionClaims, filename string, content []byte, uniteEnseignementID *string) (*UploadResult, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleEnseignant && role != domain.RoleAdmin {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // 1. Valider le type
        mimeType, supported := domain.IsSupportedFileType(filename)
        if !supported {
                return nil, &domain.ValidationError{Field: "file", Message: "format non supporté. Formats acceptés : PDF, DOCX, PPTX, DOC, PPT, TXT, MD"}
        }

        // 2. Valider la taille
        fileSize := len(content)
        if int64(fileSize) > domain.MaxFileSize {
                return nil, &domain.ValidationError{Field: "file", Message: "fichier trop volumineux. Taille maximale : 50 Mo"}
        }

        // 3. Extraire le texte AVANT l'upload R2 : si l'extraction échoue
        // (outil absent, PDF scanné), le document part quand même en stockage
        // — l'utilisateur peut relancer l'analyse plus tard via
        // POST /api/documents/{id}/analyze (re-extraction depuis R2).
        res := extractTextV2(ctx, filename, content)

        // 4. Upload vers R2
        objectKey := storage.GenerateObjectKey(claims.UserID, filename)
        if uc.storage != nil {
                _, err := uc.storage.Upload(ctx, domain.StorageObject{
                        Key:           objectKey,
                        Content:       content,
                        ContentType:   mimeType,
                        ContentLength: int64(fileSize),
                })
                if err != nil {
                        return nil, fmt.Errorf("upload to R2: %w", err)
                }
        }

        // 5. Créer en DB
        var contenuTexte *string
        var statutAnalyse domain.StatutAnalyse
        var erreurAnalyse *string
        wordCount := 0

        if res.Extracted {
                contenuTexte = &res.Text
                wordCount = countWords(res.Text)
                statutAnalyse = domain.StatutAnalyseEnCours
        } else {
                // Pas de texte exploitable : le fichier est stocké, l'analyse reste
                // EN_ATTENTE avec la note d'extraction (actionnable : re-analyse
                // possible, cf. EnsureContenuTexte).
                statutAnalyse = domain.StatutAnalyseEnAttente
                errMsg := res.Note
                erreurAnalyse = &errMsg
        }

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

        message := "Document importé avec succès"
        switch {
        case res.Extracted:
                message = fmt.Sprintf("Document importé — texte extrait (%d mots), analyse IA en cours", wordCount)
        case erreurAnalyse != nil:
                message = "Document importé — analyse IA indisponible : " + res.Note
        }

        // DOC-ANALYZER-1 : déclencher l'analyse automatique en arrière-plan
        if res.Extracted && wordCount > 0 {
                select {
                case worker.DocumentAnalysisQueue <- worker.DocumentAnalysisJob{DocumentID: doc.ID}:
                        // job envoyé
                default:
                        // queue pleine, on ignore (le worker RecoverInterruptedAnalyses le traitera au prochain démarrage)
                }
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

// ListChapters — SECT-BIBLIO-P2.5 : chapitres d'un support (découpage IA).
// Rôles ENS/RESP/ADMIN ; le scoping réel est fait par RLS (Chapter_select :
// l'enseignant voit les chapitres de SES supports ; l'étudiant passe par
// exam-prep). Un document d'autrui retourne simplement 0 chapitre (RLS,
// filtrage silencieux) — le PATCH question valide la cohérence côté
// usecase épreuve.
func (uc *DocumentUseCase) ListChapters(ctx context.Context, claims db.SessionClaims, documentID string) ([]*domain.Chapter, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleAdmin && role != domain.RoleResponsable && role != domain.RoleEnseignant {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.docRepo.ListChapters(ctx, documentID)
}

// GetByID récupère un document par ID.
func (uc *DocumentUseCase) GetByID(ctx context.Context, claims db.SessionClaims, id string) (*domain.Document, error) {
        role := domain.Role(claims.Role)
        if role != domain.RoleEnseignant && role != domain.RoleAdmin {
                return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        return uc.docRepo.FindByID(ctx, id)
}

// SoftDelete déplace un document vers la corbeille.
// CORBEILLE-FIX C5 : ne supprime plus le fichier R2 au soft-delete.
// Avant : uc.storage.Delete(ctx, doc.CheminStockage) était appelé immédiatement,
// ce qui cassait la restauration (le fichier R2 n'existait plus après restore).
// Maintenant : le fichier R2 est conservé jusqu'à la purge définitive
// (DELETE /api/corbeille/purge), qui supprime aussi l'objet R2.
func (uc *DocumentUseCase) SoftDelete(ctx context.Context, claims db.SessionClaims, id string) error {
        role := domain.Role(claims.Role)
        if role != domain.RoleEnseignant && role != domain.RoleAdmin {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }

        // Ownership check : FindByID utilise RLS → renvoie NotFound pour les rows non-owned.
        // (déjà présent avant CORBEILLE-FIX — conservé.)
        doc, err := uc.docRepo.FindByID(ctx, id)
        if err != nil {
                return err
        }
        _ = doc // doc récupéré pour ownership check ; R2 non supprimé ici (C5).

        // Soft delete en DB uniquement (le fichier R2 reste jusqu'à la purge).
        return uc.docRepo.SoftDelete(ctx, id)
}

// PurgeR2Object supprime un objet R2 par sa clé (best-effort).
// CORBEILLE-FIX C5 : appelé par corbeillePurge après le hard-delete DB.
// Le fichier R2 était conservé au soft-delete ; il est supprimé ici, à la purge
// définitive, de sorte que la restauration reste possible tant que l'item est
// seulement soft-supprimé.
func (uc *DocumentUseCase) PurgeR2Object(ctx context.Context, key string) error {
        if uc.storage == nil || key == "" {
                return nil
        }
        return uc.storage.Delete(ctx, key)
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
// extractText/countWords v1 : la version enrichie (PDF/DOCX/PPTX) vit dans
// document_extraction.go (extractTextV2). countWords reste utilisé par Upload.

// countWords compte le nombre de mots dans un texte.
func countWords(text string) int {
        return len(strings.Fields(text))
}

// EnsureContenuTexte garantit qu'un document possède un contenuTexte.
// SECT-DOC-IA-1 : pour les documents déposés AVANT la v2 d'extraction
// (EN_ATTENTE à vie) ou dont l'extraction avait échoué au dépôt — on
// re-télécharge le fichier depuis R2 et on re-tente l'extraction avec la
// chaîne courante (pdftotext + OOXML). Le texte extrait est persisté
// (COALESCE : ne touche pas un contenu existant). Retourne le document
// rafraîchi — l'appelant vérifie ContenuTexte pour savoir si l'analyse
// est désormais possible.
func (uc *DocumentUseCase) EnsureContenuTexte(ctx context.Context, claims db.SessionClaims, id string) (*domain.Document, error) {
        doc, err := uc.docRepo.FindByID(ctx, id) // ownership via RLS
        if err != nil {
                return nil, err
        }
        if doc.ContenuTexte != nil && strings.TrimSpace(*doc.ContenuTexte) != "" {
                return doc, nil // déjà extrait
        }
        if uc.storage == nil || doc.CheminStockage == "" {
                return doc, nil // rien à tenter
        }
        content, err := uc.storage.Download(ctx, doc.CheminStockage)
        if err != nil {
                return doc, nil // R2 indisponible → best-effort, pas d'erreur bloquante
        }
        res := extractTextV2(ctx, doc.NomFichier, content)
        if !res.Extracted {
                // On mémorise la raison (visible par l'enseignant) sans changer le statut.
                note := res.Note
                _ = uc.docRepo.UpdateAnalysis(ctx, id, domain.UpdateAnalysisInput{
                        ErreurAnalyse: &note,
                })
                // Le doc retourné porte la note fraîche (le handler l'affiche
                // telle quelle si l'analyse reste impossible).
                doc.ErreurAnalyse = &note
                return doc, nil
        }
        txt := res.Text
        if err := uc.docRepo.UpdateAnalysis(ctx, id, domain.UpdateAnalysisInput{
                ContenuTexte: &txt,
        }); err != nil {
                return doc, err
        }
        doc.ContenuTexte = &txt
        return doc, nil
}

// UpdateAnalysis met à jour les champs d'analyse d'un document (P1-D3).
// SECT-DOC-IA-1 : passe-plat vers le repo (sémantique COALESCE — nil =
// inchangé, cf. domaine).
func (uc *DocumentUseCase) UpdateAnalysis(ctx context.Context, claims db.SessionClaims, id string, params domain.UpdateAnalysisInput) error {
        role := domain.Role(claims.Role)
        if role != domain.RoleEnseignant && role != domain.RoleAdmin {
                return &domain.UnauthorizedError{Message: "rôle non autorisé"}
        }
        // Vérifier ownership
        _, err := uc.docRepo.FindByID(ctx, id)
        if err != nil {
                return err
        }
        return uc.docRepo.UpdateAnalysis(ctx, id, params)
}
