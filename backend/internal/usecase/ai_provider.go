// Package usecase — logique métier pour la gestion des AI providers (AI-PROVIDERS-1).
//
// Extrait la validation, les appels externes (test connexion, fetch models) et
// l'orchestration des repository calls des handlers HTTP. Le usecase ne connaît
// rien de HTTP (pas de http.ResponseWriter, pas de chi.URLParam).
package usecase

import (
        "context"
        "encoding/json"
        "fmt"
        "io"
        "log/slog"
        "net/http"
        "strings"
        "time"

        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/repository"
)

// ──────────────────────────────────────────────────────────────────────────
// Input types
// ──────────────────────────────────────────────────────────────────────────

// AIProviderCreateInput holds the data needed to create a new AI provider.
type AIProviderCreateInput struct {
        Name        string
        Provider    string
        BaseURL     *string
        APIKey      *string
        Model       *string
        Temperature *float64
        MaxTokens   *int
        ExtraConfig json.RawMessage
        Capability  *string
}

// AIProviderUpdateInput holds the data for a partial update (PATCH semantics).
// Only non-nil fields will be updated.
type AIProviderUpdateInput struct {
        Name        *string
        Provider    *string
        BaseURL     *string
        APIKey      *string
        Model       *string
        Temperature *float64
        MaxTokens   *int
        ExtraConfig json.RawMessage
        Capability  *string
}

// FailoverConfig holds the failover configuration stored in PlatformSettings.
type FailoverConfig struct {
        Enabled                bool `json:"enabled"`
        MaxConsecutiveFailures int  `json:"maxConsecutiveFailures"`
        CooldownDurationMs     int  `json:"cooldownDurationMs"`
        RetryAllProviders      bool `json:"retryAllProviders"`
}

// ──────────────────────────────────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────────────────────────────────

// FailoverStatusResult is the complete failover status returned by GetFailoverStatus.
type FailoverStatusResult struct {
        Config        FailoverConfig
        Summary       FailoverSummary
        Providers     []ProviderWithHealthResult
        RecentEvents  []repository.FailoverEvent
        TotalFailovers int
        Last24hEvents  int
}

// FailoverSummary holds aggregated health counts for the failover status.
type FailoverSummary struct {
        TotalProviders  int  `json:"totalProviders"`
        Healthy         int  `json:"healthy"`
        Degraded        int  `json:"degraded"`
        Unknown         int  `json:"unknown"`
        CoolingDown     int  `json:"coolingDown"`
        FailoverEnabled bool `json:"failoverEnabled"`
        TotalCalls      int  `json:"totalCalls"`
        TotalFailovers  int  `json:"totalFailovers"`
        Last24hEvents   int  `json:"last24hEvents"`
}

// ProviderWithHealthResult is a provider row with computed health info for
// the failover status response.
type ProviderWithHealthResult struct {
        ID         string
        Name       string
        Provider   string
        Model      *string
        IsActive   bool
        Priority   int
        LastTestAt *string // RFC3339 formatted
        LastTestOk *bool
        Status     string // HEALTHY, DEGRADED, UNKNOWN, COOLING_DOWN
        Health     *ProviderHealthResult
}

// ProviderHealthResult holds computed health data for a single provider.
type ProviderHealthResult struct {
        ProviderID          string `json:"providerId"`
        ProviderName        string `json:"providerName"`
        ConsecutiveFailures int    `json:"consecutiveFailures"`
        LastFailureAt       *int64 `json:"lastFailureAt"`
        LastSuccessAt       *int64 `json:"lastSuccessAt"`
        TotalCalls          int    `json:"totalCalls"`
        TotalFailures       int    `json:"totalFailures"`
        TotalFailovers      int    `json:"totalFailovers"`
        IsCoolingDown       bool   `json:"isCoolingDown"`
}

// FailoverConfigResult is returned by SaveFailoverConfig.
type FailoverConfigResult struct {
        Config FailoverConfig
}

