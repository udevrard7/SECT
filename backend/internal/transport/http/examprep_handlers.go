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

	// QUESTION-BANK-1 — Cache check : si la banque contient déjà assez de
	// questions validées pour ce document (et cette difficulté), on les
	// retourne immédiatement (200 PRET) sans générer de nouvelles questions
	// via l'IA. Le premier étudiant paie le coût IA, les suivants obtiennent
	// les questions instantanément.
	diff := domain.Difficulte(strings.ToUpper(body.Config.Difficulte))
	if diff == "" {
		diff = domain.DifficulteMoyen
	}

	var chapterPtr *string
	if body.Config.ChapterID != "" {
		chapterPtr = &body.Config.ChapterID
	}
	var diffPtr *string
	if diff != "" {
		s := string(diff)
		diffPtr = &s
	}

	cached, hasEnough, err := s.examPrepUC.GetCachedQuestions(r.Context(), claims, body.DocumentID, chapterPtr, diffPtr, body.Config.NombreQuestions)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	if hasEnough && len(cached) > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]any{
			"status":     "PRET",
			"documentId": body.DocumentID,
			"questions":  toExamPrepCachedQuestionDTOs(cached),
		})
		return
	}

	// Cache miss → on pousse un job IA asynchrone (202 Accepted).
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

