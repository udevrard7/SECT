// Package http — handlers pour /api/push (web push VAPID).
//
// SECT-NOTIF-VAPID-1 : endpoints pour l'abonnement push PWA.
//
//	GET  /api/push/vapid-public-key → {publicKey: "..."} (clé publique VAPID)
//	POST /api/push/subscribe        → sauvegarde PushSubscription en DB
//
// Le frontend push-notification-manager.tsx consomme ces endpoints pour
// s'abonner aux notifications push via le Service Worker + PushManager.
package http

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// GET /api/push/vapid-public-key
// ──────────────────────────────────────────────────────────────────────────

// vapidPublicKeyHandler retourne la clé publique VAPID au frontend.
// Le frontend l'utilise pour s'abonner via PushManager.subscribe().
// Si VAPID n'est pas configuré (clé vide), retourne 503.
func (s *Server) vapidPublicKeyHandler(w http.ResponseWriter, r *http.Request) {
	if s.vapidPublicKey == "" {
		writeJSONError(w, http.StatusServiceUnavailable, "VAPID non configuré")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"publicKey": s.vapidPublicKey,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// POST /api/push/subscribe
// ──────────────────────────────────────────────────────────────────────────

// pushSubscribeHandler sauvegarde une PushSubscription en DB.
// Body: {endpoint: "...", keys: {p256dh: "...", auth: "..."}}
// Upsert : si une subscription existe déjà pour cet user+endpoint, on update.
func (s *Server) pushSubscribeHandler(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if body.Endpoint == "" || body.Keys.P256dh == "" || body.Keys.Auth == "" {
		writeJSONError(w, http.StatusBadRequest, "endpoint, p256dh et auth requis")
		return
	}

	userAgent := r.Header.Get("User-Agent")
	subID := uuid.NewString()

	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// Upsert : si (userId, endpoint) existe déjà, on update les clés.
		_, err := tx.Exec(r.Context(), `
			INSERT INTO "PushSubscription" ("id", "userId", "endpoint", "p256dh", "auth", "userAgent", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
			ON CONFLICT ("userId", "endpoint")
			DO UPDATE SET "p256dh" = $4, "auth" = $5, "userAgent" = $6, "updatedAt" = NOW()`,
			subID, claims.UserID, body.Endpoint, body.Keys.P256dh, body.Keys.Auth, userAgent)
		return err
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "échec de l'enregistrement")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "abonnement enregistré",
	})
}

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/push/subscribe (optionnel — désabonnement)
// ──────────────────────────────────────────────────────────────────────────

// pushUnsubscribeHandler supprime la PushSubscription pour l'utilisateur courant.
// Utile quand l'utilisateur désactive les notifications push.
func (s *Server) pushUnsubscribeHandler(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		_, _ = tx.Exec(r.Context(), `DELETE FROM "PushSubscription" WHERE "userId" = $1`, claims.UserID)
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "désabonné",
	})
}

// _ pour éviter "imported and not used" si chi n'est pas directement utilisé
var _ = chi.URLParam
var _ = time.Now
var _ = pgx.ErrNoRows