// ──────────────────────────────────────────────────────────────────────────
// UseCase
// ──────────────────────────────────────────────────────────────────────────

// AIProviderUseCase implements business logic for AI provider management.
type AIProviderUseCase struct {
        repo *repository.AIProviderRepository
}

// NewAIProviderUseCase creates a new AIProviderUseCase.
func NewAIProviderUseCase(repo *repository.AIProviderRepository) *AIProviderUseCase {
        return &AIProviderUseCase{repo: repo}
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Create — validate input then delegate to repo.
// ──────────────────────────────────────────────────────────────────────────

// Create creates a new AI provider after validation.
func (uc *AIProviderUseCase) Create(ctx context.Context, claims appdb.SessionClaims, input AIProviderCreateInput) (*repository.AIProvider, error) {
        // Resolve string values for validation.
        var baseURL, apiKey, model string
        if input.BaseURL != nil {
                baseURL = *input.BaseURL
        }
        if input.APIKey != nil {
                apiKey = *input.APIKey
        }
        if input.Model != nil {
                model = *input.Model
        }

        if err := ValidateProviderInput(input.Name, input.Provider, baseURL, apiKey, model); err != nil {
                return nil, fmt.Errorf("validation: %w", err)
        }

        // Defaults.
        temperature := 0.7
        if input.Temperature != nil {
                temperature = *input.Temperature
        }
        maxTokens := 4096
        if input.MaxTokens != nil {
                maxTokens = *input.MaxTokens
        }

        extraConfig, err := NormalizeExtraConfig(input.ExtraConfig)
        if err != nil {
                return nil, fmt.Errorf("extraConfig invalide: %w", err)
        }

        id := uuid.NewString()
        provider, err := uc.repo.Create(ctx, claims,
                id,
                strings.TrimSpace(input.Name),
                strings.TrimSpace(input.Provider),
                input.BaseURL,
                input.APIKey,
                input.Model,
                temperature,
                maxTokens,
                extraConfig,
                input.Capability,
        )
        if err != nil {
                return nil, fmt.Errorf("create AI provider: %w", err)
        }
        return &provider, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 2a. List — return all providers.
// ──────────────────────────────────────────────────────────────────────────

// List returns all AI providers ordered by priority.
func (uc *AIProviderUseCase) List(ctx context.Context, claims appdb.SessionClaims) ([]repository.AIProvider, error) {
        return uc.repo.List(ctx, claims)
}

// ──────────────────────────────────────────────────────────────────────────
// 2b. GetByID — return a provider by ID.
// ──────────────────────────────────────────────────────────────────────────

// GetByID returns a provider by ID.
func (uc *AIProviderUseCase) GetByID(ctx context.Context, claims appdb.SessionClaims, id string) (*repository.AIProvider, error) {
        p, err := uc.repo.GetByID(ctx, claims, id)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, fmt.Errorf("provider introuvable: %w", err)
                }
                return nil, fmt.Errorf("get AI provider: %w", err)
        }
        return &p, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Update — validate then delegate to repo.
// ──────────────────────────────────────────────────────────────────────────

// Update partially updates a provider.
func (uc *AIProviderUseCase) Update(ctx context.Context, claims appdb.SessionClaims, id string, input AIProviderUpdateInput) (*repository.AIProvider, error) {
        // Validate provided fields if present.
        var name, provider, baseURL, apiKey, model string
        if input.Name != nil {
                name = *input.Name
        }
        if input.Provider != nil {
                provider = *input.Provider
        }
        if input.BaseURL != nil {
                baseURL = *input.BaseURL
        }
        if input.APIKey != nil {
                apiKey = *input.APIKey
        }
        if input.Model != nil {
                model = *input.Model
        }
        // Only validate if at least one of the validated fields is provided.
        if name != "" || provider != "" || baseURL != "" || apiKey != "" || model != "" {
                // For partial updates, we need the existing provider to fill in blanks.
                existing, err := uc.repo.GetByID(ctx, claims, id)
                if err != nil {
                        return nil, fmt.Errorf("get provider for validation: %w", err)
                }
                eName := existing.Name
                eProvider := existing.Provider
                var eBaseURL, eAPIKey, eModel string
                if existing.BaseURL != nil {
                        eBaseURL = *existing.BaseURL
                }
                if existing.APIKey != nil {
                        eAPIKey = *existing.APIKey
                }
                if existing.Model != nil {
                        eModel = *existing.Model
                }

                // Use provided values where available, existing values otherwise.
                vName := eName
                if name != "" {
                        vName = name
                }
                vProvider := eProvider
                if provider != "" {
                        vProvider = provider
                }
                vBaseURL := eBaseURL
                if baseURL != "" {
                        vBaseURL = baseURL
                }
                vAPIKey := eAPIKey
                if apiKey != "" {
                        vAPIKey = apiKey
                }
                vModel := eModel
                if model != "" {
                        vModel = model
                }

                if err := ValidateProviderInput(vName, vProvider, vBaseURL, vAPIKey, vModel); err != nil {
                        return nil, fmt.Errorf("validation: %w", err)
                }
        }

        // Normalize extraConfig.
        var extraConfig *string
        if len(input.ExtraConfig) > 0 {
                ec, err := NormalizeExtraConfig(input.ExtraConfig)
                if err != nil {
                        return nil, fmt.Errorf("extraConfig invalide: %w", err)
                }
                extraConfig = ec
        }

        fields := repository.AIProviderUpdateFields{
                Name:        input.Name,
                Provider:    input.Provider,
                BaseURL:     input.BaseURL,
                APIKey:      input.APIKey,
                Model:       input.Model,
                Temperature: input.Temperature,
                MaxTokens:   input.MaxTokens,
                ExtraConfig: extraConfig,
                Capability:  input.Capability,
        }

        updated, err := uc.repo.Update(ctx, claims, id, fields)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, fmt.Errorf("provider introuvable: %w", err)
                }
                return nil, fmt.Errorf("update AI provider: %w", err)
        }
        return &updated, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Delete — refuse if provider is active.