// deleteHelpThread — DELETE /api/exam-prep/help/{id}
// Supprime un fil clôturé + ses messages (hard delete cascade).
// Ownership : étudiant = ses propres fils, enseignant = fils de ses documents.
// Le usecase valide le statut=CLOS avant la suppression effective.
func (s *Server) deleteHelpThread(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.examPrepUC.DeleteHelpThread(r.Context(), claims, id); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Fil supprimé"})
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

// ============================================================
// DOCUMENT READER (HIGHLIGHT-FLASHCARD-1)
// ============================================================

// examPrepReaderDocumentDTO est la forme JSON attendue par le frontend
// DocumentReader (interface ReaderDocument).
type examPrepReaderDocumentDTO struct {
	ID                 string     `json:"id"`
	NomFichier         string     `json:"nomFichier"`
	ContenuTexte       *string    `json:"contenuTexte"`
	TypeMime           *string    `json:"typeMime"`
	ThemesDetectes     []string   `json:"themesDetectes"`
	ResumeAnalyse      *string    `json:"resumeAnalyse"`
	DateUpload         time.Time  `json:"dateUpload"`
	Owner              ownerRefDTO `json:"owner"`
	UniteEnseignement  *ueRefDTO  `json:"uniteEnseignement"`
}

type ownerRefDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ueRefDTO struct {
	ID   string `json:"id"`
	Code string `json:"code"`
	Nom  string `json:"nom"`
}

// readExamPrepDocument — GET /api/exam-prep/documents/{id}/read
//
// Retourne le document (avec contenuTexte) pour le lecteur modal.
// Rôles : ETUDIANT, ENSEIGNANT.
func (s *Server) readExamPrepDocument(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	docID := chi.URLParam(r, "id")
	doc, err := s.examPrepUC.GetDocumentForReader(r.Context(), claims, docID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// Résoudre l'UE et le propriétaire via les batch methods existants.
	var ueDTO *ueRefDTO
	if doc.UniteEnseignementID != nil && *doc.UniteEnseignementID != "" {
		ues, err := s.examPrepUC.ListUEsByIDs(r.Context(), []string{*doc.UniteEnseignementID})
		if err == nil {
			if ue, ok := ues[*doc.UniteEnseignementID]; ok && ue != nil {
				ueDTO = &ueRefDTO{ID: ue.ID, Code: ue.Code, Nom: ue.Nom}
			}
		}
	}

	ownerDTO := ownerRefDTO{ID: doc.OwnerID, Name: "Enseignant"}
	if doc.OwnerID != "" {
		owners, err := s.examPrepUC.ListUserRefsByIDs(r.Context(), []string{doc.OwnerID})
		if err == nil {
			if o, ok := owners[doc.OwnerID]; ok && o != nil {
				ownerDTO = ownerRefDTO{ID: o.ID, Name: o.Name}
			}
		}
	}

	dto := examPrepReaderDocumentDTO{
		ID:             doc.ID,
		NomFichier:     doc.NomFichier,
		ContenuTexte:   doc.ContenuTexte,
		TypeMime:       doc.TypeMime,
		ThemesDetectes: parseJSONStringArray(doc.ThemesDetectes),
		ResumeAnalyse:  doc.ResumeAnalyse,
		DateUpload:     doc.DateUpload,
		Owner:          ownerDTO,
		UniteEnseignement: ueDTO,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"document": dto})
}

// ============================================================
// FLASHCARDS (HIGHLIGHT-FLASHCARD-1)
// ============================================================

// examPrepCreateFlashcardBody est le body attendu par POST /api/exam-prep/flashcards.
type examPrepCreateFlashcardBody struct {
	DocumentID    string  `json:"documentId"`
	SelectedText  string  `json:"selectedText"`
	ChapterID     *string `json:"chapterId,omitempty"`
}

// examPrepFlashcardDTO est la forme JSON retournée au frontend.
type examPrepFlashcardDTO struct {
	ID         string    `json:"id"`
	ChapterID  *string   `json:"chapterId,omitempty"`
	DocumentID *string   `json:"documentId,omitempty"`
	Recto      string    `json:"recto"`
	Verso      string    `json:"verso"`
	CreatedAt  time.Time `json:"createdAt"`
}

// toExamPrepFlashcardDTO convertit un domain.Flashcard en DTO.
func toExamPrepFlashcardDTO(f *domain.Flashcard) examPrepFlashcardDTO {
	return examPrepFlashcardDTO{
		ID:         f.ID,
		ChapterID:  f.ChapterID,
		DocumentID: f.DocumentID,
		Recto:      f.Recto,
		Verso:      f.Verso,
		CreatedAt:  f.CreatedAt,
	}
}

// createFlashcard — POST /api/exam-prep/flashcards
//
// Flux synchrone (l'étudiant attend la flashcard) :
//  1. Valide le body (documentId + selectedText non vides)
//  2. Tronque selectedText à 4000 caractères (garde-fou contre les abus)
//  3. Appelle l'IA pour générer { recto, verso } au format JSON
//  4. Insère la Flashcard + crée le ReviewItem SRS associé
//  5. Retourne 201 avec la flashcard créée
//
// Si l'IA échoue ou retourne un JSON invalide, on retourne 503 (pas de
// flashcard vide).
func (s *Server) createFlashcard(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ETUDIANT" && claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	var body examPrepCreateFlashcardBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide: "+err.Error())
		return
	}
	if body.DocumentID == "" {
		writeJSONError(w, http.StatusBadRequest, "documentId requis")
		return
	}
	selectedText := strings.TrimSpace(body.SelectedText)
	if len(selectedText) < 10 {
		writeJSONError(w, http.StatusBadRequest, "selectedText trop court (min 10 caractères)")
		return
	}
	if len(selectedText) > 4000 {
		selectedText = selectedText[:4000]
	}

	// 1. Construire le prompt IA pour générer recto/verso.
	messages := buildFlashcardPrompt(selectedText)

	// 2. Appel IA synchrone.
	result, err := s.aiService.ChatCompletion(r.Context(), messages)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, "IA indisponible: "+err.Error())
		return
	}

	// 3. Parser la réponse JSON { recto, verso } (tolérant aux markdown fences).
	recto, verso, perr := parseFlashcardAIResponse(result.Content)
	if perr != nil {
		writeJSONError(w, http.StatusUnprocessableEntity, "réponse IA illisible: "+perr.Error())
		return
	}
	if strings.TrimSpace(recto) == "" || strings.TrimSpace(verso) == "" {
		writeJSONError(w, http.StatusUnprocessableEntity, "réponse IA vide (recto ou verso manquant)")
		return
	}

	// 4. Insérer la flashcard + créer le ReviewItem SRS.
	input := domain.CreateFlashcardInput{
		DocumentID: &body.DocumentID,
		ChapterID:  body.ChapterID,
		Recto:      strings.TrimSpace(recto),
		Verso:      strings.TrimSpace(verso),
	}
	flashcard, err := s.examPrepUC.CreateFlashcard(r.Context(), claims, input)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"flashcard": toExamPrepFlashcardDTO(flashcard)})
}

