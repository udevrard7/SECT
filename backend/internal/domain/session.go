// Package domain — entités Session, Reponse, Resultat + grading.
package domain

import (
	"context"
	"encoding/json"
	"time"
)

// ============================================================
// ENUMS
// ============================================================

// StatutSession — state machine de passation.
type StatutSession string

const (
	StatutSessionNonCommencee StatutSession = "NON_COMMENCEE"
	StatutSessionEnCours      StatutSession = "EN_COURS"
	StatutSessionSoumise      StatutSession = "SOUMISE"
	StatutSessionCorrigee     StatutSession = "CORRIGEE"
	StatutSessionRetournee    StatutSession = "RETOURNEE"
	StatutSessionAbsent       StatutSession = "ABSENT"
	StatutSessionNonSoumis    StatutSession = "NON_SOUMIS"
)

// ValidStatutsSession valide un statut de session.
var ValidStatutsSession = map[StatutSession]bool{
	StatutSessionNonCommencee: true,
	StatutSessionEnCours:      true,
	StatutSessionSoumise:      true,
	StatutSessionCorrigee:     true,
	StatutSessionRetournee:    true,
	StatutSessionAbsent:       true,
	StatutSessionNonSoumis:    true,
}

// ============================================================
// SESSION PASSATION
// ============================================================

// SessionPassation représente une session d'examen d'un étudiant.
type SessionPassation struct {
	ID                  string          `json:"id"`
	EtudiantID          string          `json:"etudiantId"`
	EpreuveID           string          `json:"epreuveId"`
	Statut              StatutSession   `json:"statut"`
	DateDebut           *time.Time      `json:"dateDebut,omitempty"`
	DateFin             *time.Time      `json:"dateFin,omitempty"`
	Score               *float64        `json:"score,omitempty"`
	LogEvents           json.RawMessage `json:"logEvents,omitempty"` // JSON array
	Alertes             int             `json:"alertes"`
	CreatedAt           time.Time       `json:"createdAt"`
	UpdatedAt           time.Time       `json:"updatedAt"`
	PropositionMappings json.RawMessage `json:"propositionMappings,omitempty"` // JSON {questionId: number[]}
	Penalite            float64         `json:"penalite"`
	// Relations (optionnelles selon endpoint)
	Reponses []Reponse `json:"reponses,omitempty"`
	Resultat *Resultat `json:"resultat,omitempty"`
}

// Reponse représente la réponse d'un étudiant à une question.
type Reponse struct {
	ID              string   `json:"id"`
	SessionID       string   `json:"sessionId"`
	QuestionID      string   `json:"questionId"`
	Contenu         *string  `json:"contenu,omitempty"` // QCU: "B", QCM: '["A","C"]', CODE: JSON
	Score           *float64 `json:"score,omitempty"`
	Commentaire     *string  `json:"commentaire,omitempty"`
	NoteIA          *float64 `json:"noteIA,omitempty"`
	JustificationIA *string  `json:"justificationIA,omitempty"`
}

// Resultat représente le résultat final d'une session (1:1).
type Resultat struct {
	ID                string          `json:"id"`
	SessionID         string          `json:"sessionId"`
	ScoreFinal        float64         `json:"scoreFinal"`
	DetailParQuestion json.RawMessage `json:"detailParQuestion,omitempty"` // JSON array
	DateCorrection    *time.Time      `json:"dateCorrection,omitempty"`
	DateRetour        *time.Time      `json:"dateRetour,omitempty"`
	Commentaires      *string         `json:"commentaires,omitempty"`
	Exporte           bool            `json:"exporte"`
	TotalPossible     float64         `json:"totalPossible"`
}

// ============================================================
// DTOs
// ============================================================

// StartSessionInput pour POST /api/sessions.
type StartSessionInput struct {
	EtudiantID string `json:"etudiantId"`
	EpreuveID  string `json:"epreuveId"`
}

// SubmitSessionInput pour POST /api/sessions/{id}/submit.
type SubmitSessionInput struct {
	AutoSubmit bool              `json:"autoSubmit"`
	Reponses   map[string]string `json:"reponses,omitempty"` // questionId → contenu
}

// SaveReponseInput pour PUT /api/sessions (auto-save).
type SaveReponseInput struct {
	SessionID  string       `json:"sessionId"`
	QuestionID string       `json:"questionId"`
	Contenu    string       `json:"contenu"`
	Alerte     *AlerteInput `json:"alerte,omitempty"`
}

// AlerteInput pour logging proctoring.
type AlerteInput struct {
	Type     string  `json:"type"`
	Details  string  `json:"details"`
	Penalite float64 `json:"penalite"`
}

// SessionListParams pour filtrer les sessions.
type SessionListParams struct {
	EtudiantID string
	EpreuveID  string
}

// ResultatListParams pour GET /api/resultats.
type ResultatListParams struct {
	EtudiantID string
	EpreuveID  string
	Page       int
	Limit      int
}

// ============================================================
// GRADING
// ============================================================

