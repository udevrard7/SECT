// Package notification — InstagramSender envoie des messages directs (DM)
// via l'API Instagram Messaging (Meta Graph API).
//
// C'est le canal 7 du dispatcher (après in-app, SSE, web push VAPID, email,
// FCM). Chaque étudiant ayant renseigné son handle Instagram (User.instagram,
// self-service PATCH /api/users/me) reçoit les notifications pédagogiques
// (évaluation disponible, nouveau document, nouvel ouvrage en bibliothèque)
// en DM Instagram.
//
// Setup (compte Instagram BUSINESS/CRÉATEUR de l'établissement, relié à une
// page Facebook + token longue durée) :
//   - INSTAGRAM_USER_ID       : l'IG user ID du compte business SECT
//   - INSTAGRAM_ACCESS_TOKEN  : le token d'accès (page token longue durée)
//   - INSTAGRAM_API_VERSION   : optionnel, défaut v23.0
//
// Si l'un des deux premiers est vide, Instagram est désactivé (no-op, dev
// mode) — même sémantique que VAPID/FCM : jamais bloquant.
//
// API : POST https://graph.facebook.com/{version}/{ig-user-id}/messages
// avec {"recipient":{"username":"..."},"message":{"text":"..."}}.
// L'envoi par username est la voie la plus simple (l'étudiant n'a pas besoin
// d'avoir préalablement interagi). Si Meta refuse l'username (certaines
// configurations d'app exigent l'IGSID), l'erreur est journalisée et le
// canal retombe silencieusement sur les autres (email/in-app/push) — la
// mutation métier n'est JAMAIS impactée.
package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// InstagramSender sends direct messages via the Instagram Messaging API.
// Channel 7 of the notification dispatcher.
type InstagramSender struct {
	igUserID    string
	accessToken string
	apiVersion  string
	apiBaseURL  string // injectable pour tests ; défaut https://graph.facebook.com
	logger      *slog.Logger
	client      *http.Client
}

// NewInstagramSender creates a new Instagram DM sender. If igUserID or
// accessToken is empty, returns nil (Instagram disabled — dev mode).
func NewInstagramSender(igUserID, accessToken, apiVersion string, logger *slog.Logger) *InstagramSender {
	if igUserID == "" || accessToken == "" {
		if logger != nil {
			logger.Info("Instagram DM disabled (no INSTAGRAM_USER_ID/INSTAGRAM_ACCESS_TOKEN configured)")
		}
		return nil
	}
	if apiVersion == "" {
		apiVersion = "v23.0"
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &InstagramSender{
		igUserID:    igUserID,
		accessToken: accessToken,
		apiVersion:  apiVersion,
		apiBaseURL:  "https://graph.facebook.com",
		logger:      logger,
		client:      &http.Client{Timeout: 15 * time.Second},
	}
}

// instagramMessageRequest est le payload de l'API Send (DM par username).
type instagramMessageRequest struct {
	Recipient instagramRecipient `json:"recipient"`
	Message   instagramMessage   `json:"message"`
}

type instagramRecipient struct {
	Username string `json:"username"`
}

type instagramMessage struct {
	Text string `json:"text"`
}

// instagramErrorResponse est la réponse d'erreur de l'API Graph.
type instagramErrorResponse struct {
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
		Code    int    `json:"code"`
	} `json:"error"`
}

// SendDM envoie un message direct au handle Instagram donné (sans @).
// Le handle est normalisé (trim + strip @). Non bloquant : l'erreur est
// retournée au caller (dispatcher) qui la journalise sans faire échouer
// la mutation métier.
func (s *InstagramSender) SendDM(ctx context.Context, username, text string) error {
	if s == nil {
		return fmt.Errorf("instagram: sender disabled")
	}
	handle := strings.TrimPrefix(strings.TrimSpace(username), "@")
	if handle == "" {
		return fmt.Errorf("instagram: empty username")
	}
	if text == "" {
		return fmt.Errorf("instagram: empty message")
	}

	payload, err := json.Marshal(instagramMessageRequest{
		Recipient: instagramRecipient{Username: handle},
		Message:   instagramMessage{Text: text},
	})
	if err != nil {
		return fmt.Errorf("instagram marshal payload: %w", err)
	}

	url := fmt.Sprintf("%s/%s/%s/messages", s.apiBaseURL, s.apiVersion, s.igUserID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("instagram build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("instagram http call: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errResp instagramErrorResponse
		_ = json.Unmarshal(body, &errResp)
		if errResp.Error != nil {
			return fmt.Errorf("instagram API error %d [%s]: %s",
				resp.StatusCode, errResp.Error.Type, errResp.Error.Message)
		}
		return fmt.Errorf("instagram API error: HTTP %d", resp.StatusCode)
	}
	return nil
}

// Enabled indique si le canal est actif (sender configuré).
func (s *InstagramSender) Enabled() bool { return s != nil }
