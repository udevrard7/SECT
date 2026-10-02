package http

// notification_helpers.go — SECT-NOTIF-DIFFUSION-1.
//
// Helper partagé de conditions de visibilité RBAC (defense-in-depth — le
// runtime Neon connecte avec BYPASSRLS, les policies ne filtrent rien ;
// on filtre explicitement côté SQL, comme alertesListReal / unified).
//
// Utilisé par :
//   - notificationsUnifiedList (VIEW NotificationUnified)
//   - fetchUnreadCountSSE (compteur SSE)
//   - notificationsMeList (GET /me)
//   - notificationsMeMarkAllRead (POST /me/mark-all-read)
//
// Les conditions référencent les colonnes SANS alias : elles s'appliquent
// aussi bien à la table "NotificationAdmin" qu'à la VIEW "NotificationUnified"
// (mêmes noms de colonnes).

import (
	"fmt"

	appdb "github.com/udevrard7/sect/backend/internal/db"
)

// notifAdminVisibleConds construit les conditions OR de visibilité des rows
// NotificationAdmin pour le user courant :
//
//  1. notification personnelle (destinataireId = user) ;
//  2. diffusion globale (destinataireId NULL + destinataireRole NULL —
//     inclut segment 'ALL') ;
//  3. diffusion par rôle AVEC garde établissement — SECT-NOTIF-DIFFUSION-1 :
//     une diffusion RESPONSABLE stocke destinataireRole + destinataireEtablissementId ;
//     elle ne doit être visible QUE des utilisateurs de cet établissement
//     (avant : le match destinataireRole seul fuyait vers les mêmes rôles
//     des AUTRES établissements — violation multi-tenant) ;
//  4. diffusions par segment d'abonnement (B2B/B2C/ETABLISSEMENT) —
//     mêmes EXISTS que la liste unifiée d'origine (SECT-NOTIF-SEGMENT-1).
//
// Les conditions sur les alertes (filiereId/epreuveId du RESPONSABLE /
// ENSEIGNANT, alertes système ADMIN) restent construites par les appelants
// qui lisent la VIEW unifiée (elles ne s'appliquent pas à NotificationAdmin).
func notifAdminVisibleConds(claims appdb.SessionClaims) (conds []string, args []any) {
	argIdx := func() int { return len(args) + 1 }

	// 1. Notifications personnelles.
	conds = append(conds, fmt.Sprintf(`"destinataireId" = $%d`, argIdx()))
	args = append(args, claims.UserID)

	// 2. Diffusion globale (destinataireId + destinataireRole NULL).
	conds = append(conds, `("destinataireId" IS NULL AND "destinataireRole" IS NULL)`)

	// 3. Diffusion par rôle — avec garde établissement (isolation tenant).
	//
	// Un ADMIN SaaS sans établissement (claims.EtablissementID == "") voit les
	// diffusions par rôle globales (destinataireEtablissementId NULL). Un
	// utilisateur rattaché à un établissement (RESPONSABLE / ENSEIGNANT /
	// ETUDIANT / ADMIN assistance) ne voit une diffusion par rôle QUE si elle
	// est globale OU scopée à SON établissement.
	if claims.EtablissementID != "" {
		conds = append(conds, fmt.Sprintf(`("destinataireRole" = $%d AND ("destinataireEtablissementId" IS NULL OR "destinataireEtablissementId" = $%d))`, argIdx(), argIdx()+1))
		args = append(args, claims.Role, claims.EtablissementID)
	} else {
		conds = append(conds, fmt.Sprintf(`("destinataireRole" = $%d AND "destinataireEtablissementId" IS NULL)`, argIdx()))
		args = append(args, claims.Role)
	}

	// 4. Diffusions par segment d'abonnement (copie exacte des EXISTS de
	// SECT-NOTIF-SEGMENT-1 — un seul $n pour claims.UserID).
	uid := argIdx()
	segmentConds := []string{
		// B2B_RESPONSABLES : user RESPONSABLE d'un étab non-PERSONNEL.
		fmt.Sprintf(`("destinataireSegment" = 'B2B_RESPONSABLES' AND EXISTS (
			SELECT 1 FROM "User" u2
			JOIN "Etablissement" e2 ON u2."etablissementId" = e2."id"
			WHERE u2."id" = $%d AND u2."role" = 'RESPONSABLE'
			  AND e2."type" IS DISTINCT FROM 'PERSONNEL'))`, uid),
		// B2C_SOLO : ENSEIGNANT d'un étab PERSONNEL avec plan GRATUIT.
		fmt.Sprintf(`("destinataireSegment" = 'B2C_SOLO' AND EXISTS (
			SELECT 1 FROM "User" u3
			JOIN "Etablissement" e3 ON u3."etablissementId" = e3."id"
			JOIN "Abonnement" a3 ON a3."etablissementId" = e3."id"
			JOIN "Plan" p3 ON a3."planId" = p3."id"
			WHERE u3."id" = $%d AND u3."role" = 'ENSEIGNANT'
			  AND e3."type" = 'PERSONNEL' AND p3."type" = 'GRATUIT'
			  AND a3."statut" IN ('ACTIF', 'ESSAI')))`, uid),
		// B2C_PREMIUM : ENSEIGNANT d'un étab PERSONNEL avec plan PROFESSIONNEL.
		fmt.Sprintf(`("destinataireSegment" = 'B2C_PREMIUM' AND EXISTS (
			SELECT 1 FROM "User" u4
			JOIN "Etablissement" e4 ON u4."etablissementId" = e4."id"
			JOIN "Abonnement" a4 ON a4."etablissementId" = e4."id"
			JOIN "Plan" p4 ON a4."planId" = p4."id"
			WHERE u4."id" = $%d AND u4."role" = 'ENSEIGNANT'
			  AND e4."type" = 'PERSONNEL' AND p4."type" = 'PROFESSIONNEL'
			  AND a4."statut" IN ('ACTIF', 'ESSAI')))`, uid),
		// B2C_ALL : ENSEIGNANT d'un étab PERSONNEL.
		fmt.Sprintf(`("destinataireSegment" = 'B2C_ALL' AND EXISTS (
			SELECT 1 FROM "User" u5
			JOIN "Etablissement" e5 ON u5."etablissementId" = e5."id"
			WHERE u5."id" = $%d AND u5."role" = 'ENSEIGNANT'
			  AND e5."type" = 'PERSONNEL'))`, uid),
		// ETABLISSEMENT : user appartenant à l'établissement ciblé.
		fmt.Sprintf(`("destinataireSegment" = 'ETABLISSEMENT' AND EXISTS (
			SELECT 1 FROM "User" u6
			WHERE u6."id" = $%d AND u6."etablissementId" = "destinataireEtablissementId"))`, uid),
	}
	conds = append(conds, "("+joinStringsHelper(segmentConds, " OR ")+")")
	args = append(args, claims.UserID)

	return conds, args
}

// notifNotExpiredCond est la condition d'expiration commune (SECT-NOTIF-DIFFUSION-1,
// bug #9 : expireLe n'était JAMAIS filtré à la lecture — les diffusions
// expirées s'accumulaient indéfiniment dans les cloches).
const notifNotExpiredCond = `("expireLe" IS NULL OR "expireLe" > NOW())`

// joinStringsHelper joint des fragments SQL.
func joinStringsHelper(ss []string, sep string) string {
	if len(ss) == 0 {
		return ""
	}
	result := ss[0]
	for _, s := range ss[1:] {
		result += sep + s
	}
	return result
}
