package http

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
)

// annee_scope.go — SECT-ANNEE-ARCHIVAGE-2 (complément de SECT-ANNEE-HISTOIRE-2)
//
// SECT-ANNEE-HISTOIRE-2 (000112) a livré le scoping par défaut des épreuves,
// des stats et des affectations. Ce complément couvre les lectures restées
// non scopées — les « notes de l'année passée » côté ÉTUDIANT et l'overview
// résultats côté ENSEIGNANT :
//   - /api/validations-ue (un étudiant voyait ses notes de L2 / validations
//     2025-2026 comme données actives après l'activation de 2026-2027) ;
//   - /api/resultats Branch A (sessions + résultats d'un étudiant) ;
//   - /api/resultats/etudiant-overview ;
//   - /api/resultats/overview (analytics enseignant).
//
// Philosophie identique à /api/affectations (post-000110) et /api/epreuves
// (SECT-ANNEE-HISTOIRE-2) :
//   - défaut (param absent)      → année courante de l'établissement ;
//   - ?anneeAcademiqueId=<id>    → l'année demandée (historique consultable) ;
//   - ?anneeAcademiqueId=all     → TOUTES les années (vue historique) ;
//   - aucune année active / erreur de résolution → pas de scoping
//     (dégradation gracieuse, on ne cache jamais sur un échec).

// ANNEE_ALL_SENTINEL — valeur du query param anneeAcademiqueId demandant
// explicitement TOUTES les années (même convention minuscule que
// /api/epreuves et /api/affectations dans SECT-ANNEE-HISTOIRE-2).
const ANNEE_ALL_SENTINEL = "all"

// resolveAnneeScopeID résout le paramètre anneeAcademiqueId d'une requête :
//   - ""   → ID de l'année ACTIVE (= courante, post-000110) de l'établissement
//     des claims (ou du fallback ADMIN), "" si rien à scoper ;
//   - "all" → "" (TOUTES les années, explicite) ;
//   - autre → la valeur telle quelle (ID explicite, filtrage exact).
func (s *Server) resolveAnneeScopeID(ctx context.Context, claims appdb.SessionClaims, anneeParam, etabIDFallback string) string {
	switch anneeParam {
	case ANNEE_ALL_SENTINEL:
		return "" // vue historique explicite : aucune restriction
	case "":
		return s.resolveCurrentAnneeID(ctx, claims, etabIDFallback)
	default:
		return anneeParam
	}
}

// resolveCurrentAnneeID retourne l'ID de l'année académique ACTIVE (= courante,
// post-000110) de l'établissement des claims — ou du fallback (ADMIN avec
// paramètre explicite). Retourne "" quand il n'y a rien à scoper (pas d'étab,
// pas d'année active, erreur RLS/connexion) → l'appelant ne scope pas.
func (s *Server) resolveCurrentAnneeID(ctx context.Context, claims appdb.SessionClaims, etabIDFallback string) string {
	etabID := claims.EtablissementID
	if etabID == "" {
		etabID = etabIDFallback
	}
	if etabID == "" {
		return ""
	}

	var anneeID string
	err := appdb.WithTx(ctx, s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
                        SELECT "id" FROM "AnneeAcademique"
                        WHERE "etablissementId" = $1 AND "actif" = true
                        ORDER BY "dateDebut" DESC LIMIT 1
                `, etabID).Scan(&anneeID)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "" // aucune année active → pas de scoping
		}
		slog.Warn("annee_scope: résolution de l'année courante échouée (pas de scoping par défaut)",
			"etablissementId", etabID, "error", err)
		return ""
	}
	return anneeID
}

// resolveAnneeFiltreParams — SECT-ANNEE-DETTES-3 : résout le couple
// (FK anneeAcademiqueId, libellé miroir) d'un filtre d'année de LECTURE,
// à appeler DANS la transaction courante (SELECT sur AnneeAcademique sous
// RLS). Même contrat que le filtre inline de listAffectations
// (SECT-ANNEE-HISTOIRE-2), factorisé pour /api/devoirs (liste + stats) :
//   - "all" (sur l'un des 2 params) → ("", "") : TOUTES les années ;
//   - anneeAcademiqueId=<id> explicite → (id, libellé) — le libellé sert
//     de fallback pour les lignes legacy FK NULL ;
//   - anneeUniversitaire=<libellé> legacy → (FK résolue dans l'étab, libellé) ;
//   - absent → année COURANTE de l'établissement de scope ("" si aucune
//     année active → pas de filtre, comportement historique).
//
// NB : la méthode est sur Server par symétrie avec resolveAnneeScopeID mais
// n'utilise pas le pool (tx passée par l'appelant).
func (s *Server) resolveAnneeFiltreParams(ctx context.Context, tx pgx.Tx, scopeEtab, anneeIDParam, anneeLabelParam string) (string, string) {
	switch {
	case anneeIDParam == ANNEE_ALL_SENTINEL || anneeLabelParam == ANNEE_ALL_SENTINEL:
		return "", ""
	case anneeIDParam != "":
		var lib *string
		if errS := tx.QueryRow(ctx, `
                        SELECT "libelle" FROM "AnneeAcademique" WHERE "id" = $1`,
			anneeIDParam).Scan(&lib); errS == nil && lib != nil {
			return anneeIDParam, *lib
		}
		return anneeIDParam, ""
	case anneeLabelParam != "":
		if scopeEtab != "" {
			var id *string
			_ = tx.QueryRow(ctx, `
                                SELECT "id" FROM "AnneeAcademique"
                                WHERE "etablissementId" = $1 AND "libelle" = $2`,
				scopeEtab, anneeLabelParam).Scan(&id)
			if id != nil {
				return *id, anneeLabelParam
			}
		}
		return "", anneeLabelParam
	default:
		if scopeEtab != "" {
			var id, lib *string
			if errS := tx.QueryRow(ctx, `
                                SELECT "id", "libelle" FROM "AnneeAcademique"
                                WHERE "etablissementId" = $1 AND "actif" = true
                                ORDER BY "dateDebut" DESC LIMIT 1`,
				scopeEtab).Scan(&id, &lib); errS == nil && id != nil && lib != nil {
				return *id, *lib
			}
		}
		return "", ""
	}
}

// appendAnneeFiltrePredicate — SECT-ANNEE-DETTES-3 : construit le prédicat
// OR-groupé (alias."anneeAcademiqueId" = $n OR alias."anneeUniversitaire" =
// $n+1) et pousse les args — un seul prédicat pour rester composable avec
// les autres filtres WHERE. Retourne le fragment SQL ("" si rien à scoper)
// et incrémente argIdx côté appelant via le pointeur.
func appendAnneeFiltrePredicate(where *[]string, args *[]any, argIdx *int, alias, anneeFiltreID, anneeFiltreLibelle string) string {
	if anneeFiltreID == "" && anneeFiltreLibelle == "" {
		return ""
	}
	var parts []string
	if anneeFiltreID != "" {
		parts = append(parts, fmt.Sprintf(`%s."anneeAcademiqueId" = $%d`, alias, *argIdx))
		*args = append(*args, anneeFiltreID)
		(*argIdx)++
	}
	if anneeFiltreLibelle != "" {
		parts = append(parts, fmt.Sprintf(`%s."anneeUniversitaire" = $%d`, alias, *argIdx))
		*args = append(*args, anneeFiltreLibelle)
		(*argIdx)++
	}
	pred := "(" + strings.Join(parts, " OR ") + ")"
	*where = append(*where, pred)
	return pred
}
