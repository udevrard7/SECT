// Package worker — adapter Mistral Voxtral TTS pour la synthèse vocale.
//
// VOXTRAL-TTS-1 / VOXTRAL-TTS-2.
//
// Mistral propose 4 modèles TTS (voxtral-mini-tts-*) accessibles via l'endpoint
// OpenAI-compatible /v1/audio/speech. Le voice cloning nécessite un `ref_audio`
// (audio de référence en base64).
//
// Format de la requête :
//   POST {baseUrl}/audio/speech
//   Body : {"model":"voxtral-mini-tts-latest","input":"texte","ref_audio":"<base64>"}
//   Response : JSON {"audio_data":"<base64 MP3>"} → décoder en bytes MP3.
//
// VOXTRAL-TTS-2 (multi-voix) : si le provider a deux ref_audio configurés
// (refAudioPresenter + refAudioExpert dans extraConfig), le script est parsé
// par speaker ("Présentateur :" / "Expert :") et chaque segment est synthétisé
// avec la voix correspondante. Les segments MP3 sont concaténés en un seul
// fichier.
//
// Configuration via extraConfig (UI admin) :
//   {
//     "refAudioPresenter": "https://...voix-presentation.wav",
//     "refAudioExpert":     "https://...voix-expert.wav"
//   }
//
// Si un seul ref_audio est fourni (ou aucun), on utilise la voix unique pour
// tout le script (mode single-voice, rétro-compatible).
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

        "github.com/udevrard7/sect/backend/internal/ai"
)

// Voix de référence par défaut (utilisée si aucune voix configurée dans extraConfig).
// jo.wav = voix masculine anglaise du Space Neuphonic (temporaire — l'admin
// devrait configurer ses propres voix via l'UI).
const voxtralDefaultRefAudioURL = "https://neuphonic-neutts-nano-multilingual-collection.hf.space/gradio_api/file=/tmp/gradio/6b829891aee71927ff2d61497f782a9726bed4e1fac6b965becda39ac791b766/jo.wav"

// callVoxtralTTS synthétise du texte en MP3 via l'API Mistral Voxtral.
//
// VOXTRAL-TTS-1 : voice cloning avec un audio de référence.
// VOXTRAL-TTS-2 : multi-voix si 2 ref_audio configurés dans extraConfig.
func callVoxtralTTS(ctx context.Context, provider *ai.ActiveProvider, text string, logger *slog.Logger) ([]byte, error) {
        // Limiter à 8000 caractères.
        input := text
        if len(input) > 8000 {
                input = input[:8000]
                logger.Warn("Truncating podcast script to 8000 chars (Voxtral)", "originalLen", len(text))
        }

        // Parser extraConfig pour récupérer les URLs des ref_audio.
        refPresenterURL, refExpertURL := parseVoxtralExtraConfig(provider.ExtraConfig)
        if logger != nil {
                logger.Info("Voxtral config",
                        "refPresenterURL", refPresenterURL,
                        "refExpertURL", refExpertURL,
                        "multiVoice", refPresenterURL != "" && refExpertURL != "",
                )
        }

        // Mode multi-voix : 2 ref_audio configurés.
        if refPresenterURL != "" && refExpertURL != "" {
                return callVoxtralMultiVoice(ctx, provider, input, refPresenterURL, refExpertURL, logger)
        }

        // Mode single-voice : 1 ref_audio (ou défaut).
        refAudioURL := refPresenterURL
        if refAudioURL == "" {
                refAudioURL = refExpertURL
        }
        if refAudioURL == "" {
                refAudioURL = voxtralDefaultRefAudioURL
        }

        if logger != nil {
                logger.Info("Voxtral single-voice mode", "refAudioURL", refAudioURL, "inputLen", len(input))
        }

        // Télécharger le ref_audio.
        refAudioB64, err := fetchAudioAsBase64(ctx, refAudioURL, logger)
        if err != nil {
                return nil, fmt.Errorf("fetch ref_audio: %w", err)
        }

        // Générer l'audio en une seule request.
        return callVoxtralAPI(ctx, provider, input, refAudioB64, logger)
}