// ──────────────────────────────────────────────────────────────────────────

// Delete removes a provider (refuses if active).
func (uc *AIProviderUseCase) Delete(ctx context.Context, claims appdb.SessionClaims, id string) error {
        // Bug #20: refuse to delete an active provider.
        isActive, err := uc.repo.GetIsActive(ctx, claims, id)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return fmt.Errorf("provider introuvable: %w", err)
                }
                return fmt.Errorf("check active: %w", err)
        }
        if isActive {
                return fmt.Errorf("cannot delete active provider — deactivate or activate another first")
        }

        if err := uc.repo.Delete(ctx, claims, id); err != nil {
                if err == pgx.ErrNoRows {
                        return fmt.Errorf("provider introuvable: %w", err)
                }
                return fmt.Errorf("delete AI provider: %w", err)
        }
        return nil
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Activate — toggle or set the active state.
// ──────────────────────────────────────────────────────────────────────────

// Activate toggles or sets the active state of a provider.
func (uc *AIProviderUseCase) Activate(ctx context.Context, claims appdb.SessionClaims, providerID string, active *bool) (name string, newState bool, err error) {
        result, err := uc.repo.Activate(ctx, claims, providerID, active)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return "", false, fmt.Errorf("provider introuvable: %w", err)
                }
                return "", false, fmt.Errorf("activate AI provider: %w", err)
        }
        return result.Name, result.NewState, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 6. TestConnection — test provider connection and update test results.
// ──────────────────────────────────────────────────────────────────────────

