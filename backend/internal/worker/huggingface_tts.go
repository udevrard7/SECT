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
// KOKORO-TTS-2 (chunking) : le Space Pendrokar limite la sortie à ~27 secondes
// par request (1.3MB WAV). Pour les scripts longs (>1000 chars), on découpe
// le texte en chunks de ~400 chars sur les fins de phrases, on génère un WAV
// par chunk, puis on concatène les WAV en un seul fichier. Un script de 5000
// chars produit ainsi ~10 chunks × 20s = ~3-4 minutes d'audio.
//
// Limite à 8000 caractères par script (20 chunks max) pour éviter de saturer
// le Space et respecter le timeout global de 5 min du worker.
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

// Voix par défaut pour Kokoro (Pendrokar/Kokoro-TTS).
// af_heart = voix féminine US, rend bien le français.
const defaultKokoroVoice = "af_heart"

// Taille max d'un chunk de texte envoyé au Space (en caractères).
// Le Space Pendrokar plafonne à ~27s / 1.3MB par request, ce qui correspond
// à ~600-1000 chars selon la densité du texte. On prend 400 pour rester
// sécuritaire et permettre une génération fluide.
const kokoroChunkSize = 400

// Durée max d'attente pour un chunk (la génération peut prendre 5-15s).
const kokoroChunkTimeout = 90 * time.Second

// callHuggingFaceTTS synthétise du texte en WAV via un Space Gradio Hugging Face.
//
// KOKORO-TTS-1 : utilise le protocole Gradio 4 (POST + SSE + file download).
// Le provider.BaseURL doit contenir l'host du Space, ex:
// https://pendrokar-kokoro-tts.hf.space
//
// KOKORO-TTS-2 (chunking) : pour les textes longs, découpe en chunks de
// ~400 chars sur les fins de phrases et concatène les WAV résultants.
//
// Le provider.APIKey est le token Hugging Face (hf_xxx) passé en Authorization
// Bearer (nécessaire car les Spaces peuvent être privés ou rate-limités).
//
// Retourne les bytes WAV (24kHz 16-bit mono) — un seul fichier concaténé.
func callHuggingFaceTTS(ctx context.Context, provider *aiProviderConfig, text string, logger *slog.Logger) ([]byte, error) {
	// Limiter à 8000 caractères (20 chunks max) pour éviter timeout worker.
	input := text
	if len(input) > 8000 {
		input = input[:8000]
		logger.Warn("Truncating podcast script to 8000 chars (20 chunks max)", "originalLen", len(text))
	}

	voice := defaultKokoroVoice
	speed := 1.0

	// Découper le texte en chunks sur les fins de phrases.
	chunks := chunkText(input, kokoroChunkSize)
	if logger != nil {
		logger.Info("Hugging Face TTS chunking",
			"inputLen", len(input), "chunkCount", len(chunks), "voice", voice, "chunkSize", kokoroChunkSize)
	}

	spaceHost := strings.TrimRight(provider.BaseURL, "/")
	predictURL := spaceHost + "/gradio_api/call/predict"

	// Générer un WAV par chunk, puis concaténer.
	var wavChunks [][]byte
	for i, chunk := range chunks {
		if strings.TrimSpace(chunk) == "" {
			continue
		}
		if logger != nil {
			logger.Info("Generating TTS chunk",
				"chunkIndex", i+1, "totalChunks", len(chunks), "chunkLen", len(chunk))
		}

		wavBytes, err := callHuggingFaceTTSChunk(ctx, predictURL, provider.APIKey, chunk, voice, speed, logger)
		if err != nil {
			return nil, fmt.Errorf("chunk %d/%d failed: %w", i+1, len(chunks), err)
		}
		wavChunks = append(wavChunks, wavBytes)
	}

	if len(wavChunks) == 0 {
		return nil, fmt.Errorf("no audio generated (all chunks empty)")
	}

	// Concaténer les WAV en un seul fichier.
	combined, err := concatWAV(wavChunks)
	if err != nil {
		return nil, fmt.Errorf("concat WAV chunks: %w", err)
	}

	if logger != nil {
		totalDur := len(combined) / 48000 // 24kHz × 16-bit (2 bytes) mono
		logger.Info("HF TTS completed (chunked)",
			"chunks", len(wavChunks), "audioBytes", len(combined), "durationSec", totalDur)
	}

	return combined, nil
}

