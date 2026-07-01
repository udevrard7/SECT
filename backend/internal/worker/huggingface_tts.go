// Package worker — adapter Hugging Face (Spaces Gradio) pour TTS.
//
// KOKORO-TTS-1.
//
// Contrairement à DashScope et OpenAI, Hugging Face n'héberge pas le modèle
// Kokoro-82M sur son Inference API. Le modèle est accessible via des Spaces
// Gradio qui exposent une API predict. Cet adapter implémente le protocole
// Gradio 4 :
//
//  1. POST {spaceHost}/gradio_api/call/predict
//     Body : {"data":[text, voice, speed]}
//     Response : {"event_id":"<uuid>"}
//
//  2. GET {spaceHost}/gradio_api/call/predict/{event_id} (SSE stream)
//     Response : "event: complete\ndata: [{\"url\":\"...\",\"path\":\"...\"}]\n\n"
//     (ou "event: error" en cas d'échec)
//
//  3. GET {spaceHost}/gradio_api/file={path} (avec Authorization: Bearer)
//     Response : bytes WAV (24kHz, 16-bit, mono)
//
// Le Space recommandé est Pendrokar/Kokoro-TTS (host: pendrokar-kokoro-tts.hf.space)
// qui expose l'API predict avec 3 inputs : [text, voice, speed].
//
// Le format de sortie est WAV (pas MP3). L'audio_worker adapte le content-type
// et l'extension R2 en fonction du provider (voir ttsAudioFormat).
//
// Voix par défaut : "af_heart" (voix féminine US, prononce correctement le
// français avec un léger accent). Kokoro-82M supporte aussi ff_siwis (FR)
// mais le Space Pendrokar ne l'inclut pas dans son dropdown.
//
// Limite à 4000 caractères (cohérent avec callTTSProviderShared).
package worker

import (
        "bufio"
        "context"
        "encoding/json"
        "fmt"
        "io"
        "log/slog"
        "net/http"
        "strings"
        "time"
)

// Voix par défaut pour Kokoro (Pendrokar/Kokoro-TTS).
// af_heart = voix féminine US, rend bien le français.
const defaultKokoroVoice = "af_heart"