// TestConnection tests the provider connection and updates test results.
func (uc *AIProviderUseCase) TestConnection(ctx context.Context, claims appdb.SessionClaims, id string) (success bool, message string, err error) {
        // 1. Get credentials from the repo.
        creds, err := uc.repo.GetProviderCredentials(ctx, claims, id)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return false, "", fmt.Errorf("provider introuvable: %w", err)
                }
                return false, "", fmt.Errorf("get credentials: %w", err)
        }

        // Bug #2: merge extraConfig (ZAI stores apiKey in extraConfig).
        baseURL := creds.BaseURL
        apiKey := creds.APIKey
        model := creds.Model
        providerName := creds.Name
        providerType := creds.Provider

        if creds.ExtraConfig != "" {
                var ec struct {
                        APIKey  string `json:"apiKey"`
                        BaseURL string `json:"baseUrl"`
                }
                if jsonErr := json.Unmarshal([]byte(creds.ExtraConfig), &ec); jsonErr == nil {
                        if apiKey == "" && ec.APIKey != "" {
                                apiKey = ec.APIKey
                        }
                        if baseURL == "" && ec.BaseURL != "" {
                                baseURL = ec.BaseURL
                        }
                }
        }

        // 2. Test the connection (external HTTP call, outside any transaction).
        // Bug #4 (HIGH): ZAI only had a simulated test → false success. Now we do
        // a real mini chat completion to validate apiKey + baseUrl + model.
        success = true
        message = "Connexion réussie"

        if baseURL == "" {
                success = false
                message = "baseUrl non configuré (vérifiez extraConfig pour ZAI)"
        } else if apiKey == "" {
                success = false
                message = "apiKey non configurée (vérifiez extraConfig pour ZAI)"
        } else if providerType == "ZAI" || providerType == "OPENAI" || providerType == "OPENAI_COMPATIBLE" {
                if testErr := testChatCompletion(baseURL, apiKey, model); testErr != nil {
                        success = false
                        message = "Échec : " + testErr.Error()
                } else {
                        message = providerName + " : chat completion de test réussi (model=" + model + ")"
                }
        } else if providerType == "DASHSCOPE" {
                // DASHSCOPE-AUDIO-1: DashScope (Alibaba Bailian / Model Studio).
                // For capability='chat', a mini chat completion suffices.
                // NOTE: if configured as capability='tts', this test will fail as
                // the /chat/completions endpoint doesn't exist for TTS models.
                if testErr := testChatCompletion(baseURL, apiKey, model); testErr != nil {
                        success = false
                        message = "Échec (TTS-only DashScope ? voir commentaire) : " + testErr.Error()
                } else {
                        message = providerName + " : chat completion de test réussi (model=" + model + ")"
                }
        } else if providerType == "MISTRAL" {
                // Mistral: OpenAI-compatible /chat/completions endpoint.
                if testErr := testChatCompletion(baseURL, apiKey, model); testErr != nil {
                        success = false
                        message = "Échec : " + testErr.Error()
                } else {
                        message = providerName + " : chat completion de test réussi (model=" + model + ")"
                }
        } else if providerType == "DEEPSEEK" || providerType == "CEREBRAS" {
                // DeepSeek and Cerebras use OpenAI-compatible /chat/completions.
                if testErr := testChatCompletion(baseURL, apiKey, model); testErr != nil {
                        success = false
                        message = "Échec : " + testErr.Error()
                } else {
                        message = providerName + " : chat completion de test réussi (model=" + model + ")"
                }
        } else if providerType == "ANTHROPIC" {
                // Anthropic: /messages endpoint instead of /chat/completions.
                if testErr := testAnthropicChat(baseURL, apiKey, model); testErr != nil {
                        success = false
                        message = "Échec : " + testErr.Error()
                } else {
                        message = providerName + " : chat completion de test réussi (model=" + model + ")"
                }
        } else {
                // Other providers: fallback on GET /models.
                if _, fetchErr := fetchProviderModels(providerType, baseURL, apiKey); fetchErr != nil {
                        success = false
                        message = "Échec : " + fetchErr.Error()
                }
        }

        // 3. Update test result in DB.
        // Bug #11: tolerant behavior (respond with test result regardless) but log DB error.
        if updateErr := uc.repo.UpdateTestResult(ctx, claims, id, success); updateErr != nil {
                slog.Error("DB error updating test result", "error", updateErr, "provider_id", id)
        }

        return success, message, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 7. ListModels — fetch available models from provider API.
