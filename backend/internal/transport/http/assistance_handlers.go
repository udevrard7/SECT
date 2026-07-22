package http

// assistance_handlers.go — Mode assistance ADMIN.
//
// ACCESS-ASSISTANCE : permet à l'ADMIN d'accéder temporairement aux pages
// RESPONSABLE/ENSEIGNANT pour configurer, régler ou assister un établissement.
// L'accès est lié à la durée de l'EtablissementAccess (auto-révocation).
//
// 2 endpoints :
// - POST /api/auth/assistance-mode : entre en mode assistance (nouveau JWT avec etablissementId)
// - POST /api/auth/exit-assistance-mode : quitte le mode assistance (nouveau JWT sans etablissementId)

import (
	"encoding/json"
	"net/http"

	"github.com/udevrard7/sect/backend/internal/middleware"
)

// enterAssistanceMode — POST /api/auth/assistance-mode
// Body: { "etablissementId": "..." }
// Vérifie que l'ADMIN a un accès APPROUVE valide, puis émet un nouveau JWT
// avec etablissementId set.
func (s *Server) enterAssistanceMode(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	if claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "réservé aux ADMIN")
		return
	}

	var input struct {
		EtablissementID string `json:"etablissementId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if input.EtablissementID == "" {
		writeJSONError(w, http.StatusBadRequest, "etablissementId requis")
		return
	}

	// Vérifier que l'ADMIN a un accès APPROUVE valide pour cet établissement.
	access, err := s.accessUC.CheckAccess(r.Context(), claims, input.EtablissementID)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}
	if access == nil {
		writeJSONError(w, http.StatusForbidden, "aucun accès autorisé à cet établissement. Demandez l'autorisation au responsable.")
		return
	}

	// Émettre un nouveau JWT avec etablissementId set.
	accessToken, refreshToken, expiresAt, err := s.authUC.IssueNewTokens(
		r.Context(), claims.UserID, claims.Role, input.EtablissementID,
		claims.Email, claims.Name, claims.MustChangePwd,
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur génération tokens")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"user": map[string]any{
			"id":              claims.UserID,
			"email":           claims.Email,
			"name":            claims.Name,
			"role":            claims.Role,
			"etablissementId": input.EtablissementID,
			"actif":           true,
			"mustChangePwd":   claims.MustChangePwd,
		},
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"expiresAt":    expiresAt,
		"message":      "Mode assistance activé",
	})
}

// exitAssistanceMode — POST /api/auth/exit-assistance-mode
// Émet un nouveau JWT sans etablissementId (retour au mode ADMIN normal).
func (s *Server) exitAssistanceMode(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	if claims.Role != "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "réservé aux ADMIN")
		return
	}

	// Émettre un nouveau JWT sans etablissementId.
	accessToken, refreshToken, expiresAt, err := s.authUC.IssueNewTokens(
		r.Context(), claims.UserID, claims.Role, "",
		claims.Email, claims.Name, claims.MustChangePwd,
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "erreur génération tokens")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"user": map[string]any{
			"id":              claims.UserID,
			"email":           claims.Email,
			"name":            claims.Name,
			"role":            claims.Role,
			"etablissementId": "",
			"actif":           true,
			"mustChangePwd":   claims.MustChangePwd,
		},
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
		"expiresAt":    expiresAt,
		"message":      "Mode assistance désactivé",
	})
}
