package http

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/usecase"
)

// login handler — POST /api/auth/login
// Body: { "identifier": "email ou matricule", "password": "..." }
// Response: { "user": {...}, "accessToken": "...", "refreshToken": "...", "expiresAt": "..." }
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req usecase.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	ip := clientIP(r)
	userAgent := r.Header.Get("User-Agent")

	resp, err := s.authUC.Login(r.Context(), req, ip, userAgent)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// refresh handler — POST /api/auth/refresh
// Body: { "refreshToken": "..." }
// Response: même forme que login
func (s *Server) refresh(w http.ResponseWriter, r *http.Request) {
	var req usecase.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	ip := clientIP(r)
	userAgent := r.Header.Get("User-Agent")

	resp, err := s.authUC.Refresh(r.Context(), req, ip, userAgent)
	if err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// logout handler — POST /api/auth/logout
// Body: { "refreshToken": "..." }
// Révoque le refresh token. L'access token reste valide jusqu'à expiration (stateless).
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	var req usecase.RefreshRequest
	// Body optionnel — si pas de body, on décode un empty struct
	_ = json.NewDecoder(r.Body).Decode(&req)

	ip := clientIP(r)
	if err := s.authUC.Logout(r.Context(), req.RefreshToken, ip); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "déconnexion réussie"})
}

// changePassword handler — POST /api/auth/change-password (auth requis)
// Body: { "currentPassword": "...", "newPassword": "..." }
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req usecase.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	ip := clientIP(r)
	if err := s.authUC.ChangePassword(r.Context(), claims.UserID, req, ip); err != nil {
		middleware.MapDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "mot de passe modifié"})
}

// writeJSONError écrit une erreur JSON.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}

// clientIP extrait l'IP du client en tenant compte des headers proxy.
func clientIP(r *http.Request) string {
	// X-Forwarded-For (format: client, proxy1, proxy2)
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		parts := strings.SplitN(xff, ",", 2)
		return strings.TrimSpace(parts[0])
	}
	// X-Real-IP (posé par Caddy)
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	// Fallback: RemoteAddr (host:port)
	return strings.SplitN(r.RemoteAddr, ":", 2)[0]
}