// ──────────────────────────────────────────────────────────────────────────

// ListModels fetches available models from the provider API.
func (uc *AIProviderUseCase) ListModels(ctx context.Context, claims appdb.SessionClaims, providerID string) ([]string, error) {
        creds, err := uc.repo.GetProviderModelsCreds(ctx, claims, providerID)
        if err != nil {
                if err == pgx.ErrNoRows {
                        return nil, fmt.Errorf("provider introuvable: %w", err)
                }
                return nil, fmt.Errorf("get models creds: %w", err)
        }

        models, err := fetchProviderModels(creds.Provider, creds.BaseURL, creds.APIKey)
        if err != nil {
                // On error, return empty list rather than an error (frontend falls back
                // to PROVIDER_MODELS[providerType]).
                return []string{}, nil
        }
        if models == nil {
                models = []string{}
        }
        return models, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 8. UpdatePriorities — validate then delegate to repo.
// ──────────────────────────────────────────────────────────────────────────

// UpdatePriorities batch-updates provider priorities.
func (uc *AIProviderUseCase) UpdatePriorities(ctx context.Context, claims appdb.SessionClaims, items []repository.PriorityItem) error {
        if len(items) == 0 {
                return fmt.Errorf("priorities requis")
        }
        if err := uc.repo.UpdatePriorities(ctx, claims, items); err != nil {
                return fmt.Errorf("update priorities: %w", err)
        }
        return nil
}

// ──────────────────────────────────────────────────────────────────────────
// 9. GetFailoverStatus — compute full failover status.
// ──────────────────────────────────────────────────────────────────────────

// GetFailoverStatus returns the complete failover status.
func (uc *AIProviderUseCase) GetFailoverStatus(ctx context.Context, claims appdb.SessionClaims) (*FailoverStatusResult, error) {
        // Get failover config.
        cfg := defaultFailoverConfig()
        cfgStr, err := uc.repo.GetFailoverConfig(ctx, claims)
        if err != nil {
                slog.Error("DB error reading failover config", "error", err)
        }
        if cfgStr != nil {
                _ = json.Unmarshal([]byte(*cfgStr), &cfg)
        }

        // Get failover status data (providers, events, counts).
        data, err := uc.repo.GetFailoverStatus(ctx, claims)
        if err != nil {
                slog.Error("DB error reading failover status", "error", err)
        }

        // Build result.
        result := &FailoverStatusResult{
                Config:         cfg,
                TotalFailovers: data.TotalFailovers,
                Last24hEvents:  data.Last24hEvents,
                RecentEvents:   data.RecentEvents,
        }

        // Convert providers.
        for _, p := range data.Providers {
                pw := ProviderWithHealthResult{
                        ID:         p.ID,
                        Name:       p.Name,
                        Provider:   p.Provider,
                        Model:      p.Model,
                        IsActive:   p.IsActive,
                        Priority:   p.Priority,
                        LastTestOk: p.LastTestOk,
                        Status:     p.Status,
                }
                if p.LastTestAt != nil {
                        ts := p.LastTestAt.UTC().Format(time.RFC3339)
                        pw.LastTestAt = &ts
                }

                // Build health result.
                healthy := p.LastTestOk != nil && *p.LastTestOk
                health := &ProviderHealthResult{
                        ProviderID:   p.ID,
                        ProviderName: p.Name,
                }
                if p.LastTestAt != nil {
                        ms := p.LastTestAt.UnixMilli()
                        health.TotalCalls = 1
                        if healthy {
                                health.LastSuccessAt = &ms
                        } else {
                                health.LastFailureAt = &ms
                                health.ConsecutiveFailures = 1
                                health.TotalFailures = 1
                        }
                }
                pw.Health = health
                result.Providers = append(result.Providers, pw)
        }

        // Compute summary.
        summary := FailoverSummary{
                TotalProviders:  len(result.Providers),
                FailoverEnabled: cfg.Enabled,
                TotalFailovers:  data.TotalFailovers,
                Last24hEvents:   data.Last24hEvents,
        }
        for _, p := range result.Providers {
                switch p.Status {
                case "HEALTHY":
                        summary.Healthy++
                case "DEGRADED":
                        summary.Degraded++
                case "UNKNOWN":
                        summary.Unknown++
                case "COOLING_DOWN":
                        summary.CoolingDown++
                }
                if p.Health != nil {
                        summary.TotalCalls += p.Health.TotalCalls
                }
        }
        result.Summary = summary

        return result, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 10. SaveFailoverConfig — merge and save.
// ──────────────────────────────────────────────────────────────────────────

// SaveFailoverConfig merges the input with the existing configuration and saves it.
func (uc *AIProviderUseCase) SaveFailoverConfig(ctx context.Context, claims appdb.SessionClaims, raw map[string]json.RawMessage) (*FailoverConfigResult, error) {
        // Decode the raw input into a FailoverConfig struct.
        var in FailoverConfig
        // Re-marshal and unmarshal to handle the partial input.
        bodyBytes, err := json.Marshal(raw)
        if err != nil {
                return nil, fmt.Errorf("marshal input: %w", err)
        }
        _ = json.Unmarshal(bodyBytes, &in) // tolerant: missing fields = zero

        // Load existing config and merge.
        merged := defaultFailoverConfig()
        existingStr, err := uc.repo.GetFailoverConfig(ctx, claims)
        if err != nil {
                return nil, fmt.Errorf("get existing config: %w", err)
        }
        if existingStr != nil {
                _ = json.Unmarshal([]byte(*existingStr), &merged)
        }

        // Merge: only provided fields overwrite the config.
        if _, ok := raw["enabled"]; ok {
                merged.Enabled = in.Enabled
        }
        if _, ok := raw["maxConsecutiveFailures"]; ok && in.MaxConsecutiveFailures > 0 {
                merged.MaxConsecutiveFailures = in.MaxConsecutiveFailures
        }
        if _, ok := raw["cooldownDurationMs"]; ok && in.CooldownDurationMs > 0 {
                merged.CooldownDurationMs = in.CooldownDurationMs
        }
        if _, ok := raw["retryAllProviders"]; ok {
                merged.RetryAllProviders = in.RetryAllProviders
        }

        // Validate.
        if merged.MaxConsecutiveFailures <= 0 {
                return nil, fmt.Errorf("maxConsecutiveFailures doit être > 0")
        }
        if merged.CooldownDurationMs <= 0 {
                return nil, fmt.Errorf("cooldownDurationMs doit être > 0")
        }

        // Save.
        settingsBytes, err := json.Marshal(merged)
        if err != nil {
                return nil, fmt.Errorf("marshal config: %w", err)
        }
        if err := uc.repo.SaveFailoverConfig(ctx, claims, string(settingsBytes)); err != nil {
                return nil, fmt.Errorf("save failover config: %w", err)
        }

        return &FailoverConfigResult{Config: merged}, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 11. GetHealth — simplified health check.
// ──────────────────────────────────────────────────────────────────────────

// GetHealth returns a simplified health check for all providers.
func (uc *AIProviderUseCase) GetHealth(ctx context.Context, claims appdb.SessionClaims) (allHealthy bool, providers []repository.ProviderHealth, err error) {
        providers, err = uc.repo.GetHealthStatus(ctx, claims)
        if err != nil {
                slog.Error("DB error in GetHealth", "error", err)
                return true, nil, nil // tolerant: return what we have
        }

        allHealthy = true
        for _, p := range providers {
                if !p.Healthy {
                        allHealthy = false
                }
        }
        return allHealthy, providers, nil
}

// ──────────────────────────────────────────────────────────────────────────
// 12. ResetHealth — reset all provider health counters.
// ──────────────────────────────────────────────────────────────────────────

// ResetHealth resets all provider health counters.
func (uc *AIProviderUseCase) ResetHealth(ctx context.Context, claims appdb.SessionClaims) error {
        if err := uc.repo.ResetAllHealth(ctx, claims); err != nil {
                return fmt.Errorf("reset health: %w", err)
        }
        return nil
}

// ──────────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────────

// ValidateProviderInput validates the fields for creating or updating an AI provider.
//
// Rules:
//   - name: non-empty after trim
//   - provider: one of {ZAI, OPENAI, OPENAI_COMPATIBLE, ANTHROPIC, GOOGLE, VOXTRAL, DASHSCOPE, DEEPSEEK, CEREBRAS}
//   - baseURL: if non-empty, must start with http:// or https://
//   - apiKey: required for non-ZAI providers (ZAI can store apiKey in extraConfig)
//   - model: required
func ValidateProviderInput(name, provider, baseURL, apiKey, model string) error {
        if strings.TrimSpace(name) == "" {
                return fmt.Errorf("name requis")
        }
        upper := strings.ToUpper(strings.TrimSpace(provider))
        switch upper {
        case "ZAI", "OPENAI", "OPENAI_COMPATIBLE", "ANTHROPIC", "GOOGLE", "VOXTRAL", "DASHSCOPE", "DEEPSEEK", "CEREBRAS", "MISTRAL":
                // OK
        default:
                return fmt.Errorf("provider invalide: %q (valeurs acceptées: ZAI, OPENAI, OPENAI_COMPATIBLE, ANTHROPIC, GOOGLE, VOXTRAL, MISTRAL, DASHSCOPE, DEEPSEEK, CEREBRAS)", provider)
        }
        if baseURL != "" {
                if !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
                        return fmt.Errorf("baseUrl doit commencer par http:// ou https://")
                }
        }
        if upper != "ZAI" && strings.TrimSpace(apiKey) == "" {
                return fmt.Errorf("apiKey requis pour le provider %s", upper)
        }
        if strings.TrimSpace(model) == "" {
                return fmt.Errorf("model requis")
        }
        return nil
}

// ──────────────────────────────────────────────────────────────────────────
// ExtraConfig helpers
// ──────────────────────────────────────────────────────────────────────────

// NormalizeExtraConfig transforms raw JSON from the client into a storable
// string for the DB (TEXT column). Accepts string, object, null.
// Returns nil if the value is empty or null.
func NormalizeExtraConfig(raw json.RawMessage) (*string, error) {
        if len(raw) == 0 || string(raw) == "null" {
                return nil, nil
        }
        // If it's a JSON string ("..."), unquote it.
        var s string
        if err := json.Unmarshal(raw, &s); err == nil {
                if s == "" {
                        return nil, nil
                }
                return &s, nil
        }
        // Otherwise, return the JSON as-is (object, array, etc.).
        cleaned := strings.TrimSpace(string(raw))
        if cleaned == "" {
                return nil, nil
        }
        return &cleaned, nil
}

// ──────────────────────────────────────────────────────────────────────────
// Failover config defaults
// ──────────────────────────────────────────────────────────────────────────

// defaultFailoverConfig returns the default values when no config exists in DB.
func defaultFailoverConfig() FailoverConfig {
        return FailoverConfig{
                Enabled:                true,
                MaxConsecutiveFailures: 3,
                CooldownDurationMs:     60_000,
                RetryAllProviders:      false,
        }
}

// ──────────────────────────────────────────────────────────────────────────
// External HTTP test functions (business logic, not HTTP transport concerns)
// ──────────────────────────────────────────────────────────────────────────

// httpTimeoutClient is a client with a short timeout for external API calls.
var httpTimeoutClient = &http.Client{Timeout: 15 * time.Second}

// testChatCompletion does a mini chat completion towards an OpenAI-compatible
// provider (ZAI, OpenAI, Mistral, Groq, OpenRouter…).
// Validates apiKey + baseUrl + model in a single HTTP request.
func testChatCompletion(baseURL, apiKey, model string) error {
        body := map[string]interface{}{
                "model":       model,
                "messages":    []map[string]string{{"role": "user", "content": "ping"}},
                "max_tokens":  5,
                "temperature": 0,
        }
        bodyJSON, err := json.Marshal(body)
        if err != nil {
                return fmt.Errorf("marshal request: %w", err)
        }

        url := strings.TrimRight(baseURL, "/") + "/chat/completions"
        req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(string(bodyJSON)))
        if err != nil {
                return fmt.Errorf("build request: %w", err)
        }
        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("Authorization", "Bearer "+apiKey)

        resp, err := httpTimeoutClient.Do(req)
        if err != nil {
                return fmt.Errorf("HTTP error: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode >= 400 {
                respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 500))
                return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
        }
        return nil
}

