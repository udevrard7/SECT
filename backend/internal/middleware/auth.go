// Package middleware — middlewares HTTP du backend SECT.
package middleware

import (
        "context"
        "encoding/json"
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
                                MustChangePwd:   claims.MustChangePwd, // U3
                                Email:           claims.Email,
                                Name:            claims.Name,
                        }

                        ctx := db.WithClaimsContext(r.Context(), sessionClaims)
                        next.ServeHTTP(w, r.WithContext(ctx))
                })
        }
}

// RequireAuth bloque la requête si aucun claim n'est présent.
//
// U3 (CRITICAL) : si MustChangePwd == true, bloque tous les endpoints SAUF
// /api/auth/change-password (pour permettre le changement) et /api/auth/logout
// (pour permettre la déconnexion) et /api/me (pour que le frontend récupère le
// flag et affiche force-change-password). Avant ce fix, un user avec password
// temporaire pouvait utiliser l'API indéfiniment.
func RequireAuth(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                claims, ok := ClaimsFromContext(r.Context())
                if !ok || claims.UserID == "" {
                        writeJSONError(w, http.StatusUnauthorized, "authentication required")
                        return
                }
                // U3 : enforcer le changement de password obligatoire.
                if claims.MustChangePwd {
                        path := r.URL.Path
                        if path != "/api/auth/change-password" &&
                                path != "/api/auth/logout" &&
                                path != "/api/me" {
                                writeJSONError(w, http.StatusForbidden, "vous devez changer votre mot de passe")
                                return
                        }
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
// B-17 (LOW) : délègue à writeJSONErrorMsg (json.NewEncoder au lieu de
// concaténation manuelle) pour éviter les JSON invalides si msg contient des
// guillemets ou backslashes.
func writeJSONError(w http.ResponseWriter, status int, msg string) {
        writeJSONErrorMsg(w, status, msg)
}

// MapDomainError convertit une erreur domaine en code HTTP approprié.
// B-17 (LOW) : utilise json.NewEncoder pour échapper proprement les messages
// (avant : concaténation manuelle → JSON invalide si msg contient des guillemets).
func MapDomainError(w http.ResponseWriter, err error) {
        switch e := err.(type) {
        case *domain.InvalidCredentialsError:
                writeJSONErrorMsg(w, http.StatusUnauthorized, "identifiants incorrects")
        case *domain.AccountDisabledError:
                writeJSONErrorMsg(w, http.StatusForbidden, "compte désactivé")
        case *domain.AccountLockedError:
                writeJSONErrorMsg(w, http.StatusTooManyRequests, "compte temporairement verrouillé")
        case *domain.InvalidTokenError:
                // Message distinct selon la reason pour permettre au frontend d'afficher
                // un message clair (déjà utilisé vs expiré vs non trouvé). Sécurité : on
                // ne révèle pas si le token existe — "not found" et "already used"
                // renvoient le même message "déjà utilisé ou invalide" (anti-énumération).
                msg := "token invalide, expiré ou déjà utilisé"
                switch e.Reason {
                case "expired":
                        msg = "le lien a expiré (validité 30 minutes). Demandez un nouveau lien."
                case "empty token":
                        msg = "jeton manquant dans la requête"
                case "not found or already used":
                        msg = "ce lien a déjà été utilisé ou n'est plus valide. Demandez un nouveau lien."
                }
                writeJSONErrorMsg(w, http.StatusUnauthorized, msg)
        case *domain.NotFoundError:
                writeJSONErrorMsg(w, http.StatusNotFound, e.Entity+" introuvable")
        case *domain.ConflictError:
                writeJSONErrorMsg(w, http.StatusConflict, e.Message)
        case *domain.UnauthorizedError:
                writeJSONErrorMsg(w, http.StatusForbidden, e.Message)
        case *domain.ValidationError:
                writeJSONErrorMsg(w, http.StatusBadRequest, e.Message)
        default:
                writeJSONErrorMsg(w, http.StatusInternalServerError, "erreur interne")
        }
}

// writeJSONErrorMsg écrit un objet JSON {"error": msg} avec le status HTTP donné.
// Helper partagé par writeJSONError et MapDomainError (B-17).
func writeJSONErrorMsg(w http.ResponseWriter, status int, msg string) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(status)
        _ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// BlockAdmin bloque l'accès aux endpoints marqués "pas pour ADMIN".
// Utilisé pour /api/messagerie/* : le propriétaire PaaS (ADMIN) n'a pas accès
// à la messagerie (il n'a pas d'établissement rattaché et la messagerie est
// réservée aux contextes académiques : étudiant, enseignant, responsable).
// Retourne 403 avec un message explicite si claims.Role == "ADMIN".
func BlockAdmin(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                claims, ok := ClaimsFromContext(r.Context())
                if ok && claims.Role == "ADMIN" {
                        writeJSONErrorMsg(w, http.StatusForbidden, "le compte ADMIN (propriétaire PaaS) n'a pas accès à la messagerie")
                        return
                }
                next.ServeHTTP(w, r)
        })
}
