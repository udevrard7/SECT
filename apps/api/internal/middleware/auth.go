// Package middleware contient les middlewares HTTP du backend SECT.
package middleware

import (
        "context"
        "net/http"
        "strings"

        "github.com/udevrard7/sect/apps/api/internal/db"
)

// ClaimsFromContext est un alias vers db.ClaimsFromContext pour
// éviter aux handlers d'importer le package db directement.
func ClaimsFromContext(ctx context.Context) (db.SessionClaims, bool) {
        return db.ClaimsFromContext(ctx)
}

// Auth middleware : extrait le JWT du header Authorization, le valide,
// et pose les claims dans le context pour les handlers et repositories.
//
// En l'état actuel (transition progressive), le backend Go reçoit le JWT
// émis par NextAuth côté Next.js. La validation est simplifiée — on décode
// le payload pour récupérer userId, role, etablissementId.
//
// TODO: migrer vers une émission JWT native Go une fois l'auth basculée.
func Auth(jwtSecret string) func(http.Handler) http.Handler {
        return func(next http.Handler) http.Handler {
                return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                        authHeader := r.Header.Get("Authorization")
                        if authHeader == "" {
                                // Pas de token → claims vides (pour endpoints publics)
                                next.ServeHTTP(w, r)
                                return
                        }

                        // Extraire le Bearer token
                        parts := strings.SplitN(authHeader, " ", 2)
                        if len(parts) != 2 || parts[0] != "Bearer" {
                                http.Error(w, `{"error":"invalid authorization header"}`, http.StatusUnauthorized)
                                return
                        }

                        claims, err := parseJWT(parts[1], jwtSecret)
                        if err != nil {
                                http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
                                return
                        }

                        // Poser les claims dans le context (pour les repositories)
                        ctx := db.WithClaimsContext(r.Context(), claims)
                        next.ServeHTTP(w, r.WithContext(ctx))
                })
        }
}

// RequireAuth bloque la requête si aucun claim n'est présent.
// À utiliser après le middleware Auth pour les endpoints protégés.
func RequireAuth(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                claims, ok := ClaimsFromContext(r.Context())
                if !ok || claims.UserID == "" {
                        http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
                        return
                }
                next.ServeHTTP(w, r)
        })
}

// RequireRole bloque la requête si le rôle de l'utilisateur n'est pas dans la liste.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
        return func(next http.Handler) http.Handler {
                return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                        claims, ok := ClaimsFromContext(r.Context())
                        if !ok {
                                http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
                                return
                        }
                        for _, role := range roles {
                                if claims.Role == role {
                                        next.ServeHTTP(w, r)
                                        return
                                }
                        }
                        http.Error(w, `{"error":"insufficient permissions"}`, http.StatusForbidden)
                })
        }
}
