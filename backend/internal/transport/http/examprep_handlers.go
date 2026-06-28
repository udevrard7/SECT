package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/ai"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/worker"
)

// examprep_handlers.go — handlers HTTP pour Exam-prep.

// ============================================================
// DASHBOARD
// ============================================================

// examPrepDashboard — GET /api/exam-prep/dashboard
func (s *Server) examPrepDashboard(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	documentID := r.URL.Query().Get("documentId")
	dash, err := s.examPrepUC.GetDashboard(r.Context(), claims, documentID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dash)
}

// ============================================================
// DOCUMENTS
// ============================================================

// examPrepDocumentDTO est la forme JSON exacte attendue par le frontend
// exam-prep-page.tsx (interface ExamPrepDocument).
//
// DOC-ANALYZER-2 : le frontend accède à doc.chapters.length,
// doc.uniteEnseignement.code, doc.owner.name et doc.themesDetectes.length
// SANS optional chaining — tous ces champs doivent donc être non-null.
type examPrepDocumentDTO struct {
	ID                string               `json:"id"`
	NomFichier        string               `json:"nomFichier"`
	TypeMime          *string              `json:"typeMime"`
	TailleFichier     *int                 `json:"tailleFichier"`
	StatutAnalyse     domain.StatutAnalyse `json:"statutAnalyse"`
	ThemesDetectes    []string             `json:"themesDetectes"`
	ResumeAnalyse     *string              `json:"resumeAnalyse"`
	DateUpload        time.Time            `json:"dateUpload"`
	UniteEnseignement examPrepUEDTO        `json:"uniteEnseignement"`
	Owner             examPrepOwnerDTO     `json:"owner"`
	Chapters          []examPrepChapterDTO `json:"chapters"`
}

type examPrepUEDTO struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	Nom         string `json:"nom"`
	CreditsECTS *int   `json:"creditsECTS"`
}

type examPrepOwnerDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type examPrepChapterDTO struct {
	ID     string   `json:"id"`
	Titre  string   `json:"titre"`
	Ordre  int      `json:"ordre"`
	Sujets []string `json:"sujets"`
}

// toExamPrepDocumentDTO convertit un domain.Document enrichi (avec chapitres)
// en DTO JSON pour le frontend. themesDetectes et chapters[].sujets (stockés
// en DB comme *string JSON) sont parsés en []string. L'UE et le propriétaire
// sont résolus via les maps batch ; des valeurs de fallback sont utilisées
// si l'ID n'est pas trouvé (pour ne jamais crasher le frontend).
func toExamPrepDocumentDTO(doc *domain.Document, ues map[string]*domain.UniteEnseignement, owners map[string]*domain.UserRef) examPrepDocumentDTO {
	ue := examPrepUEDTO{}
	if doc.UniteEnseignementID != nil {
		if found, ok := ues[*doc.UniteEnseignementID]; ok && found != nil {
			ue = examPrepUEDTO{ID: found.ID, Code: found.Code, Nom: found.Nom, CreditsECTS: found.CreditsECTS}
		}
	}

	owner := examPrepOwnerDTO{ID: doc.OwnerID, Name: "Enseignant"}
	if found, ok := owners[doc.OwnerID]; ok && found != nil {
		owner = examPrepOwnerDTO{ID: found.ID, Name: found.Name}
	}

	chapters := make([]examPrepChapterDTO, 0, len(doc.Chapters))
	for _, ch := range doc.Chapters {
		chapters = append(chapters, examPrepChapterDTO{
			ID:     ch.ID,
			Titre:  ch.Titre,
			Ordre:  ch.Ordre,
			Sujets: parseJSONStringArray(ch.Sujets),
		})
	}

	return examPrepDocumentDTO{
		ID:                doc.ID,
		NomFichier:        doc.NomFichier,
		TypeMime:          doc.TypeMime,
		TailleFichier:     doc.TailleFichier,
		StatutAnalyse:     doc.StatutAnalyse,
		ThemesDetectes:    parseJSONStringArray(doc.ThemesDetectes),
		ResumeAnalyse:     doc.ResumeAnalyse,
		DateUpload:        doc.DateUpload,
		UniteEnseignement: ue,
		Owner:             owner,
		Chapters:          chapters,
	}
}

