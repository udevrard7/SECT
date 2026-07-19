// Package http — handlers HTTP pour la gestion des AI providers (AI-PROVIDERS-1).
//
// Implémente les 11 endpoints REST pour la gestion des AI providers :
//
//	POST   /api/ai-providers               — créer un provider
//	GET    /api/ai-providers               — lister les providers
//	GET    /api/ai-providers/{id}          — lire un provider (avec apiKey)
//	PATCH  /api/ai-providers/{id}          — mise à jour partielle
//	DELETE /api/ai-providers/{id}          — supprimer
//	POST   /api/ai-providers/activate      — activer un provider
//	GET/POST /api/ai-providers/{id}/test   — tester la connexion au provider
//	GET    /api/ai-providers/models        — lister les modèles disponibles
//	GET    /api/ai-providers/failover/status — statut complet du failover
//	POST   /api/ai-providers/failover/config — sauver la config failover
//	POST   /api/ai-providers/priority      — réordonner les priorités
//	GET/POST /api/ai-providers/failover/health — healthcheck (POST = reset)
//
// Tous les endpoints sont protégés par middleware.RequireAuth +
// middleware.RequireRole("ADMIN") (appliqués au niveau du router).
// Les handlers délèguent toute la logique métier à AIProviderUseCase.
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
	"github.com/jackc/pgx/v5"
	appdb "github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/middleware"
	"github.com/udevrard7/sect/backend/internal/repository"
	"github.com/udevrard7/sect/backend/internal/usecase"
)

// ──────────────────────────────────────────────────────────────────────────
// Types JSON (HTTP concern — request/response shapes)
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
	Capability  *string `json:"capability,omitempty"`
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
	Capability  *string         `json:"capability,omitempty"`
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

// providerToJSON converts a repository.AIProvider to aiProviderJSON for the API response.
// includeAPIKey controls whether the apiKey is revealed (only for GET /{id}).
func providerToJSON(p *repository.AIProvider, includeAPIKey bool) aiProviderJSON {
	j := aiProviderJSON{
		ID:          p.ID,
		Name:        p.Name,
		Provider:    p.Provider,
		BaseURL:     p.BaseURL,
		Model:       p.Model,
		Temperature: p.Temperature,
		MaxTokens:   p.MaxTokens,
		IsActive:    p.IsActive,
		Priority:    p.Priority,
		ExtraConfig: p.ExtraConfig,
		Capability:  p.Capability,
		HasAPIKey:   p.APIKey != nil && *p.APIKey != "",
	}
	if includeAPIKey {
		j.APIKey = p.APIKey
	}
	if p.LastTestAt != nil {
		ts := p.LastTestAt.UTC().Format(time.RFC3339)
		j.LastTestAt = &ts
	}
	j.LastTestOk = p.LastTestOk
	if !p.CreatedAt.IsZero() {
		j.CreatedAt = p.CreatedAt.UTC().Format(time.RFC3339)
	}
	if !p.UpdatedAt.IsZero() {
		j.UpdatedAt = p.UpdatedAt.UTC().Format(time.RFC3339)
	}
	return j
}

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

// mapUseCaseError maps a usecase error to an appropriate HTTP status code.
func mapUseCaseError(err error) (int, string) {
	msg := err.Error()
	if err == pgx.ErrNoRows || strings.Contains(msg, "introuvable") {
		return http.StatusNotFound, msg
	}
	if strings.Contains(msg, "validation") || strings.Contains(msg, "invalide") || strings.Contains(msg, "requis") {
		return http.StatusBadRequest, msg
	}
	if strings.Contains(msg, "cannot delete active") || strings.Contains(msg, "Conflict") {
		return http.StatusConflict, msg
	}
	return http.StatusInternalServerError, msg
}

// ──────────────────────────────────────────────────────────────────────────
// 1. POST /api/ai-providers — Create
// ──────────────────────────────────────────────────────────────────────────

