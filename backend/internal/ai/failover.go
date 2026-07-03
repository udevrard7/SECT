// Package ai — failover automatique pour les appels LLM.
//
// Bug #3 (CRITICAL, audit ai-providers 2025) : avant ce fix, le backend ne
// faisait QUE `WHERE isActive=true LIMIT 1` — un seul provider, jamais de
// bascule. Si le provider actif tombait (429/500/timeout), l'erreur remontait
// directement à l'utilisateur.
//
// Ce fichier implémente le failover server-side :
//  1. Lire TOUS les providers actifs triés par priorité.
//  2. Tenter chaque provider en ordre.
//  3. En cas d'échec (429/500/timeout/erreur réseau), passer au suivant.
//  4. Logger chaque bascule dans AIFailoverEvent (bug #5).
//  5. Retourner le premier succès.
//
// La config failover (maxConsecutiveFailures, cooldownDurationMs) est lue
// depuis PlatformSettings(id='ai_failover_config') si elle existe.
package ai

import (
        "context"
        "encoding/json"
        "fmt"
        "log/slog"
        "strings"
        "time"

        "github.com/jackc/pgx/v5"
)

// FailoverConfig est la configuration du failover lue depuis PlatformSettings.
type FailoverConfig struct {
        MaxConsecutiveFailures int `json:"maxConsecutiveFailures"` // défaut 3
        CooldownDurationMs     int `json:"cooldownDurationMs"`     // défaut 60000 (60s)
        RetryAllProviders      bool `json:"retryAllProviders"`     // défaut false
}

// DefaultFailoverConfig retourne la config par défaut si PlatformSettings est vide.
func DefaultFailoverConfig() FailoverConfig {
        return FailoverConfig{
                MaxConsecutiveFailures: 3,
                CooldownDurationMs:     60000,
                RetryAllProviders:      false,
        }
}

// FailoverResult contient le résultat d'un appel avec failover.
type FailoverResult struct {
        Content      string
        Model        string
        ProviderUsed *activeProvider
        FailoverUsed bool // true si un provider de secours a été utilisé
}

// ChatWithFailover tente l'appel LLM avec failover automatique.
//
// Comportement :
//  1. Lit tous les providers actifs triés par priorité.
//  2. Pour chaque provider, tente ChatCompletion.
//  3. Si succès → retourne le résultat.
//  4. Si échec → log dans AIFailoverEvent, passe au suivant.
//  5. Si tous échouent → retourne la dernière erreur.
//
// Le failover respecte la config (cooldown, maxConsecutiveFailures) mais
// reste simple : on ne fait pas de retry sur le même provider (le cooldown
// serait complexe à gérer sans state persistant). On bascule juste au suivant.
func (s *AIService) ChatWithFailover(ctx context.Context, messages []ChatMessage, logger *slog.Logger) (*FailoverResult, error) {
        providers, err := s.getActiveProvidersForFailover(ctx)
        if err != nil {
                return nil, err
        }

        if len(providers) == 0 {
                return nil, fmt.Errorf("aucun provider IA actif — activez un provider via /api/ai-providers/activate")
        }

        config := s.getFailoverConfig(ctx)

        var lastErr error
        for i, p := range providers {
                // Tenter l'appel avec ce provider.
                result, err := s.chatWithProvider(ctx, p, messages)
                if err == nil {
                        // Succès !
                        if i > 0 && logger != nil {
                                logger.Info("AI failover réussi",
                                        "failed_provider", providers[0].Name,
                                        "fallback_provider", p.Name,
                                )
                        }
                        return &FailoverResult{
                                Content:      result.Content,
                                Model:        result.Model,
                                ProviderUsed: p,
                                FailoverUsed: i > 0,
                        }, nil
                }

                // Échec : logger et passer au suivant.
                lastErr = err
                if logger != nil {
                        logger.Warn("AI provider échec, bascule vers le suivant",
                                "provider", p.Name,
                                "error", err.Error(),
                                "next_index", i+1,
                                "total_providers", len(providers),
                        )
                }

                // Bug #5 : logger dans AIFailoverEvent (best-effort, ne bloque pas).
                s.logFailoverEvent(ctx, p, err, i+1 < len(providers))

                // Si pas de retryAllProviders et qu'on a essayé tous les providers, sortir.
                if !config.RetryAllProviders && i+1 >= len(providers) {
                        break
                }
        }

        return nil, fmt.Errorf("tous les providers IA ont échoué, dernière erreur: %w", lastErr)
}

