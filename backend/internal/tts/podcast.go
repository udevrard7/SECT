// podcast.go — SECT-TTS-3 : PODCASTS MULTI-VOIX 0 coût (exam-prep).
//
// Le script de podcast généré par l'IA est un dialogue
// « Présentateur : … » / « Expert : … ». SynthesePodcast synthétise chaque
// réplique avec la voix de SON locuteur, puis assemble l'épisode complet :
//
//  1. GEMINI STUDIO DUO (primaire) — Puck (animateur·rice enjoué·e) +
//     Charon (expert posé et précis) : WAV 24 kHz mono 16 bits, PCM
//     concaténés avec une RESPIRATION de ~350 ms entre deux répliques
//     (le rythme d'une vraie conversation, pas d'un collage).
//  2. EDGE NEURAL DUO (complément, illimité) — Denise (animation) +
//     Henri (expertise) : duo féminin/masculin Azure, MP3 24 kHz,
//     concaténation de frames (ID3v2 strippés des suivants).
//  3. MELOTTS VOIX UNIQUE (dernier secours) — le script entier en une
//     synthèse : on perd le contraste du dialogue, l'épisode existe quand
//     même (dégradation gracieuse cohérente avec AUDIO-LEARNING-1).
//
// INVARIANTS :
//   - un échec de SEGMENT fait basculer le PODCAST ENTIER sur la couche
//     suivante : jamais de WAV et de MP3 mélangés dans un même fichier ;
//   - PAS de rate-limit par utilisateur ici (autorise() est réservé à la
//     lecture à la demande) : un podcast est une génération serveur
//     unique déclenchée par un POST /audio — le sémaphore global (3
//     simultanées) reste acquis SEGMENT PAR SEGMENT pour rester équitable
//     avec les lecteurs de la bibliothèque ;
//   - Voxtral (Mistral, payant au caractère) reste HORS de cette chaîne —
//     il est proposé en option premium explicite côté worker (clonage de
//     voix propre à l'exploitant), cf internal/worker/voxtral_tts.go.
package tts

import (
	"context"
	"encoding/binary"
	"fmt"
	"strings"
)

// ──────────────────────────────────────────────────────────────────────────
// Casting vocal (duos contrastés : animation vive ↔ expertise posée)
// ──────────────────────────────────────────────────────────────────────────

const (
	// Duo studio Gemini (liste blanche voixStudio).
	voixPodcastAnimateur = "puck"   // enjouée — le·la host qui tient le rythme
	voixPodcastExpert    = "charon" // posée, précise — l'expert qui explique

	// Duo Neural Edge (illimité, sans clé — complément SECT-TTS-2).
	voixEdgePodcastAnimateur = "fr-FR-DeniseNeural"
	voixEdgePodcastExpert    = "fr-FR-HenriNeural"

	// maxSegmentsPodcast — plafond défensif : un dialogue sain de ~6 min
	// fait 20 à 40 répliques ; au-delà on dégrade en voix unique (un script
	// dégénéré en mitraillette ne doit pas déclencher 200 appels API).
	maxSegmentsPodcast = 60

	// silenceInterlocuteur — respiration insérée entre deux répliques
	// (Gemini/PCM uniquement — un vrai tour de parole respire).
	silenceInterlocuteur = 0.35
)

// segmentDialogue — une réplique attribuée à un locuteur.
type segmentDialogue struct {
	Locuteur string // "animateur" | "expert"
	Texte    string
}

// ──────────────────────────────────────────────────────────────────────────
// SynthesePodcast
// ──────────────────────────────────────────────────────────────────────────

