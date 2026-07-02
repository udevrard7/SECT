// Package worker — adapter MMS-TTS (Facebook Massively Multilingual Speech) pour TTS.
//
// MMS-TTS-1.
//
// facebook/mms-tts-fra est un modèle VITS (Variational Inference with adversarial
// learning for end-to-end Text-to-Speech) entraîné sur 1100+ langues dont le
// français. Il génère de la parole française native à 16kHz (format WAV).
//
// Contrairement à Kokoro (voix US) et NeuTTS (voice cloning), MMS-TTS :
//   - Voix française native (pas d'accent étranger)
//   - Pas besoin d'audio de référence (pas de voice cloning)
//   - Modèle léger (~1.2GB, tourne sur CPU free tier)
//   - Une seule voix par langue (pas de sélection de voix)
//
// L'Inference API HF ne supporte PAS les modèles TTS (retourne 400 "Model not
// supported by provider hf-inference"). Le modèle doit être hébergé sur un Space
// Gradio dédié. L'utilisateur doit créer le Space `udevrard7/sect-mms-tts-fra`
// avec les fichiers fournis (app.py + requirements.txt).
//
// Protocole Gradio 4 (identique à Kokoro) :
//  1. POST {spaceHost}/gradio_api/call/predict
//     Body : {"data":[text]}
//     Response : {"event_id":"<uuid>"}
//
//  2. GET {spaceHost}/gradio_api/call/predict/{event_id} (SSE stream)
//     Response : "event: complete\ndata: [{"url":"..."}]"
//
//  3. GET {spaceHost}/gradio_api/file={path} (Authorization: Bearer)
//     Response : bytes WAV (16kHz, 16-bit, mono)
//
// MMS-TTS-2 (chunking) : MMS-TTS a aussi une limite de longueur par request
// (~500 chars recommandé). On découpe le script en chunks et on concatène.
package worker

import (
        "bufio"
        "bytes"
        "context"
        "encoding/binary"
        "encoding/json"
        "fmt"
        "io"
        "log/slog"
        "net/http"
        "strings"
        "time"
)

// Taille max d'un chunk pour MMS-TTS (le modèle VITS a une limite mémoire).
const mmsChunkSize = 400

// Durée max d'attente pour un chunk MMS-TTS (CPU free tier peut être lent).
const mmsChunkTimeout = 3 * time.Minute

// callMMSTTS synthétise du texte en WAV via un Space Gradio hébergeant
// facebook/mms-tts-fra.
//
// MMS-TTS-1 : voix française native, pas de voice cloning.
// MMS-TTS-2 : chunking pour les textes longs.
//
// Le provider.BaseURL doit contenir l'host du Space, ex:
// https://udevrard7-sect-mms-tts-fra.hf.space
//
// Le provider.APIKey est le token Hugging Face (hf_xxx).
//
// Retourne les bytes WAV — un seul fichier concaténé.
func callMMSTTS(ctx context.Context, provider *aiProviderConfig, text string, logger *slog.Logger) ([]byte, error) {
        // Limiter à 8000 caractères (20 chunks max).
        input := text
        if len(input) > 8000 {
                input = input[:8000]
                logger.Warn("Truncating podcast script to 8000 chars (MMS-TTS)", "originalLen", len(text))
        }

        spaceHost := strings.TrimRight(provider.BaseURL, "/")
        predictURL := spaceHost + "/gradio_api/call/predict"

        // Découper en chunks.
        chunks := chunkText(input, mmsChunkSize)
        if logger != nil {
                logger.Info("MMS-TTS chunking",
                        "inputLen", len(input), "chunkCount", len(chunks), "chunkSize", mmsChunkSize)
        }

        // Générer un WAV par chunk, puis concaténer.
        var wavChunks [][]byte
        for i, chunk := range chunks {
                if strings.TrimSpace(chunk) == "" {
                        continue
                }
                if logger != nil {
                        logger.Info("Generating MMS-TTS chunk",
                                "chunkIndex", i+1, "totalChunks", len(chunks), "chunkLen", len(chunk))
                }

                wavBytes, err := callMMSTTSChunk(ctx, predictURL, provider.APIKey, chunk, logger)
                if err != nil {
                        return nil, fmt.Errorf("mms-tts chunk %d/%d failed: %w", i+1, len(chunks), err)
                }
                wavChunks = append(wavChunks, wavBytes)
        }

        if len(wavChunks) == 0 {
                return nil, fmt.Errorf("no audio generated (all chunks empty)")
        }

        // Concaténer les WAV en un seul fichier.
        combined, err := concatWAV(wavChunks)
        if err != nil {
                return nil, fmt.Errorf("concat MMS-TTS WAV chunks: %w", err)
        }

        if logger != nil {
                // MMS-TTS retourne du 16kHz mono 16-bit → 32000 bytes/sec
                totalDur := len(combined) / 32000
                logger.Info("MMS-TTS completed (chunked)",
                        "chunks", len(wavChunks), "audioBytes", len(combined), "durationSec", totalDur)
        }

        return combined, nil
}