// callVoxtralMultiVoice génère un podcast multi-voix en parsant le script par
// speaker (Présentateur / Expert) et en utilisant un ref_audio différent pour
// chaque speaker. Les segments MP3 sont concaténés.
func callVoxtralMultiVoice(ctx context.Context, provider *ai.ActiveProvider, script, refPresenterURL, refExpertURL string, logger *slog.Logger) ([]byte, error) {
        // Télécharger les 2 ref_audios (une seule fois chacun).
        if logger != nil {
                logger.Info("Downloading ref_audios for multi-voice",
                        "presenterURL", refPresenterURL, "expertURL", refExpertURL)
        }

        refPresenterB64, err := fetchAudioAsBase64(ctx, refPresenterURL, logger)
        if err != nil {
                return nil, fmt.Errorf("fetch presenter ref_audio: %w", err)
        }
        refExpertB64, err := fetchAudioAsBase64(ctx, refExpertURL, logger)
        if err != nil {
                return nil, fmt.Errorf("fetch expert ref_audio: %w", err)
        }

        // Parser le script par speaker.
        segments := parseScriptBySpeaker(script)
        if logger != nil {
                logger.Info("Script parsed for multi-voice",
                        "segmentCount", len(segments),
                        "presenterSegments", countSegments(segments, "presentateur"),
                        "expertSegments", countSegments(segments, "expert"),
                )
        }

        if len(segments) == 0 {
                // Pas de speaker détecté → fallback single-voice avec refPresenter.
                if logger != nil {
                        logger.Warn("No speaker markers found, falling back to single-voice")
                }
                return callVoxtralAPI(ctx, provider, script, refPresenterB64, logger)
        }

        // Générer un MP3 par segment.
        var mp3Segments [][]byte
        for i, seg := range segments {
                if strings.TrimSpace(seg.Text) == "" {
                        continue
                }
                refB64 := refPresenterB64
                if seg.Speaker == "expert" {
                        refB64 = refExpertB64
                }
                if logger != nil {
                        logger.Info("Generating multi-voice segment",
                                "segmentIndex", i+1, "totalSegments", len(segments),
                                "speaker", seg.Speaker, "textLen", len(seg.Text))
                }

                mp3, err := callVoxtralAPI(ctx, provider, seg.Text, refB64, logger)
                if err != nil {
                        return nil, fmt.Errorf("segment %d/%d (speaker=%s): %w", i+1, len(segments), seg.Speaker, err)
                }
                mp3Segments = append(mp3Segments, mp3)
        }

        if len(mp3Segments) == 0 {
                return nil, fmt.Errorf("no audio segments generated (all empty)")
        }

        // Concaténer les MP3.
        combined := concatMP3(mp3Segments)
        if logger != nil {
                totalDur := len(combined) / 12000 // MP3 96kbps ≈ 12KB/s
                logger.Info("Voxtral multi-voice completed",
                        "segments", len(mp3Segments), "audioBytes", len(combined), "durationSec", totalDur)
        }

        return combined, nil
}

