// Package notification — TelegramSender envoie des messages via un BOT
// TELEGRAM PARTAGÉ (Bot API, SECT-NOTIF-TELEGRAM-1).
//
// C'est le canal 7 du dispatcher (après in-app, SSE, web push VAPID, email,
// FCM). Chaque étudiant ayant LIÉ son compte Telegram (deep-link
// t.me/<bot>?start=<code> → POST /api/telegram/webhook → User.telegramChatId)
// reçoit les notifications pédagogiques (évaluation disponible, nouveau
// document, nouvel ouvrage en bibliothèque) par message Telegram.
//
// POURQUOI TELEGRAM (remplacement du canal Instagram retiré) : l'API
// Instagram Messaging exigeait un compte BUSINESS relié à une page Facebook,
// un token d'accès Meta longue durée et potentiellement une app review —
// coût et complexité rédhibitoires pour un établissement. Le Bot API
// Telegram est GRATUIT, sans revue d'app, et UN SEUL bot partagé sert
// tous les étudiants : chaque étudiant démarre une conversation privée
// avec le bot (prérequis Telegram : un bot ne peut écrire qu'aux chats
// qui l'ont démarré), le chat_id est stocké côté SECT, et l'envoi se fait
// par POST /bot<token>/sendMessage.
//
// Setup (2 minutes, via @BotFather — instructions dans docs/worklog.md) :
//  1. Créer le bot : /newbot → nom + username → BOT TOKEN.
//  2. Poser les variables d'environnement :
//     TELEGRAM_BOT_TOKEN     — le token du bot (activé si non vide)
//     TELEGRAM_WEBHOOK_SECRET— secret aléatoire (openssl rand -hex 32)
//     TELEGRAM_WEBHOOK_URL   — ex. https://api.sect.ftci.fr/api/telegram/webhook
//     (optionnel : si posé, setWebhook auto au boot)
//  3. Redémarrer l'API. Les étudiants lient leur compte depuis /profil.
//
// Si TELEGRAM_BOT_TOKEN est vide, Telegram est désactivé (no-op, dev mode)
// — même sémantique que VAPID/FCM : jamais bloquant.
//
// Rate limits Telegram honorés : ~30 messages/s par bot en broadcast →
// limiteur process-wide à 25 msg/s (marge) + retry une fois sur 429 en
// respectant retry_after renvoyé par l'API.
package notification

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// telegramRatePerSec — plafond d'envoi process-wide (Telegram autorise
// ~30 msg/s par bot en broadcast ; 25 laisse une marge de sécurité).
const telegramRatePerSec = 25

// telegramHTTPTimeout — timeout par appel API.
const telegramHTTPTimeout = 15 * time.Second

// TelegramSender sends messages via a shared Telegram bot.
// Channel 7 of the notification dispatcher.
type TelegramSender struct {
	botToken string
	apiBase  string // injectable pour tests ; défaut https://api.telegram.org
	logger   *slog.Logger
	client   *http.Client
	limiter  *telegramLimiter

	mu            sync.Mutex
	botUsername   string // cache du getMe (username sans @)
	botUsernameOk bool   // getMe réussi au moins une fois
}

// NewTelegramSender creates a new Telegram sender. If botToken is empty,
// returns nil (Telegram disabled — dev mode).
func NewTelegramSender(botToken string, logger *slog.Logger) *TelegramSender {
	if botToken == "" {
		if logger != nil {
			logger.Info("Telegram channel disabled (no TELEGRAM_BOT_TOKEN configured)")
		}
		return nil
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &TelegramSender{
		botToken: botToken,
		apiBase:  "https://api.telegram.org",
		logger:   logger,
		client:   &http.Client{Timeout: telegramHTTPTimeout},
		limiter:  newTelegramLimiter(telegramRatePerSec),
	}
}

// Enabled indique si le canal est actif (sender configuré).
func (s *TelegramSender) Enabled() bool { return s != nil }

// telegramLimiter — token bucket process-wide fait maison (pas de
// golang.org/x/time dans go.mod : on évite une dépendance pour 20 lignes).
// Un goroutine recharge 1 token par tick ; les envois consomment 1 token
// chacun (bloquant sur ctx si le bucket est vide → sérialise les bursts
// de fanout à ~25 msg/s au lieu de mitrailler l'API).
type telegramLimiter struct {
	tokens chan struct{}
}

func newTelegramLimiter(perSec int) *telegramLimiter {
	l := &telegramLimiter{tokens: make(chan struct{}, perSec)}
	interval := time.Second / time.Duration(perSec)
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			select {
			case l.tokens <- struct{}{}:
			default: // bucket plein
			}
		}
	}()
	return l
}

