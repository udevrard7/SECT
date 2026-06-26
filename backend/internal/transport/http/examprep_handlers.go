package http

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/middleware"
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

// listExamPrepDocuments — GET /api/exam-prep/documents
func (s *Server) listExamPrepDocuments(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	docs, err := s.examPrepUC.ListDocuments(r.Context(), claims)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"documents": docs})
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