// parseJSONStringArray parse un *string contenant un tableau JSON (ex.
// themesDetectes, chapters.sujets) en []string. Retourne un slice vide
// (non-nil) si la valeur est nil ou si le parsing échoue.
func parseJSONStringArray(raw *string) []string {
	out := []string{}
	if raw == nil || *raw == "" {
		return out
	}
	if err := json.Unmarshal([]byte(*raw), &out); err != nil {
		return []string{}
	}
	if out == nil {
		return []string{}
	}
	return out
}

// listExamPrepDocuments — GET /api/exam-prep/documents
//
// DOC-ANALYZER-2 : retourne les documents enrichis avec leurs chapitres,
// leur UE et leur propriétaire (batch queries). Le frontend accède à
// doc.chapters.length, doc.uniteEnseignement.code, doc.owner.name et
// doc.themesDetectes SANS optional chaining — le DTO garantit que tous
// ces champs sont non-null.
func (s *Server) listExamPrepDocuments(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	list, err := s.examPrepUC.ListDocumentsWithChapters(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	dtos := make([]examPrepDocumentDTO, 0, len(list.Documents))
	for _, doc := range list.Documents {
		dtos = append(dtos, toExamPrepDocumentDTO(doc, list.UEs, list.Owners))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"documents": dtos})
}

// ============================================================
// REVIEW (spaced repetition)
// ============================================================

// listReviewItems — GET /api/exam-prep/review
func (s *Server) listReviewItems(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	documentID := r.URL.Query().Get("documentId")
	dueOnly := r.URL.Query().Get("due") == "true"

	items, err := s.examPrepUC.ListReviewItems(r.Context(), claims, documentID, dueOnly)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"reviewItems": items})
}

