// Package http — handlers HTTP pour la gestion des AI providers (AI-PROVIDERS-1).
//
// Implémente les 11 endpoints REST pour la gestion des AI providers :
//
//      POST   /api/ai-providers               — créer un provider
//      GET    /api/ai-providers/{id}          — lire un provider (avec apiKey)
//      PATCH  /api/ai-providers/{id}          — mise à jour partielle
//      DELETE /api/ai-providers/{id}          — supprimer
//      POST   /api/ai-providers/activate      — activer un provider (désactive les autres)
//      GET/POST /api/ai-providers/{id}/test   — tester la connexion au provider
//      GET    /api/ai-providers/models        — lister les modèles disponibles
//      GET    /api/ai-providers/failover/status — statut complet du failover
//      POST   /api/ai-providers/failover/config — sauver la config failover
//      POST   /api/ai-providers/priority      — réordonner les priorités
//      GET/POST /api/ai-providers/failover/health — healthcheck (POST = reset)
//
// Tous les endpoints sont protégés par middleware.RequireAuth +
// middleware.RequireRole("ADMIN") (appliqués au niveau du router).
// Les transactions DB passent par appdb.WithTx pour poser les claims RLS.
package http

import (
        "encoding/json"
        "fmt"
        "io"
        "log/slog"
        "net/http"
        "strings"
        "time"

        "github.com/go-chi/chi/v5"
        "github.com/google/uuid"
        "github.com/jackc/pgx/v5"
        appdb "github.com/udevrard7/sect/backend/internal/db"
        "github.com/udevrard7/sect/backend/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────
// Types partagés
// ──────────────────────────────────────────────────────────────────────────

// aiProviderJSON est la représentation JSON d'un AIProviderConfig.
// hasAPIKey indique si un apiKey est configuré (sans le révéler).
// apiKey n'est rempli QUE par GET /api/ai-providers/{id} (édition admin).
type aiProviderJSON struct {
        ID          string  `json:"id"`
        Name        string  `json:"name"`
        Provider    string  `json:"provider"`
        BaseURL     *string `json:"baseUrl"`
        APIKey      *string `json:"apiKey,omitempty"`
        HasAPIKey   bool    `json:"hasApiKey"`
        Model       *string `json:"model"`
        Temperature float64 `json:"temperature"`
        MaxTokens   int     `json:"maxTokens"`
        IsActive    bool    `json:"isActive"`
        Priority    int     `json:"priority"`
        ExtraConfig *string `json:"extraConfig,omitempty"`
        Capability  *string `json:"capability,omitempty"`   // DASHSCOPE-AUDIO-1 : 'chat' (défaut), 'tts', 'audio'
        LastTestAt  *string `json:"lastTestAt,omitempty"`
        LastTestOk  *bool   `json:"lastTestOk,omitempty"`
        CreatedAt   string  `json:"createdAt"`
        UpdatedAt   string  `json:"updatedAt"`
}

// aiProviderInput est le body accepté par POST et PATCH.
// Tous les champs sont optionnels pour permettre la mise à jour partielle.
type aiProviderInput struct {
        Name        *string         `json:"name,omitempty"`
        Provider    *string         `json:"provider,omitempty"`
        BaseURL     *string         `json:"baseUrl,omitempty"`
        APIKey      *string         `json:"apiKey,omitempty"`
        Model       *string         `json:"model,omitempty"`
        Temperature *float64        `json:"temperature,omitempty"`
        MaxTokens   *int            `json:"maxTokens,omitempty"`
        ExtraConfig json.RawMessage `json:"extraConfig,omitempty"`
        Capability  *string         `json:"capability,omitempty"`   // DASHSCOPE-AUDIO-1
}

// failoverConfig est la config stockée dans PlatformSettings(id='ai_failover_config').
type failoverConfig struct {
        Enabled                bool `json:"enabled"`
        MaxConsecutiveFailures int  `json:"maxConsecutiveFailures"`
        CooldownDurationMs     int  `json:"cooldownDurationMs"`
        RetryAllProviders      bool `json:"retryAllProviders"`
}

// defaultFailoverConfig retourne les valeurs par défaut (config absente en DB).
func defaultFailoverConfig() failoverConfig {
        return failoverConfig{
                Enabled:                true,
                MaxConsecutiveFailures: 3,
                CooldownDurationMs:     60_000,
                RetryAllProviders:      false,
        }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

// normalizeExtraConfig transforme le JSON brut reçu du client en chaîne
// stockable en DB (colonne TEXT). Accepte string, object, null.
// Retourne nil si la valeur est vide ou null.
func normalizeExtraConfig(raw json.RawMessage) (*string, error) {
        if len(raw) == 0 || string(raw) == "null" {
                return nil, nil
        }
        // Si c'est une chaîne JSON ("..."), on la déquote.
        var s string
        if err := json.Unmarshal(raw, &s); err == nil {
                if s == "" {
                        return nil, nil
                }
                return &s, nil
        }
        // Sinon, on renvoie le JSON tel quel (objet, tableau, etc.).
        cleaned := strings.TrimSpace(string(raw))
        if cleaned == "" {
                return nil, nil
        }
        return &cleaned, nil
}

// scanProvider scan une ligne AIProviderConfig dans un aiProviderJSON.
// Inclut l'apiKey (à n'utiliser que pour GET /{id}).
func scanProviderWithKey(row pgx.Row) (aiProviderJSON, error) {
        p := aiProviderJSON{}
        var baseURL, apiKey, model, extraConfig *string
        var lastTestAt *time.Time
        var lastTestOk *bool
        var createdAt, updatedAt time.Time
        // DASHSCOPE-AUDIO-1 : COALESCE("capability", 'chat') dans le SELECT
        // garantit une valeur non-NULL. On scan dans un *string pour pouvoir
        // l'omettre du JSON si vide (bien que COALESCE produise toujours 'chat').
        if err := row.Scan(
                &p.ID, &p.Name, &p.Provider, &baseURL, &apiKey, &model,
                &p.Temperature, &p.MaxTokens, &p.IsActive, &p.Priority,
                &extraConfig, &p.Capability, &lastTestAt, &lastTestOk, &createdAt, &updatedAt,
        ); err != nil {
                return p, err
        }
        p.BaseURL = baseURL
        p.APIKey = apiKey
        p.HasAPIKey = apiKey != nil && *apiKey != ""
        p.Model = model
        p.ExtraConfig = extraConfig
        if lastTestAt != nil {
                ts := lastTestAt.UTC().Format(time.RFC3339)
                p.LastTestAt = &ts
        }
        p.LastTestOk = lastTestOk
        p.CreatedAt = createdAt.UTC().Format(time.RFC3339)
        p.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
        return p, nil
}

// scanProviderWithoutKey scan une ligne AIProviderConfig sans l'apiKey
// (pour la liste publique et les mutations POST/PATCH/DELETE).
// providerColumnsWithKey est la liste des colonnes lues par scanProviderWithKey.
// DASHSCOPE-AUDIO-1 : COALESCE("capability", 'chat') pour rétro-compatibilité
// (NULL → 'chat' côté Go, cohérent avec getActiveProviderShared et la migration 000035).
const providerColumnsWithKey = `"id", "name", "provider", "baseUrl", "apiKey", "model",
        "temperature", "maxTokens", "isActive", "priority",
        "extraConfig", COALESCE("capability", 'chat') AS "capability",
        "lastTestAt", "lastTestOk", "createdAt", "updatedAt"`

// requireAdminClaims vérifie que la requête est authentifiée en tant qu'ADMIN.
// Retourne (claims, true) si OK, sinon écrit une erreur et retourne (zero, false).
func (s *Server) requireAdminClaims(w http.ResponseWriter, r *http.Request) (appdb.SessionClaims, bool) {
        claims, ok := middleware.ClaimsFromContext(r.Context())
        if !ok || claims.UserID == "" {
                writeJSONError(w, http.StatusUnauthorized, "authentication required")
                return appdb.SessionClaims{}, false
        }
        if claims.Role != "ADMIN" {
                writeJSONError(w, http.StatusForbidden, "admin privileges required")
                return appdb.SessionClaims{}, false
        }
        return claims, true
}

// httpTimeoutClient est un client HTTP avec un timeout court pour les
// appels test/models vers les APIs externes (OpenAI, Anthropic, etc.).
var httpTimeoutClient = &http.Client{Timeout: 15 * time.Second}

// fetchProviderModels appelle GET {baseUrl}/models avec Authorization: Bearer {apiKey}.
// Retourne la liste des IDs de modèles. Pour ZAI (sans baseUrl), retourne
// une liste vide sans erreur (le frontend retombera sur PROVIDER_MODELS['ZAI']).
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
        body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1 MiB max
        if resp.StatusCode >= 400 {
                return nil, fmt.Errorf("provider returned HTTP %d", resp.StatusCode)
        }
        // Format OpenAI-compatible : { data: [{ id: "gpt-4o", ... }] }
        var parsed struct {
                Data []struct {
                        ID string `json:"id"`
                } `json:"data"`
        }
        if err := json.Unmarshal(body, &parsed); err != nil {
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

// validateProviderInput valide les champs reçus par POST/PATCH /api/ai-providers.
// Retourne nil si valide, ou une erreur descriptive (bug #8 — audit ai-providers MEDIUM).
//
// Règles :
//   - name non vide
//   - provider dans {ZAI, OPENAI, OPENAI_COMPATIBLE, ANTHROPIC, GOOGLE} (case insensitive)
//   - baseURL : si non vide, doit commencer par http:// ou https://
//   - apiKey requis (non vide) pour les providers non-ZAI
//     (ZAI peut stocker l'apiKey dans extraConfig ; les autres non)
//   - model non vide
func validateProviderInput(name, provider, baseURL, apiKey, model string) error {
        if strings.TrimSpace(name) == "" {
                return fmt.Errorf("name requis")
        }
        upper := strings.ToUpper(strings.TrimSpace(provider))
        switch upper {
        case "ZAI", "OPENAI", "OPENAI_COMPATIBLE", "ANTHROPIC", "GOOGLE", "DASHSCOPE", "HUGGINGFACE":
                // OK (DASHSCOPE-AUDIO-1 : Alibaba Bailian ; HUGGINGFACE : Kokoro-82M via Space Gradio)
        default:
                return fmt.Errorf("provider invalide: %q (valeurs acceptées: ZAI, OPENAI, OPENAI_COMPATIBLE, ANTHROPIC, GOOGLE, DASHSCOPE, HUGGINGFACE)", provider)
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
// 1. POST /api/ai-providers — Create
// ──────────────────────────────────────────────────────────────────────────

// aiProviderCreate crée un nouveau AIProviderConfig avec un UUID frais.
// Body : { name, provider, baseUrl?, apiKey?, model?, temperature?, maxTokens?, extraConfig? }
func (s *Server) aiProviderCreate(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        var in aiProviderInput
        if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if in.Name == nil || strings.TrimSpace(*in.Name) == "" {
                writeJSONError(w, http.StatusBadRequest, "name requis")
                return
        }
        if in.Provider == nil || strings.TrimSpace(*in.Provider) == "" {
                writeJSONError(w, http.StatusBadRequest, "provider requis")
                return
        }

        // Bug #8 : valider les inputs avant l'INSERT.
        var baseURL, apiKey, model string
        if in.BaseURL != nil {
                baseURL = *in.BaseURL
        }
        if in.APIKey != nil {
                apiKey = *in.APIKey
        }
        if in.Model != nil {
                model = *in.Model
        }
        if err := validateProviderInput(*in.Name, *in.Provider, baseURL, apiKey, model); err != nil {
                writeJSONError(w, http.StatusBadRequest, err.Error())
                return
        }

        temperature := 0.7
        if in.Temperature != nil {
                temperature = *in.Temperature
        }
        maxTokens := 4096
        if in.MaxTokens != nil {
                maxTokens = *in.MaxTokens
        }
        extraConfig, err := normalizeExtraConfig(in.ExtraConfig)
        if err != nil {
                writeJSONError(w, http.StatusBadRequest, "extraConfig invalide")
                return
        }

        id := uuid.NewString()
        var created aiProviderJSON
        err = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // Calcule la priorité = max+1 pour que le nouveau provider soit en dernier.
                var maxPriority int
                _ = tx.QueryRow(r.Context(), `SELECT COALESCE(MAX("priority"), 0) FROM "AIProviderConfig"`).Scan(&maxPriority)
                priority := maxPriority + 1

                // DASHSCOPE-AUDIO-1 : on insère aussi la colonne "capability" si
                // fournie (sinon NULL → traité comme 'chat' côté Go via COALESCE).
                row := tx.QueryRow(r.Context(), `
                        INSERT INTO "AIProviderConfig"
                                ("id", "name", "provider", "baseUrl", "apiKey", "model",
                                 "temperature", "maxTokens", "isActive", "priority",
                                 "extraConfig", "capability", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, NOW(), NOW())
                        RETURNING `+providerColumnsWithKey,
                        id, strings.TrimSpace(*in.Name), strings.TrimSpace(*in.Provider),
                        in.BaseURL, in.APIKey, in.Model,
                        temperature, maxTokens, priority, extraConfig, in.Capability,
                )
                p, err := scanProviderWithKey(row)
                if err != nil {
                        return err
                }
                // Le handler POST ne doit pas révéler l'apiKey (seul GET /{id} le fait).
                p.APIKey = nil
                created = p
                return nil
        })
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur lors de la création: "+err.Error())
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]any{"provider": created})
}

// ──────────────────────────────────────────────────────────────────────────
// 2. GET /api/ai-providers/{id} — Get one (avec apiKey pour édition admin)
// ──────────────────────────────────────────────────────────────────────────

// aiProviderGet retourne un provider par ID, INCLUANT l'apiKey (édition admin).
func (s *Server) aiProviderGet(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        id := chi.URLParam(r, "id")
        if id == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        var provider aiProviderJSON
        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(r.Context(), `
                        SELECT `+providerColumnsWithKey+`
                        FROM "AIProviderConfig" WHERE "id" = $1`, id)
                p, err := scanProviderWithKey(row)
                if err != nil {
                        return err
                }
                provider = p
                return nil
        })
        if err != nil {
                if err == pgx.ErrNoRows {
                        writeJSONError(w, http.StatusNotFound, "provider introuvable")
                        return
                }
                writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"provider": provider})
}

