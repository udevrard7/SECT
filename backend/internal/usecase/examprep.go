// Package usecase — logique métier Exam-prep.
package usecase

import (
	"context"
	"fmt"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// ExamPrepUseCase implémente les cas d'usage exam-prep.
type ExamPrepUseCase struct {
	repo domain.ExamPrepRepository
}

// NewExamPrepUseCase crée un nouveau ExamPrepUseCase.
func NewExamPrepUseCase(repo domain.ExamPrepRepository) *ExamPrepUseCase {
	return &ExamPrepUseCase{repo: repo}
}

// GetDashboard récupère le tableau de bord de progression.
func (uc *ExamPrepUseCase) GetDashboard(ctx context.Context, claims db.SessionClaims, documentID string) (*domain.ExamPrepDashboard, error) {
	if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants et enseignants"}
	}
	return uc.repo.GetDashboard(ctx, claims.UserID, documentID)
}

// ListDocuments liste les documents accessibles (ETUDIANT via filière+niveau).
func (uc *ExamPrepUseCase) ListDocuments(ctx context.Context, claims db.SessionClaims) ([]*domain.Document, error) {
	if claims.Role != string(domain.RoleEtudiant) {
		return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
	}
	if claims.FiliereID == "" {
		return []*domain.Document{}, nil
	}
	niveau := "L1" // default — claims n'a pas niveau, on prendra tous les niveaux
	return uc.repo.ListStudentDocuments(ctx, claims.UserID, claims.FiliereID, niveau)
}

// ExamPrepDocumentList est la liste enrichie de documents pour l'UI exam-prep.
// Contient les documents (avec chapitres attachés) + les maps batch pour UE
// et propriétaire, prêtes à être consommées par le handler pour construire
// le DTO JSON attendu par le frontend.
type ExamPrepDocumentList struct {
	Documents []*domain.Document
	UEs       map[string]*domain.UniteEnseignement
	Owners    map[string]*domain.UserRef
}

// ListDocumentsWithChapters récupère les documents accessibles à l'étudiant
// et les enrichit en batch avec leurs chapitres, leur UE et leur propriétaire.
//
// DOC-ANALYZER-2 : le frontend exam-prep accède à doc.chapters.length,
// doc.uniteEnseignement.code et doc.owner.name SANS optional chaining —
// ces champs doivent donc toujours être présents (non-null) dans la réponse.
func (uc *ExamPrepUseCase) ListDocumentsWithChapters(ctx context.Context, claims db.SessionClaims) (*ExamPrepDocumentList, error) {
	docs, err := uc.ListDocuments(ctx, claims)
	if err != nil {
		return nil, err
	}

	result := &ExamPrepDocumentList{
		Documents: docs,
		UEs:       make(map[string]*domain.UniteEnseignement),
		Owners:    make(map[string]*domain.UserRef),
	}

	if len(docs) == 0 {
		return result, nil
	}

	// 1. Chapitres par documentId (batch).
	docIDs := make([]string, 0, len(docs))
	for _, d := range docs {
		docIDs = append(docIDs, d.ID)
	}
	chaptersByDoc, err := uc.repo.ListChaptersByDocumentIDs(ctx, docIDs)
	if err != nil {
		return nil, err
	}

	// 2. UEs par ID (batch) — collecte des IDs non-nil.
	ueIDSet := make(map[string]struct{})
	for _, d := range docs {
		if d.UniteEnseignementID != nil && *d.UniteEnseignementID != "" {
			ueIDSet[*d.UniteEnseignementID] = struct{}{}
		}
	}
	ueIDs := make([]string, 0, len(ueIDSet))
	for id := range ueIDSet {
		ueIDs = append(ueIDs, id)
	}
	ues, err := uc.repo.ListUEsByIDs(ctx, ueIDs)
	if err != nil {
		return nil, err
	}

	// 3. Propriétaires par ID (batch) — collecte des ownerIDs.
	ownerIDSet := make(map[string]struct{})
	for _, d := range docs {
		if d.OwnerID != "" {
			ownerIDSet[d.OwnerID] = struct{}{}
		}
	}
	ownerIDs := make([]string, 0, len(ownerIDSet))
	for id := range ownerIDSet {
		ownerIDs = append(ownerIDs, id)
	}
	owners, err := uc.repo.ListUserRefsByIDs(ctx, ownerIDs)
	if err != nil {
		return nil, err
	}

	// 4. Attacher les chapitres (slice non-nil pour le frontend).
	for _, d := range docs {
		chs := chaptersByDoc[d.ID]
		if chs == nil {
			chs = []*domain.Chapter{}
		}
		d.Chapters = chs
	}

	result.UEs = ues
	result.Owners = owners
	return result, nil
}

