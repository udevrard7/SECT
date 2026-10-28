package worker

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/udevrard7/sect/backend/internal/ai"
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

// getActiveProviderShared lit le provider IA actif de capability='chat' depuis
// AIProviderConfig. Fonction partagée entre les workers TTS.
//
// MULTI-CAPABILITY : filtre sur COALESCE("capability",'chat')='chat' pour ne
// jamais retourner un provider tts/audio à un worker qui attend un chat LLM
// (OpenAI-compatible /chat/completions). Le worker audio utilise
// getActiveProviderByCapabilityShared pour le TTS dédié.
//
// Bug #2 (CRITICAL, audit ai-providers 2025) : extraConfig est maintenant lu
// et fusionné. Pour ZAI, l'apiKey est souvent dans extraConfig.apiKey.
//
// BUG #8 fix: retourne *ai.ActiveProvider au lieu du doublon aiProviderConfig.
func getActiveProviderShared(ctx context.Context, dbPool *pgxpool.Pool) (*ai.ActiveProvider, error) {
	tx, err := dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

	var p ai.ActiveProvider
	var extraConfig string
	// DASHSCOPE-AUDIO-1 : on lit aussi la colonne "capability" (NULL → 'chat').
	// Cette fonction retourne le 1er provider actif sans filtrer par
	// capability — utilisée par les workers TTS qui restent rétro-compatibles
	// avec les providers existants.
	err = tx.QueryRow(ctx, `
                SELECT "id", "name", "provider", "baseUrl", "apiKey", "model",
                       COALESCE("temperature", 0.7), COALESCE("maxTokens", 4096),
                       COALESCE("extraConfig", ''), COALESCE("capability", 'chat')
                FROM "AIProviderConfig"
                WHERE "isActive" = true AND COALESCE("capability", 'chat') = 'chat'
                ORDER BY "priority" ASC
                LIMIT 1
        `).Scan(&p.ID, &p.Name, &p.Provider, &p.BaseURL, &p.APIKey, &p.Model, &p.Temperature, &p.MaxTokens, &extraConfig, &p.Capability)
	if err != nil {
		return nil, fmt.Errorf("no active AI provider: %w", err)
	}

	_ = tx.Commit(ctx)

	// Bug #2 : fusionner extraConfig (ZAI stocke apiKey dans extraConfig).
	if extraConfig != "" {
		p.ExtraConfig = extraConfig // VOXTRAL-TTS-2 : stocker pour parsing ultérieur
		ec := ai.ParseExtraConfig(extraConfig)
		if ec.APIKey != "" && p.APIKey == "" {
			p.APIKey = ec.APIKey
		}
		if ec.BaseURL != "" && p.BaseURL == "" {
			p.BaseURL = ec.BaseURL
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
//
// BUG #8 fix: retourne *ai.ActiveProvider au lieu du doublon aiProviderConfig.
func getActiveProviderByCapabilityShared(ctx context.Context, dbPool *pgxpool.Pool, capability string) (*ai.ActiveProvider, error) {
	tx, err := dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, _ = tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)")

	var p ai.ActiveProvider
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

	_ = tx.Commit(ctx)

	// Fusionner extraConfig (ZAI stocke apiKey dans extraConfig).
	if extraConfig != "" {
		p.ExtraConfig = extraConfig // VOXTRAL-TTS-2 : stocker pour parsing ultérieur
		ec := ai.ParseExtraConfig(extraConfig)
		if ec.APIKey != "" && p.APIKey == "" {
			p.APIKey = ec.APIKey
		}
		if ec.BaseURL != "" && p.BaseURL == "" {
			p.BaseURL = ec.BaseURL
		}
	}

	return &p, nil
}

// BUG #8 fix: callAIProviderShared supprimé (code mort — plus appelé depuis
// que tous les workers utilisent aiService.ChatCompletion avec failover).
//
// SECT-TTS-3 : callTTSProviderShared supprimé à son tour — la synthèse des
// podcasts passe par tts.Service.SynthesePodcast (chaîne 0 coût
// Gemini duo studio → MeloTTS, Edge retiré SECT-TTS-4). Voxtral (payant) reste
// joignable en option premium via callVoxtralTTS (voxtral_tts.go),
// appelé directement par le worker audio.
