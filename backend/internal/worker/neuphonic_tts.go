// Package worker — adapter Neuphonic NeuTTS Nano (français natif) pour TTS.
//
// NEUPHONIC-TTS-1.
//
// Contrairement à Kokoro (28 voix US/UK, pas de FR), NeuTTS Nano French
// (neuphonic/neutts-nano-french, 228M params, LlamaForCausalLM) génère
// de la parole française native et naturelle via voice cloning.
//
// Le modèle n'est PAS sur l'Inference API HF (retourne 400 "Model not
// supported by provider hf-inference"). Il est accessible via le Space
// Gradio officiel neuphonic/neutts-nano-multilingual-collection qui expose
// l'API `infer` avec 4 inputs :
//
//  1. POST {spaceHost}/gradio_api/call/update_defaults
//     Body : {"data":["French"]}
//     → retourne le ref_text + ref_audio par défaut (voix "juliette.wav" FR).
//     Cette étape est OPTIONAL : on peut hardcoder les valeurs par défaut
//     ci-dessous (évite un aller-retour supplémentaire par podcast).
//
//  2. POST {spaceHost}/gradio_api/call/infer
//     Body : {"data":[ref_text, ref_audio_obj, text_to_generate, "French"]}
//     → retourne un event_id (protocole Gradio 4).
//
//  3. GET {spaceHost}/gradio_api/call/infer/{event_id} (SSE stream)
//     → "event: complete\ndata: [{\"url\":\"...\",\"path\":\"...\"}]"
//     (ou "event: error" en cas d'échec)
//
//  4. GET {spaceHost}/gradio_api/file={path} (Authorization: Bearer)
//     → bytes WAV (24kHz, 16-bit, mono)
//
// Le voice cloning nécessite :
//   - ref_text : le texte EXACT prononcé dans le ref_audio
//   - ref_audio : un WAV de référence (voix à imiter)
//
// On utilise la voix FR par défaut "juliette.wav" (fournie par le Space)
// avec son texte de référence. Pour personnaliser, l'utilisateur pourrait
// uploader sa propre voix via extraConfig.refAudioUrl + extraConfig.refText.
//
// NEUPHONIC-TTS-2 (chunking) : comme Kokoro, le Space a une limite de
// longueur d'input (testé : 1000 chars OK, 3000 chars → erreur). On
// découpe le script en chunks de ~500 chars et on concatène les WAV.
//
// Limite à 8000 caractères par script (16 chunks max).
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

// Voix FR par défaut du Space neuphonic/neutts-nano-multilingual-collection.
// Récupérée via POST /gradio_api/call/update_defaults avec ["French"].
// "juliette.wav" = voix féminine FR native.
const neuphonicDefaultRefText = "Dans les zones rurales où de nombreuses communautés n'ont pas accès à l'électricité, l'énergie solaire peut faire une énorme différence."

const neuphonicDefaultRefAudioPath = "/tmp/gradio/c959c111c1f58a83177f72c70d3662b9acb0f7cfed95852e0ef155a047a74c39/juliette.wav"

// Taille max d'un chunk pour NeuTTS (testé : 1000 chars OK, 3000 erreur).
const neuphonicChunkSize = 500

// Durée max d'attente pour un chunk NeuTTS.
const neuphonicChunkTimeout = 2 * time.Minute

// callNeuphonicTTS synthétise du texte en WAV via le Space Gradio NeuTTS.
//
// NEUPHONIC-TTS-1 : voice cloning avec la voix FR "juliette.wav" par défaut.
// NEUPHONIC-TTS-2 : chunking pour les textes longs (>500 chars).
//
// Le provider.BaseURL doit contenir l'host du Space, ex:
// https://neuphonic-neutts-nano-multilingual-collection.hf.space
//
// Le provider.APIKey est le token Hugging Face (hf_xxx).
//
// Retourne les bytes WAV (24kHz 16-bit mono) — un seul fichier concaténé.
func callNeuphonicTTS(ctx context.Context, provider *aiProviderConfig, text string, logger *slog.Logger) ([]byte, error) {
	// Limiter à 8000 caractères (16 chunks max).
	input := text
	if len(input) > 8000 {
		input = input[:8000]
		logger.Warn("Truncating podcast script to 8000 chars (NeuTTS)", "originalLen", len(text))
	}

	spaceHost := strings.TrimRight(provider.BaseURL, "/")

	// Découper en chunks (le Space NeuTTS a une limite ~1000 chars).
	chunks := chunkText(input, neuphonicChunkSize)
	if logger != nil {
		logger.Info("Neuphonic NeuTTS chunking",
			"inputLen", len(input), "chunkCount", len(chunks), "chunkSize", neuphonicChunkSize)
	}

	// Générer un WAV par chunk, puis concaténer.
	var wavChunks [][]byte
	for i, chunk := range chunks {
		if strings.TrimSpace(chunk) == "" {
			continue
		}
		if logger != nil {
			logger.Info("Generating NeuTTS chunk",
				"chunkIndex", i+1, "totalChunks", len(chunks), "chunkLen", len(chunk))
		}

		wavBytes, err := callNeuphonicTTSChunk(ctx, spaceHost, provider.APIKey, chunk, logger)
		if err != nil {
			return nil, fmt.Errorf("neuphonic chunk %d/%d failed: %w", i+1, len(chunks), err)
		}
		wavChunks = append(wavChunks, wavBytes)
	}

	if len(wavChunks) == 0 {
		return nil, fmt.Errorf("no audio generated (all chunks empty)")
	}

	// Concaténer les WAV en un seul fichier (utilise concatWAV de huggingface_tts.go).
	combined, err := concatWAV(wavChunks)
	if err != nil {
		return nil, fmt.Errorf("concat NeuTTS WAV chunks: %w", err)
	}

	if logger != nil {
		totalDur := len(combined) / 48000
		logger.Info("NeuTTS completed (chunked)",
			"chunks", len(wavChunks), "audioBytes", len(combined), "durationSec", totalDur)
	}

	return combined, nil
}