// ──────────────────────────────────────────────────────────────────────────
// 3. PATCH /api/ai-providers/{id} — Update partiel
// ──────────────────────────────────────────────────────────────────────────

// aiProviderUpdate met à jour partiellement un provider.
// Si apiKey est vide/absent, ne pas l'écraser.
func (s *Server) aiProviderUpdate(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        id := chi.URLParam(r, "id")
        if id == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        var in aiProviderInput
        if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }

        // Construire dynamiquement la clause SET selon les champs fournis.
        setParts := []string{`"updatedAt" = NOW()`}
        args := []any{}
        argIdx := 1
        addStr := func(col string, v *string) {
                if v != nil {
                        setParts = append(setParts, fmt.Sprintf(`%s = $%d`, col, argIdx))
                        args = append(args, *v)
                        argIdx++
                }
        }
        addStr(`"name"`, in.Name)
        addStr(`"provider"`, in.Provider)
        addStr(`"baseUrl"`, in.BaseURL)
        // apiKey : si fourni ET non vide, on l'écrase.
        if in.APIKey != nil && strings.TrimSpace(*in.APIKey) != "" {
                setParts = append(setParts, fmt.Sprintf(`"apiKey" = $%d`, argIdx))
                args = append(args, *in.APIKey)
                argIdx++
        }
        addStr(`"model"`, in.Model)
        // DASHSCOPE-AUDIO-1 : capability optionnelle (NULL → 'chat' côté Go).
        addStr(`"capability"`, in.Capability)
        if in.Temperature != nil {
                setParts = append(setParts, fmt.Sprintf(`"temperature" = $%d`, argIdx))
                args = append(args, *in.Temperature)
                argIdx++
        }
        if in.MaxTokens != nil {
                setParts = append(setParts, fmt.Sprintf(`"maxTokens" = $%d`, argIdx))
                args = append(args, *in.MaxTokens)
                argIdx++
        }
        if len(in.ExtraConfig) > 0 {
                ec, err := normalizeExtraConfig(in.ExtraConfig)
                if err != nil {
                        writeJSONError(w, http.StatusBadRequest, "extraConfig invalide")
                        return
                }
                setParts = append(setParts, fmt.Sprintf(`"extraConfig" = $%d`, argIdx))
                args = append(args, ec)
                argIdx++
        }

        args = append(args, id)
        query := fmt.Sprintf(`UPDATE "AIProviderConfig" SET %s WHERE "id" = $%d RETURNING `+providerColumnsWithKey,
                strings.Join(setParts, ", "), argIdx)

        var updated aiProviderJSON
        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(r.Context(), query, args...)
                p, err := scanProviderWithKey(row)
                if err != nil {
                        return err
                }
                p.APIKey = nil // ne pas révéler l'apiKey sur PATCH
                updated = p
                return nil
        })
        if err != nil {
                if err == pgx.ErrNoRows {
                        writeJSONError(w, http.StatusNotFound, "provider introuvable")
                        return
                }
                writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{"provider": updated})
}