// callHuggingFaceTTS synthétise du texte en WAV via un Space Gradio Hugging Face.
//
// KOKORO-TTS-1 : utilise le protocole Gradio 4 (POST + SSE + file download).
// Le provider.BaseURL doit contenir l'host du Space, ex:
// https://pendrokar-kokoro-tts.hf.space
//
// Le provider.APIKey est le token Hugging Face (hf_xxx) passé en Authorization
// Bearer (nécessaire car les Spaces peuvent être privés ou rate-limités).
//
// Retourne les bytes WAV (24kHz 16-bit mono).
func callHuggingFaceTTS(ctx context.Context, provider *aiProviderConfig, text string, logger *slog.Logger) ([]byte, error) {
        // Tronquer à 4000 caractères.
        input := text
        if len(input) > 4000 {
                input = input[:4000]
        }

        // Voix : af_heart par défaut (le Space Pendrokar ne supporte pas ff_siwis).
        voice := defaultKokoroVoice
        speed := 1.0

        // Étape 1 : POST /gradio_api/call/predict → obtenir un event_id.
        spaceHost := strings.TrimRight(provider.BaseURL, "/")
        predictURL := spaceHost + "/gradio_api/call/predict"

        body := map[string]interface{}{
                "data": []interface{}{input, voice, speed},
        }
        bodyJSON, err := json.Marshal(body)
        if err != nil {
                return nil, fmt.Errorf("marshal hf tts request: %w", err)
        }

        if logger != nil {
                logger.Info("Calling Hugging Face TTS (Gradio predict)",
                        "url", predictURL, "voice", voice, "speed", speed, "inputLen", len(input))
        }

        postCtx, postCancel := context.WithTimeout(ctx, 30*time.Second)
        defer postCancel()

        req, err := newHTTPRequest(postCtx, "POST", predictURL, bodyJSON, provider.APIKey)
        if err != nil {
                return nil, fmt.Errorf("create hf tts request: %w", err)
        }

        resp, err := httpClient.Do(req)
        if err != nil {
                return nil, fmt.Errorf("hf tts POST request failed: %w", err)
        }
        if resp.StatusCode != 200 {
                resp.Body.Close()
                return nil, fmt.Errorf("hf tts POST returned HTTP %d", resp.StatusCode)
        }

        var postResp struct {
                EventID string `json:"event_id"`
        }
        if err := json.NewDecoder(resp.Body).Decode(&postResp); err != nil {
                resp.Body.Close()
                return nil, fmt.Errorf("decode hf tts event_id: %w", err)
        }
        resp.Body.Close()

        if postResp.EventID == "" {
                return nil, fmt.Errorf("hf tts POST returned empty event_id")
        }

        if logger != nil {
                logger.Info("HF TTS event queued", "eventId", postResp.EventID)
        }

        // Étape 2 : GET /gradio_api/call/predict/{event_id} (SSE) → attendre le résultat.
        sseURL := predictURL + "/" + postResp.EventID
        sseCtx, sseCancel := context.WithTimeout(ctx, 3*time.Minute)
        defer sseCancel()

        // KOKORO-TTS-1 : on crée la requête GET SANS Content-Type (contrairement à
        // newHTTPRequest qui met application/json sur tous les requests). Le SSE
        // Gradio n'attend pas de Content-Type sur un GET, et certains proxies HF
        // rejettent les GET avec Content-Type: application/json.
        sseReq, err := http.NewRequestWithContext(sseCtx, "GET", sseURL, nil)
        if err != nil {
                return nil, fmt.Errorf("create hf sse request: %w", err)
        }
        sseReq.Header.Set("Authorization", "Bearer "+provider.APIKey)
        sseReq.Header.Set("Accept", "text/event-stream")

        sseResp, err := httpClient.Do(sseReq)
        if err != nil {
                return nil, fmt.Errorf("hf sse GET request failed: %w", err)
        }
        defer sseResp.Body.Close()

        if sseResp.StatusCode != 200 {
                return nil, fmt.Errorf("hf sse GET returned HTTP %d", sseResp.StatusCode)
        }

        // Lire le flux SSE ligne par ligne jusqu'à "event: complete" ou "event: error".
        // Format SSE :
        //   event: complete\n
        //   data: [{"path":"...","url":"..."}]\n
        //   \n
        scanner := bufio.NewScanner(sseResp.Body)
        scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024) // max 1MB par ligne

        var eventType string
        var dataLine string
        for scanner.Scan() {
                line := scanner.Text()
                if strings.HasPrefix(line, "event: ") {
                        eventType = strings.TrimPrefix(line, "event: ")
                } else if strings.HasPrefix(line, "data: ") {
                        dataLine = strings.TrimPrefix(line, "data: ")
                }
                // Une ligne vide marque la fin d'un event SSE.
                if line == "" && eventType != "" {
                        break
                }
        }

        if eventType == "error" {
                return nil, fmt.Errorf("hf tts gradio returned error event (data: %s)", dataLine)
        }
        if eventType != "complete" {
                return nil, fmt.Errorf("hf tts sse stream ended without complete event (last event: %q)", eventType)
        }
        if dataLine == "" {
                return nil, fmt.Errorf("hf tts sse complete event has no data")
        }

        // Parser le data : [{"path":"...","url":"...","orig_name":"audio.wav",...}]
        var results []struct {
                Path     string `json:"path"`
                URL      string `json:"url"`
                OrigName string `json:"orig_name"`
                MimeType string `json:"mime_type"`
        }
        if err := json.Unmarshal([]byte(dataLine), &results); err != nil {
                return nil, fmt.Errorf("decode hf tts sse data: %w (raw: %s)", err, truncate(dataLine, 200))
        }
        if len(results) == 0 {
                return nil, fmt.Errorf("hf tts sse returned empty data array")
        }
        result := results[0]
        if result.URL == "" {
                return nil, fmt.Errorf("hf tts sse result has no url")
        }

        if logger != nil {
                logger.Info("HF TTS audio file ready", "url", result.URL, "origName", result.OrigName)
        }

        // Étape 3 : GET l'URL du fichier audio (avec Authorization Bearer).
        dlCtx, dlCancel := context.WithTimeout(ctx, 60*time.Second)
        defer dlCancel()

        // GET de téléchargement SANS Content-Type (même raison que le SSE ci-dessus).
        dlReq, err := http.NewRequestWithContext(dlCtx, "GET", result.URL, nil)
        if err != nil {
                return nil, fmt.Errorf("create hf audio download request: %w", err)
        }
        dlReq.Header.Set("Authorization", "Bearer "+provider.APIKey)

        dlResp, err := httpClient.Do(dlReq)
        if err != nil {
                return nil, fmt.Errorf("hf audio download failed: %w", err)
        }
        defer dlResp.Body.Close()

        if dlResp.StatusCode != 200 {
                return nil, fmt.Errorf("hf audio download returned HTTP %d", dlResp.StatusCode)
        }

        audioBytes, err := io.ReadAll(dlResp.Body)
        if err != nil {
                return nil, fmt.Errorf("read hf audio response: %w", err)
        }

        if len(audioBytes) == 0 {
                return nil, fmt.Errorf("hf tts returned empty audio")
        }

        if logger != nil {
                logger.Info("HF TTS completed",
                        "audioBytes", len(audioBytes),
                        "format", "wav",
                )
        }

        return audioBytes, nil
}

// ttsAudioFormat retourne l'extension et le content-type à utiliser pour le
// stockage R2 en fonction du type de provider TTS.
//
// KOKORO-TTS-1 : Hugging Face (Kokoro via Gradio) retourne du WAV, pas du MP3.
// DashScope et OpenAI retournent du MP3.
func ttsAudioFormat(provider *aiProviderConfig) (extension string, contentType string) {
        if provider == nil {
                return ".mp3", "audio/mpeg"
        }
        if strings.EqualFold(provider.Provider, "HUGGINGFACE") {
                return ".wav", "audio/wav"
        }
        return ".mp3", "audio/mpeg"
}

// truncate limite une chaîne à n caractères (avec suffixe "..." si tronquée).
func truncate(s string, n int) string {
        if len(s) <= n {
                return s
        }
        return s[:n] + "..."
}