// DetailParQuestion — entrée du JSON detailParQuestion.
type DetailParQuestion struct {
	QuestionID   string   `json:"questionId"`
	Type         string   `json:"type"`
	Bareme       float64  `json:"bareme"`
	Score        *float64 `json:"score"`
	IsAutoGraded bool     `json:"isAutoGraded"`
	Repondu      bool     `json:"repondu"`
}

// SubmitResult est la réponse de /api/sessions/{id}/submit.
type SubmitResult struct {
	Session           *SessionPassation `json:"session"`
	Resultat          *Resultat         `json:"resultat"`
	Score             float64           `json:"score"`
	RawScore          float64           `json:"rawScore"`
	Penalite          float64           `json:"penalite"`
	TotalPossible     float64           `json:"totalPossible"`
	AutoGradableTotal float64           `json:"autoGradableTotal"`
	Percentage        int               `json:"percentage"`
	AutoGraded        int               `json:"autoGraded"`
	PendingCorrection int               `json:"pendingCorrection"`
	Scenario          string            `json:"scenario"` // "A" (100% auto) ou "B" (mixed)
	ScenarioMessage   string            `json:"scenarioMessage"`
	Message           string            `json:"message"`
}

// ============================================================
// REPOSITORIES
// ============================================================

// SessionRepository interface.
type SessionRepository interface {
	FindByID(ctx context.Context, id string) (*SessionPassation, error)
	List(ctx context.Context, params SessionListParams) ([]*SessionPassation, error)
	FindByEtudiantAndEpreuve(ctx context.Context, etudiantID, epreuveID string) (*SessionPassation, error)
	Create(ctx context.Context, etudiantID, epreuveID string, propositionMappings json.RawMessage) (*SessionPassation, error)
	UpdateStatut(ctx context.Context, id string, statut StatutSession, score *float64, dateFin *time.Time) error
	SaveReponse(ctx context.Context, sessionID, questionID, contenu string) error
	GetReponses(ctx context.Context, sessionID string) ([]Reponse, error)
	UpdateReponseScore(ctx context.Context, reponseID string, score float64) error
	AddAlerte(ctx context.Context, sessionID string, penalite float64, alerte AlerteInput) error
}

// ResultatRepository interface.
type ResultatRepository interface {
	FindBySessionID(ctx context.Context, sessionID string) (*Resultat, error)
	Upsert(ctx context.Context, r *Resultat) (*Resultat, error)
	ListByEtudiant(ctx context.Context, etudiantID string) ([]*SessionPassation, error)
	ListByEpreuve(ctx context.Context, epreuveID string, page, limit int) ([]*SessionPassation, int, error)
	GetOverview(ctx context.Context, enseignantID string) (overview *OverviewResult, err error)
	GetEtudiantOverview(ctx context.Context, etudiantID string) (*EtudiantOverviewResult, error)
}

// OverviewResult pour GET /api/resultats/overview.
type OverviewResult struct {
	TotalEpreuves      int                 `json:"totalEpreuves"`
	TotalSessions      int                 `json:"totalSessions"`
	TotalCorrigees     int                 `json:"totalCorrigees"`
	GlobalMoyenne      float64             `json:"globalMoyenne"`
	GlobalTauxReussite int                 `json:"globalTauxReussite"`
	Epreuves           []OverviewEpreuve   `json:"epreuves"`
	Evolution          []OverviewEvolution `json:"evolution"`
	StudentsAtRisk     []StudentAtRisk     `json:"studentsAtRisk"`
	TopQuestions       []TopQuestion       `json:"topQuestions"`
}

// OverviewEpreuve — stats par épreuve.
type OverviewEpreuve struct {
	ID           string    `json:"id"`
	Titre        string    `json:"titre"`
	DateDebut    time.Time `json:"dateDebut"`
	DateFin      time.Time `json:"dateFin"`
	Statut       string    `json:"statut"`
	NoteTotal    float64   `json:"noteTotal"`
	NbSessions   int       `json:"nbSessions"`
	NbCorrigees  int       `json:"nbCorrigees"`
	Moyenne      float64   `json:"moyenne"`
	TauxReussite int       `json:"tauxReussite"`
	Mediane      float64   `json:"mediane"`
}

// OverviewEvolution — évolution mensuelle.
type OverviewEvolution struct {
	Mois    string  `json:"mois"`
	Moyenne float64 `json:"moyenne"`
	Count   int     `json:"count"`
}

// StudentAtRisk — étudiant en difficulté.
type StudentAtRisk struct {
	EtudiantID    string  `json:"etudiantId"`
	EtudiantName  string  `json:"etudiantName"`
	EtudiantEmail string  `json:"etudiantEmail"`
	NbExamens     int     `json:"nbExamens"`
	Moyenne       float64 `json:"moyenne"`
	DerniereNote  float64 `json:"derniereNote"`
}