// ──────────────────────────────────────────────────────────────────────────
// 4. DELETE /api/ai-providers/{id} — Delete
// ──────────────────────────────────────────────────────────────────────────

// aiProviderDelete supprime un provider de la DB.
// Bug #20 : refuse de supprimer un provider actuellement actif (sinon
// l'application se retrouve sans provider IA). L'admin doit d'abord
// activer un autre provider (POST /api/ai-providers/activate) ou désactiver
// celui-ci via PATCH { isActive: false } (si jamais le front l'expose).
func (s *Server) aiProviderDelete(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        id := chi.URLParam(r, "id")
        if id == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        // Bug #20 : lire isActive AVANT de tenter le DELETE pour pouvoir
        // renvoyer un 409 Conflict clair (plutôt qu'une erreur 500 générique).
        var isActive bool
        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                return tx.QueryRow(r.Context(),
                        `SELECT "isActive" FROM "AIProviderConfig" WHERE "id" = $1`, id,
                ).Scan(&isActive)
        })
        if err != nil {
                if err == pgx.ErrNoRows {
                        writeJSONError(w, http.StatusNotFound, "provider introuvable")
                        return
                }
                writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
                return
        }
        if isActive {
                writeJSONError(w, http.StatusConflict,
                        "cannot delete active provider — deactivate or activate another first")
                return
        }

        var deletedID string
        err = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                tag, err := tx.Exec(r.Context(), `DELETE FROM "AIProviderConfig" WHERE "id" = $1`, id)
                if err != nil {
                        return err
                }
                if tag.RowsAffected() == 0 {
                        return pgx.ErrNoRows
                }
                deletedID = id
                return nil
        })
        if err != nil {
                if err == pgx.ErrNoRows {
                        writeJSONError(w, http.StatusNotFound, "provider introuvable")
                        return
                }
                writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "success": true,
                "message": "provider supprimé",
                "id":      deletedID,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 5. POST /api/ai-providers/activate — Active un provider
// ──────────────────────────────────────────────────────────────────────────

// aiProviderActivate désactive tous les autres providers et active celui-ci.
// Body : { providerId }
func (s *Server) aiProviderActivate(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        var body struct {
                ProviderID string `json:"providerId"`
        }
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if strings.TrimSpace(body.ProviderID) == "" {
                writeJSONError(w, http.StatusBadRequest, "providerId requis")
                return
        }

        var activatedName string
        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // Désactive tous les providers.
                if _, err := tx.Exec(r.Context(), `UPDATE "AIProviderConfig" SET "isActive" = false, "updatedAt" = NOW()`); err != nil {
                        return err
                }
                // Active celui-ci et récupère son nom.
                err := tx.QueryRow(r.Context(),
                        `UPDATE "AIProviderConfig" SET "isActive" = true, "updatedAt" = NOW()
                         WHERE "id" = $1 RETURNING "name"`, body.ProviderID,
                ).Scan(&activatedName)
                if err != nil {
                        return err
                }
                return nil
        })
        if err != nil {
                if err == pgx.ErrNoRows {
                        writeJSONError(w, http.StatusNotFound, "provider introuvable")
                        return
                }
                writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "success": true,
                "message": fmt.Sprintf("Provider « %s » activé", activatedName),
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 6. GET/POST /api/ai-providers/{id}/test — Test de connexion
// ──────────────────────────────────────────────────────────────────────────

// aiProviderTest teste la connexion au provider via un GET {baseUrl}/models
// (ou un simple chat minimal). Met à jour lastTestAt et lastTestOk.
func (s *Server) aiProviderTest(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        id := chi.URLParam(r, "id")
        if id == "" {
                writeJSONError(w, http.StatusBadRequest, "id requis")
                return
        }

        // 1. Lire le provider (avec apiKey + extraConfig pour faire l'appel test).
        var provider, baseURL, apiKey, model string
        var providerType, extraConfig string
        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(r.Context(), `
                        SELECT "id", "name", "provider", COALESCE("baseUrl", ''), COALESCE("apiKey", ''), COALESCE("model", ''), COALESCE("extraConfig", '')
                        FROM "AIProviderConfig" WHERE "id" = $1`, id)
                return row.Scan(&id, &provider, &providerType, &baseURL, &apiKey, &model, &extraConfig)
        })
        if err != nil {
                if err == pgx.ErrNoRows {
                        writeJSONError(w, http.StatusNotFound, "provider introuvable")
                        return
                }
                writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
                return
        }

        // Bug #2 : fusionner extraConfig (ZAI stocke apiKey dans extraConfig).
        if extraConfig != "" {
                var ec struct {
                        APIKey  string `json:"apiKey"`
                        BaseURL string `json:"baseUrl"`
                }
                if jsonErr := json.Unmarshal([]byte(extraConfig), &ec); jsonErr == nil {
                        if apiKey == "" && ec.APIKey != "" {
                                apiKey = ec.APIKey
                        }
                        if baseURL == "" && ec.BaseURL != "" {
                                baseURL = ec.BaseURL
                        }
                }
        }

        // 2. Tester la connexion (HTTP externe, hors transaction).
        // Bug #4 (HIGH) : ZAI n'avait qu'un test simulé → faux succès. Maintenant
        // on fait un mini chat completion réel pour valider apiKey + baseUrl + model.
        success := true
        message := "Connexion réussie"
        if baseURL == "" {
                success = false
                message = "baseUrl non configuré (vérifiez extraConfig pour ZAI)"
        } else if apiKey == "" {
                success = false
                message = "apiKey non configurée (vérifiez extraConfig pour ZAI)"
        } else if providerType == "ZAI" || providerType == "OPENAI" || providerType == "OPENAI_COMPATIBLE" {
                // Mini chat completion réel : valide apiKey + baseUrl + model en une requête.
                if err := testChatCompletion(baseURL, apiKey, model); err != nil {
                        success = false
                        message = "Échec : " + err.Error()
                } else {
                        message = provider + " : chat completion de test réussi (model=" + model + ")"
                }
        } else if providerType == "DASHSCOPE" {
                // DASHSCOPE-AUDIO-1 : DashScope (Alibaba Bailian / Model Studio).
                // Pour un provider DASHSCOPE configuré en capability='chat' (ex:
                // qwen-plus via /compatible-mode/v1/chat/completions), un mini chat
                // completion suffit pour valider apiKey + baseUrl + model.
                //
                // NOTE : si le provider DASHSCOPE est configuré en capability='tts'
                // (modèle qwen3-tts-flash sur /api/v1/services/audio/tts), ce test
                // échouera car l'endpoint /chat/completions n'existe pas pour les
                // modèles TTS. L'admin devra valider la config TTS via un appel
                // podcast réel (POST /api/exam-prep/documents/{id}/audio). À
                // améliorer dans une future itération avec un test TTS dédié.
                if err := testChatCompletion(baseURL, apiKey, model); err != nil {
                        success = false
                        message = "Échec (TTS-only DashScope ? voir commentaire) : " + err.Error()
                } else {
                        message = provider + " : chat completion de test réussi (model=" + model + ")"
                }
        } else if providerType == "ANTHROPIC" {
                // Anthropic : endpoint /messages au lieu de /chat/completions.
                if err := testAnthropicChat(baseURL, apiKey, model); err != nil {
                        success = false
                        message = "Échec : " + err.Error()
                } else {
                        message = provider + " : chat completion de test réussi (model=" + model + ")"
                }
        } else {
                // Autres providers : fallback sur GET /models.
                if _, err := fetchProviderModels(providerType, baseURL, apiKey); err != nil {
                        success = false
                        message = "Échec : " + err.Error()
                }
        }

        // 3. Mettre à jour lastTestAt / lastTestOk dans la DB.
        // Bug #11 : on garde le comportement tolerant (on répond quand même
        // succès/échec du test) MAIS on log l'erreur DB pour debug.
        if err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                _, err := tx.Exec(r.Context(),
                        `UPDATE "AIProviderConfig" SET "lastTestAt" = NOW(), "lastTestOk" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
                        id, success)
                return err
        }); err != nil {
                slog.Error("DB error in aiProviderTest", "error", err, "provider_id", id)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "success": success,
                "message": message,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 7. GET /api/ai-providers/models?providerId={id} — Liste des modèles
// ──────────────────────────────────────────────────────────────────────────

// aiProviderModels récupère la liste des modèles disponibles depuis l'API
// du provider (GET {baseUrl}/models avec Authorization: Bearer apiKey).
func (s *Server) aiProviderModels(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        providerID := r.URL.Query().Get("providerId")
        if providerID == "" {
                writeJSONError(w, http.StatusBadRequest, "providerId requis")
                return
        }

        var providerType, baseURL, apiKey string
        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                row := tx.QueryRow(r.Context(), `
                        SELECT "provider", COALESCE("baseUrl", ''), COALESCE("apiKey", '')
                        FROM "AIProviderConfig" WHERE "id" = $1`, providerID)
                return row.Scan(&providerType, &baseURL, &apiKey)
        })
        if err != nil {
                if err == pgx.ErrNoRows {
                        writeJSONError(w, http.StatusNotFound, "provider introuvable")
                        return
                }
                writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
                return
        }

        models, err := fetchProviderModels(providerType, baseURL, apiKey)
        if err != nil {
                // En cas d'erreur, on retourne une liste vide plutôt qu'un 500
                // (le frontend retombe sur PROVIDER_MODELS[providerType]).
                models = []string{}
        }
        if models == nil {
                models = []string{}
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "models": models,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 8. GET /api/ai-providers/failover/status — Statut complet du failover
// ──────────────────────────────────────────────────────────────────────────

// aiProviderFailoverStatus retourne le statut complet du failover :
// config, summary, providers (avec health), recentEvents.
func (s *Server) aiProviderFailoverStatus(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        type providerHealthJSON struct {
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

        type providerWithHealthJSON struct {
                ID         string              `json:"id"`
                Name       string              `json:"name"`
                Provider   string              `json:"provider"`
                Model      *string             `json:"model"`
                IsActive   bool                `json:"isActive"`
                Priority   int                 `json:"priority"`
                LastTestAt *string             `json:"lastTestAt"`
                LastTestOk *bool               `json:"lastTestOk"`
                Status     string              `json:"status"`
                Health     *providerHealthJSON `json:"health"`
        }

        type failoverEventJSON struct {
                ID           string  `json:"id"`
                EventType    string  `json:"eventType"`
                FromProvider *string `json:"fromProvider"`
                ToProvider   *string `json:"toProvider"`
                Reason       string  `json:"reason"`
                ErrorDetails *string `json:"errorDetails"`
                Resolved     bool    `json:"resolved"`
                CreatedAt    string  `json:"createdAt"`
        }

        type failoverSummaryJSON struct {
                TotalProviders  int  `json:"totalProviders"`
                Healthy         int  `json:"healthy"`
                Degraded        int  `json:"degraded"`
                CoolingDown     int  `json:"coolingDown"`
                FailoverEnabled bool `json:"failoverEnabled"`
                TotalCalls      int  `json:"totalCalls"`
                TotalFailovers  int  `json:"totalFailovers"`
                Last24hEvents   int  `json:"last24hEvents"`
        }

        cfg := defaultFailoverConfig()
        providers := []providerWithHealthJSON{}
        recentEvents := []failoverEventJSON{}
        totalFailovers := 0
        last24hEvents := 0

        // Bug #11 : on garde le comportement tolerant (on répond toujours
        // avec ce qu'on a pu lire) MAIS on log l'erreur DB pour debug.
        if err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                // 1. Lire la config failover depuis PlatformSettings(id='ai_failover_config').
                var cfgJSON *string
                _ = tx.QueryRow(r.Context(),
                        `SELECT "settings" FROM "PlatformSettings" WHERE "id" = 'ai_failover_config'`,
                ).Scan(&cfgJSON)
                if cfgJSON != nil {
                        _ = json.Unmarshal([]byte(*cfgJSON), &cfg)
                }

                // 2. Lister tous les providers.
                rows, err := tx.Query(r.Context(), `
                        SELECT "id", "name", "provider", "model", "isActive", "priority",
                               "lastTestAt", "lastTestOk"
                        FROM "AIProviderConfig" ORDER BY "priority" ASC`)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        p := providerWithHealthJSON{}
                        var lastTestAt *time.Time
                        if err := rows.Scan(&p.ID, &p.Name, &p.Provider, &p.Model,
                                &p.IsActive, &p.Priority, &lastTestAt, &p.LastTestOk); err != nil {
                                return err
                        }
                        if lastTestAt != nil {
                                ts := lastTestAt.UTC().Format(time.RFC3339)
                                p.LastTestAt = &ts
                        }

                        // Détermine le status.
                        healthy := p.LastTestOk != nil && *p.LastTestOk
                        coolingDown := false // pas de cooldown implémenté pour l'instant
                        switch {
                        case coolingDown:
                                p.Status = "COOLING_DOWN"
                        case healthy:
                                p.Status = "HEALTHY"
                        default:
                                p.Status = "DEGRADED"
                        }

                        // Construit l'objet health.
                        health := &providerHealthJSON{
                                ProviderID:    p.ID,
                                ProviderName:  p.Name,
                                IsCoolingDown: coolingDown,
                        }
                        if lastTestAt != nil {
                                ms := lastTestAt.UnixMilli()
                                health.TotalCalls = 1
                                if healthy {
                                        health.LastSuccessAt = &ms
                                } else {
                                        health.LastFailureAt = &ms
                                        health.ConsecutiveFailures = 1
                                        health.TotalFailures = 1
                                }
                        }
                        p.Health = health
                        providers = append(providers, p)
                }
                if err := rows.Err(); err != nil {
                        return err
                }

                // 3. Compter les événements de failover (total + 24h).
                _ = tx.QueryRow(r.Context(),
                        `SELECT COUNT(*) FROM "AIFailoverEvent"`).Scan(&totalFailovers)
                _ = tx.QueryRow(r.Context(),
                        `SELECT COUNT(*) FROM "AIFailoverEvent" WHERE "createdAt" >= NOW() - INTERVAL '24 hours'`).Scan(&last24hEvents)

                // 4. Récupérer les 20 derniers événements.
                evRows, err := tx.Query(r.Context(), `
                        SELECT "id", "eventType", "fromProvider", "toProvider",
                               "reason", "errorDetails", "resolved", "createdAt"
                        FROM "AIFailoverEvent"
                        ORDER BY "createdAt" DESC
                        LIMIT 20`)
                if err != nil {
                        return err
                }
                defer evRows.Close()
                for evRows.Next() {
                        e := failoverEventJSON{}
                        var createdAt time.Time
                        if err := evRows.Scan(&e.ID, &e.EventType, &e.FromProvider, &e.ToProvider,
                                &e.Reason, &e.ErrorDetails, &e.Resolved, &createdAt); err != nil {
                                return err
                        }
                        e.CreatedAt = createdAt.UTC().Format(time.RFC3339)
                        recentEvents = append(recentEvents, e)
                }
                return evRows.Err()
        }); err != nil {
                slog.Error("DB error in aiProviderFailoverStatus", "error", err)
        }

        // Calcule le summary.
        summary := failoverSummaryJSON{
                TotalProviders:  len(providers),
                FailoverEnabled: cfg.Enabled,
                TotalFailovers:  totalFailovers,
                Last24hEvents:   last24hEvents,
        }
        for _, p := range providers {
                switch p.Status {
                case "HEALTHY":
                        summary.Healthy++
                case "DEGRADED":
                        summary.Degraded++
                case "COOLING_DOWN":
                        summary.CoolingDown++
                }
                if p.Health != nil {
                        summary.TotalCalls += p.Health.TotalCalls
                }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "config":       cfg,
                "summary":      summary,
                "providers":    providers,
                "recentEvents": recentEvents,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 9. POST /api/ai-providers/failover/config — Sauver la config failover
// ──────────────────────────────────────────────────────────────────────────

// aiProviderFailoverConfig sauvegarde la config failover dans PlatformSettings
// avec l'id 'ai_failover_config'. Body : { enabled?, maxConsecutiveFailures?,
// cooldownDurationMs?, retryAllProviders? } (mise à jour partielle).
func (s *Server) aiProviderFailoverConfig(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        // On décode le body en map[string]json.RawMessage PUIS en struct, pour
        // pouvoir détecter les champs réellement fournis (sinon "false" et "absent"
        // sont indistinguables avec un struct Go).
        bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
        if err != nil {
                writeJSONError(w, http.StatusBadRequest, "body illisible")
                return
        }
        var raw map[string]json.RawMessage
        if err := json.Unmarshal(bodyBytes, &raw); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        var in failoverConfig
        _ = json.Unmarshal(bodyBytes, &in) // tolérant : champs manquants = zero

        // Charge la config existante puis merge.
        merged := defaultFailoverConfig()
        err = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                var existingJSON *string
                _ = tx.QueryRow(r.Context(),
                        `SELECT "settings" FROM "PlatformSettings" WHERE "id" = 'ai_failover_config'`,
                ).Scan(&existingJSON)
                if existingJSON != nil {
                        _ = json.Unmarshal([]byte(*existingJSON), &merged)
                }
                // Merge : seuls les champs fournis dans le body écrasent la config.
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

                settingsBytes, err := json.Marshal(merged)
                if err != nil {
                        return err
                }
                _, err = tx.Exec(r.Context(), `
                        INSERT INTO "PlatformSettings" ("id", "settings", "updatedAt")
                        VALUES ('ai_failover_config', $1, NOW())
                        ON CONFLICT ("id") DO UPDATE SET "settings" = EXCLUDED."settings", "updatedAt" = NOW()`,
                        string(settingsBytes))
                return err
        })
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "success": true,
                "config":  merged,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 10. POST /api/ai-providers/priority — Réordonner les priorités
// ──────────────────────────────────────────────────────────────────────────

// aiProviderPriority met à jour les priorités de tous les providers en une
// seule transaction. Body : { priorities: [{ id, priority }] }
func (s *Server) aiProviderPriority(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        var body struct {
                Priorities []struct {
                        ID       string `json:"id"`
                        Priority int    `json:"priority"`
                } `json:"priorities"`
        }
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                writeJSONError(w, http.StatusBadRequest, "JSON invalide")
                return
        }
        if len(body.Priorities) == 0 {
                writeJSONError(w, http.StatusBadRequest, "priorities requis")
                return
        }

        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                for _, p := range body.Priorities {
                        if p.ID == "" {
                                continue
                        }
                        if _, err := tx.Exec(r.Context(),
                                `UPDATE "AIProviderConfig" SET "priority" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
                                p.ID, p.Priority); err != nil {
                                return err
                        }
                }
                return nil
        })
        if err != nil {
                writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "success": true,
                "message": "priorités mises à jour",
        })
}