// aiProviderCreate crée un nouveau AIProviderConfig.
// Body : { name, provider, baseUrl?, apiKey?, model?, temperature?, maxTokens?, extraConfig?, capability? }
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

	input := usecase.AIProviderCreateInput{
		Name:        ptrStr(in.Name),
		Provider:    ptrStr(in.Provider),
		BaseURL:     in.BaseURL,
		APIKey:      in.APIKey,
		Model:       in.Model,
		Temperature: in.Temperature,
		MaxTokens:   in.MaxTokens,
		ExtraConfig: in.ExtraConfig,
		Capability:  in.Capability,
	}

	provider, err := s.aiProviderUC.Create(r.Context(), claims, input)
	if err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
		return
	}

	created := providerToJSON(provider, false) // POST: don't reveal apiKey

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

	provider, err := s.aiProviderUC.GetByID(r.Context(), claims, id)
	if err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
		return
	}

	j := providerToJSON(provider, true) // GET /{id}: include apiKey

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"provider": j})
}

// ──────────────────────────────────────────────────────────────────────────
// 3. PATCH /api/ai-providers/{id} — Update partiel
// ──────────────────────────────────────────────────────────────────────────

// aiProviderUpdate met à jour partiellement un provider.
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

	input := usecase.AIProviderUpdateInput{
		Name:        in.Name,
		Provider:    in.Provider,
		BaseURL:     in.BaseURL,
		APIKey:      in.APIKey,
		Model:       in.Model,
		Temperature: in.Temperature,
		MaxTokens:   in.MaxTokens,
		ExtraConfig: in.ExtraConfig,
		Capability:  in.Capability,
	}

	provider, err := s.aiProviderUC.Update(r.Context(), claims, id, input)
	if err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
		return
	}

	updated := providerToJSON(provider, false) // PATCH: don't reveal apiKey

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

	if err := s.aiProviderUC.Delete(r.Context(), claims, id); err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"message": "provider supprimé",
		"id":      id,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 5. POST /api/ai-providers/activate — Active un provider
// ──────────────────────────────────────────────────────────────────────────

