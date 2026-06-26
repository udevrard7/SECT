// Package middleware — middlewares HTTP du backend SECT.
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
	"github.com/udevrard7/sect/backend/internal/jwt"
)

// ClaimsFromContext récupère les claims de session depuis le context.
func ClaimsFromContext(ctx context.Context) (db.SessionClaims, bool) {
	return db.ClaimsFromContext(ctx)
}

// Auth middleware : extrait le JWT depuis DEUX sources possibles :
//  1. Cookie httpOnly "access_token" (envoyé par le navigateur via rewrite Vercel — 0 CPU Vercel)
//  2. Header "Authorization: Bearer" (pour API clients directs, mobile, etc.)
//
// Le cookie est prioritaire car il permet au rewrite next.config.ts de transférer
// la requête SANS middleware Next.js (0 CPU Vercel, 0 Edge invocation).
func Auth(signer *jwt.Signer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var tokenString string

			// 1. Essayer le cookie httpOnly "access_token" (navigateur via rewrite)
			if cookie, err := r.Cookie("access_token"); err == nil && cookie.Value != "" {
				tokenString = cookie.Value
			}

			// 2. Fallback: header "Authorization: Bearer" (API clients, mobile)
			if tokenString == "" {
				authHeader := r.Header.Get("Authorization")
				if authHeader != "" {
					parts := strings.SplitN(authHeader, " ", 2)
					if len(parts) == 2 && parts[0] == "Bearer" {
						tokenString = parts[1]
					}
				}
			}

			// Pas de token → pas de claims (pour endpoints publics)
			if tokenString == "" {
				next.ServeHTTP(w, r)
				return
			}

			// Vérifier le token
			claims, err := signer.VerifyAccessToken(tokenString)
			if err != nil {
				next.ServeHTTP(w, r) // Token invalide → pas de claims (RequireAuth bloquera)
				return
			}

			// Construire les SessionClaims
			sessionClaims := db.SessionClaims{
				UserID:          claims.Subject,
				Role:            claims.Role,
				EtablissementID: claims.EtablissementID,
				FiliereID:       claims.FiliereID,
			}

			ctx := db.WithClaimsContext(r.Context(), sessionClaims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAuth bloque la requête si aucun claim n'est présent.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := ClaimsFromContext(r.Context())
		if !ok || claims.UserID == "" {
			writeJSONError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireRole bloque la requête si le rôle n'est pas dans la liste.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := ClaimsFromContext(r.Context())
			if !ok {
				writeJSONError(w, http.StatusUnauthorized, "authentication required")
				return
			}
			for _, role := range roles {
				if claims.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}
			writeJSONError(w, http.StatusForbidden, "insufficient permissions")
		})
	}
}

// writeJSONError écrit une erreur JSON standardisée.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}

// MapDomainError convertit une erreur domaine en code HTTP approprié.
func MapDomainError(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	switch e := err.(type) {
	case *domain.InvalidCredentialsError:
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"identifiants incorrects"}`))
	case *domain.AccountDisabledError:
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"compte désactivé"}`))
	case *domain.AccountLockedError:
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"compte temporairement verrouillé"}`))
	case *domain.InvalidTokenError:
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"token invalide"}`))
	case *domain.NotFoundError:
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":"` + e.Entity + ` introuvable"}`))
	case *domain.ConflictError:
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"` + e.Message + `"}`))
	case *domain.UnauthorizedError:
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"` + e.Message + `"}`))
	case *domain.ValidationError:
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"` + e.Message + `"}`))
	default:
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"erreur interne"}`))
	}
}
