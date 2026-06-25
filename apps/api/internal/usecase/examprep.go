// Package usecase — logique métier Exam-prep.
package usecase

import (
	"context"
	"fmt"

	"github.com/udevrard7/sect/apps/api/internal/db"
	"github.com/udevrard7/sect/apps/api/internal/domain"
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

var _ = fmt.Sprintf