// listFlashcards — GET /api/exam-prep/flashcards?documentId=X
func (s *Server) listFlashcards(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	documentID := r.URL.Query().Get("documentId")
	flashcards, err := s.examPrepUC.ListFlashcards(r.Context(), claims, documentID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	dtos := make([]examPrepFlashcardDTO, 0, len(flashcards))
	for _, f := range flashcards {
		dtos = append(dtos, toExamPrepFlashcardDTO(f))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"flashcards": dtos})
}

// deleteFlashcard — DELETE /api/exam-prep/flashcards/{id}
func (s *Server) deleteFlashcard(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	if err := s.examPrepUC.DeleteFlashcard(r.Context(), claims, id); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// buildFlashcardPrompt construit les messages (system + user) pour la génération
// d'une flashcard Q/R à partir d'un passage sélectionné.
//
// Le système exige une réponse JSON strict : {"recto": "...", "verso": "..."}.
// recto = question courte, verso = réponse concise mais complète.
func buildFlashcardPrompt(selectedText string) []ai.ChatMessage {
	system := strings.TrimSpace(`Tu es un assistant pédagogique qui crée des flashcards de révision.
À partir d'un passage de cours sélectionné par l'étudiant, tu génères UNE flashcard au format JSON strict :

{"recto": "<question claire et concise>", "verso": "<réponse pédagogique correcte>"}

Règles :
1. La question (recto) doit être reformulée à partir du passage — ne recopie pas le texte tel quel.
2. La réponse (verso) doit être fidèle au passage, concise (1–4 phrases), et suffisante pour réviser.
3. Réponds UNIQUEMENT avec le JSON, sans markdown, sans commentaire, sans texte avant ou après.
4. Si le passage est trop court ou incohérent, réponds : {"recto": "", "verso": ""}`)

	user := fmt.Sprintf(`[PASSAGE SÉLECTIONNÉ]
%s

Génère la flashcard JSON.`, selectedText)

	return []ai.ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}
}

