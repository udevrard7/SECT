package middleware

// b2c_middleware.go — Middleware pour le self-service B2C.
//
// SECT-B2C-SELF-SERVICE : un prof B2C (ENSEIGNANT dans un étab PERSONNEL) doit
// pouvoir créer des filières, UE, étudiants dans SON espace — comme un RESPONSABLE.
// Ce middleware autorise l'accès si :
//   1. L'utilisateur a un des rôles spécifiés (ex: ADMIN, RESPONSABLE), OU
//   2. L'utilisateur est ENSEIGNANT ET son établissement est de type PERSONNEL
//
// Le check du type d'étab nécessite une query DB (le type n'est pas dans les
// claims JWT). C'est pourquoi ce middleware prend un *pgxpool.Pool en paramètre.

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// EtabTypeChecker est une interface pour vérifier le type d'établissement.
// Permet de mock en tests. En prod, c'est *pgxpool.Pool via une closure.
type EtabTypeChecker interface {
	IsPersonalEtab(ctx context.Context, etablissementID string) (bool, error)
}

// etabTypeCheckerImpl implémente EtabTypeChecker avec pgxpool.
type etabTypeCheckerImpl struct {
	pool *pgxpool.Pool
}

func (c *etabTypeCheckerImpl) IsPersonalEtab(ctx context.Context, etablissementID string) (bool, error) {
	if etablissementID == "" {
		return false, nil
	}
	var etabType string
	err := c.pool.QueryRow(ctx,
		`SELECT "type" FROM "Etablissement" WHERE "id" = $1`,
		etablissementID,
	).Scan(&etabType)
	if err != nil {
		return false, err
	}
	return etabType == "PERSONNEL", nil
}

// RequireRoleOrPersonalEtab autorise l'accès si l'utilisateur a un des rôles
// spécifiés, OU si c'est un ENSEIGNANT dans un étab PERSONNEL (B2C self-service).
//
// Usage : RequireRoleOrPersonalEtab(pool, "ADMIN", "RESPONSABLE")
// → autorise ADMIN, RESPONSABLE, et ENSEIGNANT dans étab PERSONNEL.
//
// Le check DB n'a lieu QUE si l'utilisateur n'a pas un des rôles spécifiés
// (optimisation : pour ADMIN/RESPONSABLE, pas de query DB).
func RequireRoleOrPersonalEtab(pool *pgxpool.Pool, roles ...string) func(http.Handler) http.Handler {
	checker := &etabTypeCheckerImpl{pool: pool}
	return requireRoleOrPersonalEtabWithChecker(checker, roles...)
}

func requireRoleOrPersonalEtabWithChecker(checker EtabTypeChecker, roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := ClaimsFromContext(r.Context())
			if !ok || claims.UserID == "" {
				writeJSONError(w, http.StatusUnauthorized, "authentication required")
				return
			}

			// 1. Check si l'utilisateur a un des rôles spécifiés
			for _, role := range roles {
				if claims.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}

			// 2. Si pas de rôle requis → autorisé (RequireAuth seul)
			//    (cas théorique, en pratique on toujours passe des rôles)

			// 3. Check si ENSEIGNANT dans étab PERSONNEL (B2C self-service)
			if claims.Role == "ENSEIGNANT" && claims.EtablissementID != "" {
				ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
				defer cancel()

				isPersonal, err := checker.IsPersonalEtab(ctx, claims.EtablissementID)
				if err != nil {
					// Erreur DB : ne pas bloquer par défaut (log + 403 pour sécurité)
					writeJSONError(w, http.StatusForbidden, "unable to verify establishment type")
					return
				}
				if isPersonal {
					next.ServeHTTP(w, r)
					return
				}
			}

			writeJSONError(w, http.StatusForbidden, "insufficient permissions")
		})
	}
}