// GetDocumentContentForQA récupère le contenu textuel d'un document pour le
// Q&A RAG (EXAM-PREP-CONNECT-1 — Étape 3).
//
// Rôles autorisés : ETUDIANT, ENSEIGNANT. L'étudiant peut poser une question
// sur un document de son filière (le scoping strict est assuré côté frontend
// via ListStudentDocuments ; le backend trust le documentID passé).
func (uc *ExamPrepUseCase) GetDocumentContentForQA(ctx context.Context, claims db.SessionClaims, documentID string) (string, error) {
	if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
		return "", &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if documentID == "" {
		return "", &domain.ValidationError{Field: "documentId", Message: "requis"}
	}
	return uc.repo.GetDocumentContent(ctx, documentID)
}

// GetDocumentForReader récupère un document complet pour le lecteur modal
// (HIGHLIGHT-FLASHCARD-1). Rôles : ETUDIANT, ENSEIGNANT.
func (uc *ExamPrepUseCase) GetDocumentForReader(ctx context.Context, claims db.SessionClaims, documentID string) (*domain.Document, error) {
	if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if documentID == "" {
		return nil, &domain.ValidationError{Field: "documentId", Message: "requis"}
	}
	return uc.repo.GetDocumentForReader(ctx, documentID)
}

// ListUEsByIDs expose le batch lookup des UEs (HIGHLIGHT-FLASHCARD-1 — utilisé
// par readExamPrepDocument pour résoudre l'UE du document).
func (uc *ExamPrepUseCase) ListUEsByIDs(ctx context.Context, ueIDs []string) (map[string]*domain.UniteEnseignement, error) {
	return uc.repo.ListUEsByIDs(ctx, ueIDs)
}

// ListUserRefsByIDs expose le batch lookup des users (HIGHLIGHT-FLASHCARD-1 —
// utilisé par readExamPrepDocument pour résoudre le propriétaire du document).
func (uc *ExamPrepUseCase) ListUserRefsByIDs(ctx context.Context, userIDs []string) (map[string]*domain.UserRef, error) {
	return uc.repo.ListUserRefsByIDs(ctx, userIDs)
}

// ListReviewItems liste les items de révision.
func (uc *ExamPrepUseCase) ListReviewItems(ctx context.Context, claims db.SessionClaims, documentID string, dueOnly bool) ([]*domain.ReviewItem, error) {
	if claims.Role != string(domain.RoleEtudiant) {
		return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
	}
	return uc.repo.ListReviewItems(ctx, domain.ReviewListParams{
		UserID:     claims.UserID,
		DocumentID: documentID,
		DueOnly:    dueOnly,
	})
}

// MarkReviewed marque un item comme révisé.
func (uc *ExamPrepUseCase) MarkReviewed(ctx context.Context, claims db.SessionClaims, itemID string, quality int) error {
	if claims.Role != string(domain.RoleEtudiant) {
		return &domain.UnauthorizedError{Message: "réservé aux étudiants"}
	}
	if quality < 0 || quality > 5 {
		quality = 3
	}
	return uc.repo.MarkReviewed(ctx, itemID, quality)
}

// ListStudySessions liste les sessions de révision planifiées.
func (uc *ExamPrepUseCase) ListStudySessions(ctx context.Context, claims db.SessionClaims) ([]*domain.StudySession, error) {
	if claims.Role != string(domain.RoleEtudiant) {
		return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
	}
	return uc.repo.ListStudySessions(ctx, claims.UserID)
}

// CreateStudySession crée une session.
func (uc *ExamPrepUseCase) CreateStudySession(ctx context.Context, claims db.SessionClaims, input domain.CreateStudySessionInput) (*domain.StudySession, error) {
	if claims.Role != string(domain.RoleEtudiant) {
		return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
	}
	if input.Type == "" {
		return nil, &domain.ValidationError{Field: "type", Message: "requis"}
	}
	if input.DateDebut == "" {
		return nil, &domain.ValidationError{Field: "dateDebut", Message: "requis"}
	}
	return uc.repo.CreateStudySession(ctx, claims.UserID, input)
}

// DeleteStudySession supprime une session.
func (uc *ExamPrepUseCase) DeleteStudySession(ctx context.Context, claims db.SessionClaims, id string) error {
	if claims.Role != string(domain.RoleEtudiant) {
		return &domain.UnauthorizedError{Message: "réservé aux étudiants"}
	}
	return uc.repo.DeleteStudySession(ctx, id)
}

// ListPracticeAttempts liste les tentatives.
func (uc *ExamPrepUseCase) ListPracticeAttempts(ctx context.Context, claims db.SessionClaims, documentID string) ([]*domain.PracticeAttempt, error) {
	if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.repo.ListPracticeAttempts(ctx, claims.UserID, documentID)
}