// parseFlashcardAIResponse extrait { recto, verso } de la réponse IA.
// Tolérant aux markdown fences ```json ... ``` et au texte avant/après le JSON.
func parseFlashcardAIResponse(raw string) (recto string, verso string, err error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", "", fmt.Errorf("réponse vide")
	}

	// Retirer les éventuelles markdown fences ```json ... ``` ou ``` ... ```.
	if strings.HasPrefix(trimmed, "```") {
		// Enlever la première ligne (```json ou ```)
		if idx := strings.Index(trimmed, "\n"); idx >= 0 {
			trimmed = trimmed[idx+1:]
		}
		// Enlever le ``` final s'il existe
		trimmed = strings.TrimSuffix(strings.TrimSpace(trimmed), "```")
		trimmed = strings.TrimSpace(trimmed)
	}

	// Chercher le premier { ... } dans la chaîne (au cas où l'IA ajoute du texte).
	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start < 0 || end <= start {
		return "", "", fmt.Errorf("JSON introuvable dans la réponse")
	}
	jsonStr := trimmed[start : end+1]

	var parsed struct {
		Recto string `json:"recto"`
		Verso string `json:"verso"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return "", "", fmt.Errorf("parse JSON: %w", err)
	}
	return parsed.Recto, parsed.Verso, nil
}


// Suppress unused warning
var _ = strconv.Atoi


// ============================================================
// QUESTION BANK — votes collaboratifs + liste (QUESTION-BANK-1)
// ============================================================

// examPrepCachedQuestionDTO est la forme JSON d'une question de la banque
// quand elle est retournée par /practice/generate (cache hit, 200 PRET).
// Le frontend la mappe vers PracticeQuestion : propositions et themes sont
// renvoyés comme json.RawMessage (et non *string) pour matcher l'interface
// TS (Array<{texte}> | null et string[]).
type examPrepCachedQuestionDTO struct {
	ID           string          `json:"id"`
	Type         string          `json:"type"`
	Enonce       string          `json:"enonce"`
	Propositions json.RawMessage `json:"propositions"`
	Difficulte   string          `json:"difficulte"`
	Themes       json.RawMessage `json:"themes"`
}

// toExamPrepCachedQuestionDTO convertit un QuestionBankItem (*string pour
// propositions/themes) en DTO avec json.RawMessage (null si nil ou invalide).
func toExamPrepCachedQuestionDTO(q *domain.QuestionBankItem) examPrepCachedQuestionDTO {
	return examPrepCachedQuestionDTO{
		ID:           q.ID,
		Type:         q.Type,
		Enonce:       q.Enonce,
		Propositions: stringToRawJSON(q.Propositions),
		Difficulte:   q.Difficulte,
		Themes:       stringToRawJSON(q.Themes),
	}
}

func toExamPrepCachedQuestionDTOs(items []*domain.QuestionBankItem) []examPrepCachedQuestionDTO {
	out := make([]examPrepCachedQuestionDTO, 0, len(items))
	for _, q := range items {
		out = append(out, toExamPrepCachedQuestionDTO(q))
	}
	return out
}

// stringToRawJSON convertit un *string contenant du JSON en json.RawMessage.
// Retourne nil si le pointeur est nil, la chaîne vide, ou si le parsing échoue.
func stringToRawJSON(s *string) json.RawMessage {
	if s == nil || *s == "" {
		return nil
	}
	var v any
	if err := json.Unmarshal([]byte(*s), &v); err != nil {
		return nil
	}
	return json.RawMessage(*s)
}

// examPrepQuestionBankDTO est la forme JSON d'une question de la banque pour
// l'onglet "Banque" (lecture seule + votes). Comme pour le cache, propositions
// et themes sont en json.RawMessage pour faciliter le parsing côté frontend.
type examPrepQuestionBankDTO struct {
	ID              string          `json:"id"`
	DocumentID      *string         `json:"documentId,omitempty"`
	AuteurID        *string         `json:"auteurId,omitempty"`
	Type            string          `json:"type"`
	Enonce          string          `json:"enonce"`
	Propositions    json.RawMessage `json:"propositions"`
	ReponseCorrecte json.RawMessage `json:"reponseCorrecte"`
	Explication     *string         `json:"explication,omitempty"`
	Difficulte      string          `json:"difficulte"`
	Themes          json.RawMessage `json:"themes"`
	Validee         bool            `json:"validee"`
	CreatedAt       time.Time       `json:"createdAt"`
	NetVotes        int             `json:"netVotes"`
	Upvotes         int             `json:"upvotes"`
	Downvotes       int             `json:"downvotes"`
	UserVote        *int            `json:"userVote,omitempty"`
}

func toExamPrepQuestionBankDTO(q *domain.QuestionBankItem) examPrepQuestionBankDTO {
	return examPrepQuestionBankDTO{
		ID:              q.ID,
		DocumentID:      q.DocumentID,
		AuteurID:        q.AuteurID,
		Type:            q.Type,
		Enonce:          q.Enonce,
		Propositions:    stringToRawJSON(q.Propositions),
		ReponseCorrecte: stringToRawJSON(q.ReponseCorrecte),
		Explication:     q.Explication,
		Difficulte:      q.Difficulte,
		Themes:          stringToRawJSON(q.Themes),
		Validee:         q.Validee,
		CreatedAt:       q.CreatedAt,
		NetVotes:        q.NetVotes,
		Upvotes:         q.Upvotes,
		Downvotes:       q.Downvotes,
		UserVote:        q.UserVote,
	}
}

// listQuestionBank — GET /api/exam-prep/question-bank?documentId=X&limit=50&offset=0
func (s *Server) listQuestionBank(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	documentID := r.URL.Query().Get("documentId")
	if documentID == "" {
		writeJSONError(w, http.StatusBadRequest, "documentId requis")
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}

	var chapterPtr *string
	if ch := r.URL.Query().Get("chapterId"); ch != "" {
		chapterPtr = &ch
	}

	items, err := s.examPrepUC.ListQuestionBank(r.Context(), claims, documentID, chapterPtr, limit, offset)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	dtos := make([]examPrepQuestionBankDTO, 0, len(items))
	for _, q := range items {
		dtos = append(dtos, toExamPrepQuestionBankDTO(q))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"questions": dtos})
}

// examPrepVoteBody est le body attendu par POST /api/exam-prep/questions/{id}/vote.
type examPrepVoteBody struct {
	Value int `json:"value"` // +1 ou -1
}

// voteQuestion — POST /api/exam-prep/questions/{id}/vote
// Body : { "value": 1|-1 }. Upsert : si l'utilisateur a déjà voté, la valeur
// est mise à jour. Retourne 200 avec le vote.
func (s *Server) voteQuestion(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ETUDIANT" && claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	questionID := chi.URLParam(r, "id")
	if questionID == "" {
		writeJSONError(w, http.StatusBadRequest, "id question requis")
		return
	}

	var body examPrepVoteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide: "+err.Error())
		return
	}

	vote, err := s.examPrepUC.VoteQuestion(r.Context(), claims, questionID, body.Value)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{"vote": vote})
}

// removeVote — DELETE /api/exam-prep/questions/{id}/vote
// Supprime le vote de l'utilisateur courant sur la question (un-vote).
// No-op si le vote n'existait pas. Retourne 204.
func (s *Server) removeVote(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ETUDIANT" && claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	questionID := chi.URLParam(r, "id")
	if questionID == "" {
		writeJSONError(w, http.StatusBadRequest, "id question requis")
		return
	}

	if err := s.examPrepUC.RemoveVote(r.Context(), claims, questionID); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ============================================================
// AUDIO-LEARNING-1 — Mode Audio-Learning (podcasts de révision)
// ============================================================

// examPrepAudioDTO est la forme JSON renvoyée au frontend. Le champ audioUrl
// est présent uniquement si l'audio a un r2Key ET que la présignature R2 a
// réussi. Sinon, le frontend affiche uniquement le script (cas TTS non supporté).
type examPrepAudioDTO struct {
	ID           string  `json:"id"`
	DocumentID   string  `json:"documentId"`
	UserID       string  `json:"userId"`
	Script       string  `json:"script"`
	R2Key        *string `json:"r2Key,omitempty"`
	DurationSec  *int    `json:"durationSec,omitempty"`
	Status       string  `json:"status"`
	ErrorMessage *string `json:"errorMessage,omitempty"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
	AudioURL     string  `json:"audioUrl,omitempty"`
}