// callHuggingFaceTTSChunk génère un WAV pour un seul chunk de texte.
// Protocole Gradio 4 : POST predict → SSE event_id → download WAV.
func callHuggingFaceTTSChunk(ctx context.Context, predictURL, apiKey, text, voice string, speed float64, logger *slog.Logger) ([]byte, error) {
	// Étape 1 : POST /gradio_api/call/predict → obtenir un event_id.
	body := map[string]interface{}{
		"data": []interface{}{text, voice, speed},
	}
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal hf tts request: %w", err)
	}

	postCtx, postCancel := context.WithTimeout(ctx, 30*time.Second)
	defer postCancel()

	// Le POST utilise newHTTPRequest (avec Content-Type: application/json).
	req, err := newHTTPRequest(postCtx, "POST", predictURL, bodyJSON, apiKey)
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

	// Étape 2 : GET /gradio_api/call/predict/{event_id} (SSE) → attendre le résultat.
	sseURL := predictURL + "/" + postResp.EventID
	sseCtx, sseCancel := context.WithTimeout(ctx, kokoroChunkTimeout)
	defer sseCancel()

	// KOKORO-TTS-1 : GET SANS Content-Type (le proxy HF rejette les GET avec Content-Type).
	sseReq, err := http.NewRequestWithContext(sseCtx, "GET", sseURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create hf sse request: %w", err)
	}
	sseReq.Header.Set("Authorization", "Bearer "+apiKey)
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
	// KOKORO-TTS-1 fix : ignorer les heartbeats (ne breaker QUE sur complete/error).
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

	// Étape 3 : GET l'URL du fichier audio (avec Authorization Bearer).
	dlCtx, dlCancel := context.WithTimeout(ctx, 60*time.Second)
	defer dlCancel()

	// GET de téléchargement SANS Content-Type.
	dlReq, err := http.NewRequestWithContext(dlCtx, "GET", result.URL, nil)
	if err != nil {
		return nil, fmt.Errorf("create hf audio download request: %w", err)
	}
	dlReq.Header.Set("Authorization", "Bearer "+apiKey)

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

	return audioBytes, nil
}

// chunkText découpe un texte en chunks de maxChars caractères, en coupant
// préférentiellement sur les fins de phrases (. ! ? \n) pour préserver la
// prosodie. Le dernier chunk peut être plus court.
//
// KOKORO-TTS-2 : le Space Pendrokar plafonne à ~27s par request (~600 chars).
// On découpe à 400 chars pour rester sécuritaire et avoir des chunks naturels.
func chunkText(text string, maxChars int) []string {
	if len(text) <= maxChars {
		return []string{text}
	}

	var chunks []string
	remaining := text

	for len(remaining) > maxChars {
		// Chercher la dernière fin de phrase dans la fenêtre [0, maxChars].
		window := remaining[:maxChars]
		bestCut := -1
		for _, sep := range []string{". ", "! ", "? ", ".\n", "!\n", "?\n", ".\n", "\n\n", "\n"} {
			if idx := strings.LastIndex(window, sep); idx > bestCut {
				bestCut = idx + len(sep)
			}
		}
		// Si aucune fin de phrase trouvée, couper sur le dernier espace.
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

// concatWAV concatène plusieurs fichiers WAV (même format : 24kHz 16-bit mono)
// en un seul fichier WAV valide. On garde le header du premier, on supprime
// les headers suivants (44 bytes), et on recalcule les tailles dans le header.
//
// Format WAV (RIFF) :
//   Offset 0:  "RIFF" (4 bytes)
//   Offset 4:  ChunkSize = 36 + data size (4 bytes, little-endian)
//   Offset 8:  "WAVE" (4 bytes)
//   Offset 12: "fmt " (4 bytes)
//   Offset 16: Subchunk1Size = 16 (4 bytes)
//   Offset 20: AudioFormat = 1 (PCM) (2 bytes)
//   Offset 22: NumChannels (2 bytes)
//   Offset 24: SampleRate (4 bytes)
//   Offset 28: ByteRate (4 bytes)
//   Offset 32: BlockAlign (2 bytes)
//   Offset 34: BitsPerSample (2 bytes)
//   Offset 36: "data" (4 bytes)
//   Offset 40: Subchunk2Size = data size (4 bytes)
//   Offset 44: data (PCM samples)
func concatWAV(wavs [][]byte) ([]byte, error) {
	if len(wavs) == 0 {
		return nil, fmt.Errorf("no WAV to concat")
	}
	if len(wavs) == 1 {
		return wavs[0], nil
	}

	// Valider le premier WAV et extraire son header.
	first := wavs[0]
	if len(first) < 44 {
		return nil, fmt.Errorf("first WAV too short: %d bytes", len(first))
	}
	if string(first[0:4]) != "RIFF" || string(first[8:12]) != "WAVE" {
		return nil, fmt.Errorf("first WAV invalid header")
	}

	// Récupérer le header du premier (44 bytes).
	header := make([]byte, 44)
	copy(header, first[:44])

	// Concaténer les données PCM (à partir de l'offset 44) de tous les WAV.
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

	// Mettre à jour le header avec la nouvelle taille totale.
	// ChunkSize (offset 4) = 36 + totalDataSize
	binary.LittleEndian.PutUint32(header[4:8], 36+totalDataSize)
	// Subchunk2Size (offset 40) = totalDataSize
	binary.LittleEndian.PutUint32(header[40:44], totalDataSize)

	// Assembler le WAV final : header + PCM data.
	result := make([]byte, 0, 44+len(pcmData))
	result = append(result, header...)
	result = append(result, pcmData...)

	return result, nil
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
