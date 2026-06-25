package http

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/udevrard7/sect/apps/api/internal/domain"
	"github.com/udevrard7/sect/apps/api/internal/middleware"
)

// certificat_handlers.go — handlers HTTP pour Certificats + Correction.

// ============================================================
// CERTIFICATS
// ============================================================

// listCertificats — GET /api/certificats
func (s *Server) listCertificats(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	params := domain.CertificatListParams{
		EtudiantID: r.URL.Query().Get("etudiantId"),
		Type:       r.URL.Query().Get("type"),
		Statut:     r.URL.Query().Get("statut"),
	}

	certs, err := s.certificatUC.List(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"certificats": certs})
}

// getCertificat — GET /api/certificats/{id}
func (s *Server) getCertificat(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	cert, err := s.certificatUC.GetByID(r.Context(), claims, id)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"certificat": cert})
}

// verifyCertificat — GET /api/certificats/verify/{code} (PUBLIC — no auth required)
func (s *Server) verifyCertificat(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if code == "" {
		writeJSONError(w, http.StatusBadRequest, "code requis")
		return
	}

	cert, err := s.certificatUC.Verify(r.Context(), code)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"valide":       cert.Statut == domain.StatutCertificatActif,
		"certificat":   cert,
	})
}

// revokeCertificat — POST /api/certificats/{id}/revoquer
func (s *Server) revokeCertificat(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	id := chi.URLParam(r, "id")
	var body struct {
		Raison string `json:"raison"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	if err := s.certificatUC.Revoke(r.Context(), claims, id, body.Raison); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Certificat révoqué"})
}

// ============================================================
// CORRECTION
// ============================================================

// listCorrectionSessions — GET /api/correction
func (s *Server) listCorrectionSessions(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	params := domain.CorrectionListParams{
		EnseignantID: r.URL.Query().Get("enseignantId"),
		EpreuveID:    r.URL.Query().Get("epreuveId"),
	}

	sessions, err := s.correctionUC.ListSessions(r.Context(), claims, params)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"sessions": sessions})
}

// updateReponse — PATCH /api/correction/reponses/{reponseId}
func (s *Server) updateReponse(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	reponseID := chi.URLParam(r, "reponseId")
	var input domain.UpdateReponseInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	if err := s.correctionUC.UpdateReponse(r.Context(), claims, reponseID, input); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Réponse mise à jour"})
}

// retournerSession — POST /api/correction/{sessionId}/retourner
func (s *Server) retournerSession(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID := chi.URLParam(r, "sessionId")
	if err := s.correctionUC.RetournerSession(r.Context(), claims, sessionID); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Session retournée à l'étudiant"})
}

// retournerBatch — POST /api/correction/retourner-batch
func (s *Server) retournerBatch(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		SessionIDs []string `json:"sessionIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	count, err := s.correctionUC.RetournerBatch(r.Context(), claims, body.SessionIDs)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"message": "Sessions retournées",
		"count":   count,
	})
}
