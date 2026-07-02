// Package worker — adapter Mistral Voxtral TTS pour la synthèse vocale.
//
// VOXTRAL-TTS-1.
//
// Mistral propose 4 modèles TTS (voxtral-mini-tts-*) accessibles via l'endpoint
// OpenAI-compatible /v1/audio/speech. Contrairement à Kokoro (voix US) et
// MMS-TTS (pas d'Inference API), Voxtral :
//
//   - Voix française native (voice cloning à partir d'un audio de référence)
//   - Accessible via l'API Mistral standard (déjà configurée pour le chat)
//   - Pas besoin de Space Gradio dédié
//   - Réponse rapide (~5s pour 500 chars, 5x plus rapide que le temps réel)
//   - Format MP3 80kbps 22.05kHz mono
//
// Le voice cloning nécessite un `ref_audio` (audio de référence en base64).
// Les voix prédéfinies (Alma, Naila...) ne sont pas accessibles sur tous les
// comptes — on utilise donc le voice cloning avec un audio de référence
// français embarqué dans le code (voix féminine claire).
//
// Format de la requête :
//   POST {baseUrl}/audio/speech
//   Body : {"model":"voxtral-mini-tts-latest","input":"texte","ref_audio":"<base64>"}
//   Headers : Authorization: Bearer {apiKey}, Content-Type: application/json
//
// Format de la réponse :
//   JSON : {"audio_data":"<base64 MP3>"}
//   → décoder le base64 pour obtenir les bytes MP3.
//
// Le provider.BaseURL doit être l'host Mistral (https://api.mistral.ai/v1).
// Le provider.APIKey est le token Mistral.
// Le provider.Model doit être "voxtral-mini-tts-latest" (ou voxtral-mini-tts-2603).
package worker

import (
        "context"
        "encoding/base64"
        "encoding/json"
        "fmt"
        "io"
        "log/slog"
        "strings"
        "time"
)

// Voix de référence française pour le voice cloning Voxtral.
// C'est un court extrait audio (format WAV) encodé en base64.
// En production, on devrait stocker cet audio sur R2 et le télécharger
// dynamiquement — pour l'instant, on le récupère à la volée depuis le
// Space Neuphonic (audio juliette.wav, voix FR féminine).
//
// Si le téléchargement échoue, on retourne une erreur (pas de fallback).
const voxtralRefAudioURL = "https://neuphonic-neutts-nano-multilingual-collection.hf.space/gradio_api/file=/tmp/gradio/6b829891aee71927ff2d61497f782a9726bed4e1fac6b965becda39ac791b766/jo.wav"

