package http

import (
        "encoding/json"
        "net/http"

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

// requestPasswordReset handler — POST /api/auth/password-reset (PUBLIC — anti-énumération)
// Body: { "email": "..." }
// Réponse : toujours 200 avec un message générique, qu'un compte existe ou non.
func (s *Server) requestPasswordReset(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Email string `json:"email"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
                return
        }
        if req.Email == "" {
                writeJSONError(w, http.StatusBadRequest, "email requis")
                return
        }

        ip := clientIP(r)
        userAgent := r.Header.Get("User-Agent")
        // Toujours 200 (anti-énumération) — l'usecase ne retourne jamais d'erreur
        // métier visible même si l'email n'existe pas.
        _ = s.authUC.RequestPasswordReset(r.Context(), req.Email, ip, userAgent)

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{
                "message": "Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.",
        })
}

// confirmPasswordReset handler — POST /api/auth/password-reset/confirm (PUBLIC)
// Body: { "token": "...", "newPassword": "..." }
// Réponse : 200 si succès, 400/401 si token invalide/expiré ou password trop court.
func (s *Server) confirmPasswordReset(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Token       string `json:"token"`
                NewPassword string `json:"newPassword"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
                return
        }

        ip := clientIP(r)
        if err := s.authUC.ConfirmPasswordReset(r.Context(), req.Token, req.NewPassword, ip); err != nil {
                middleware.MapDomainError(w, err)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{
                "message": "mot de passe réinitialisé avec succès",
        })
}

// writeJSONError écrit une erreur JSON.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(status)
        _, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}

// clientIP utilise la fonction partagée GetClientIP du middleware pour
// extraire l'IP RÉELLE du client (via headers Vercel X-Forwarded-For / X-Real-IP).
func clientIP(r *http.Request) string {
        return middleware.GetClientIP(r)
}
