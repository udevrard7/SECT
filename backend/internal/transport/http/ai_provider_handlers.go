// Package http — handlers HTTP pour la gestion des AI providers (AI-PROVIDERS-1).
//
// Implémente les 11 endpoints REST pour la gestion des AI providers :
//
//	POST   /api/ai-providers               — créer un provider
//	GET    /api/ai-providers/{id}          — lire un provider (avec apiKey)
//	PATCH  /api/ai-providers/{id}          — mise à jour partielle
//	DELETE /api/ai-providers/{id}          — supprimer
//	POST   /api/ai-providers/activate      — activer un provider (désactive les autres)
//	GET/POST /api/ai-providers/{id}/test   — tester la connexion au provider
//	GET    /api/ai-providers/models        — lister les modèles disponibles
//	GET    /api/ai-providers/failover/status — statut complet du failover
//	POST   /api/ai-providers/failover/config — sauver la config failover
//	POST   /api/ai-providers/priority      — réordonner les priorités
//	GET/POST /api/ai-providers/failover/health — healthcheck (POST = reset)
//
// Tous les endpoints sont protégés par middleware.RequireAuth +
// middleware.RequireRole("ADMIN") (appliqués au niveau du router).
// Les transactions DB passent par appdb.WithTx pour poser les claims RLS.
package http

import (
	"encoding/json"
	"fmt"
	"io"
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
	if err := row.Scan(
		&p.ID, &p.Name, &p.Provider, &baseURL, &apiKey, &model,
		&p.Temperature, &p.MaxTokens, &p.IsActive, &p.Priority,
		&extraConfig, &lastTestAt, &lastTestOk, &createdAt, &updatedAt,
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
const providerColumnsWithKey = `"id", "name", "provider", "baseUrl", "apiKey", "model",
        "temperature", "maxTokens", "isActive", "priority",
        "extraConfig", "lastTestAt", "lastTestOk", "createdAt", "updatedAt"`

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

		row := tx.QueryRow(r.Context(), `
                        INSERT INTO "AIProviderConfig"
                                ("id", "name", "provider", "baseUrl", "apiKey", "model",
                                 "temperature", "maxTokens", "isActive", "priority",
                                 "extraConfig", "createdAt", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, NOW(), NOW())
                        RETURNING `+providerColumnsWithKey,
			id, strings.TrimSpace(*in.Name), strings.TrimSpace(*in.Provider),
			in.BaseURL, in.APIKey, in.Model,
			temperature, maxTokens, priority, extraConfig,
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

	var deletedID string
	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
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

	// 1. Lire le provider (avec apiKey pour faire l'appel test).
	var provider, baseURL, apiKey, model string
	var providerType string
	err := appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		row := tx.QueryRow(r.Context(), `
                        SELECT "id", "name", "provider", COALESCE("baseUrl", ''), COALESCE("apiKey", ''), COALESCE("model", '')
                        FROM "AIProviderConfig" WHERE "id" = $1`, id)
		return row.Scan(&id, &provider, &providerType, &baseURL, &apiKey, &model)
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			writeJSONError(w, http.StatusNotFound, "provider introuvable")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "erreur DB: "+err.Error())
		return
	}

	// 2. Tester la connexion (HTTP externe, hors transaction).
	success := true
	message := "Connexion réussie"
	if providerType == "ZAI" {
		// ZAI : pas d'endpoint /models public — on simule un succès.
		message = "Z-AI : test simulé (SDK natif, pas d'endpoint /models)"
	} else if baseURL == "" {
		success = false
		message = "baseUrl non configuré"
	} else {
		if _, err := fetchProviderModels(providerType, baseURL, apiKey); err != nil {
			success = false
			message = "Échec : " + err.Error()
		}
	}

	// 3. Mettre à jour lastTestAt / lastTestOk dans la DB.
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(),
			`UPDATE "AIProviderConfig" SET "lastTestAt" = NOW(), "lastTestOk" = $2, "updatedAt" = NOW() WHERE "id" = $1`,
			id, success)
		return err
	})

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

	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
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
	})

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
	_ = appdb.WithTx(r.Context(), s.dbPool, claims, func(tx pgx.Tx) error {
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
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"healthy":   allHealthy,
		"providers": providers,
	})
}