// callMMSTTSChunk génère un WAV pour un seul chunk via le Space Gradio.
// Protocole Gradio 4 : POST predict → SSE event_id → download WAV.
func callMMSTTSChunk(ctx context.Context, predictURL, apiKey, text string, logger *slog.Logger) ([]byte, error) {
        // Étape 1 : POST /gradio_api/call/predict → event_id.
        body := map[string]interface{}{
                "data": []interface{}{text},
        }
        bodyJSON, err := json.Marshal(body)
        if err != nil {
                return nil, fmt.Errorf("marshal mms-tts request: %w", err)
        }

        if logger != nil {
                logger.Info("Calling MMS-TTS (predict)", "url", predictURL, "inputLen", len(text))
        }

        postCtx, postCancel := context.WithTimeout(ctx, 30*time.Second)
        defer postCancel()

        req, err := newHTTPRequest(postCtx, "POST", predictURL, bodyJSON, apiKey)
        if err != nil {
                return nil, fmt.Errorf("create mms-tts request: %w", err)
        }

        resp, err := httpClient.Do(req)
        if err != nil {
                return nil, fmt.Errorf("mms-tts POST failed: %w", err)
        }
        if resp.StatusCode != 200 {
                resp.Body.Close()
                return nil, fmt.Errorf("mms-tts POST returned HTTP %d", resp.StatusCode)
        }

        var postResp struct {
                EventID string `json:"event_id"`
        }
        if err := json.NewDecoder(resp.Body).Decode(&postResp); err != nil {
                resp.Body.Close()
                return nil, fmt.Errorf("decode mms-tts event_id: %w", err)
        }
        resp.Body.Close()

        if postResp.EventID == "" {
                return nil, fmt.Errorf("mms-tts POST returned empty event_id")
        }

        // Étape 2 : GET SSE stream.
        sseURL := predictURL + "/" + postResp.EventID
        sseCtx, sseCancel := context.WithTimeout(ctx, mmsChunkTimeout)
        defer sseCancel()

        // GET SANS Content-Type (le proxy HF rejette les GET avec Content-Type).
        sseReq, err := http.NewRequestWithContext(sseCtx, "GET", sseURL, nil)
        if err != nil {
                return nil, fmt.Errorf("create mms-tts sse request: %w", err)
        }
        sseReq.Header.Set("Authorization", "Bearer "+apiKey)
        sseReq.Header.Set("Accept", "text/event-stream")

        sseResp, err := httpClient.Do(sseReq)
        if err != nil {
                return nil, fmt.Errorf("mms-tts sse GET failed: %w", err)
        }
        defer sseResp.Body.Close()

        if sseResp.StatusCode != 200 {
                return nil, fmt.Errorf("mms-tts sse GET returned HTTP %d", sseResp.StatusCode)
        }

        // Lire le flux SSE (ignorer heartbeats, breaker sur complete/error).
        scanner := bufio.NewScanner(sseResp.Body)
        scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

        var eventType string
        var dataLine string
        for scanner.Scan() {
                line := scanner.Text()
                if strings.HasPrefix(line, "event: ") {
                        eventType = strings.TrimPrefix(line, "event: ")
                        dataLine = ""
                } else if strings.HasPrefix(line, "data: ") {
                        dataLine = strings.TrimPrefix(line, "data: ")
                }
                if line == "" && (eventType == "complete" || eventType == "error") {
                        break
                }
        }

        if eventType == "error" {
                return nil, fmt.Errorf("mms-tts gradio returned error event (data: %s)", dataLine)
        }
        if eventType != "complete" {
                return nil, fmt.Errorf("mms-tts sse stream ended without complete event (last: %q)", eventType)
        }
        if dataLine == "" {
                return nil, fmt.Errorf("mms-tts sse complete event has no data")
        }

        // Parser le data : [{"path":"...","url":"..."}]
        var results []struct {
                Path string `json:"path"`
                URL  string `json:"url"`
        }
        if err := json.Unmarshal([]byte(dataLine), &results); err != nil {
                return nil, fmt.Errorf("decode mms-tts sse data: %w (raw: %s)", err, truncate(dataLine, 200))
        }
        if len(results) == 0 || results[0].URL == "" {
                return nil, fmt.Errorf("mms-tts sse result has no url")
        }
        result := results[0]

        // Étape 3 : download du WAV.
        dlCtx, dlCancel := context.WithTimeout(ctx, 60*time.Second)
        defer dlCancel()

        dlReq, err := http.NewRequestWithContext(dlCtx, "GET", result.URL, nil)
        if err != nil {
                return nil, fmt.Errorf("create mms-tts download request: %w", err)
        }
        dlReq.Header.Set("Authorization", "Bearer "+apiKey)

        dlResp, err := httpClient.Do(dlReq)
        if err != nil {
                return nil, fmt.Errorf("mms-tts audio download failed: %w", err)
        }
        defer dlResp.Body.Close()

        if dlResp.StatusCode != 200 {
                return nil, fmt.Errorf("mms-tts audio download returned HTTP %d", dlResp.StatusCode)
        }

        audioBytes, err := io.ReadAll(dlResp.Body)
        if err != nil {
                return nil, fmt.Errorf("read mms-tts audio response: %w", err)
        }

        if len(audioBytes) == 0 {
                return nil, fmt.Errorf("mms-tts returned empty audio")
        }

        return audioBytes, nil
}

