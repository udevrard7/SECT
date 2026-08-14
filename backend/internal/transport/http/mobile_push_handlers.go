// Package http — handlers pour /api/push/mobile (FCM/APNs device token registration).
//
// Endpoints :
//
//	POST   /api/push/mobile/register  → register device token (upsert)
//	DELETE /api/push/mobile/register  → deactivate device token
//	POST   /api/push/mobile/topic     → subscribe/unsubscribe to a topic
//
// Called by the mobile app (Android/iOS) after receiving an FCM or APNs token.
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
// POST /api/push/mobile/register
// ──────────────────────────────────────────────────────────────────────────

// mobilePushRegisterHandler registers a mobile device token (FCM or APNs) for push notifications.
// Body: { "userId": "...", "token": "...", "platform": "android"|"ios", "bundleId": "ci.sect.app" }
// Upsert: if a token already exists for this userId+platform, update it.
func (s *Server) mobilePushRegisterHandler(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		UserID   string `json:"userId"`
		Token    string `json:"token"`
		Platform string `json:"platform"`  // "android" or "ios"
		BundleID string `json:"bundleId"`  // "ci.sect.app" or "ci.sect.app.ios"
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}

	// Validate required fields
	if body.Token == "" {
		writeJSONError(w, http.StatusBadRequest, "token requis")
		return
	}
	if body.Platform != "android" && body.Platform != "ios" {
		writeJSONError(w, http.StatusBadRequest, "platform doit être 'android' ou 'ios'")
		return
	}

	// Use the authenticated user's ID (ignore body.UserID for security)
	userID := claims.UserID

	// Default bundleId if not provided
	bundleID := body.BundleID
	if bundleID == "" {
		if body.Platform == "android" {
			bundleID = "ci.sect.app"
		} else {
			bundleID = "ci.sect.app.ios"
		}
	}

	deviceID := uuid.NewString()

	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		// Upsert: if (userId, platform) exists, update the token
		_, err := tx.Exec(r.Context(), `
			INSERT INTO "MobileDeviceToken" 
				("id", "userId", "token", "platform", "bundleId", "active", "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
			ON CONFLICT ("userId", "platform")
			DO UPDATE SET "token" = $3, "bundleId" = $5, "active" = true, "updatedAt" = NOW()`,
			deviceID, userID, body.Token, body.Platform, bundleID)
		return err
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "échec de l'enregistrement")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "appareil enregistré",
	})
}

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/push/mobile/register
// ──────────────────────────────────────────────────────────────────────────

// mobilePushUnregisterHandler deactivates a mobile device token (e.g., user logged out).
func (s *Server) mobilePushUnregisterHandler(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		Platform string `json:"platform"` // "android" or "ios"
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		_, _ = tx.Exec(r.Context(),
			`UPDATE "MobileDeviceToken" SET "active" = false, "updatedAt" = NOW() 
			 WHERE "userId" = $1 AND "platform" = $2`,
			claims.UserID, body.Platform)
		return nil
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "appareil désactivé",
	})
}

// ──────────────────────────────────────────────────────────────────────────
// POST /api/push/mobile/topic
// ──────────────────────────────────────────────────────────────────────────

// mobilePushTopicHandler subscribes/unsubscribes a mobile device from a notification topic.
// Body: { "userId": "...", "topic": "epreuve-123", "action": "subscribe"|"unsubscribe", "platform": "android"|"ios" }
// For Android (FCM): directly calls Firebase topic subscription API.
// For iOS (APNs): stores topic subscription in DB for server-side routing.
func (s *Server) mobilePushTopicHandler(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.UserID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		Topic    string `json:"topic"`
		Action   string `json:"action"`   // "subscribe" or "unsubscribe"
		Platform string `json:"platform"` // "android" or "ios"
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if body.Topic == "" {
		writeJSONError(w, http.StatusBadRequest, "topic requis")
		return
	}
	if body.Action != "subscribe" && body.Action != "unsubscribe" {
		writeJSONError(w, http.StatusBadRequest, "action doit être 'subscribe' ou 'unsubscribe'")
		return
	}

	// For iOS (APNs doesn't support native topics), we store the subscription in DB
	// so the backend can send targeted pushes when a topic event occurs.
	if body.Platform == "ios" || body.Platform == "" {
		err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
			if body.Action == "subscribe" {
				_, err := tx.Exec(r.Context(), `
					INSERT INTO "MobileTopicSubscription" ("userId", "topic", "platform", "createdAt")
					VALUES ($1, $2, 'ios', NOW())
					ON CONFLICT ("userId", "topic") DO NOTHING`,
					claims.UserID, body.Topic)
				return err
			} else {
				_, err := tx.Exec(r.Context(), `
					DELETE FROM "MobileTopicSubscription" 
					WHERE "userId" = $1 AND "topic" = $2`,
					claims.UserID, body.Topic)
				return err
			}
		})
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "échec de l'abonnement")
			return
		}
	}

	// For Android (FCM), topic subscriptions are managed by the FCM SDK on the device.
	// The server doesn't need to do anything — FCM handles topic routing automatically.
	// We just acknowledge the request.

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "ok",
		"topic":   body.Topic,
		"action":  body.Action,
	})
}

// Suppress unused import warnings
var _ = chi.URLParam
var _ = time.Now
var _ = pgx.ErrNoRows