// markReviewed — POST /api/exam-prep/review
func (s *Server) markReviewed(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		ChapterID string `json:"chapterId"`
		Quality   *int   `json:"quality"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	quality := 3
	if body.Quality != nil {
		quality = *body.Quality
	}

	if err := s.examPrepUC.MarkReviewed(r.Context(), claims, body.ChapterID, quality); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Chapitre marqué comme révisé"})
}

// ============================================================
// PLANNING (study sessions)
// ============================================================

// listStudySessions — GET /api/exam-prep/planning
func (s *Server) listStudySessions(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessions, err := s.examPrepUC.ListStudySessions(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"sessions": sessions})
}

// createStudySession — POST /api/exam-prep/planning
func (s *Server) createStudySession(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input domain.CreateStudySessionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	session, err := s.examPrepUC.CreateStudySession(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"session": session})
}

// deleteStudySession — DELETE /api/exam-prep/planning/{id}
func (s *Server) deleteStudySession(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.examPrepUC.DeleteStudySession(r.Context(), claims, id); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Session supprimée"})
}

// ============================================================
// PRACTICE
// ============================================================

// listPracticeAttempts — GET /api/exam-prep/practice
func (s *Server) listPracticeAttempts(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	documentID := r.URL.Query().Get("documentId")
	attempts, err := s.examPrepUC.ListPracticeAttempts(r.Context(), claims, documentID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"attempts": attempts})
}

// submitPractice — POST /api/exam-prep/practice/{id}/submit
func (s *Server) submitPractice(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input domain.SubmitPracticeInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	attempt, err := s.examPrepUC.SubmitPractice(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"attempt": attempt})
}

// ============================================================
// PRACTICE GENERATION (async — EXAM-PREP-CONNECT-1 Étape 2b)
// ============================================================

// examPrepGeneratePracticeConfig est la partie « config » du body.
type examPrepGeneratePracticeConfig struct {
	NombreQuestions int            `json:"nombreQuestions"`
	TypesQuestions  map[string]int `json:"typesQuestions"` // qcu, qcm, qrc, code, reflexion
	Difficulte      string         `json:"difficulte"`
	ChapterID       string         `json:"chapterId,omitempty"`
}

// examPrepGeneratePracticeBody est le body attendu par /api/exam-prep/practice/generate.
type examPrepGeneratePracticeBody struct {
	DocumentID string                         `json:"documentId"`
	Config     examPrepGeneratePracticeConfig `json:"config"`
}

// examPrepGeneratePractice — POST /api/exam-prep/practice/generate
//
// Flux async (202 Accepted + PracticeQueue) :
//  1. Valide le body (documentId + config.nombreQuestions > 0)
//  2. Pousse un PracticeJob dans worker.PracticeQueue (channel Go, < 1ms)
//  3. Retourne 202 Accepted
//
// Le worker (goroutine) consomme la queue et génère les questions via l'IA
// en arrière-plan (cf. internal/worker/practice_worker.go).
// Le frontend poll /api/questions?documentId=X pour récupérer les questions.
func (s *Server) examPrepGeneratePractice(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// ETUDIANT et ENSEIGNANT peuvent générer des questions d'entraînement.
	if claims.Role != "ETUDIANT" && claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	var body examPrepGeneratePracticeBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide: "+err.Error())
		return
	}
	if body.DocumentID == "" {
		writeJSONError(w, http.StatusBadRequest, "documentId requis")
		return
	}
	if body.Config.NombreQuestions <= 0 {
		writeJSONError(w, http.StatusBadRequest, "config.nombreQuestions doit être > 0")
		return
	}

	// Construire le PracticeJob et le pousser dans la queue.
	diff := domain.Difficulte(strings.ToUpper(body.Config.Difficulte))
	if diff == "" {
		diff = domain.DifficulteMoyen
	}

	job := worker.PracticeJob{
		UserID:     claims.UserID,
		DocumentID: body.DocumentID,
		Config: worker.PracticeConfig{
			NombreQuestions: body.Config.NombreQuestions,
			TypesQuestions:  body.Config.TypesQuestions,
			Difficulte:      diff,
			ChapterID:       body.Config.ChapterID,
		},
	}

	select {
	case worker.PracticeQueue <- job:
		// OK — job accepté, le worker le traitera en arrière-plan.
	default:
		// Queue pleine (100 jobs en attente) — on reject pour éviter une OOM.
		writeJSONError(w, http.StatusServiceUnavailable, "file d'attente de génération saturée, réessayez dans un instant")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]any{
		"status":     "EN_COURS",
		"documentId": body.DocumentID,
		"message":    "génération de questions lancée en arrière-plan, interrogez /api/questions?documentId=X pour récupérer le résultat",
	})
}

// ============================================================
// Q&A RAG (synchrone — EXAM-PREP-CONNECT-1 Étape 3)
// ============================================================

// examPrepQABody est le body attendu par /api/exam-prep/qa.
type examPrepQABody struct {
	DocumentID string `json:"documentId"`
	Question   string `json:"question"`
}

// examPrepQA — POST /api/exam-prep/qa
//
// Endpoint Q&A synchrone (l'étudiant attend la réponse) :
//  1. Récupère le contenu du document depuis la DB (RAG context)
//  2. Construit un prompt avec le contexte + la question
//  3. Appelle s.aiService.ChatCompletion (synchrone)
//  4. Retourne { response, citations }
//
// Les citations sont actuellement vides (v1 — pas d'extraction de spans).
// L'IA est invitée à citer les passages pertinents dans sa réponse.
func (s *Server) examPrepQA(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	// ETUDIANT et ENSEIGNANT peuvent poser des questions Q&A.
	if claims.Role != "ETUDIANT" && claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	var body examPrepQABody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide: "+err.Error())
		return
	}
	if body.DocumentID == "" {
		writeJSONError(w, http.StatusBadRequest, "documentId requis")
		return
	}
	question := strings.TrimSpace(body.Question)
	if question == "" {
		writeJSONError(w, http.StatusBadRequest, "question requise")
		return
	}

	// 1. Récupérer le contenu du document.
	docContent, err := s.examPrepUC.GetDocumentContentForQA(r.Context(), claims, body.DocumentID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	if strings.TrimSpace(docContent) == "" {
		writeJSONError(w, http.StatusUnprocessableEntity, "le document n'a pas de contenu textuel exploitable")
		return
	}

	// 2. Construire le prompt RAG.
	messages := buildExamPrepQAPrompt(docContent, question, claims.Role)

	// 3. Appel IA synchrone.
	result, err := s.aiService.ChatCompletion(r.Context(), messages)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, "IA indisponible: "+err.Error())
		return
	}

	// 4. Réponse.
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"response":   result.Content,
		"model":      result.Model,
		"citations":  []any{}, // v1 : pas d'extraction de citations (placeholder pour future v2)
		"documentId": body.DocumentID,
	})
}

// buildExamPrepQAPrompt construit les messages (system + user) pour le Q&A RAG.
//
// Le système est configuré pour répondre STRICTEMENT à partir du contenu du
// document fourni (évite les hallucinations). Si la réponse n'est pas dans
// le document, l'IA doit l'indiquer clairement plutôt que d'inventer.
func buildExamPrepQAPrompt(docContent, question, userRole string) []ai.ChatMessage {
	roleHint := "étudiant"
	if userRole == "ENSEIGNANT" || userRole == "ADMIN" {
		roleHint = "enseignant"
	}

	system := strings.TrimSpace(`Tu es un tuteur pédagogique expert. Tu aides un ` + roleHint + ` à comprendre le contenu d'un document de cours.
Ta réponse DOIT respecter ces règles :
1. Réponds UNIQUEMENT à partir du contenu du document fourni ci-dessous. Si la réponse n'y est pas, dis-le clairement : "Cette information n'est pas présente dans le document fourni."
2. Cite les passages pertinents du document entre guillemets quand cela appuie ta réponse.
3. Sois concis, structuré et pédagogique. Utilise du markdown léger (titres ##, listes -, **gras**) si utile.
4. Si la question demande un avis personnel ou une extrapolation hors document, recentre poliment sur ce que dit le document.

[CONTENU DU DOCUMENT]
` + docContent)

	user := fmt.Sprintf(`Question : %s

Réponds en français en t'appuyant sur le contenu du document ci-dessus.`, question)

	return []ai.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}
}