// toExamPrepAudioDTO converts a domain.DocumentAudio to a DTO with RFC3339
// timestamps. The audioUrl field is left empty here — the handler fills it
// in after generating the presigned URL (if applicable).
func toExamPrepAudioDTO(a *domain.DocumentAudio) examPrepAudioDTO {
	return examPrepAudioDTO{
		ID:           a.ID,
		DocumentID:   a.DocumentID,
		UserID:       a.UserID,
		Script:       a.Script,
		R2Key:        a.R2Key,
		DurationSec:  a.DurationSec,
		Status:       a.Status,
		ErrorMessage: a.ErrorMessage,
		CreatedAt:    a.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    a.UpdatedAt.Format(time.RFC3339),
	}
}

// generateAudio — POST /api/exam-prep/documents/{id}/audio
//
// Crée une ligne DocumentAudio (status=EN_COURS, script="") puis pousse un
// job dans worker.AudioGenerationQueue. Retourne 202 Accepted avec l'audio
// (pour que le frontend puisse poller son statut via GET /audio/{id} ou
// GET /documents/{id}/audio).
//
// Rôles : ETUDIANT, ENSEIGNANT.
func (s *Server) generateAudio(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ETUDIANT" && claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	documentID := chi.URLParam(r, "id")
	if documentID == "" {
		writeJSONError(w, http.StatusBadRequest, "id document requis")
		return
	}

	// 1. Créer la ligne DocumentAudio (status=EN_COURS, script="").
	audio, err := s.examPrepUC.GenerateAudio(r.Context(), claims, documentID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	// 2. Pousser le job dans la queue (non-bloquant : si queue pleine → 503).
	job := worker.AudioGenerationJob{
		AudioID:    audio.ID,
		DocumentID: documentID,
		UserID:     claims.UserID,
	}
	select {
	case worker.AudioGenerationQueue <- job:
		// OK — job accepté, le worker le traitera en arrière-plan.
	default:
		// Queue pleine (25 jobs en attente) — on marque l'audio en ERREUR
		// pour que le frontend arrête de poller.
		errMsg := "file d'attente audio saturée, réessayez dans un instant"
		_ = s.examPrepUC.MarkAudioError(r.Context(), claims, audio.ID, errMsg)
		writeJSONError(w, http.StatusServiceUnavailable, errMsg)
		return
	}

	// 3. Retourner 202 avec l'audio (status EN_COURS).
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]any{
		"audio":   toExamPrepAudioDTO(audio),
		"message": "génération du podcast lancée en arrière-plan",
	})
}