// callVoxtralAPI fait l'appel HTTP à l'API Voxtral pour un texte + ref_audio.
// Retourne les bytes MP3.
func callVoxtralAPI(ctx context.Context, provider *ai.ActiveProvider, text, refAudioB64 string, logger *slog.Logger) ([]byte, error) {
        model := provider.Model
        if strings.TrimSpace(model) == "" {
                model = "voxtral-mini-tts-latest"
        }

        body := map[string]interface{}{
                "model":     model,
                "input":     text,
                "ref_audio": refAudioB64,
        }
        bodyJSON, err := json.Marshal(body)
        if err != nil {
                return nil, fmt.Errorf("marshal voxtral request: %w", err)
        }

        url := strings.TrimRight(provider.BaseURL, "/") + "/audio/speech"
        if logger != nil {
                logger.Info("Calling Mistral Voxtral TTS", "url", url, "model", model, "inputLen", len(text))
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
                var errResp struct {
                        Message string `json:"message"`
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

        audioBytes, err := base64.StdEncoding.DecodeString(ttsResp.AudioData)
        if err != nil {
                return nil, fmt.Errorf("decode voxtral base64 audio: %w", err)
        }
        if len(audioBytes) == 0 {
                return nil, fmt.Errorf("voxtral returned empty audio after decode")
        }

        return audioBytes, nil
}

// parseVoxtralExtraConfig extrait les URLs des ref_audio depuis le JSON extraConfig.
//
// Format attendu :
//   {"refAudioPresenter":"https://...","refAudioExpert":"https://..."}
//
// Retourne (refPresenterURL, refExpertURL). Chaînes vides si non configurées.
func parseVoxtralExtraConfig(extraConfig string) (string, string) {
        if extraConfig == "" {
                return "", ""
        }
        var cfg struct {
                RefAudioPresenter string `json:"refAudioPresenter"`
                RefAudioExpert    string `json:"refAudioExpert"`
        }
        if err := json.Unmarshal([]byte(extraConfig), &cfg); err != nil {
                return "", ""
        }
        return cfg.RefAudioPresenter, cfg.RefAudioExpert
}

// scriptSegment représente un segment de script attribué à un speaker.
type scriptSegment struct {
        Speaker string // "presentateur" ou "expert"
        Text    string
}

// parseScriptBySpeaker découpe un script podcast en segments par speaker.
//
// Le script généré par Mistral suit le format :
//   Présentateur : Bonjour et bienvenue...
//   <ligne vide>
//   Expert : Bonjour ! Ravis d'être ici...
//   <ligne vide>
//   Présentateur : Super ! Alors...
//
// Les lignes continues (sans marker de speaker) sont rattachées au speaker
// courant. Les marqueurs reconnus (case-insensitive, avec/sans accent) :
//   "Présentateur :", "Presentateur :", "Expert :"
func parseScriptBySpeaker(script string) []scriptSegment {
        lines := strings.Split(script, "\n")
        var segments []scriptSegment
        var currentSpeaker string
        var currentText strings.Builder

        flushCurrent := func() {
                if currentSpeaker != "" && currentText.Len() > 0 {
                        segments = append(segments, scriptSegment{
                                Speaker: currentSpeaker,
                                Text:    strings.TrimSpace(currentText.String()),
                        })
                }
                currentSpeaker = ""
                currentText.Reset()
        }

        for _, line := range lines {
                trimmed := strings.TrimSpace(line)
                if trimmed == "" {
                        flushCurrent()
                        continue
                }

                lower := strings.ToLower(trimmed)
                if strings.HasPrefix(lower, "présentateur") || strings.HasPrefix(lower, "presentateur") {
                        flushCurrent()
                        currentSpeaker = "presentateur"
                        if idx := strings.Index(trimmed, ":"); idx >= 0 {
                                currentText.WriteString(strings.TrimSpace(trimmed[idx+1:]))
                        }
                } else if strings.HasPrefix(lower, "expert") {
                        flushCurrent()
                        currentSpeaker = "expert"
                        if idx := strings.Index(trimmed, ":"); idx >= 0 {
                                currentText.WriteString(strings.TrimSpace(trimmed[idx+1:]))
                        }
                } else if currentSpeaker != "" {
                        if currentText.Len() > 0 {
                                currentText.WriteString(" ")
                        }
                        currentText.WriteString(trimmed)
                }
        }
        flushCurrent()

        return segments
}

// countSegments compte les segments pour un speaker donné.
func countSegments(segments []scriptSegment, speaker string) int {
        count := 0
        for _, s := range segments {
                if s.Speaker == speaker {
                        count++
                }
        }
        return count
}

// fetchAudioAsBase64 télécharge un fichier audio depuis une URL et le retourne
// en base64 (format attendu par l'API Voxtral).
func fetchAudioAsBase64(ctx context.Context, audioURL string, logger *slog.Logger) (string, error) {
        if logger != nil {
                logger.Info("Fetching ref_audio", "url", audioURL)
        }

        dlCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
        defer cancel()

        req, err := newHTTPRequest(dlCtx, "GET", audioURL, nil, "")
        if err != nil {
                return "", fmt.Errorf("create ref_audio request: %w", err)
        }

        resp, err := httpClient.Do(req)
        if err != nil {
                return "", fmt.Errorf("fetch ref_audio: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode != 200 {
                return "", fmt.Errorf("ref_audio HTTP %d", resp.StatusCode)
        }

        // FIX (audit 2025): limiter la lecture à 50 MiB pour empêcher OOM si l'URL est compromise
        audioBytes, err := io.ReadAll(io.LimitReader(resp.Body, 50<<20))
        if err != nil {
                return "", fmt.Errorf("read ref_audio: %w", err)
        }
        if len(audioBytes) == 0 {
                return "", fmt.Errorf("ref_audio empty")
        }

        b64 := base64.StdEncoding.EncodeToString(audioBytes)
        if logger != nil {
                logger.Info("Ref_audio fetched", "bytes", len(audioBytes), "b64len", len(b64))
        }
        return b64, nil
}

// concatMP3 concatène plusieurs fichiers MP3 en un seul.
//
// Les tags ID3v2 (en-tête au début du fichier) sont stripping des fichiers
// suivants pour éviter les artefacts. Les tags ID3v1 (128 bytes à la fin)
// sont laissés intactes — les lecteurs MP3 lisent le dernier tag rencontré.
//
// Cette méthode produit un MP3 valide jouable par tous les lecteurs standards.
func concatMP3(mp3s [][]byte) []byte {
        if len(mp3s) == 0 {
                return nil
        }
        if len(mp3s) == 1 {
                return mp3s[0]
        }

        var result []byte
        for i, mp3 := range mp3s {
                if i == 0 {
                        // Garder le premier fichier intact (avec son ID3v2).
                        result = append(result, mp3...)
                } else {
                        // Stripper l'ID3v2 des fichiers suivants.
                        stripped := stripID3v2(mp3)
                        result = append(result, stripped...)
                }
        }
        return result
}

// stripID3v2 supprime le tag ID3v2 au début d'un fichier MP3.
//
// Format ID3v2 :
//   Bytes 0-2: "ID3"
//   Bytes 3-4: version majeure + révision
//   Byte 5: flags
//   Bytes 6-9: taille (synchsafe integer, 7 bits par byte)
//   Puis le tag lui-même (taille bytes)
//   Puis les frames MP3
func stripID3v2(data []byte) []byte {
        if len(data) < 10 {
                return data
        }
        if string(data[0:3]) != "ID3" {
                return data // pas de tag ID3v2
        }
        // Taille synchsafe : chaque byte utilise seulement 7 bits.
        size := int(data[6]&0x7f)<<21 | int(data[7]&0x7f)<<14 | int(data[8]&0x7f)<<7 | int(data[9]&0x7f)
        headerSize := 10 + size
        if headerSize >= len(data) {
                return data // tag corrompu, retourner tel quel
        }
        return data[headerSize:]
}

// ttsAudioFormat retourne l'extension et le content-type pour le stockage R2.
//
// VOXTRAL-TTS-1 : Mistral Voxtral retourne du MP3 (96kbps 22.05kHz mono).
func ttsAudioFormat(provider *ai.ActiveProvider) (extension string, contentType string) {
        if provider == nil {
                return ".mp3", "audio/mpeg"
        }
        return ".mp3", "audio/mpeg"
}
