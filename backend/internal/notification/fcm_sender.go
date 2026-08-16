// Package notification — FCMSender envoie des push notifications mobile via
// Firebase Cloud Messaging (FCM HTTP v1 API).
//
// C'est le canal 5 du dispatcher (après in-app, SSE, web push VAPID, email).
//
// Setup : positionner FIREBASE_PROJECT_ID et FIREBASE_SERVICE_ACCOUNT_KEY.
// Si l'un est vide, FCM est désactivé (no-op, mode dev).
package notification

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	appdb "github.com/udevrard7/sect/backend/internal/db"
)

// FCMSender sends push notifications to mobile devices via Firebase Cloud Messaging.
//
// It reads MobileDeviceToken records from the DB and calls the FCM HTTP v1 API
// to deliver messages. This is channel 5 of the notification dispatcher.
//
// Setup: Set FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_KEY env vars.
// If either is empty, FCM is disabled (no-op, dev mode).
type FCMSender struct {
	pool       *pgxpool.Pool
	logger     *slog.Logger
	projectID  string
	serviceKey string // JSON service account key

	// Token cache (protected by mu)
	mu          sync.Mutex
	accessToken string // Cached OAuth2 access token
	tokenExpiry int64  // Unix timestamp when token expires
}

// serviceAccountKey represents the relevant fields from a Firebase service account JSON.
type serviceAccountKey struct {
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	TokenURI    string `json:"token_uri"`
}

// oauthTokenResponse represents the response from Google's OAuth2 token endpoint.
type oauthTokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

// MobileDeviceToken represents a registered mobile device for push notifications.
type MobileDeviceToken struct {
	ID        string
	UserID    string
	Token     string // FCM registration token (Android) or APNs device token (iOS)
	Platform  string // "android" or "ios"
	BundleID  string // "ci.sect.app" or "ci.sect.app.ios"
	CreatedAt string
	UpdatedAt string
}

// NewFCMSender creates a new FCM sender. If projectID or serviceKey is empty,
// returns nil (FCM disabled).
func NewFCMSender(pool *pgxpool.Pool, logger *slog.Logger, projectID, serviceKey string) *FCMSender {
	if projectID == "" || serviceKey == "" {
		if logger != nil {
			logger.Info("notification.FCMSender: disabled (FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_KEY not set)")
		}
		return nil
	}
	return &FCMSender{
		pool:       pool,
		logger:     logger,
		projectID:  projectID,
		serviceKey: serviceKey,
	}
}

// SendToUser sends a push notification to all mobile devices for a given user.
// It queries MobileDeviceToken for the user, then sends via FCM HTTP v1 API.
// Non-blocking: errors are logged but don't fail the caller.
func (s *FCMSender) SendToUser(ctx context.Context, userID string, payload map[string]any) {
	if s == nil {
		return // FCM disabled
	}

	// Get device tokens for this user
	tokens, err := s.getDeviceTokens(ctx, userID)
	if err != nil {
		s.logger.Warn("FCMSender.SendToUser: query tokens failed", "userId", userID, "error", err)
		return
	}
	if len(tokens) == 0 {
		return // No mobile devices registered
	}

	// Send to each device
	for _, deviceToken := range tokens {
		s.sendToDevice(ctx, deviceToken, payload)
	}
}

// SendToTopic sends a push notification to all devices subscribed to a topic.
// This uses FCM's built-in topic messaging (topic messages are automatically
// routed to subscribed devices by FCM).
func (s *FCMSender) SendToTopic(ctx context.Context, topic string, payload map[string]any) {
	if s == nil {
		return
	}

	s.logger.Debug("FCMSender.SendToTopic", "topic", topic, "type", payload["type"])

	// Use FCM HTTP v1 API to send to topic
	// POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send
	// Body: { "message": { "topic": "...", "notification": {...}, "data": {...} } }
	s.sendFCMMessage(ctx, "", topic, payload)
}

