// Package ai fournit le service d'appel aux LLM externes (Mistral, Groq,
// OpenRouter, ZAI, etc.) en lisant la configuration du provider actif depuis
// la table « AIProviderConfig ».
//
// Le backend fait l'appel API vers le provider (jamais d'appel IA direct côté
// client). Le format attendu est OpenAI-compatible :
//
//      POST {baseUrl}/chat/completions
//      Headers: Authorization: Bearer {apiKey}
//      Body:    { "model", "messages", "temperature", "max_tokens" }
//
// Le provider actif est lu via « SELECT * FROM "AIProviderConfig" WHERE
// "isActive" = true AND capability='chat' LIMIT 1 ». La lecture se fait dans
// une transaction qui pose les claims system-worker pour RLS car le worker de
// fond (goroutine de flush, jobs hors-ligne, etc.) n'a pas de claims HTTP à
// poser.
package ai

import (
        "bufio"
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
//
// Bug #2 (CRITICAL, audit ai-providers 2025) : extraConfig est maintenant lu
// et fusionné via ApplyExtraConfig. Pour ZAI, l'apiKey est souvent dans
// extraConfig.apiKey (pas dans le champ apiKey de AIProviderConfig).
type activeProvider struct {
        ID          string
        Name        string
        Provider    string
        BaseURL     string
        APIKey      string
        Model       string
        Temperature float64
        MaxTokens   int
        ExtraConfig string
        Capability  string // DASHSCOPE-AUDIO-1 : 'chat' (défaut), 'tts', 'audio'
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
                // QUESTIONS-IA-LOW : timeout aligné sur le path async (5 min).
                // Avant : sync=180s, async=5min → le sync pouvait renvoyer 503 à
                // 180s alors que l'IA répondait à 200s (l'utilisateur réessayait →
                // double coût). Maintenant les 2 paths ont le même timeout 5min,
                // cohérent avec le frontend (AbortController 120-360s).
                client: &http.Client{Timeout: 5 * time.Minute},
        }
}

// ChatCompletion lit le provider actif depuis la DB puis fait l'appel API
// chat completion vers son endpoint OpenAI-compatible.
//
// Bug #3 (CRITICAL, audit ai-providers 2025) : utilise maintenant ChatWithFailover
// qui tente tous les providers actifs en ordre de priorité. Si le provider
// principal échoue (429/500/timeout), bascule automatiquement vers le suivant.
// Chaque échec est tracé dans AIFailoverEvent (bug #5).
//
// Étapes :
//  1. ChatWithFailover lit tous les providers actifs triés par priorité.
//  2. Tente chaque provider en ordre, bascule en cas d'échec.
//  3. Retourne le contenu textuel + le modèle utilisé du provider gagnant.
func (s *AIService) ChatCompletion(ctx context.Context, messages []ChatMessage) (*ChatResult, error) {
        if s == nil || s.dbPool == nil {
                return nil, fmt.Errorf("AIService non initialisé")
        }
        if len(messages) == 0 {
                return nil, fmt.Errorf("messages vides")
        }

        // Bug #3 : failover automatique. Si le provider principal échoue,
        // bascule vers les suivants dans l'ordre de priorité.
        result, err := s.ChatWithFailover(ctx, messages, nil)
        if err != nil {
                return nil, err
        }

        return &ChatResult{Content: result.Content, Model: result.Model}, nil
}

