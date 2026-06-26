// Package domain — entités Exam-prep (ReviewItem, StudySession, PracticeAttempt, HelpThread, HelpMessage, Chapter).
package domain

import (
	"context"
	"time"
)

// ============================================================
// CHAPTER
// ============================================================

// Chapter représente un chapitre d'un document.
type Chapter struct {
	ID         string    `json:"id"`
	DocumentID string    `json:"documentId"`
	Titre      string    `json:"titre"`
	Ordre      int       `json:"ordre"`
	Sujets     *string   `json:"sujets,omitempty"` // JSON array
	CreatedAt  time.Time `json:"createdAt"`
}

// ============================================================
// REVIEW ITEM (Spaced Repetition)
// ============================================================

// ReviewItem représente un item de révision espacée.
type ReviewItem struct {
	ID           string     `json:"id"`
	UserID       string     `json:"userId"`
	ChapterID    string     `json:"chapterId"`
	QuestionID   *string    `json:"questionId,omitempty"`
	Interval     int        `json:"interval"`   // jours
	EaseFactor   float64    `json:"easeFactor"` // SM-2
	NextReviewAt time.Time  `json:"nextReviewAt"`
	LastReviewAt *time.Time `json:"lastReviewAt,omitempty"`
	Repetitions  int        `json:"repetitions"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

// ReviewListParams pour filtrer.
type ReviewListParams struct {
	UserID     string
	DocumentID string
	DueOnly    bool
}

// ============================================================
// STUDY SESSION (Planning)
// ============================================================

// StudySession représente une session de révision planifiée.
type StudySession struct {
	ID         string     `json:"id"`
	UserID     string     `json:"userId"`
	DocumentID *string    `json:"documentId,omitempty"`
	ChapitreID *string    `json:"chapitreId,omitempty"`
	Type       string     `json:"type"` // "lecture", "exercices", "revision"
	DateDebut  time.Time  `json:"dateDebut"`
	DateFin    *time.Time `json:"dateFin,omitempty"`
	Statut     string     `json:"statut"` // "PLANIFIEE", "EN_COURS", "TERMINEE"
	Notes      *string    `json:"notes,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// CreateStudySessionInput pour créer une session.
type CreateStudySessionInput struct {
	DocumentID *string `json:"documentId,omitempty"`
	ChapitreID *string `json:"chapitreId,omitempty"`
	Type       string  `json:"type"`
	DateDebut  string  `json:"dateDebut"` // ISO
	DateFin    *string `json:"dateFin,omitempty"`
	Notes      *string `json:"notes,omitempty"`
}

// ============================================================
// PRACTICE ATTEMPT
// ============================================================

// PracticeAttempt représente une tentative d'exercice.
type PracticeAttempt struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	QuestionID string    `json:"questionId"`
	DocumentID *string   `json:"documentId,omitempty"`
	ChapterID  *string   `json:"chapterId,omitempty"`
	Score      float64   `json:"score"` // 0..1
	Correct    bool      `json:"correct"`
	DureeSec   *int      `json:"dureeSec,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

// SubmitPracticeInput pour soumettre une tentative.
type SubmitPracticeInput struct {
	QuestionID string  `json:"questionId"`
	DocumentID *string `json:"documentId,omitempty"`
	ChapterID  *string `json:"chapterId,omitempty"`
	Score      float64 `json:"score"` // 0..1
	Correct    bool    `json:"correct"`
	DureeSec   *int    `json:"dureeSec,omitempty"`
}

// ============================================================
// HELP THREAD + MESSAGES
// ============================================================

// HelpThread représente un fil d'aide étudiant ↔ enseignant.
//
// BUGFIX (ENS-AUDIT-3) : ajout des relations `Etudiant` et `Document` peuplées
// par ListHelpThreads (LEFT JOIN). Avant ce fix, l'API ne renvoyait que les
// IDs (etudiantId, documentId), ce qui faisait crasher le frontend
// aide-etudiants-page.tsx qui accédait à `t.etudiant.name` (undefined.nom).
type HelpThread struct {
	ID           string       `json:"id"`
	DocumentID   string       `json:"documentId"`
	EtudiantID   string       `json:"etudiantId"`
	EnseignantID *string      `json:"enseignantId,omitempty"`
	Sujet        string       `json:"sujet"`
	Statut       string       `json:"statut"` // "OUVERT", "CLOS"
	CreatedAt    time.Time    `json:"createdAt"`
	UpdatedAt    time.Time    `json:"updatedAt"`
	Etudiant     *UserRef     `json:"etudiant,omitempty"`
	Document     *DocumentRef `json:"document,omitempty"`
}

// HelpMessage représente un message dans un fil d'aide.
type HelpMessage struct {
	ID        string    `json:"id"`
	ThreadID  string    `json:"threadId"`
	AuteurID  string    `json:"auteurId"`
	Contenu   string    `json:"contenu"`
	CreatedAt time.Time `json:"createdAt"`
}

// CreateHelpThreadInput pour créer un fil.
type CreateHelpThreadInput struct {
	DocumentID     string `json:"documentId"`
	Sujet          string `json:"sujet"`
	MessageInitial string `json:"messageInitial"`
}

// CreateHelpMessageInput pour ajouter un message.
type CreateHelpMessageInput struct {
	Contenu string `json:"contenu"`
}

// ============================================================
// DASHBOARD
// ============================================================

// ExamPrepDashboard est le tableau de bord de progression.
type ExamPrepDashboard struct {
	ScoreMoyen         float64           `json:"scoreMoyen"`
	TotalAttempts      int               `json:"totalAttempts"`
	TauxReussite       float64           `json:"tauxReussite"`
	TempsRevision      int               `json:"tempsRevision"`
	SessionsAVenir     int               `json:"sessionsAVenir"`
	ItemsSrs           DashboardSrsStats `json:"itemsSrs"`
	LacunesParChapitre []ChapterLacune   `json:"lacunesParChapitre"`
}

// DashboardSrsStats — stats spaced repetition.
type DashboardSrsStats struct {
	Total         int     `json:"total"`
	DusAujourdhui int     `json:"dusAujourdhui"`
	Masterises    int     `json:"masterises"`
	AvgMastery    float64 `json:"avgMastery"`
}

// ChapterLacune — chapitre en difficulté (avgScore < 0.5).
type ChapterLacune struct {
	ChapterID string  `json:"chapterId"`
	Titre     string  `json:"titre"`
	AvgScore  float64 `json:"avgScore"`
	Attempts  int     `json:"attempts"`
}

// ============================================================
// REPOSITORIES
// ============================================================

// ExamPrepRepository interface unifiée pour exam-prep.
type ExamPrepRepository interface {
	// Dashboard
	GetDashboard(ctx context.Context, userID string, documentID string) (*ExamPrepDashboard, error)

	// Documents (student-scoped)
	ListStudentDocuments(ctx context.Context, userID, filiereID, niveau string) ([]*Document, error)

	// Review (spaced repetition)
	ListReviewItems(ctx context.Context, params ReviewListParams) ([]*ReviewItem, error)
	MarkReviewed(ctx context.Context, itemID string, quality int) error

	// Planning (study sessions)
	ListStudySessions(ctx context.Context, userID string) ([]*StudySession, error)
	CreateStudySession(ctx context.Context, userID string, input CreateStudySessionInput) (*StudySession, error)
	DeleteStudySession(ctx context.Context, id string) error

	// Practice
	ListPracticeAttempts(ctx context.Context, userID, documentID string) ([]*PracticeAttempt, error)
	SubmitPractice(ctx context.Context, userID string, input SubmitPracticeInput) (*PracticeAttempt, error)

	// Help threads
	ListHelpThreads(ctx context.Context, userID string, role string) ([]*HelpThread, error)
	CreateHelpThread(ctx context.Context, etudiantID string, input CreateHelpThreadInput) (*HelpThread, error)
	CloseHelpThread(ctx context.Context, threadID string) error
	ListHelpMessages(ctx context.Context, threadID string) ([]*HelpMessage, error)
	CreateHelpMessage(ctx context.Context, threadID, auteurID string, input CreateHelpMessageInput) (*HelpMessage, error)
}