// aiProviderActivate bascule l'état actif/inactif d'un provider.
// Body : { providerId, active? }
func (s *Server) aiProviderActivate(w http.ResponseWriter, r *http.Request) {
	claims, ok := s.requireAdminClaims(w, r)
	if !ok {
		return
	}

	var body struct {
		ProviderID string `json:"providerId"`
		Active     *bool  `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "JSON invalide")
		return
	}
	if strings.TrimSpace(body.ProviderID) == "" {
		writeJSONError(w, http.StatusBadRequest, "providerId requis")
		return
	}

	name, newState, err := s.aiProviderUC.Activate(r.Context(), claims, body.ProviderID, body.Active)
	if err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
		return
	}

	verb := "désactivé"
	if newState {
		verb = "activé"
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"message": fmt.Sprintf("Provider « %s » %s", name, verb),
		"active":  newState,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 6. GET/POST /api/ai-providers/{id}/test — Test de connexion
// ──────────────────────────────────────────────────────────────────────────

// aiProviderTest teste la connexion au provider.
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

	success, message, err := s.aiProviderUC.TestConnection(r.Context(), claims, id)
	if err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
		return
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

// aiProviderModels récupère la liste des modèles disponibles depuis l'API du provider.
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

	models, err := s.aiProviderUC.ListModels(r.Context(), claims, providerID)
	if err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"models": models,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 8. GET /api/ai-providers/failover/status — Statut complet du failover
// ──────────────────────────────────────────────────────────────────────────

// aiProviderFailoverStatus retourne le statut complet du failover.
func (s *Server) aiProviderFailoverStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := s.requireAdminClaims(w, r)
	if !ok {
		return
	}

	result, err := s.aiProviderUC.GetFailoverStatus(r.Context(), claims)
	if err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
		return
	}

	// Convert usecase result to JSON response shapes.
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
		Unknown         int  `json:"unknown"`
		CoolingDown     int  `json:"coolingDown"`
		FailoverEnabled bool `json:"failoverEnabled"`
		TotalCalls      int  `json:"totalCalls"`
		TotalFailovers  int  `json:"totalFailovers"`
		Last24hEvents   int  `json:"last24hEvents"`
	}

	// Convert providers.
	providers := make([]providerWithHealthJSON, 0, len(result.Providers))
	for _, p := range result.Providers {
		pj := providerWithHealthJSON{
			ID:         p.ID,
			Name:       p.Name,
			Provider:   p.Provider,
			Model:      p.Model,
			IsActive:   p.IsActive,
			Priority:   p.Priority,
			LastTestAt: p.LastTestAt,
			LastTestOk: p.LastTestOk,
			Status:     p.Status,
		}
		if p.Health != nil {
			pj.Health = &providerHealthJSON{
				ProviderID:          p.Health.ProviderID,
				ProviderName:        p.Health.ProviderName,
				ConsecutiveFailures: p.Health.ConsecutiveFailures,
				LastFailureAt:       p.Health.LastFailureAt,
				LastSuccessAt:       p.Health.LastSuccessAt,
				TotalCalls:          p.Health.TotalCalls,
				TotalFailures:       p.Health.TotalFailures,
				TotalFailovers:      p.Health.TotalFailovers,
				IsCoolingDown:       p.Health.IsCoolingDown,
			}
		}
		providers = append(providers, pj)
	}

	// Convert events.
	events := make([]failoverEventJSON, 0, len(result.RecentEvents))
	for _, e := range result.RecentEvents {
		events = append(events, failoverEventJSON{
			ID:           e.ID,
			EventType:    e.EventType,
			FromProvider: e.FromProvider,
			ToProvider:   e.ToProvider,
			Reason:       e.Reason,
			ErrorDetails: e.ErrorDetails,
			Resolved:     e.Resolved,
			CreatedAt:    e.CreatedAt.UTC().Format(time.RFC3339),
		})
	}

	// Convert summary.
	summary := failoverSummaryJSON{
		TotalProviders:  result.Summary.TotalProviders,
		Healthy:         result.Summary.Healthy,
		Degraded:        result.Summary.Degraded,
		Unknown:         result.Summary.Unknown,
		CoolingDown:     result.Summary.CoolingDown,
		FailoverEnabled: result.Summary.FailoverEnabled,
		TotalCalls:      result.Summary.TotalCalls,
		TotalFailovers:  result.Summary.TotalFailovers,
		Last24hEvents:   result.Summary.Last24hEvents,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"config":       result.Config,
		"summary":      summary,
		"providers":    providers,
		"recentEvents": events,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 9. POST /api/ai-providers/failover/config — Sauver la config failover
// ──────────────────────────────────────────────────────────────────────────

// aiProviderFailoverConfig sauvegarde la config failover dans PlatformSettings.
// Body : { enabled?, maxConsecutiveFailures?, cooldownDurationMs?, retryAllProviders? }
func (s *Server) aiProviderFailoverConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := s.requireAdminClaims(w, r)
	if !ok {
		return
	}

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

	result, err := s.aiProviderUC.SaveFailoverConfig(r.Context(), claims, raw)
	if err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"config":  result.Config,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// 10. POST /api/ai-providers/priority — Réordonner les priorités
// ──────────────────────────────────────────────────────────────────────────

// aiProviderPriority met à jour les priorités de tous les providers.
// Body : { priorities: [{ id, priority }] }
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

	items := make([]repository.PriorityItem, 0, len(body.Priorities))
	for _, p := range body.Priorities {
		if p.ID == "" {
			continue
		}
		items = append(items, repository.PriorityItem{ID: p.ID, Priority: p.Priority})
	}

	if err := s.aiProviderUC.UpdatePriorities(r.Context(), claims, items); err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
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
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.ResetAll {
			if err := s.aiProviderUC.ResetHealth(r.Context(), claims); err != nil {
				status, msg := mapUseCaseError(err)
				writeJSONError(w, status, msg)
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
	allHealthy, providers, err := s.aiProviderUC.GetHealth(r.Context(), claims)
	if err != nil {
		status, msg := mapUseCaseError(err)
		writeJSONError(w, status, msg)
		return
	}

	type providerHealth struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Healthy bool   `json:"healthy"`
	}
	result := make([]providerHealth, 0, len(providers))
	for _, p := range providers {
		result = append(result, providerHealth{
			ID:      p.ID,
			Name:    p.Name,
			Healthy: p.Healthy,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"healthy":   allHealthy,
		"providers": result,
	})
}

// ──────────────────────────────────────────────────────────────────────────
// Tiny helpers
// ──────────────────────────────────────────────────────────────────────────

// ptrStr returns the dereferenced string value if s is non-nil, or "".
func ptrStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// ensure aiProviderInput unused fields don't cause import issues
var _ = slog.Default
var _ = io.EOF