// ChatCompletionStream fait un appel streaming vers le provider actif.
// MESSAGERIE-STREAMING : pour chaque token reçu du provider, onChunk est
// appelé avec le contenu partiel accumulé (pas le delta seul — l'appelant
// peut directement afficher le contenu cumulé).
//
// Le provider doit supporter `stream: true` (OpenAI-compatible). Le parsing
// lit les lignes SSE `data: {...}` et extrait `choices[0].delta.content`.
// La ligne `data: [DONE]` termine le stream.
//
// Pas de failover en cours de streaming (si le provider échoue après le
// premier token, on remonte l'erreur). Le failover au démarrage est géré
// en lisant le provider actif principal (pas ChatWithFailover pour éviter
// la complexité de bascule en cours de streaming).
//
// Retourne le contenu complet accumulé + le modèle utilisé.
func (s *AIService) ChatCompletionStream(ctx context.Context, messages []ChatMessage, onChunk func(accumulatedContent string)) (*ChatResult, error) {
        if s == nil || s.dbPool == nil {
                return nil, fmt.Errorf("AIService non initialisé")
        }
        if len(messages) == 0 {
                return nil, fmt.Errorf("messages vides")
        }

        p, err := s.getActiveProvider(ctx)
        if err != nil {
                return nil, err
        }

        body := map[string]interface{}{
                "model":       p.Model,
                "messages":    messages,
                "temperature": p.Temperature,
                "max_tokens":  p.MaxTokens,
                "stream":      true,
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

        if resp.StatusCode >= 400 {
                respBody, _ := readResponseBody(resp)
                snippet := string(respBody)
                if len(snippet) > 300 {
                        snippet = snippet[:300] + "…"
                }
                return nil, fmt.Errorf("provider %s returned HTTP %d: %s", p.Name, resp.StatusCode, snippet)
        }

        // Lire le stream SSE ligne par ligne. Format OpenAI :
        //   data: {"choices":[{"delta":{"content":"Hello"}}]}
        //   data: {"choices":[{"delta":{"content":" world"}}]}
        //   data: [DONE]
        var accumulated strings.Builder
        scanner := bufio.NewScanner(resp.Body)
        // Augmenter le buffer max (un chunk peut être grand si le provider batche).
        scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

        for scanner.Scan() {
                line := scanner.Text()
                // Les lignes SSE commencent par "data: ". Les commentaires (": heartbeat")
                // et lignes vides sont ignorés.
                if !strings.HasPrefix(line, "data: ") {
                        continue
                }
                data := strings.TrimPrefix(line, "data: ")
                if data == "[DONE]" {
                        break
                }

                // Parser le chunk JSON.
                var chunk struct {
                        Model   string `json:"model"`
                        Choices []struct {
                                Delta struct {
                                        Content string `json:"content"`
                                } `json:"delta"`
                                FinishReason string `json:"finish_reason"`
                        } `json:"choices"`
                }
                if err := json.Unmarshal([]byte(data), &chunk); err != nil {
                        // Chunk malformé (rare) — on skip sans planter le stream.
                        continue
                }
                if len(chunk.Choices) == 0 {
                        continue
                }
                delta := chunk.Choices[0].Delta.Content
                if delta != "" {
                        accumulated.WriteString(delta)
                        if onChunk != nil {
                                onChunk(accumulated.String())
                        }
                }
        }

        if err := scanner.Err(); err != nil {
                // Si on a déjà accumulé du contenu, on le retourne (stream partiel).
                // Sinon on remonte l'erreur.
                if accumulated.Len() > 0 {
                        return &ChatResult{Content: accumulated.String(), Model: p.Model}, nil
                }
                return nil, fmt.Errorf("scan stream: %w", err)
        }

        content := accumulated.String()
        if content == "" {
                return nil, fmt.Errorf("provider %s: stream vide (aucun contenu reçu)", p.Name)
        }

        model := p.Model
        return &ChatResult{Content: content, Model: model}, nil
}

// getActiveProvider lit la ligne AIProviderConfig active de capability='chat'.
// MULTI-CAPABILITY : filtre sur COALESCE("capability",'chat')='chat' pour ne
// jamais retourner un provider tts/audio (Voxtral, etc.) à l'AIService qui ne
// fait que du chat completion OpenAI-compatible.
// Claims system-worker posés via set_config('app.claims.*') au début de la
// transaction : le worker de fond (goroutine sans claims HTTP) peut ainsi
// lire la config système.
func (s *AIService) getActiveProvider(ctx context.Context) (*activeProvider, error) {
        tx, err := s.dbPool.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                return nil, fmt.Errorf("begin tx: %w", err)
        }
        defer tx.Rollback(ctx) // safe après Commit (no-op)

        if _, err := tx.Exec(ctx, "SELECT set_config('app.claims.user_id', 'system-worker', true), set_config('app.claims.role', 'ADMIN', true)"); err != nil {
                return nil, fmt.Errorf("set system claims: %w", err)
        }

        const query = `
                SELECT "id", "name", "provider",
                       COALESCE("baseUrl", ''), COALESCE("apiKey", ''), COALESCE("model", ''),
                       COALESCE("temperature", 0.7), COALESCE("maxTokens", 4096),
                       COALESCE("extraConfig", '')
                FROM "AIProviderConfig"
                WHERE "isActive" = true AND COALESCE("capability", 'chat') = 'chat'
                ORDER BY "priority" ASC, "createdAt" ASC
                LIMIT 1`

        p := &activeProvider{}
        err = tx.QueryRow(ctx, query).Scan(
                &p.ID, &p.Name, &p.Provider,
                &p.BaseURL, &p.APIKey, &p.Model,
                &p.Temperature, &p.MaxTokens,
                &p.ExtraConfig,
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

        // Bug #2 (CRITICAL) : fusionner extraConfig (ZAI stocke apiKey dans extraConfig).
        // ApplyExtraConfig ne modifie que si le champ principal est vide.
        ec := ParseExtraConfig(p.ExtraConfig)
        if ec.APIKey != "" && p.APIKey == "" {
                p.APIKey = ec.APIKey
        }
        if ec.BaseURL != "" && p.BaseURL == "" {
                p.BaseURL = ec.BaseURL
        }

        // Defaults de secours si la DB contient des valeurs nulles / vides.
        if p.Model == "" {
                p.Model = "gpt-4o-mini"
        }
        if p.MaxTokens <= 0 {
                p.MaxTokens = 4096
        }
        // Validation finale : baseUrl et apiKey requis après fusion extraConfig.
        if p.BaseURL == "" {
                return nil, fmt.Errorf("provider %s (%s): baseUrl manquant (vérifiez extraConfig pour ZAI)", p.Name, p.Provider)
        }
        if p.APIKey == "" {
                return nil, fmt.Errorf("provider %s (%s): apiKey manquante (vérifiez extraConfig pour ZAI)", p.Name, p.Provider)
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

// newRequestWithContext crée une requête HTTP POST avec body JSON + Bearer auth.
// Utilisé par chatWithProvider dans failover.go.
func newRequestWithContext(ctx context.Context, method, url string, body []byte, apiKey string) (*http.Request, error) {
        req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
        if err != nil {
                return nil, err
        }
        req.Header.Set("Content-Type", "application/json")
        if apiKey != "" {
                req.Header.Set("Authorization", "Bearer "+apiKey)
        }
        return req, nil
}

// readResponseBody lit le corps de la réponse (limité à 8 MiB).
// Utilisé par chatWithProvider dans failover.go.
func readResponseBody(resp *http.Response) ([]byte, error) {
        return io.ReadAll(io.LimitReader(resp.Body, 8<<20))
}