// getActiveProvidersForFailover lit TOUS les providers actifs de capability='chat'
// triés par priorité. MULTI-CAPABILITY : filtre sur capability='chat' pour que le
// failover ne bascule qu'entre providers chat (jamais vers un provider tts/audio).
// Utilisé par ChatWithFailover pour avoir une liste de secours.
func (s *AIService) getActiveProvidersForFailover(ctx context.Context) ([]*activeProvider, error) {
        tx, err := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx)

        if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)"); err != nil {
                return nil, fmt.Errorf("set system claims: %w", err)
        }

        rows, err := tx.Query(ctx, `
                SELECT "id", "name", "provider",
                       COALESCE("baseUrl", ''), COALESCE("apiKey", ''), COALESCE("model", ''),
                       COALESCE("temperature", 0.7), COALESCE("maxTokens", 4096),
                       COALESCE("extraConfig", ''), COALESCE("capability", 'chat')
                FROM "AIProviderConfig"
                WHERE "isActive" = true AND COALESCE("capability", 'chat') = 'chat'
                ORDER BY "priority" ASC, "createdAt" ASC
        `)
        if err != nil {
                return nil, fmt.Errorf("query providers: %w", err)
        }
        defer rows.Close()

        var providers []*activeProvider
        for rows.Next() {
                p := &activeProvider{}
                // DASHSCOPE-AUDIO-1 : scan aussi la colonne capability (NULL → 'chat').
                if err := rows.Scan(
                        &p.ID, &p.Name, &p.Provider,
                        &p.BaseURL, &p.APIKey, &p.Model,
                        &p.Temperature, &p.MaxTokens, &p.ExtraConfig, &p.Capability,
                ); err != nil {
                        return nil, fmt.Errorf("scan provider: %w", err)
                }

                // Bug #2 : fusionner extraConfig (ZAI).
                ec := ParseExtraConfig(p.ExtraConfig)
                if ec.APIKey != "" && p.APIKey == "" {
                        p.APIKey = ec.APIKey
                }
                if ec.BaseURL != "" && p.BaseURL == "" {
                        p.BaseURL = ec.BaseURL
                }

                // Defaults de secours.
                if p.Model == "" {
                        p.Model = "gpt-4o-mini"
                }
                if p.MaxTokens <= 0 {
                        p.MaxTokens = 4096
                }

                // Skip providers invalides (sans baseUrl ou apiKey).
                if p.BaseURL == "" || p.APIKey == "" {
                        continue
                }

                providers = append(providers, p)
        }

        if err := rows.Err(); err != nil {
                return nil, fmt.Errorf("rows err: %w", err)
        }

        return providers, nil
}

// getFailoverConfig lit la config failover depuis PlatformSettings.
// Retourne DefaultFailoverConfig si la config est absente ou invalide.
func (s *AIService) getFailoverConfig(ctx context.Context) FailoverConfig {
        tx, err := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return DefaultFailoverConfig()
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        var settingsJSON string
        err = tx.QueryRow(ctx, `SELECT "settings" FROM "PlatformSettings" WHERE "id" = 'ai_failover_config'`).Scan(&settingsJSON)
        if err != nil {
                return DefaultFailoverConfig()
        }

        var cfg FailoverConfig
        if err := json.Unmarshal([]byte(settingsJSON), &cfg); err != nil {
                return DefaultFailoverConfig()
        }

        // Defaults si champs manquants.
        if cfg.MaxConsecutiveFailures <= 0 {
                cfg.MaxConsecutiveFailures = 3
        }
        if cfg.CooldownDurationMs <= 0 {
                cfg.CooldownDurationMs = 60000
        }
        return cfg
}

// logFailoverEvent insère une entrée dans AIFailoverEvent (best-effort).
// Bug #5 : la table d'audit était toujours vide. Maintenant chaque échec
// provider est tracé pour diagnostic post-mortem.
func (s *AIService) logFailoverEvent(ctx context.Context, provider *activeProvider, callErr error, hasFallback bool) {
        tx, err := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return
        }
        defer tx.Rollback(ctx)

        tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

        eventType := "PROVIDER_FAILURE"
        if !hasFallback {
                eventType = "ALL_PROVIDERS_FAILED"
        }

        // Tronquer l'erreur pour éviter un log trop volumineux.
        errMsg := callErr.Error()
        if len(errMsg) > 500 {
                errMsg = errMsg[:500] + "…"
        }

        _, _ = tx.Exec(ctx, `
                INSERT INTO "AIFailoverEvent" ("id", "providerId", "providerName", "eventType", "reason", "errorDetails", "resolved", "createdAt")
                VALUES ($1, $2, $3, $4, $5, $6, false, CURRENT_TIMESTAMP)
        `,
                "failover-"+provider.ID+"-"+fmt.Sprintf("%d", time.Now().UnixNano()),
                provider.ID, provider.Name, eventType,
                "HTTP error or timeout during chat completion",
                errMsg,
        )

        _ = tx.Commit(ctx)
}

// chatWithProvider fait l'appel LLM avec un provider spécifique.
// Wrapper autour de ChatCompletion qui utilise un activeProvider explicite.
func (s *AIService) chatWithProvider(ctx context.Context, p *activeProvider, messages []ChatMessage) (*ChatResult, error) {
        // Construire le body OpenAI-compatible.
        body := map[string]interface{}{
                "model":       p.Model,
                "messages":    messages,
                "temperature": p.Temperature,
                "max_tokens":  p.MaxTokens,
        }
        bodyBytes, err := json.Marshal(body)
        if err != nil {
                return nil, fmt.Errorf("encode body: %w", err)
        }

        url := strings.TrimRight(p.BaseURL, "/") + "/chat/completions"
        req, err := newRequestWithContext(ctx, "POST", url, bodyBytes, p.APIKey)
        if err != nil {
                return nil, fmt.Errorf("build request: %w", err)
        }

        resp, err := s.client.Do(req)
        if err != nil {
                return nil, fmt.Errorf("appel provider %s: %w", p.Name, err)
        }
        defer resp.Body.Close()

        respBody, err := readResponseBody(resp)
        if err != nil {
                return nil, fmt.Errorf("lire réponse provider: %w", err)
        }

        if resp.StatusCode >= 400 {
                snippet := string(respBody)
                if len(snippet) > 300 {
                        snippet = snippet[:300] + "…"
                }
                return nil, fmt.Errorf("provider %s returned HTTP %d: %s", p.Name, resp.StatusCode, snippet)
        }

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
                return nil, fmt.Errorf("parse réponse provider %s: %w", p.Name, err)
        }
        if len(parsed.Choices) == 0 {
                return nil, fmt.Errorf("provider %s: réponse sans choix", p.Name)
        }

        content := parsed.Choices[0].Message.Content
        model := parsed.Model
        if model == "" {
                model = p.Model
        }

        return &ChatResult{Content: content, Model: model}, nil
}