// SynthesePodcast — épisode complet multi-voix (chaîne 0 coût).
// userID n'est PAS rate-limité ici (génération serveur asynchrone — cf
// invariant en tête de fichier) ; il sert uniquement à l'observabilité.
func (s *Service) SynthesePodcast(ctx context.Context, script, userID string) (*Result, error) {
	if strings.TrimSpace(script) == "" {
		return nil, fmt.Errorf("script vide")
	}

	segments := parserDialogue(script)

	// Script sans marqueurs de locuteur (ou dégénéré) : voix unique sur
	// le texte entier — même la chaîne de secours doit sonner humaine.
	if len(segments) == 0 || len(segments) > maxSegmentsPodcast {
		s.logger.Info("podcast: script sans dialogue exploitable — voix unique",
			"segments", len(segments), "scriptLen", len(script))
		return s.SyntheseLecture(ctx, script, "", "1", "podcast:"+userID)
	}

	// 1. Gemini studio duo (la perle).
	if gem, ok := s.lireProviderRow(ctx, "GOOGLE"); ok && !s.enCooldown("gemini") {
		res, err := s.podcastGemini(ctx, gem, segments)
		if err == nil {
			return res, nil
		}
		s.marquerEchec("gemini", err)
		s.logger.Warn("podcast: duo Gemini échec — bascule duo Edge",
			"error", err.Error(), "segments", len(segments))
	}

	// 2. Edge Neural duo (illimité, sans clé).
	if binaireEdge() != "" && !s.enCooldown("edge") {
		res, err := s.podcastEdge(ctx, segments)
		if err == nil {
			return res, nil
		}
		s.marquerEchec("edge", err)
		s.logger.Warn("podcast: duo Edge échec — bascule MeloTTS",
			"error", err.Error(), "segments", len(segments))
	}

	// 3. MeloTTS voix unique (dernier secours indépendant G & M).
	if melo, ok := s.lireProviderRow(ctx, "CLOUDFLARE"); ok && !s.enCooldown("melotts") {
		res, err := s.syntheseMeloTTS(ctx, melo, script, 1)
		if err == nil {
			return res, nil
		}
		s.marquerEchec("melotts", err)
		s.logger.Warn("podcast: MeloTTS échec", "error", err.Error())
	}

	return nil, fmt.Errorf("synthèse podcast indisponible (tous les fournisseurs gratuits ont échoué)")
}

// podcastGemini — une requête par réplique, voix studio selon le locuteur,
// puis concaténation PCM + respirations. Un échec quelconque → erreur
// (le PODCAST entier bascule sur la couche suivante — jamais de mélange
// de formats dans un même fichier).
func (s *Service) podcastGemini(ctx context.Context, gem providerRow, segments []segmentDialogue) (*Result, error) {
	modele := ""
	wavs := make([][]byte, 0, len(segments))

	for i, seg := range segments {
		vox := voixPodcastExpert
		if seg.Locuteur == "animateur" {
			vox = voixPodcastAnimateur
		}
		res, err := s.segmentAvecSemaphore(ctx, func() (*Result, error) {
			return s.syntheseGemini(ctx, gem, seg.Texte, vox, 1)
		})
		if err != nil {
			return nil, fmt.Errorf("réplique %d/%d (voix %s): %w", i+1, len(segments), vox, err)
		}
		modele = res.Model
		wavs = append(wavs, res.Audio)
	}

	pcm, rate, err := concatWAV(wavs)
	if err != nil {
		return nil, err
	}
	return &Result{
		Audio:       encapsulerWAV(pcm, rate),
		ContentType: "audio/wav",
		Provider:    "gemini",
		Model:       modele + " (duo " + voixPodcastAnimateur + "+" + voixPodcastExpert + ")",
	}, nil
}

// podcastEdge — duo Azure Neural Denise/Henri (dialogue féminin/masculin
// naturel), MP3 concaténés (ID3v2 strippés des suivants).
func (s *Service) podcastEdge(ctx context.Context, segments []segmentDialogue) (*Result, error) {
	mp3s := make([][]byte, 0, len(segments))

	for i, seg := range segments {
		vox := voixEdgePodcastExpert
		if seg.Locuteur == "animateur" {
			vox = voixEdgePodcastAnimateur
		}
		res, err := s.segmentAvecSemaphore(ctx, func() (*Result, error) {
			return s.syntheseEdge(ctx, seg.Texte, vox, 1)
		})
		if err != nil {
			return nil, fmt.Errorf("réplique %d/%d (voix %s): %w", i+1, len(segments), vox, err)
		}
		if res.ContentType != "audio/mpeg" {
			return nil, fmt.Errorf("réplique %d: format inattendu %s (Edge)", i+1, res.ContentType)
		}
		mp3s = append(mp3s, res.Audio)
	}

	if len(mp3s) == 0 {
		return nil, fmt.Errorf("aucune réplique synthétisée")
	}
	return &Result{
		Audio:       ConcatMP3(mp3s),
		ContentType: "audio/mpeg",
		Provider:    "edge",
		Model:       voixEdgePodcastAnimateur + "+" + voixEdgePodcastExpert,
	}, nil
}