// TopQuestion — question la plus échouée.
type TopQuestion struct {
	EpreuveID     string  `json:"epreuveId"`
	EpreuveTitre  string  `json:"epreuveTitre"`
	QuestionIndex int     `json:"questionIndex"`
	Enonce        string  `json:"enonce"`
	Type          string  `json:"type"`
	TauxReussite  float64 `json:"tauxReussite"`
	Count         int     `json:"count"`
}

// EtudiantOverviewResult pour GET /api/resultats/etudiant-overview.
type EtudiantOverviewResult struct {
	TotalEpreuves      int                  `json:"totalEpreuves"`
	TotalCorrigees     int                  `json:"totalCorrigees"`
	MoyenneGenerale    float64              `json:"moyenneGenerale"`
	MeilleureNote      float64              `json:"meilleureNote"`
	MoinsBonneNote     float64              `json:"moinsBonneNote"`
	TauxReussite       int                  `json:"tauxReussite"`
	Tendance           float64              `json:"tendance"`
	Evolution          []OverviewEvolution  `json:"evolution"`
	PerformanceParType []PerformanceParType `json:"performanceParType"`
	Distribution       []DistributionBin    `json:"distribution"`
	RecentResults      []RecentResult       `json:"recentResults"`
}

// PerformanceParType — performance par type de question.
type PerformanceParType struct {
	Type    string  `json:"type"`
	Moyenne float64 `json:"moyenne"`
	Count   int     `json:"count"`
}

// DistributionBin — bin de distribution des scores.
type DistributionBin struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

// RecentResult — résultat récent d'un étudiant.
type RecentResult struct {
	ID          string     `json:"id"`
	EpreuveID   string     `json:"epreuveId"`
	Titre       string     `json:"titre"`
	Enseignant  string     `json:"enseignant"`
	Statut      string     `json:"statut"`
	Score       float64    `json:"score"`
	NoteTotal   float64    `json:"noteTotal"`
	ScoreOn20   float64    `json:"scoreOn20"`
	Percentage  int        `json:"percentage"`
	DateFin     *time.Time `json:"dateFin,omitempty"`
	DateDebut   *time.Time `json:"dateDebut,omitempty"`
	IsCorrected bool       `json:"isCorrected"`
	IsReturned  bool       `json:"isReturned"`
}

// GradingScenario détecte le scénario de correction.
type GradingScenario struct {
	Type                  string // "A" (100% auto) ou "B" (mixed)
	AutoGradableCount     int
	ManualCorrectionCount int
}

// QuestionForGrading — question préparée pour le grading.
type QuestionForGrading struct {
	QuestionID      string
	Type            TypeQuestion
	Bareme          float64
	ReponseCorrecte string // pour QCU/QCM
	Ordre           int
}

// DetectGradingScenario détermine si l'épreuve est 100% auto-gradable ou mixte.
func DetectGradingScenario(questions []QuestionForGrading) GradingScenario {
	autoGradableTypes := map[TypeQuestion]bool{
		TypeQCU: true, TypeQCM: true, TypeCode: true,
	}
	auto := 0
	manual := 0
	for _, q := range questions {
		if autoGradableTypes[q.Type] {
			auto++
		} else {
			manual++
		}
	}
	scenario := "A"
	if manual > 0 {
		scenario = "B"
	}
	return GradingScenario{
		Type:                  scenario,
		AutoGradableCount:     auto,
		ManualCorrectionCount: manual,
	}
}

// GradeQCU corrige une question QCU.
// studentAnswer = lettre choisie par l'étudiant (après unshuffle via mapping)
// correctAnswer = lettre correcte (originale)
// bareme = points de la question
// Retourne 0 ou bareme.
func GradeQCU(studentAnswer, correctAnswer string, bareme float64) float64 {
	if studentAnswer == correctAnswer && studentAnswer != "" {
		return bareme
	}
	return 0
}

// GradeQCM corrige une question QCM.
// studentAnswers = JSON array '["A","C"]'
// correctAnswers = JSON array '["A","B"]'
// Formule: max(0, (correctSel - incorrectSel) / totalCorrect * bareme)
func GradeQCM(studentAnswers, correctAnswers string, bareme float64) float64 {
	var student, correct []string
	if err := json.Unmarshal([]byte(studentAnswers), &student); err != nil {
		return 0
	}
	if err := json.Unmarshal([]byte(correctAnswers), &correct); err != nil {
		return 0
	}
	if len(correct) == 0 {
		return 0
	}
	studentSet := make(map[string]bool)
	for _, s := range student {
		studentSet[s] = true
	}
	correctSet := make(map[string]bool)
	for _, c := range correct {
		correctSet[c] = true
	}
	correctSel := 0
	incorrectSel := 0
	for s := range studentSet {
		if correctSet[s] {
			correctSel++
		} else {
			incorrectSel++
		}
	}
	score := float64(correctSel-incorrectSel) / float64(len(correct)) * bareme
	if score < 0 {
		score = 0
	}
	// Arrondir à 2 décimales
	return float64(int(score*100)) / 100
}
