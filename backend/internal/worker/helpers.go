package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// httpClient est le client HTTP partagé pour les appels IA.
var httpClient = &http.Client{
	Timeout: 5 * time.Minute,
}

// newHTTPRequest crée une requête HTTP avec auth Bearer.
func newHTTPRequest(ctx context.Context, method, url string, body []byte, apiKey string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	return req, nil
}

// getActiveProviderShared lit le provider IA actif depuis AIProviderConfig.
// Fonction partagée entre IAWorker et CorrectionWorker.
func getActiveProviderShared(ctx context.Context, dbPool *pgxpool.Pool) (*aiProviderConfig, error) {
	tx, err := dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tx.Exec(ctx, "SET LOCAL row_security = off")

	var p aiProviderConfig
	err = tx.QueryRow(ctx, `
		SELECT "id", "name", "provider", "baseUrl", "apiKey", "model",
		       COALESCE("temperature", 0.7), COALESCE("maxTokens", 4096)
		FROM "AIProviderConfig"
		WHERE "isActive" = true
		ORDER BY "priority" ASC
		LIMIT 1
	`).Scan(&p.ID, &p.Name, &p.Provider, &p.BaseURL, &p.APIKey, &p.Model, &p.Temperature, &p.MaxTokens)
	if err != nil {
		return nil, fmt.Errorf("no active AI provider: %w", err)
	}

	tx.Commit(ctx)
	return &p, nil
}

// callAIProviderShared fait l'appel chat completion vers le provider.
// Fonction partagée entre IAWorker et CorrectionWorker.
func callAIProviderShared(ctx context.Context, provider *aiProviderConfig, messages []ChatMessage, logger *slog.Logger) (string, error) {
	body := map[string]interface{}{
		"model":       provider.Model,
		"messages":    messages,
		"temperature": provider.Temperature,
		"max_tokens":  provider.MaxTokens,
	}
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	url := provider.BaseURL + "/chat/completions"
	if logger != nil {
		logger.Info("Calling AI provider", "url", url, "model", provider.Model)
	}

	httpCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	req, err := newHTTPRequest(httpCtx, "POST", url, bodyJSON, provider.APIKey)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("AI request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("AI provider returned HTTP %d", resp.StatusCode)
	}

	var aiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&aiResp); err != nil {
		return "", fmt.Errorf("decode AI response: %w", err)
	}

	if len(aiResp.Choices) == 0 {
		return "", fmt.Errorf("AI returned no choices")
	}

	return aiResp.Choices[0].Message.Content, nil
}