// ─── Fonctions utilitaires partagées (déplacées depuis huggingface_tts.go) ───

// chunkText découpe un texte en chunks de maxChars caractères, en coupant
// préférentiellement sur les fins de phrases (. ! ? \n) pour préserver la
// prosodie.
func chunkText(text string, maxChars int) []string {
        if len(text) <= maxChars {
                return []string{text}
        }

        var chunks []string
        remaining := text

        for len(remaining) > maxChars {
                window := remaining[:maxChars]
                bestCut := -1
                for _, sep := range []string{". ", "! ", "? ", ".\n", "!\n", "?\n", "\n\n", "\n"} {
                        if idx := strings.LastIndex(window, sep); idx > bestCut {
                                bestCut = idx + len(sep)
                        }
                }
                if bestCut <= 0 || bestCut > maxChars {
                        if idx := strings.LastIndex(window, " "); idx > 0 {
                                bestCut = idx + 1
                        } else {
                                bestCut = maxChars
                        }
                }

                chunks = append(chunks, strings.TrimSpace(remaining[:bestCut]))
                remaining = remaining[bestCut:]
        }

        if strings.TrimSpace(remaining) != "" {
                chunks = append(chunks, strings.TrimSpace(remaining))
        }

        return chunks
}

// concatWAV concatène plusieurs fichiers WAV (même format) en un seul fichier
// WAV valide. On garde le header du premier, on supprime les headers suivants
// (44 bytes), et on recalcule les tailles dans le header.
func concatWAV(wavs [][]byte) ([]byte, error) {
        if len(wavs) == 0 {
                return nil, fmt.Errorf("no WAV to concat")
        }
        if len(wavs) == 1 {
                return wavs[0], nil
        }

        first := wavs[0]
        if len(first) < 44 {
                return nil, fmt.Errorf("first WAV too short: %d bytes", len(first))
        }
        if string(first[0:4]) != "RIFF" || string(first[8:12]) != "WAVE" {
                return nil, fmt.Errorf("first WAV invalid header")
        }

        header := make([]byte, 44)
        copy(header, first[:44])

        var pcmBuf bytes.Buffer
        pcmBuf.Write(first[44:])
        for i, w := range wavs[1:] {
                if len(w) < 44 {
                        return nil, fmt.Errorf("WAV chunk %d too short: %d bytes", i+1, len(w))
                }
                pcmBuf.Write(w[44:])
        }

        pcmData := pcmBuf.Bytes()
        totalDataSize := uint32(len(pcmData))

        binary.LittleEndian.PutUint32(header[4:8], 36+totalDataSize)
        binary.LittleEndian.PutUint32(header[40:44], totalDataSize)

        result := make([]byte, 0, 44+len(pcmData))
        result = append(result, header...)
        result = append(result, pcmData...)

        return result, nil
}

// ttsAudioFormat retourne l'extension et le content-type pour le stockage R2.
// - Voxtral (Mistral) retourne du MP3 (80kbps 22.05kHz mono).
// - MMS-TTS (Space Gradio) retourne du WAV (16kHz 16-bit mono).
func ttsAudioFormat(provider *aiProviderConfig) (extension string, contentType string) {
        if provider == nil {
                return ".mp3", "audio/mpeg"
        }
        // VOXTRAL-TTS-1 : Mistral Voxtral retourne du MP3.
        if strings.EqualFold(provider.Provider, "VOXTRAL") {
                return ".mp3", "audio/mpeg"
        }
        // MMS-TTS-1 : Space Gradio retourne du WAV.
        if strings.EqualFold(provider.Provider, "MMS_TTS") {
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