// SubmitPractice enregistre une tentative.
func (uc *ExamPrepUseCase) SubmitPractice(ctx context.Context, claims db.SessionClaims, input domain.SubmitPracticeInput) (*domain.PracticeAttempt, error) {
	if claims.Role != string(domain.RoleEtudiant) {
		return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
	}
	if input.QuestionID == "" {
		return nil, &domain.ValidationError{Field: "questionId", Message: "requis"}
	}
	if input.Score < 0 || input.Score > 1 {
		return nil, &domain.ValidationError{Field: "score", Message: "doit être entre 0 et 1"}
	}
	return uc.repo.SubmitPractice(ctx, claims.UserID, input)
}

// ListHelpThreads liste les fils d'aide.
func (uc *ExamPrepUseCase) ListHelpThreads(ctx context.Context, claims db.SessionClaims) ([]*domain.HelpThread, error) {
	if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.repo.ListHelpThreads(ctx, claims.UserID, claims.Role)
}

// CreateHelpThread crée un fil d'aide (ETUDIANT only).
func (uc *ExamPrepUseCase) CreateHelpThread(ctx context.Context, claims db.SessionClaims, input domain.CreateHelpThreadInput) (*domain.HelpThread, error) {
	if claims.Role != string(domain.RoleEtudiant) {
		return nil, &domain.UnauthorizedError{Message: "réservé aux étudiants"}
	}
	if input.DocumentID == "" || input.Sujet == "" {
		return nil, &domain.ValidationError{Field: "documentId+sujet", Message: "requis"}
	}
	return uc.repo.CreateHelpThread(ctx, claims.UserID, input)
}

// CloseHelpThread ferme un fil (ETUDIANT propriétaire ou ENSEIGNANT).
func (uc *ExamPrepUseCase) CloseHelpThread(ctx context.Context, claims db.SessionClaims, threadID string) error {
	if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
		return &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.repo.CloseHelpThread(ctx, threadID)
}

// ListHelpMessages liste les messages d'un fil.
func (uc *ExamPrepUseCase) ListHelpMessages(ctx context.Context, claims db.SessionClaims, threadID string) ([]*domain.HelpMessage, error) {
	if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.repo.ListHelpMessages(ctx, threadID)
}

// CreateHelpMessage ajoute un message.
func (uc *ExamPrepUseCase) CreateHelpMessage(ctx context.Context, claims db.SessionClaims, threadID string, input domain.CreateHelpMessageInput) (*domain.HelpMessage, error) {
	if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	if input.Contenu == "" {
		return nil, &domain.ValidationError{Field: "contenu", Message: "requis"}
	}
	return uc.repo.CreateHelpMessage(ctx, threadID, claims.UserID, input)
}

// ============================================================
// FLASHCARDS (HIGHLIGHT-FLASHCARD-1)
// ============================================================

// CreateFlashcard crée une flashcard (recto/verso déjà générés par l'IA
// côté handler) puis crée le ReviewItem associé (SM-2 init, dû immédiatement).
//
// Rôle : ETUDIANT seulement. Le chapterId est optionnel (la flashcard peut
// être rattachée à un chapitre si l'étudiant était positionné sur un chapitre
// précis dans le lecteur).
func (uc *ExamPrepUseCase) CreateFlashcard(ctx context.Context, claims db.SessionClaims, input domain.CreateFlashcardInput) (*domain.Flashcard, error) {
	if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	input.UserID = claims.UserID
	if input.Recto == "" || input.Verso == "" {
		return nil, &domain.ValidationError{Field: "recto/verso", Message: "requis"}
	}

	f, err := uc.repo.CreateFlashcard(ctx, input)
	if err != nil {
		return nil, err
	}

	// Best-effort : si la création du ReviewItem échoue, la flashcard existe
	// déjà mais ne sera pas dans la file SRS. On ne fait pas échouer l'opération
	// (la flashcard est quand même utilisable via l'onglet Flashcards).
	_ = uc.repo.CreateFlashcardReviewItem(ctx, claims.UserID, f.ID, input.ChapterID)

	return f, nil
}

// ListFlashcards liste les flashcards de l'utilisateur (filtrées par documentId
// si non vide).
func (uc *ExamPrepUseCase) ListFlashcards(ctx context.Context, claims db.SessionClaims, documentID string) ([]*domain.Flashcard, error) {
	if claims.Role != string(domain.RoleEtudiant) && claims.Role != string(domain.RoleEnseignant) {
		return nil, &domain.UnauthorizedError{Message: "rôle non autorisé"}
	}
	return uc.repo.ListFlashcards(ctx, claims.UserID, documentID)
}

// DeleteFlashcard supprime une flashcard (ETUDIANT propriétaire seulement).
func (uc *ExamPrepUseCase) DeleteFlashcard(ctx context.Context, claims db.SessionClaims, flashcardID string) error {
	if claims.Role != string(domain.RoleEtudiant) {
		return &domain.UnauthorizedError{Message: "réservé aux étudiants"}
	}
	if flashcardID == "" {
		return &domain.ValidationError{Field: "id", Message: "requis"}
	}
	return uc.repo.DeleteFlashcard(ctx, claims.UserID, flashcardID)
}

var _ = fmt.Sprintf
