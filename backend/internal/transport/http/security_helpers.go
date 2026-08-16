// Package http — helpers de sécurité pour la résolution des IDs utilisateur.
package http

import (
        "net/http"

        "github.com/udevrard7/sect/backend/internal/middleware"
)

// resolveScopedUserID résout l'ID utilisateur cible pour les endpoints qui
// acceptent un query param ?enseignantId= ou ?etudiantId=.
//
// SECURITY-FIX (audit 2025, tâche 4) : anti-spoofing.
//
// Avant : un ETUDIANT malveillant pouvait forger ?etudiantId=USER_B dans l'URL
// pour lire les données d'un autre étudiant (sessions, résultats, certificats).
// Le backend utilisait aveuglément le query param sans vérifier le rôle.
//
// Après :
//   - ETUDIANT / ENSEIGNANT → toujours claims.UserID (le query param est ignoré).
//     Un étudiant ne voit que SES données ; un enseignant ne voit que SES données.
//   - RESPONSABLE / ADMIN → le query param est accepté (ils peuvent consulter
//     les données des utilisateurs de leur établissement). RLS filtre de toute
//     façon les lignes visibles selon l'établissement du claims.
//
// Usage :
//   enseignantID := resolveScopedUserID(r, r.URL.Query().Get("enseignantId"))
//   // → si l'utilisateur est ENSEIGNANT, retourne claims.UserID (ignore le param)
//   // → si l'utilisateur est ADMIN/RESPONSABLE, retourne le param (ou "" si vide)
func resolveScopedUserID(r *http.Request, queryParamValue string) string {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                return "" // pas authentifié → chaîne vide (RequireAuth bloquera avant)
        }
        // UX-FIX : résoudre l'alias "me" → claims.UserID pour tous les rôles.
        // Avant, passer ?enseignantId=me retournait "me" (pas un UUID valide)
        // pour ADMIN/RESPONSABLE → context vide. Maintenant "me" = l'user courant.
        if queryParamValue == "me" {
                return claims.UserID
        }
        switch claims.Role {
        case "ETUDIANT", "ENSEIGNANT":
                // Sécurité : ces rôles ne peuvent cibler que leur propre ID.
                return claims.UserID
        default:
                // ADMIN, RESPONSABLE : accepter le query param (RLS filtre par établissement).
                return queryParamValue
        }
}
