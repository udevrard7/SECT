// Package middleware — middlewares HTTP du backend SECT.
package middleware

import (
        "context"
        "net/http"
        "strings"

        "github.com/udevrard7/sect/apps/api/internal/db"
        "github.com/udevrard7/sect/apps/api/internal/domain"
        "github.com/udevrard7/sect/apps/api/internal/jwt"
)

// ClaimsFromContext récupère les claims de session depuis le context.
// Délègue à db.ClaimsFromContext pour utiliser la même clé de context
// que db.WithClaimsContext (utilisée par le middleware Auth).
func ClaimsFromContext(ctx context.Context) (db.SessionClaims, bool) {
        return db.ClaimsFromContext(ctx)
}

// Auth middleware : extrait le JWT du header Authorization, vérifie la signature
// HMAC-SHA256, et pose les claims dans le context.
//
// La vérification de signature est faite avec le signer partagé (secret JWT_SECRET).
// Pour la sécurité, on ne fait PAS de DB re-check ici (c'est au handler de décider,
// via RequireAuthWithDBCheck si besoin).
func Auth(signer *jwt.Signer) func(http.Handler) http.Handler {
        return func(next http.Handler) http.Handler {
                return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                        authHeader := r.Header.Get("Authorization")
                        if authHeader == "" {
                                next.ServeHTTP(w, r)
                                return
                        }

                        parts := strings.SplitN(authHeader, " ", 2)
                        if len(parts) != 2 || parts[0] != "Bearer" {
                                writeJSONError(w, http.StatusUnauthorized, "invalid authorization header")
                                return
                        }

                        claims, err := signer.VerifyAccessToken(parts[1])
                        if err != nil {
                                writeJSONError(w, http.StatusUnauthorized, "invalid or expired token")
                                return
                        }

                        // Construire les SessionClaims depuis les claims JWT
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
        // Ignore error — best-effort
        _, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}

// MapDomainError convertit une erreur domaine en code HTTP approprié.
func MapDomainError(w http.ResponseWriter, err error) {
        w.Header().Set("Content-Type", "application/json")
        switch err.(type) {
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
                _, _ = w.Write([]byte(`{"error":"ressource introuvable"}`))
        default:
                w.WriteHeader(http.StatusInternalServerError)
                _, _ = w.Write([]byte(`{"error":"erreur interne"}`))
        }
}