// getDeviceTokens queries the MobileDeviceToken table for a user's devices.
// Utilise SystemClaims (bypass RLS user) car le FCMSender s'exécute dans le
// contexte du dispatcher de notifications (worker système), pas d'une requête
// utilisateur authentifiée — sans claims, RLS bloquerait 100% des SELECT.
func (s *FCMSender) getDeviceTokens(ctx context.Context, userID string) ([]MobileDeviceToken, error) {
	var tokens []MobileDeviceToken
	err := appdb.WithTx(ctx, s.pool, appdb.SystemClaims(), func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT "id", "userId", "token", "platform", "bundleId", "createdAt", "updatedAt"
			FROM "MobileDeviceToken"
			WHERE "userId" = $1 AND "active" = true
			ORDER BY "updatedAt" DESC`, userID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var t MobileDeviceToken
			if err := rows.Scan(&t.ID, &t.UserID, &t.Token, &t.Platform, &t.BundleID, &t.CreatedAt, &t.UpdatedAt); err != nil {
				continue
			}
			tokens = append(tokens, t)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	return tokens, nil
}

// sendToDevice sends a push notification to a specific device token.
func (s *FCMSender) sendToDevice(ctx context.Context, device MobileDeviceToken, payload map[string]any) {
	s.sendFCMMessage(ctx, device.Token, "", payload)
}

// sendFCMMessage sends a message via the FCM HTTP v1 API.
// If deviceToken is non-empty, sends to a specific device.
// If topic is non-empty, sends to all devices subscribed to the topic.
func (s *FCMSender) sendFCMMessage(ctx context.Context, deviceToken string, topic string, payload map[string]any) {
	// Get OAuth2 access token for the FCM API
	accessToken, err := s.getAccessToken(ctx)
	if err != nil {
		s.logger.Warn("FCMSender: failed to get access token", "error", err)
		return
	}
	if accessToken == "" {
		s.logger.Warn("FCMSender: empty access token, skipping send")
		return
	}

	// Build the FCM message
	title, _ := payload["titre"].(string)
	if title == "" {
		title, _ = payload["title"].(string)
	}
	body, _ := payload["message"].(string)
	if body == "" {
		body, _ = payload["body"].(string)
	}

	message := map[string]any{
		"notification": map[string]string{
			"title": title,
			"body":  body,
		},
		"data": buildFCMData(payload),
		"android": map[string]any{
			"notification": map[string]string{
				"channel_id": "sect_notifications",
				"icon":       "ic_notification",
				"color":      "#10B981",
			},
			"priority": "high",
		},
		"apns": map[string]any{
			"payload": map[string]any{
				"aps": map[string]any{
					"sound":             "default",
					"content-available": 1,
				},
			},
		},
	}

	if deviceToken != "" {
		message["token"] = deviceToken
	} else if topic != "" {
		message["topic"] = topic
	}

	requestBody := map[string]any{
		"message": message,
	}

	bodyJSON, err := json.Marshal(requestBody)
	if err != nil {
		s.logger.Warn("FCMSender: failed to marshal request body", "error", err)
		return
	}

	// Real HTTP POST to FCM HTTP v1 API
	fcmURL := fmt.Sprintf("https://fcm.googleapis.com/v1/projects/%s/messages:send", s.projectID)
	req, err := http.NewRequestWithContext(ctx, "POST", fcmURL, bytes.NewReader(bodyJSON))
	if err != nil {
		s.logger.Warn("FCMSender: failed to create HTTP request", "error", err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.logger.Warn("FCMSender: HTTP request failed", "error", err)
		return
	}
	defer func() { _ = resp.Body.Close() }()

	switch resp.StatusCode {
	case 200:
		s.logger.Debug("FCMSender: message sent successfully",
			"token", truncate(deviceToken, 16),
			"topic", topic,
			"title", title)
	case 404:
		// Invalid device token — mark as inactive in DB
		s.logger.Warn("FCMSender: device token not found (404), marking inactive",
			"token", truncate(deviceToken, 16))
		if deviceToken != "" {
			s.markDeviceInactive(ctx, deviceToken)
		}
	default:
		respBody, _ := io.ReadAll(resp.Body)
		s.logger.Warn("FCMSender: FCM API error",
			"status", resp.StatusCode,
			"body", string(respBody),
			"token", truncate(deviceToken, 16),
			"topic", topic)
	}
}

// getAccessToken retrieves an OAuth2 access token for the FCM API
// using the service account key (JWT grant flow). Caches the token until expiry.
// Thread-safe: protected by sync.Mutex.
func (s *FCMSender) getAccessToken(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Return cached token if still valid (with 60s safety margin)
	now := time.Now().Unix()
	if s.accessToken != "" && now < s.tokenExpiry-60 {
		return s.accessToken, nil
	}

	// Parse the service account key JSON
	var key serviceAccountKey
	if err := json.Unmarshal([]byte(s.serviceKey), &key); err != nil {
		return "", fmt.Errorf("fcm: failed to parse service account key: %w", err)
	}
	if key.ClientEmail == "" || key.PrivateKey == "" {
		return "", fmt.Errorf("fcm: service account key missing client_email or private_key")
	}
	if key.TokenURI == "" {
		key.TokenURI = "https://oauth2.googleapis.com/token"
	}

	// Parse the RSA private key from PEM
	privateKey, err := parseRSAPrivateKey(key.PrivateKey)
	if err != nil {
		return "", fmt.Errorf("fcm: failed to parse private key: %w", err)
	}

	// Build and sign the JWT
	jwt, err := buildAndSignJWT(key.ClientEmail, key.TokenURI, privateKey)
	if err != nil {
		return "", fmt.Errorf("fcm: failed to build JWT: %w", err)
	}

	// Exchange the JWT for an access token
	token, expiresIn, err := exchangeJWTForToken(ctx, key.TokenURI, jwt)
	if err != nil {
		return "", fmt.Errorf("fcm: failed to exchange JWT for token: %w", err)
	}

	// Cache the token
	s.accessToken = token
	s.tokenExpiry = now + int64(expiresIn)

	s.logger.Debug("FCMSender: access token refreshed", "expiresIn", expiresIn)
	return s.accessToken, nil
}

// parseRSAPrivateKey parses a PEM-encoded RSA private key.
func parseRSAPrivateKey(pemKey string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemKey))
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	// Try PKCS8 first (most common for service account keys)
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err == nil {
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("private key is not RSA")
		}
		return rsaKey, nil
	}

	// Fallback to PKCS1
	rsaKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key (tried PKCS8 and PKCS1): %w", err)
	}
	return rsaKey, nil
}

// buildAndSignJWT creates a signed JWT for the OAuth2 JWT grant.
// Header: {"alg": "RS256", "typ": "JWT"}
// Payload: {"iss": email, "sub": email, "aud": tokenURI, "iat": now, "exp": now+3600, "scope": firebase.messaging}
func buildAndSignJWT(clientEmail, tokenURI string, privateKey *rsa.PrivateKey) (string, error) {
	now := time.Now().Unix()

	// Build header
	header := map[string]string{
		"alg": "RS256",
		"typ": "JWT",
	}
	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", err
	}

	// Build payload
	payload := map[string]any{
		"iss":   clientEmail,
		"sub":   clientEmail,
		"aud":   tokenURI,
		"iat":   now,
		"exp":   now + 3600,
		"scope": "https://www.googleapis.com/auth/firebase.messaging",
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	// Base64url encode header and payload
	headerB64 := base64urlEncode(headerJSON)
	payloadB64 := base64urlEncode(payloadJSON)

	// Sign the header.payload
	signingInput := headerB64 + "." + payloadB64
	hashed := sha256.Sum256([]byte(signingInput))

	signature, err := rsa.SignPKCS1v15(nil, privateKey, crypto.SHA256, hashed[:])
	if err != nil {
		return "", fmt.Errorf("failed to sign JWT: %w", err)
	}

	signatureB64 := base64urlEncode(signature)

	return signingInput + "." + signatureB64, nil
}

// exchangeJWTForToken exchanges a signed JWT for an OAuth2 access token.
func exchangeJWTForToken(ctx context.Context, tokenURI, jwt string) (accessToken string, expiresIn int, err error) {
	// POST to token_uri with grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
	data := url.Values{}
	data.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	data.Set("assertion", jwt)

	req, err := http.NewRequestWithContext(ctx, "POST", tokenURI, strings.NewReader(data.Encode()))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", 0, fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp oauthTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", 0, fmt.Errorf("failed to decode token response: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", 0, fmt.Errorf("token response missing access_token")
	}

	expiresIn = tokenResp.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 3600 // default 1 hour
	}

	return tokenResp.AccessToken, expiresIn, nil
}

// markDeviceInactive marks a device token as inactive in the database
// when FCM returns 404 (invalid/unregistered token).
// Utilise SystemClaims (bypass RLS user) — même raison que getDeviceTokens.
func (s *FCMSender) markDeviceInactive(ctx context.Context, deviceToken string) {
	err := appdb.WithTx(ctx, s.pool, appdb.SystemClaims(), func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE "MobileDeviceToken"
			SET "active" = false, "updatedAt" = NOW()
			WHERE "token" = $1`, deviceToken)
		return err
	})
	if err != nil {
		s.logger.Warn("FCMSender: failed to mark device inactive",
			"token", truncate(deviceToken, 16),
			"error", err)
	} else {
		s.logger.Info("FCMSender: device token marked inactive",
			"token", truncate(deviceToken, 16))
	}
}

// buildFCMData converts a notification payload to FCM data map (all values must be strings).
func buildFCMData(payload map[string]any) map[string]string {
	data := make(map[string]string)
	for k, v := range payload {
		switch val := v.(type) {
		case string:
			data[k] = val
		default:
			data[k] = fmt.Sprintf("%v", val)
		}
	}
	return data
}

// base64urlEncode encodes bytes to base64url (no padding) — RFC 7515.
func base64urlEncode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// Ensure pgx import is used (referenced by other package consumers)
var _ = pgx.ErrNoRows
