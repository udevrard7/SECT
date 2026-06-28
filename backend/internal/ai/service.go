// Package ai fournit le service d'appel aux LLM externes (Mistral, Groq,
// OpenRouter, ZAI, etc.) en lisant la configuration du provider actif depuis
// la table « AIProviderConfig ».
//
// Le backend fait l'appel API vers le provider (jamais d'appel IA direct côté
// client). Le format attendu est OpenAI-compatible :
//
//	POST {baseUrl}/chat/completions
//	Headers: Authorization: Bearer {apiKey}
//	Body:    { "model", "messages", "temperature", "max_tokens" }
//
// Le provider actif est lu via « SELECT * FROM "AIProviderConfig" WHERE
// "isActive" = true LIMIT 1 ». La lecture se fait dans une transaction qui
// désactive RLS (« SET LOCAL row_security = off ») car le worker de fond
// (goroutine de flush, jobs hors-ligne, etc.) n'a pas de claims HTTP à poser.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ──────────────────────────────────────────────────────────────────────────
// Types publics
// ──────────────────────────────────────────────────────────────────────────

// ChatMessage représente un message de la conversation envoyée au LLM.
type ChatMessage struct {
	Role    string `json:"role"` // "system" | "user" | "assistant"
	Content string `json:"content"`
}

// ChatResult est le résultat d'un appel ChatCompletion.
type ChatResult struct {
	Content string // texte de la réponse
	Model   string // modèle effectivement utilisé (renvoyé par le provider)
}

// activeProvider est la projection d'une ligne AIProviderConfig lue depuis la
// DB. Seuls les champs nécessaires à l'appel API sont conservés.
type activeProvider struct {
	ID          string
	Name        string
	Provider    string
	BaseURL     string
	APIKey      string
	Model       string
	Temperature float64
	MaxTokens   int
}

// ──────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────

// AIService encapsule le pool DB et un client HTTP pour appeler les LLM.
type AIService struct {
	dbPool *pgxpool.Pool
	client *http.Client
}

// NewAIService construit un AIService à partir du pool Neon.
func NewAIService(dbPool *pgxpool.Pool) *AIService {
	return &AIService{
		dbPool: dbPool,
		// Timeout large (3 min) : la génération d'épreuves peut demander
		// plusieurs questions en une seule complétion (jusqu'à ~6 min côté
		// frontend via AbortController). On reste en-dessous de la limite
		// supérieure frontend pour éviter une 504 Go prématurée.
		client: &http.Client{Timeout: 180 * time.Second},
	}
}

// ChatCompletion lit le provider actif depuis la DB puis fait l'appel API
// chat completion vers son endpoint OpenAI-compatible.
//
// Étapes :
//  1. Lire le provider actif : SELECT * FROM "AIProviderConfig" WHERE "isActive" = true LIMIT 1
//     (transaction avec RLS désactivé — appelable depuis le worker sans claims HTTP)
//  2. Construire la requête : POST {baseUrl}/chat/completions
//     Body: { model, messages, temperature, max_tokens }
//     Headers: Authorization: Bearer {apiKey}, Content-Type: application/json
//  3. Parser la réponse OpenAI-compatible ({ choices: [{ message: { content } }] })
//  4. Retourner le contenu textuel + le modèle utilisé
func (s *AIService) ChatCompletion(ctx context.Context, messages []ChatMessage) (*ChatResult, error) {
	if s == nil || s.dbPool == nil {
		return nil, fmt.Errorf("AIService non initialisé")
	}
	if len(messages) == 0 {
		return nil, fmt.Errorf("messages vides")
	}

	// 1. Lire le provider actif (RLS off).
	provider, err := s.getActiveProvider(ctx)
	if err != nil {
		return nil, fmt.Errorf("lire provider actif: %w", err)
	}

	// 2. Construire et envoyer la requête.
	body := map[string]any{
		"model":       provider.Model,
		"messages":    messages,
		"temperature": provider.Temperature,
		"max_tokens":  provider.MaxTokens,
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("encode body: %w", err)
	}

	url := strings.TrimRight(provider.BaseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if provider.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+provider.APIKey)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("appel provider %s: %w", provider.Name, err)
	}
	defer resp.Body.Close()

	// On limite la lecture à 8 MiB pour rester raisonnable (une complétion
	// texte dépasse rarement 100 KiB, mais on garde de la marge).
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("lire réponse provider: %w", err)
	}
	if resp.StatusCode >= 400 {
		// On tronque l'erreur pour ne pas fuiter toute la réponse en log.
		snippet := string(respBody)
		if len(snippet) > 500 {
			snippet = snippet[:500] + "…"
		}
		return nil, fmt.Errorf("provider %s returned HTTP %d: %s",
			provider.Name, resp.StatusCode, snippet)
	}

	// 3. Parser la réponse OpenAI-compatible.
	var parsed struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("parse réponse provider: %w (body: %s)", err, truncate(string(respBody), 300))
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("provider %s: réponse sans choix (body: %s)",
			provider.Name, truncate(string(respBody), 300))
	}

	content := parsed.Choices[0].Message.Content
	model := parsed.Model
	if model == "" {
		model = provider.Model
	}

	return &ChatResult{Content: content, Model: model}, nil
}

// getActiveProvider lit la ligne AIProviderConfig active (isActive = true).
// RLS désactivé via « SET LOCAL row_security = off » au début de la
// transaction : le worker de fond (goroutine sans claims HTTP) peut ainsi
// lire la config système.
func (s *AIService) getActiveProvider(ctx context.Context) (*activeProvider, error) {
	tx, err := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) // safe après Commit (no-op)

	if _, err := tx.Exec(ctx, "SET LOCAL row_security = off"); err != nil {
		return nil, fmt.Errorf("disable rls: %w", err)
	}

	const query = `
		SELECT "id", "name", "provider",
		       COALESCE("baseUrl", ''), COALESCE("apiKey", ''), COALESCE("model", ''),
		       "temperature", "maxTokens"
		FROM "AIProviderConfig"
		WHERE "isActive" = true
		ORDER BY "priority" ASC, "createdAt" ASC
		LIMIT 1`

	p := &activeProvider{}
	err = tx.QueryRow(ctx, query).Scan(
		&p.ID, &p.Name, &p.Provider,
		&p.BaseURL, &p.APIKey, &p.Model,
		&p.Temperature, &p.MaxTokens,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("aucun provider IA actif dans AIProviderConfig — activez un provider via /api/ai-providers/activate")
		}
		return nil, fmt.Errorf("query active provider: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	// Defaults de secours si la DB contient des valeurs nulles / vides.
	if p.Model == "" {
		p.Model = "gpt-4o-mini"
	}
	if p.BaseURL == "" {
		return nil, fmt.Errorf("provider %s (%s): baseUrl manquant", p.Name, p.Provider)
	}
	if p.MaxTokens <= 0 {
		p.MaxTokens = 4096
	}

	return p, nil
}

// truncate limite la taille d'une chaîne pour les messages d'erreur.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