// ──────────────────────────────────────────────────────────────────────────
// 11. GET/POST /api/ai-providers/failover/health — Healthcheck
// ──────────────────────────────────────────────────────────────────────────

// aiProviderFailoverHealth :
//   - GET  : retourne un healthcheck simplifié { healthy, providers: [{id,name,healthy}] }
//   - POST : body { resetAll: true } → reset lastTestAt/lastTestOk pour tous les providers.
func (s *Server) aiProviderFailoverHealth(w http.ResponseWriter, r *http.Request) {
        claims, ok := s.requireAdminClaims(w, r)
        if !ok {
                return
        }

        // POST + resetAll : réinitialise les compteurs de santé.
        if r.Method == http.MethodPost {
                var body struct {
                        ResetAll bool `json:"resetAll"`
                }
                // Body optionnel : on tente de décoder, en ignorant les erreurs.
                _ = json.NewDecoder(r.Body).Decode(&body)
                if body.ResetAll {
                        err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                                _, err := tx.Exec(r.Context(),
                                        `UPDATE "AIProviderConfig" SET "lastTestAt" = NULL, "lastTestOk" = NULL, "updatedAt" = NOW()`)
                                return err
                        })
                        if err != nil {
                                writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
                                return
                        }
                }
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]any{
                        "success": true,
                        "message": "santé réinitialisée",
                })
                return
        }

        // GET : healthcheck simplifié.
        type providerHealth struct {
                ID      string `json:"id"`
                Name    string `json:"name"`
                Healthy bool   `json:"healthy"`
        }
        providers := []providerHealth{}
        allHealthy := true
        // Bug #11 : on garde le comportement tolerant (on répond toujours
        // avec ce qu'on a pu lire, même vide) MAIS on log l'erreur DB pour debug.
        if err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
                rows, err := tx.Query(r.Context(), `
                        SELECT "id", "name", "lastTestOk" FROM "AIProviderConfig" ORDER BY "priority" ASC`)
                if err != nil {
                        return err
                }
                defer rows.Close()
                for rows.Next() {
                        p := providerHealth{}
                        var lastTestOk *bool
                        if err := rows.Scan(&p.ID, &p.Name, &lastTestOk); err != nil {
                                return err
                        }
                        // Healthy si pas encore testé OU dernier test OK.
                        p.Healthy = lastTestOk == nil || *lastTestOk
                        if !p.Healthy {
                                allHealthy = false
                        }
                        providers = append(providers, p)
                }
                return rows.Err()
        }); err != nil {
                slog.Error("DB error in aiProviderFailoverHealth", "error", err)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
                "healthy":   allHealthy,
                "providers": providers,
        })
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers de test de connexion IA (bug #4)
// ──────────────────────────────────────────────────────────────────────────

// testChatCompletion fait un mini chat completion réel vers un provider
// OpenAI-compatible (ZAI, OpenAI, Mistral, Groq, OpenRouter…).
// Valide apiKey + baseUrl + model en une seule requête HTTP.
// Timeout 15s pour ne pas bloquer l'UI admin.
func testChatCompletion(baseURL, apiKey, model string) error {
        body := map[string]interface{}{
                "model":       model,
                "messages":    []map[string]string{{"role": "user", "content": "ping"}},
                "max_tokens":  5, // minimal pour réduire le coût
                "temperature": 0,
        }
        bodyJSON, err := json.Marshal(body)
        if err != nil {
                return fmt.Errorf("marshal request: %w", err)
        }

        url := strings.TrimRight(baseURL, "/") + "/chat/completions"
        client := &http.Client{Timeout: 15 * time.Second}
        req, err := http.NewRequest("POST", url, strings.NewReader(string(bodyJSON)))
        if err != nil {
                return fmt.Errorf("build request: %w", err)
        }
        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("Authorization", "Bearer "+apiKey)

        resp, err := client.Do(req)
        if err != nil {
                return fmt.Errorf("HTTP error: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode >= 400 {
                body, _ := io.ReadAll(io.LimitReader(resp.Body, 500))
                return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
        }
        return nil
}

// testAnthropicChat fait un mini chat completion vers l'API Anthropic.
// Anthropic utilise /v1/messages avec headers x-api-key + anthropic-version.
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
        client := &http.Client{Timeout: 15 * time.Second}
        req, err := http.NewRequest("POST", url, strings.NewReader(string(bodyJSON)))
        if err != nil {
                return fmt.Errorf("build request: %w", err)
        }
        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("x-api-key", apiKey)
        req.Header.Set("anthropic-version", "2023-06-01")

        resp, err := client.Do(req)
        if err != nil {
                return fmt.Errorf("HTTP error: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode >= 400 {
                body, _ := io.ReadAll(io.LimitReader(resp.Body, 500))
                return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
        }
        return nil
}