// callVoxtralTTS synthétise du texte en MP3 via l'API Mistral Voxtral.
//
// VOXTRAL-TTS-1 : voice cloning avec un audio de référence français.
//
// Le provider doit avoir :
//   - BaseURL = "https://api.mistral.ai/v1"
//   - APIKey = token Mistral
//   - Model = "voxtral-mini-tts-latest"
//
// Retourne les bytes MP3.
func callVoxtralTTS(ctx context.Context, provider *aiProviderConfig, text string, logger *slog.Logger) ([]byte, error) {
        // Limiter à 8000 caractères (limite raisonnable pour une request).
        input := text
        if len(input) > 8000 {
                input = input[:8000]
                logger.Warn("Truncating podcast script to 8000 chars (Voxtral)", "originalLen", len(text))
        }

        // Récupérer l'audio de référence (voice cloning).
        // TODO: stocker cet audio sur R2 et le télécharger dynamiquement.
        // Pour l'instant, on le récupère depuis le Space Neuphonic.
        refAudioB64, err := fetchVoxtralRefAudio(ctx, logger)
        if err != nil {
                return nil, fmt.Errorf("fetch ref_audio: %w", err)
        }

        model := provider.Model
        if strings.TrimSpace(model) == "" {
                model = "voxtral-mini-tts-latest"
        }

        // Construire le payload.
        body := map[string]interface{}{
                "model":     model,
                "input":     input,
                "ref_audio": refAudioB64,
        }
        bodyJSON, err := json.Marshal(body)
        if err != nil {
                return nil, fmt.Errorf("marshal voxtral request: %w", err)
        }

        url := strings.TrimRight(provider.BaseURL, "/") + "/audio/speech"
        if logger != nil {
                logger.Info("Calling Mistral Voxtral TTS",
                        "url", url, "model", model, "inputLen", len(input))
        }

        httpCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
        defer cancel()

        req, err := newHTTPRequest(httpCtx, "POST", url, bodyJSON, provider.APIKey)
        if err != nil {
                return nil, fmt.Errorf("create voxtral request: %w", err)
        }

        resp, err := httpClient.Do(req)
        if err != nil {
                return nil, fmt.Errorf("voxtral request failed: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode != 200 {
                // Lire le body pour le message d'erreur (Mistral retourne du JSON).
                var errResp struct {
                        Object  string `json:"object"`
                        Message string `json:"message"`
                        Type    string `json:"type"`
                        Code    string `json:"code"`
                }
                _ = json.NewDecoder(resp.Body).Decode(&errResp)
                if errResp.Message != "" {
                        return nil, fmt.Errorf("voxtral HTTP %d: %s (%s)", resp.StatusCode, errResp.Message, errResp.Code)
                }
                return nil, fmt.Errorf("voxtral returned HTTP %d", resp.StatusCode)
        }

        // Voxtral retourne du JSON : {"audio_data":"<base64 MP3>"}
        var ttsResp struct {
                AudioData string `json:"audio_data"`
        }
        if err := json.NewDecoder(resp.Body).Decode(&ttsResp); err != nil {
                return nil, fmt.Errorf("decode voxtral response: %w", err)
        }

        if ttsResp.AudioData == "" {
                return nil, fmt.Errorf("voxtral returned empty audio_data")
        }

        // Décoder le base64 en bytes MP3.
        audioBytes, err := base64.StdEncoding.DecodeString(ttsResp.AudioData)
        if err != nil {
                return nil, fmt.Errorf("decode voxtral base64 audio: %w", err)
        }

        if len(audioBytes) == 0 {
                return nil, fmt.Errorf("voxtral returned empty audio after decode")
        }

        if logger != nil {
                // MP3 80kbps = 10KB/s
                totalDur := len(audioBytes) / 10000
                logger.Info("Voxtral TTS completed",
                        "audioBytes", len(audioBytes), "durationSec", totalDur, "format", "mp3")
        }

        return audioBytes, nil
}

// fetchVoxtralRefAudio télécharge l'audio de référence pour le voice cloning
// et le retourne en base64.
//
// VOXTRAL-TTS-1 : utilise un audio FR féminin (jo.wav du Space Neuphonic).
// En production, cet audio devrait être stocké sur R2 (sect-documents bucket).
func fetchVoxtralRefAudio(ctx context.Context, logger *slog.Logger) (string, error) {
        if logger != nil {
                logger.Info("Fetching Voxtral ref_audio", "url", voxtralRefAudioURL)
        }

        dlCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
        defer cancel()

        req, err := newHTTPRequest(dlCtx, "GET", voxtralRefAudioURL, nil, "")
        if err != nil {
                return "", fmt.Errorf("create ref_audio request: %w", err)
        }
        // Pas d'Authorization pour cet audio public.

        resp, err := httpClient.Do(req)
        if err != nil {
                return "", fmt.Errorf("fetch ref_audio: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode != 200 {
                return "", fmt.Errorf("ref_audio HTTP %d", resp.StatusCode)
        }

        audioBytes, err := io.ReadAll(resp.Body)
        if err != nil {
                return "", fmt.Errorf("read ref_audio: %w", err)
        }

        if len(audioBytes) == 0 {
                return "", fmt.Errorf("ref_audio empty")
        }

        // Encoder en base64.
        b64 := base64.StdEncoding.EncodeToString(audioBytes)
        if logger != nil {
                logger.Info("Ref_audio fetched", "bytes", len(audioBytes), "b64len", len(b64))
        }

        return b64, nil
}

// ttsAudioFormat retourne l'extension et le content-type pour le stockage R2
// en fonction du type de provider TTS.
//
// VOXTRAL-TTS-1 : Mistral Voxtral retourne du MP3 (96kbps 22.05kHz mono).
func ttsAudioFormat(provider *aiProviderConfig) (extension string, contentType string) {
        if provider == nil {
                return ".mp3", "audio/mpeg"
        }
        // Voxtral (Mistral) retourne du MP3.
        if strings.EqualFold(provider.Provider, "VOXTRAL") {
                return ".mp3", "audio/mpeg"
        }
        return ".mp3", "audio/mpeg"
}