// segmentAvecSemaphore — une réplique = un slot du sémaphore global (3) :
// un podcast long ne monopolise JAMAIS un slot pendant des minutes, il
// attend son tour réplique par réplique comme les lecteurs de la
// bibliothèque (équité entre générations asynchrones et lectures live).
func (s *Service) segmentAvecSemaphore(ctx context.Context, f func() (*Result, error)) (*Result, error) {
	select {
	case s.synthMu <- struct{}{}:
		defer func() { <-s.synthMu }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return f()
}

// ──────────────────────────────────────────────────────────────────────────
// Découpage du script par locuteur
// ──────────────────────────────────────────────────────────────────────────

// parserDialogue découpe le script podcast en répliques. Le format est
// imposé par le prompt worker (buildPodcastPrompt) :
//
//	Présentateur : Bonjour et bienvenue…
//	<ligne vide>
//	Expert : Bonjour ! Ravi d'être ici…
//
// Les lignes continues sans marqueur sont rattachées au locuteur courant.
// Marqueurs reconnus (insensible à la casse/accents) : « présentateur » /
// « presentateur » / « expert » / « animateur » / « host » / « professeur ».
func parserDialogue(script string) []segmentDialogue {
	lignes := strings.Split(script, "\n")
	var segments []segmentDialogue
	var locuteur, texte string

	flush := func() {
		if locuteur != "" && strings.TrimSpace(texte) != "" {
			segments = append(segments, segmentDialogue{
				Locuteur: locuteur,
				Texte:    strings.TrimSpace(texte),
			})
		}
		locuteur, texte = "", ""
	}

	for _, ligne := range lignes {
		ligne = strings.TrimSpace(ligne)
		if ligne == "" {
			flush()
			continue
		}
		basse := strings.ToLower(ligne)

		var marque string
		for _, m := range []string{"présentateur", "presentateur", "animateur", "host"} {
			if strings.HasPrefix(basse, m) {
				marque = "animateur"
				break
			}
		}
		if marque == "" {
			for _, m := range []string{"expert", "professeur"} {
				if strings.HasPrefix(basse, m) {
					marque = "expert"
					break
				}
			}
		}

		if marque != "" {
			flush()
			locuteur = marque
			if idx := strings.Index(ligne, ":"); idx >= 0 {
				texte = strings.TrimSpace(ligne[idx+1:])
			} else if idx := strings.Index(ligne, " :"); idx >= 0 {
				texte = strings.TrimSpace(ligne[idx+2:])
			}
		} else if locuteur != "" {
			if texte != "" {
				texte += " "
			}
			texte += ligne
		}
	}
	flush()
	return segments
}

// ──────────────────────────────────────────────────────────────────────────
// Assemblage audio
// ──────────────────────────────────────────────────────────────────────────

// concatWAV assemble des WAV Gemini (RIFF/WAVE PCM 16 bits mono, même
// fréquence) en un flux PCM unique, en insérant une RESPIRATION entre les
// répliques. Retourne (pcm, fréquence).
func concatWAV(wavs [][]byte) ([]byte, int, error) {
	if len(wavs) == 0 {
		return nil, 0, fmt.Errorf("aucun segment WAV")
	}

	var sortie []byte
	rateRef := 0

	for i, w := range wavs {
		pcm, rate, err := pcmDeWAV(w)
		if err != nil {
			return nil, 0, fmt.Errorf("segment WAV %d: %w", i+1, err)
		}
		if rateRef == 0 {
			rateRef = rate
		} else if rate != rateRef {
			return nil, 0, fmt.Errorf("fréquences hétérogènes (%d vs %d Hz) — refus de mélanger", rateRef, rate)
		}
		if i > 0 && rateRef > 0 {
			// Respiration inter-locuteurs : silenceInterlocuteur secondes
			// de silence PCM (16 bits mono → 2 octets par échantillon).
			n := int(float64(rateRef) * silenceInterlocuteur)
			sortie = append(sortie, make([]byte, n*2)...)
		}
		sortie = append(sortie, pcm...)
	}

	if rateRef == 0 || len(sortie) == 0 {
		return nil, 0, fmt.Errorf("assemblage WAV vide")
	}
	return sortie, rateRef, nil
}

// pcmDeWAV extrait les données PCM et la fréquence d'un conteneur
// RIFF/WAVE en parcourant RÉELLEMENT les chunks (robuste aux en-têtes
// non canoniques — LIST/INFO avant fmt/data, chunksimpairs padddés…).
func pcmDeWAV(w []byte) ([]byte, int, error) {
	if len(w) < 44 || string(w[0:4]) != "RIFF" || string(w[8:12]) != "WAVE" {
		return nil, 0, fmt.Errorf("en-tête RIFF/WAVE absent")
	}

	rate, tailleData := 0, 0
	var pcm []byte
	pos := 12
	for pos+8 <= len(w) {
		id := string(w[pos : pos+4])
		taille := int(binary.LittleEndian.Uint32(w[pos+4 : pos+8]))
		corps := pos + 8
		if corps+taille > len(w) {
			taille = len(w) - corps // chunk tronqué : prendre ce qui reste
		}
		switch id {
		case "fmt ":
			if taille >= 16 {
				rate = int(binary.LittleEndian.Uint32(w[corps+4 : corps+8]))
			}
		case "data":
			tailleData = taille
			pcm = w[corps : corps+taille]
		}
		pos = corps + taille
		if taille%2 == 1 {
			pos++ // chunk impair : octet de bourrage RIFF
		}
	}

	if rate == 0 || tailleData == 0 || len(pcm) == 0 {
		return nil, 0, fmt.Errorf("WAVE sans fmt/data exploitables (rate=%d, data=%d)", rate, tailleData)
	}
	return pcm, rate, nil
}

// ──────────────────────────────────────────────────────────────────────────
// Utilitaires partagés (worker Voxtral inclut)
// ──────────────────────────────────────────────────────────────────────────

// ConcatMP3 concatène des fichiers MP3 en un flux jouable : le premier
// reste intact (son ID3v2), les suivants sont STRIPPÉS de leur ID3v2 pour
// éviter les artefacts (les lecteurs standards avancent frame par frame).
func ConcatMP3(mp3s [][]byte) []byte {
	if len(mp3s) == 0 {
		return nil
	}
	if len(mp3s) == 1 {
		return mp3s[0]
	}
	var sortie []byte
	for i, mp3 := range mp3s {
		if i == 0 {
			sortie = append(sortie, mp3...)
		} else {
			sortie = append(sortie, StripID3v2(mp3)...)
		}
	}
	return sortie
}

// StripID3v2 supprime le tag ID3v2 d'un MP3 (magic « ID3 », taille
// synchsafe 7 bits/octet, cf spécification ID3v2).
func StripID3v2(data []byte) []byte {
	if len(data) < 10 || string(data[0:3]) != "ID3" {
		return data
	}
	taille := int(data[6]&0x7f)<<21 | int(data[7]&0x7f)<<14 | int(data[8]&0x7f)<<7 | int(data[9]&0x7f)
	fin := 10 + taille
	if fin >= len(data) {
		return data
	}
	return data[fin:]
}

// DureeAudio estime la durée (secondes, arrondie) d'un audio WAV ou MP3
// CBR — alimente DocumentAudio.durationSec (affiché sur les cartes
// podcast). WAV : lecture exacte fmt/data. MP3 : bitrate de la PREMIÈRE
// frame (Edge = 48 kbps CBR, Voxtral = CBR également).
func DureeAudio(audio []byte, contentType string) int {
	if len(audio) == 0 {
		return 0
	}
	if strings.Contains(contentType, "wav") || (len(audio) > 12 && string(audio[0:4]) == "RIFF" && string(audio[8:12]) == "WAVE") {
		pcm, rate, err := pcmDeWAV(audio)
		if err != nil || rate == 0 {
			return 0
		}
		return int(float64(len(pcm)) / (float64(rate) * 2))
	}
	// MP3 : bitrate de la première frame MPEG.
	bitrate := bitrateMP3(audio)
	if bitrate == 0 {
		return 0
	}
	return int(float64(len(audio)*8) / float64(bitrate))
}

// bitrateMP3 — débit en bits/seconde de la première frame MPEG (CBR).
// Tables Layer III des spécifications MPEG-1 et MPEG-2/2.5.
func bitrateMP3(data []byte) int {
	pos := 0
	if len(data) > 10 && string(data[0:3]) == "ID3" {
		taille := int(data[6]&0x7f)<<21 | int(data[7]&0x7f)<<14 | int(data[8]&0x7f)<<7 | int(data[9]&0x7f)
		pos = 10 + taille
	}
	// Chercher la synchronisation frame (0xFF 0xEx/0xFx).
	for pos+4 <= len(data) {
		if data[pos] == 0xFF && data[pos+1]&0xE0 == 0xE0 {
			break
		}
		pos++
	}
	if pos+4 > len(data) {
		return 0
	}

	version := (data[pos+1] >> 3) & 0x03 // 0=2.5, 2=2, 3=MPEG-1
	layer := (data[pos+1] >> 1) & 0x03   // 1=Layer III
	if layer != 1 {
		return 0
	}
	indexBitrate := int(data[pos+2] >> 4)

	var table []int
	if version == 3 { // MPEG-1 Layer III
		table = []int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0}
	} else { // MPEG-2 / 2.5 Layer III
		table = []int{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0}
	}
	if indexBitrate <= 0 || indexBitrate >= len(table) || table[indexBitrate] == 0 {
		return 0
	}
	return table[indexBitrate] * 1000
}