// listDocumentAudio — GET /api/exam-prep/documents/{id}/audio
//
// Liste tous les podcasts d'un document (tous utilisateurs confondus — comme
// la banque de questions, les podcasts sont partagés entre étudiants d'une
// même filière). Ordonné par createdAt DESC côté repo.
//
// Pour chaque audio PRET avec un r2Key non-nil, génère une URL présignée R2
// (15 min de validité) et l'inclut dans le DTO via audioUrl.
//
// Rôles : ETUDIANT, ENSEIGNANT.
func (s *Server) listDocumentAudio(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ETUDIANT" && claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	documentID := chi.URLParam(r, "id")
	if documentID == "" {
		writeJSONError(w, http.StatusBadRequest, "id document requis")
		return
	}

	audios, err := s.examPrepUC.ListAudio(r.Context(), claims, documentID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	dtos := make([]examPrepAudioDTO, 0, len(audios))
	for _, a := range audios {
		dto := toExamPrepAudioDTO(a)
		// Générer l'URL présignée si l'audio est PRET et a un r2Key.
		if a.Status == "PRET" && a.R2Key != nil && *a.R2Key != "" {
			if url, urlErr := s.examPrepUC.GetAudioURL(r.Context(), *a.R2Key); urlErr == nil {
				dto.AudioURL = url
			}
		}
		dtos = append(dtos, dto)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"audios": dtos})
}

// getAudio — GET /api/exam-prep/audio/{id}
//
// Récupère un podcast par son ID. Si l'audio est PRET et a un r2Key non-nil,
// génère une URL présignée R2 (15 min) et l'inclut dans la réponse via audioUrl.
//
// Rôles : ETUDIANT, ENSEIGNANT.
func (s *Server) getAudio(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if claims.Role != "ETUDIANT" && claims.Role != "ENSEIGNANT" && claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "rôle non autorisé")
		return
	}

	audioID := chi.URLParam(r, "id")
	if audioID == "" {
		writeJSONError(w, http.StatusBadRequest, "id audio requis")
		return
	}

	audio, err := s.examPrepUC.GetAudio(r.Context(), claims, audioID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	dto := toExamPrepAudioDTO(audio)
	if audio.Status == "PRET" && audio.R2Key != nil && *audio.R2Key != "" {
		if url, urlErr := s.examPrepUC.GetAudioURL(r.Context(), *audio.R2Key); urlErr == nil {
			dto.AudioURL = url
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"audio": dto})
}
