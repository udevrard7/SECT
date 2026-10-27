// Package http — SECT-NOTIF-STUDENT-1 : self-service du profil courant.
//
// PATCH /api/users/me — mise à jour des champs INNOCUOUS du profil de
// l'utilisateur connecté (tous rôles). Premier champ : le handle Instagram
// (canal DM des notifications pédagogiques — évaluations disponibles,
// nouveaux documents, nouveaux ouvrages).
//
// Pourquoi une route dédiée (et pas PATCH /api/users/{id}) :
//   - PATCH /api/users/{id} est réservé ADMIN/RESPONSABLE/ENSEIGNANT-B2C
//     (gestion des comptes) — un ÉTUDIANT ne peut pas y éditer SON profil ;
//   - le profil self-service doit être resserré aux champs non sensibles
//     (jamais role/actif/password/etablissement) — attack surface minimale ;
//   - la RLS User_update (self : id = current_user_id()) couvre déjà la
//     ligne — le handler n'a qu'à poser les claims et laisser la policy
//     décider (un ADMIN en mode assistance ne peut PAS éditer le profil
//     d'un autre via cette route : WHERE id = claims.UserID).
package http

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"

	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// instagramHandleRe — charset des usernames Instagram (lettres, chiffres,
// point, underscore ; 1-30 chars côté Meta, on borne à 64 par prudence).
var instagramHandleRe = regexp.MustCompile(`^[A-Za-z0-9._]{1,64}$`)

// updateMeInstagram — PATCH /api/users/me
//
// Body : {"instagram": "handle_sans_@"} — normalisé (trim + strip @).
// "" ou null → retire le handle (canal Instagram désactivé pour l'user).
//
// Réponse 200 : {"instagram": "<handle ou null>"}.
func (s *Server) updateMeInstagram(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		Instagram *string `json:"instagram"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	// Normalisation : trim + strip @. Vide → NULL (retrait du handle).
	var instagramValue any // nil = SQL NULL
	handle := ""
	if body.Instagram != nil {
		handle = strings.TrimPrefix(strings.TrimSpace(*body.Instagram), "@")
		if handle != "" {
			if !instagramHandleRe.MatchString(handle) {
				writeJSONError(w, http.StatusBadRequest,
					"handle Instagram invalide (lettres, chiffres, point et underscore uniquement)")
				return
			}
			instagramValue = handle
		}
	}

	// UPDATE self via RLS (policy User_update : id = current_user_id()).
	var stored *string
	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), `
			UPDATE "User" SET "instagram" = $2, "updatedAt" = CURRENT_TIMESTAMP
			WHERE "id" = $1
			RETURNING "instagram"
		`, claims.UserID, instagramValue).Scan(&stored)
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "mise à jour impossible")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"instagram": stored,
		"message":   "Profil mis à jour",
	})
}