func (l *telegramLimiter) acquire(ctx context.Context) error {
	select {
	case <-l.tokens:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// telegramAPIResponse — enveloppe commune des réponses Bot API.
type telegramAPIResponse struct {
	OK          bool   `json:"ok"`
	Description string `json:"description"`
	ErrorCode   int    `json:"error_code"`
	Parameters  *struct {
		RetryAfter int `json:"retry_after"` // secondes (présent sur 429)
	} `json:"parameters"`
	Result json.RawMessage `json:"result"`
}

// call exécute un appel Bot API POST JSON. Retourne la réponse parsée.
func (s *TelegramSender) call(ctx context.Context, method string, payload any) (*telegramAPIResponse, []byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, fmt.Errorf("telegram marshal %s: %w", method, err)
	}
	url := s.apiBase + "/bot" + s.botToken + "/" + method
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, nil, fmt.Errorf("telegram build request %s: %w", method, err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("telegram http call %s: %w", method, err)
	}
	defer func() { _ = resp.Body.Close() }()

	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	var api telegramAPIResponse
	if err := json.Unmarshal(raw, &api); err != nil {
		return nil, raw, fmt.Errorf("telegram %s: HTTP %d (réponse illisible: %.200s)", method, resp.StatusCode, string(raw))
	}
	return &api, raw, nil
}

// BotUsername retourne l'username du bot (sans @), via getMe avec cache.
// Utilisé par GET /api/telegram/link pour construire le deep-link
// t.me/<username>?start=<code>.
func (s *TelegramSender) BotUsername(ctx context.Context) (string, error) {
	if s == nil {
		return "", fmt.Errorf("telegram: sender disabled")
	}
	s.mu.Lock()
	if s.botUsernameOk {
		u := s.botUsername
		s.mu.Unlock()
		return u, nil
	}
	s.mu.Unlock()

	api, _, err := s.call(ctx, "getMe", map[string]any{})
	if err != nil {
		return "", err
	}
	if !api.OK {
		return "", fmt.Errorf("telegram getMe: %s", api.Description)
	}
	var me struct {
		Username string `json:"username"`
	}
	if err := json.Unmarshal(api.Result, &me); err != nil || me.Username == "" {
		return "", fmt.Errorf("telegram getMe: username manquant dans la réponse")
	}
	s.mu.Lock()
	s.botUsername, s.botUsernameOk = me.Username, true
	s.mu.Unlock()
	return me.Username, nil
}

// SendMessage envoie un message texte à un chat (chat_id stocké côté SECT à
// la liaison). Respecte le rate limit process-wide ; sur 429 (trop de
// messages), attend retry_after et réessaie UNE fois. Non bloquant pour
// l'appelant : l'erreur est retournée au dispatcher qui la journalise sans
// faire échouer la mutation métier.
func (s *TelegramSender) SendMessage(ctx context.Context, chatID, text string) error {
	if s == nil {
		return fmt.Errorf("telegram: sender disabled")
	}
	if chatID == "" {
		return fmt.Errorf("telegram: empty chat id")
	}
	if text == "" {
		return fmt.Errorf("telegram: empty message")
	}

	payload := map[string]any{
		"chat_id": chatID,
		"text":    text,
		// Texte brut (pas de parse_mode) : aucun risque d'injection Markdown
		// via les noms d'étudiants/épreuves ; aperçu des liens désactivé
		// (les URL sont des routes de l'app, l'aperçu Telegram est du bruit).
		"link_preview_options": map[string]any{"is_disabled": true},
	}

	for attempt := 0; attempt < 2; attempt++ {
		if err := s.limiter.acquire(ctx); err != nil {
			return fmt.Errorf("telegram: rate limiter: %w", err)
		}
		api, _, err := s.call(ctx, "sendMessage", payload)
		if err != nil {
			return err
		}
		if api.OK {
			return nil
		}
		if api.ErrorCode == 429 && attempt == 0 {
			wait := 5 * time.Second
			if api.Parameters != nil && api.Parameters.RetryAfter > 0 {
				wait = time.Duration(api.Parameters.RetryAfter) * time.Second
			}
			if wait > 30*time.Second {
				wait = 30 * time.Second // plafond — le ctx reste maître
			}
			s.logger.Warn("Telegram 429, retrying", "chatId", chatID, "wait", wait.String())
			select {
			case <-time.After(wait):
				continue
			case <-ctx.Done():
				return fmt.Errorf("telegram: cancelled pendant le backoff 429: %w", ctx.Err())
			}
		}
		return fmt.Errorf("telegram sendMessage error %d: %s", api.ErrorCode, api.Description)
	}
	return fmt.Errorf("telegram sendMessage: échec après retry 429")
}

// EnsureWebhook enregistre le webhook Telegram (setWebhook) avec le secret
// partagé. Idempotent : appelé au boot quand TELEGRAM_WEBHOOK_URL est posé
// (l'instance OCI primaire seulement — pas le standby Render, dont l'env
// ne porte pas la variable). Enregistre aussi le bot username (getMe) pour
// les logs et le deep-link /profil.
func (s *TelegramSender) EnsureWebhook(ctx context.Context, webhookURL, secret string) error {
	if s == nil {
		return fmt.Errorf("telegram: sender disabled")
	}
	if bot, err := s.BotUsername(ctx); err == nil {
		s.logger.Info("Telegram bot configured", "bot", "@"+bot)
	}
	payload := map[string]any{
		"url":          webhookURL,
		"secret_token": secret,
		// On ne traite que les messages (liaison /start, /stop) — inutile
		// de recevoir edited_messages/callback_query/etc.
		"allowed_updates": []string{"message"},
	}
	api, _, err := s.call(ctx, "setWebhook", payload)
	if err != nil {
		return err
	}
	if !api.OK {
		return fmt.Errorf("telegram setWebhook: %s", api.Description)
	}
	s.logger.Info("Telegram webhook registered", "url", webhookURL)
	return nil
}