// ============================================================
// HELP THREADS
// ============================================================

// listHelpThreads — GET /api/exam-prep/help
func (s *Server) listHelpThreads(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	threads, err := s.examPrepUC.ListHelpThreads(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"threads": threads})
}

// createHelpThread — POST /api/exam-prep/help
func (s *Server) createHelpThread(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var input domain.CreateHelpThreadInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	thread, err := s.examPrepUC.CreateHelpThread(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"thread": thread})
}

// closeHelpThread — POST /api/exam-prep/help/{id}/close
func (s *Server) closeHelpThread(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.examPrepUC.CloseHelpThread(r.Context(), claims, id); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Fil clos"})
}

// listHelpMessages — GET /api/exam-prep/help/{id}/messages
func (s *Server) listHelpMessages(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	threadID := chi.URLParam(r, "id")
	messages, err := s.examPrepUC.ListHelpMessages(r.Context(), claims, threadID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"messages": messages})
}

// createHelpMessage — POST /api/exam-prep/help/{id}/messages
func (s *Server) createHelpMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	threadID := chi.URLParam(r, "id")
	var input domain.CreateHelpMessageInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	msg, err := s.examPrepUC.CreateHelpMessage(r.Context(), claims, threadID, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"message": msg})
}

// Suppress unused warning
var _ = strconv.Atoi
