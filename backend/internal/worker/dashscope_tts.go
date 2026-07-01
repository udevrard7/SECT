// Package worker — adapter DashScope (Alibaba Bailian / Model Studio) pour TTS.
//
// DASHSCOPE-AUDIO-1.
//
// DashScope expose les modèles TTS (qwen3-tts-flash, qwen3-tts-instruct-flash,
// etc.) via l'API native /api/v1/services/audio/tts, avec un format de requête
// et de réponse différent de l'OpenAI-compatible /audio/speech :
//   - Body : {"model":"qwen3-tts-flash","input":{"text":"..."},"parameters":{"voice":"Cherry","format":"mp3"}}
//   - Response : {"output":{"audio":"<base64>","request_id":"..."},"usage":{"input_tokens":...}}
//
// Le modèle et la voix sont lus depuis la config du provider (provider.Model
// pour le modèle ; si provider.Model est vide, fallback "qwen3-tts-flash").
// La voix par défaut est "Cherry" (voix féminine FR, la plus courante sur
// qwen3-tts-flash). Elle peut être surchargée via extraConfig.voice.
//
// Limite à 4000 caractères (cohérent avec callTTSProviderShared).
package worker

import (
        "context"
        "encoding/base64"
        "encoding/json"
        "fmt"
        "log/slog"
        "strings"
        "time"
)

// callDashScopeTTS synthétise du texte en MP3 via l'API native DashScope
// (Alibaba Bailian / Model Studio).
//
// DASHSCOPE-AUDIO-1 : DashScope expose les modèles TTS (qwen3-tts-flash,
// qwen3-tts-instruct-flash, etc.) via l'endpoint natif
// /api/v1/services/audio/tts, avec un format de requête et de réponse
// différent de l'OpenAI-compatible /audio/speech :
//   - Body : {"model":"qwen3-tts-flash","input":{"text":"..."},"parameters":{"voice":"Cherry","format":"mp3"}}
//   - Response : {"output":{"audio":"<base64>","request_id":"..."},"usage":{"input_tokens":...}}
//
// Le modèle et la voix sont lus depuis la config du provider (provider.Model
// pour le modèle ; si provider.Model est vide, fallback "qwen3-tts-flash").
// La voix par défaut est "Cherry" (voix féminine FR, la plus courante sur
// qwen3-tts-flash). Elle peut être surchargée via extraConfig.voice.
//
// Limite à 4000 caractères (cohérent avec callTTSProviderShared).
func callDashScopeTTS(ctx context.Context, provider *aiProviderConfig, text string, logger *slog.Logger) ([]byte, error) {
        // Tronquer à 4000 caractères.
        input := text
        if len(input) > 4000 {
                input = input[:4000]
        }

        // Modèle : provider.Model ou fallback "qwen3-tts-flash".
        model := provider.Model
        if strings.TrimSpace(model) == "" {
                model = "qwen3-tts-flash"
        }

        // Voix : "Cherry" par défaut (voix FR féminine qwen3-tts-flash).
        // Peut être surchargée via extraConfig.voice.
        voice := "Cherry"
        // (extraConfig n'est pas stocké dans aiProviderConfig — voir ia_worker.go.
        // Pour l'instant on garde la voix par défaut. Une évolution future
        // pourrait ajouter un champ Voice à aiProviderConfig.)

        body := map[string]interface{}{
                "model": model,
                "input": map[string]interface{}{
                        "text": input,
                },
                "parameters": map[string]interface{}{
                        "voice":  voice,
                        "format": "mp3",
                },
        }
        bodyJSON, err := json.Marshal(body)
        if err != nil {
                return nil, fmt.Errorf("marshal dashscope tts request: %w", err)
        }

        // URL : {BaseUrl}/api/v1/services/audio/tts
        // BaseUrl pour ce provider doit être l'host racine, ex:
        // https://ws-xxx.cn-beijing.maas.aliyuncs.com
        url := strings.TrimRight(provider.BaseURL, "/") + "/api/v1/services/audio/tts"
        if logger != nil {
                logger.Info("Calling DashScope TTS provider",
                        "url", url, "model", model, "voice", voice, "inputLen", len(input))
        }

        httpCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
        defer cancel()

        req, err := newHTTPRequest(httpCtx, "POST", url, bodyJSON, provider.APIKey)
        if err != nil {
                return nil, fmt.Errorf("create dashscope tts request: %w", err)
        }

        resp, err := httpClient.Do(req)
        if err != nil {
                return nil, fmt.Errorf("dashscope tts request failed: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode != 200 {
                // Lire le body pour le message d'erreur (DashScope retourne du JSON).
                var errResp struct {
                        Code      string `json:"code"`
                        Message   string `json:"message"`
                        RequestID string `json:"request_id"`
                }
                _ = json.NewDecoder(resp.Body).Decode(&errResp)
                if errResp.Message != "" {
                        return nil, fmt.Errorf("dashscope tts HTTP %d: %s (%s)", resp.StatusCode, errResp.Message, errResp.Code)
                }
                return nil, fmt.Errorf("dashscope tts returned HTTP %d", resp.StatusCode)
        }

        // DashScope retourne du JSON avec un champ output.audio en base64.
        var ttsResp struct {
                Output struct {
                        Audio     string `json:"audio"`
                        RequestID string `json:"request_id"`
                } `json:"output"`
                Usage struct {
                        InputTokens int `json:"input_tokens"`
                } `json:"usage"`
        }
        if err := json.NewDecoder(resp.Body).Decode(&ttsResp); err != nil {
                return nil, fmt.Errorf("decode dashscope tts response: %w", err)
        }

        if ttsResp.Output.Audio == "" {
                return nil, fmt.Errorf("dashscope tts returned empty audio (request_id=%s)", ttsResp.Output.RequestID)
        }

        // Décoder le base64 en bytes MP3.
        audioBytes, err := base64.StdEncoding.DecodeString(ttsResp.Output.Audio)
        if err != nil {
                return nil, fmt.Errorf("decode dashscope tts base64 audio: %w", err)
        }

        if len(audioBytes) == 0 {
                return nil, fmt.Errorf("dashscope tts returned empty audio after decode")
        }

        if logger != nil {
                logger.Info("DashScope TTS completed",
                        "audioBytes", len(audioBytes),
                        "requestId", ttsResp.Output.RequestID,
                        "inputTokens", ttsResp.Usage.InputTokens,
                )
        }

        return audioBytes, nil
}
