package worker

import (
        "bytes"
        "context"
        "encoding/json"
        "fmt"
        "log/slog"
        "net/http"
        "strings"
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
//
// Bug #2 (CRITICAL, audit ai-providers 2025) : extraConfig est maintenant lu
// et fusionné. Pour ZAI, l'apiKey est souvent dans extraConfig.apiKey.
func getActiveProviderShared(ctx context.Context, dbPool *pgxpool.Pool) (*aiProviderConfig, error) {
        tx, err := dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        var p aiProviderConfig
        var extraConfig string
        // DASHSCOPE-AUDIO-1 : on lit aussi la colonne "capability" (NULL → 'chat').
        // Cette fonction retourne le 1er provider actif sans filtrer par
        // capability — utilisée par les workers chat (ia, correction, doc
        // analyzer) qui restent rétro-compatibles avec les providers existants.
        err = tx.QueryRow(ctx, `
                SELECT "id", "name", "provider", "baseUrl", "apiKey", "model",
                       COALESCE("temperature", 0.7), COALESCE("maxTokens", 4096),
                       COALESCE("extraConfig", ''), COALESCE("capability", 'chat')
                FROM "AIProviderConfig"
                WHERE "isActive" = true
                ORDER BY "priority" ASC
                LIMIT 1
        `).Scan(&p.ID, &p.Name, &p.Provider, &p.BaseURL, &p.APIKey, &p.Model, &p.Temperature, &p.MaxTokens, &extraConfig, &p.Capability)
        if err != nil {
                return nil, fmt.Errorf("no active AI provider: %w", err)
        }

        tx.Commit(ctx)

        // Bug #2 : fusionner extraConfig (ZAI stocke apiKey dans extraConfig).
        if extraConfig != "" {
                var ec struct {
                        APIKey  string `json:"apiKey"`
                        BaseURL string `json:"baseUrl"`
                }
                if jsonErr := json.Unmarshal([]byte(extraConfig), &ec); jsonErr == nil {
                        if p.APIKey == "" && ec.APIKey != "" {
                                p.APIKey = ec.APIKey
                        }
                        if p.BaseURL == "" && ec.BaseURL != "" {
                                p.BaseURL = ec.BaseURL
                        }
                }
        }

        return &p, nil
}

// getActiveProviderByCapabilityShared lit le provider IA actif pour une capacité
// donnée ('chat', 'tts', 'audio'). Retourne le provider de cette capacité s'il
// existe, sinon fallback sur le provider 'chat' (rétro-compatible).
//
// DASHSCOPE-AUDIO-1 : permet d'avoir un provider TTS dédié (ex: DashScope)
// différent du provider chat (ex: ZAI/qwen-plus).
func getActiveProviderByCapabilityShared(ctx context.Context, dbPool *pgxpool.Pool, capability string) (*aiProviderConfig, error) {
        tx, err := dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        var p aiProviderConfig
        var extraConfig string
        // D'abord chercher un provider actif avec la capability exacte.
        // Si introuvable, fallback sur capability='chat' (ou NULL traité comme 'chat').
        err = tx.QueryRow(ctx, `
                SELECT "id", "name", "provider", "baseUrl", "apiKey", "model",
                       COALESCE("temperature", 0.7), COALESCE("maxTokens", 4096),
                       COALESCE("extraConfig", ''), COALESCE("capability", 'chat')
                FROM "AIProviderConfig"
                WHERE "isActive" = true AND COALESCE("capability", 'chat') = $1
                ORDER BY "priority" ASC
                LIMIT 1
        `, capability).Scan(&p.ID, &p.Name, &p.Provider, &p.BaseURL, &p.APIKey, &p.Model, &p.Temperature, &p.MaxTokens, &extraConfig, &p.Capability)
        if err != nil {
                // Fallback : aucun provider pour cette capability → utiliser le provider chat.
                if capability != "chat" {
                        return getActiveProviderShared(ctx, dbPool)
                }
                return nil, fmt.Errorf("no active AI provider for capability %q: %w", capability, err)
        }

        tx.Commit(ctx)

        // Fusionner extraConfig (ZAI stocke apiKey dans extraConfig).
        if extraConfig != "" {
                var ec struct {
                        APIKey  string `json:"apiKey"`
                        BaseURL string `json:"baseUrl"`
                }
                if jsonErr := json.Unmarshal([]byte(extraConfig), &ec); jsonErr == nil {
                        if p.APIKey == "" && ec.APIKey != "" {
                                p.APIKey = ec.APIKey
                        }
                        if p.BaseURL == "" && ec.BaseURL != "" {
                                p.BaseURL = ec.BaseURL
                        }
                }
        }

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

// callTTSProviderShared tente une synthèse audio (TTS). Retourne les bytes
// audio (MP3) ou une erreur si le provider ne supporte pas le TTS.
//
// VOXTRAL-TTS-1 : si provider.Provider == "VOXTRAL", dispatch vers callVoxtralTTS
// qui utilise l'API Mistral /audio/speech avec voice cloning (audio FR natif).
//
// AUDIO-LEARNING-1 : le TTS est OPTIONNEL. Si le provider ne supporte pas
// le TTS, cette fonction retourne une erreur et le worker garde le script
// textuel uniquement (status=PRET, r2Key=nil). L'échec TTS n'est PAS une
// erreur de job — c'est une dégradation gracieuse.
func callTTSProviderShared(ctx context.Context, provider *aiProviderConfig, text string, logger *slog.Logger) ([]byte, error) {
        if len(text) == 0 {
                return nil, fmt.Errorf("empty text")
        }

        // VOXTRAL-TTS-1 : dispatch Mistral Voxtral (API /audio/speech + voice cloning).
        if strings.EqualFold(provider.Provider, "VOXTRAL") {
                return callVoxtralTTS(ctx, provider, text, logger)
        }

        // Fallback : provider non-TTS (chat-only) → erreur → dégradation gracieuse.
        return nil, fmt.Errorf("provider %q does not support TTS (capability != 'tts')", provider.Provider)
}