// testAnthropicChat does a mini chat completion towards the Anthropic API.
// Anthropic uses /v1/messages with headers x-api-key + anthropic-version.
func testAnthropicChat(baseURL, apiKey, model string) error {
        body := map[string]interface{}{
                "model":      model,
                "max_tokens": 5,
                "messages":   []map[string]string{{"role": "user", "content": "ping"}},
        }
        bodyJSON, err := json.Marshal(body)
        if err != nil {
                return fmt.Errorf("marshal request: %w", err)
        }

        url := strings.TrimRight(baseURL, "/") + "/messages"
        req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(string(bodyJSON)))
        if err != nil {
                return fmt.Errorf("build request: %w", err)
        }
        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("x-api-key", apiKey)
        req.Header.Set("anthropic-version", "2023-06-01")

        resp, err := httpTimeoutClient.Do(req)
        if err != nil {
                return fmt.Errorf("HTTP error: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode >= 400 {
                respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 500))
                return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
        }
        return nil
}

// fetchProviderModels calls GET {baseUrl}/models with Authorization: Bearer {apiKey}.
// Returns the list of model IDs. For ZAI (no baseUrl), returns an empty list
// without error (the frontend falls back on PROVIDER_MODELS['ZAI']).
func fetchProviderModels(provider, baseURL, apiKey string) ([]string, error) {
        if provider == "ZAI" || baseURL == "" {
                return nil, nil
        }
        url := strings.TrimRight(baseURL, "/") + "/models"
        req, err := http.NewRequest(http.MethodGet, url, nil)
        if err != nil {
                return nil, err
        }
        if apiKey != "" {
                req.Header.Set("Authorization", "Bearer "+apiKey)
        }
        req.Header.Set("Accept", "application/json")
        resp, err := httpTimeoutClient.Do(req)
        if err != nil {
                return nil, err
        }
        defer resp.Body.Close()
        respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MiB max
        if resp.StatusCode >= 400 {
                return nil, fmt.Errorf("provider returned HTTP %d", resp.StatusCode)
        }
        // OpenAI-compatible format: { data: [{ id: "gpt-4o", ... }] }
        var parsed struct {
                Data []struct {
                        ID string `json:"id"`
                } `json:"data"`
        }
        if err := json.Unmarshal(respBody, &parsed); err != nil {
                return nil, fmt.Errorf("invalid models response: %w", err)
        }
        models := make([]string, 0, len(parsed.Data))
        for _, m := range parsed.Data {
                if m.ID != "" {
                        models = append(models, m.ID)
                }
        }
        return models, nil
}