// callNeuphonicTTSChunk génère un WAV pour un seul chunk via le Space NeuTTS.
// Protocole Gradio 4 : POST infer → SSE event_id → download WAV.
//
// Les 4 inputs du Space neuphonic/neutts-nano-multilingual-collection :
//   - ref_text (string) : texte exact du ref_audio
//   - ref_audio (FileData) : voix à cloner
//   - text_to_generate (string) : texte à synthétiser
//   - language (string) : "French"
func callNeuphonicTTSChunk(ctx context.Context, spaceHost, apiKey, text string, logger *slog.Logger) ([]byte, error) {
	inferURL := spaceHost + "/gradio_api/call/infer"

	// Construire le payload avec la voix FR par défaut (juliette.wav).
	refAudioObj := map[string]interface{}{
		"path": neuphonicDefaultRefAudioPath,
		"url":  spaceHost + "/gradio_api/file=" + neuphonicDefaultRefAudioPath,
		"meta": map[string]string{"_type": "gradio.FileData"},
	}
	body := map[string]interface{}{
		"data": []interface{}{
			neuphonicDefaultRefText, // ref_text
			refAudioObj,             // ref_audio
			text,                    // text_to_generate
			"French",                // language
		},
	}
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal neuphonic tts request: %w", err)
	}

	if logger != nil {
		logger.Info("Calling Neuphonic NeuTTS (infer)",
			"url", inferURL, "inputLen", len(text), "language", "French")
	}

	// Étape 1 : POST /gradio_api/call/infer → event_id.
	postCtx, postCancel := context.WithTimeout(ctx, 30*time.Second)
	defer postCancel()

	req, err := newHTTPRequest(postCtx, "POST", inferURL, bodyJSON, apiKey)
	if err != nil {
		return nil, fmt.Errorf("create neuphonic tts request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("neuphonic tts POST failed: %w", err)
	}
	if resp.StatusCode != 200 {
		resp.Body.Close()
		return nil, fmt.Errorf("neuphonic tts POST returned HTTP %d", resp.StatusCode)
	}

	var postResp struct {
		EventID string `json:"event_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&postResp); err != nil {
		resp.Body.Close()
		return nil, fmt.Errorf("decode neuphonic event_id: %w", err)
	}
	resp.Body.Close()

	if postResp.EventID == "" {
		return nil, fmt.Errorf("neuphonic tts POST returned empty event_id")
	}

	// Étape 2 : GET SSE stream.
	sseURL := inferURL + "/" + postResp.EventID
	sseCtx, sseCancel := context.WithTimeout(ctx, neuphonicChunkTimeout)
	defer sseCancel()

	sseReq, err := http.NewRequestWithContext(sseCtx, "GET", sseURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create neuphonic sse request: %w", err)
	}
	sseReq.Header.Set("Authorization", "Bearer "+apiKey)
	sseReq.Header.Set("Accept", "text/event-stream")

	sseResp, err := httpClient.Do(sseReq)
	if err != nil {
		return nil, fmt.Errorf("neuphonic sse GET failed: %w", err)
	}
	defer sseResp.Body.Close()

	if sseResp.StatusCode != 200 {
		return nil, fmt.Errorf("neuphonic sse GET returned HTTP %d", sseResp.StatusCode)
	}

	// Lire le flux SSE (ignorer les heartbeats, breaker sur complete/error).
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
		return nil, fmt.Errorf("neuphonic tts gradio returned error event (data: %s)", dataLine)
	}
	if eventType != "complete" {
		return nil, fmt.Errorf("neuphonic sse stream ended without complete event (last: %q)", eventType)
	}
	if dataLine == "" {
		return nil, fmt.Errorf("neuphonic sse complete event has no data")
	}

	// Parser le data : [{"path":"...","url":"..."}]
	var results []struct {
		Path string `json:"path"`
		URL  string `json:"url"`
	}
	if err := json.Unmarshal([]byte(dataLine), &results); err != nil {
		return nil, fmt.Errorf("decode neuphonic sse data: %w (raw: %s)", err, truncate(dataLine, 200))
	}
	if len(results) == 0 || results[0].URL == "" {
		return nil, fmt.Errorf("neuphonic sse result has no url")
	}
	result := results[0]

	// Étape 3 : download du WAV.
	dlCtx, dlCancel := context.WithTimeout(ctx, 60*time.Second)
	defer dlCancel()

	dlReq, err := http.NewRequestWithContext(dlCtx, "GET", result.URL, nil)
	if err != nil {
		return nil, fmt.Errorf("create neuphonic audio download request: %w", err)
	}
	dlReq.Header.Set("Authorization", "Bearer "+apiKey)

	dlResp, err := httpClient.Do(dlReq)
	if err != nil {
		return nil, fmt.Errorf("neuphonic audio download failed: %w", err)
	}
	defer dlResp.Body.Close()

	if dlResp.StatusCode != 200 {
		return nil, fmt.Errorf("neuphonic audio download returned HTTP %d", dlResp.StatusCode)
	}

	audioBytes, err := io.ReadAll(dlResp.Body)
	if err != nil {
		return nil, fmt.Errorf("read neuphonic audio response: %w", err)
	}

	if len(audioBytes) == 0 {
		return nil, fmt.Errorf("neuphonic tts returned empty audio")
	}

	return audioBytes, nil
}
