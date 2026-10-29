// podcast.go — SECT-TTS-3 : PODCASTS MULTI-VOIX 0 coût (exam-prep),
// SECT-TTS-5 : FORMAT ÉMISSION DE RADIO avec personnages nommés.
//
// Le script de podcast généré par l'IA est un dialogue entre deux
// PERSONNAGES NOMMÉS (identité fixe imposée par le prompt worker) :
//
//	Aya : Bonjour à toutes et à tous ! Vous écoutez « Révision
//	Express »…
//	<ligne vide>
//	Dr Brou : Bonsoir Aya ! Ravi d'être ce soir dans votre studio…
//
// SynthesePodcast synthétise chaque réplique avec la voix de SON
// locuteur, puis assemble l'épisode complet :
//
//  1. GEMINI STUDIO DUO (primaire) — Puck (Aya Konan, animatrice
//     pétillante) + Charon (Dr Kouassi Brou, expert posé et précis) :
//     WAV 24 kHz mono 16 bits, PCM concaténés avec une RESPIRATION de
//     ~350 ms entre deux prises de parole (le rythme d'une vraie
//     conversation d'antenne, pas d'un collage).
//     SECT-TTS-5 : chaque réplique est précédée d'une INSTRUCTION DE
//     JEU propre au personnage (même mécanisme éprouvé
//     qu'instructionVitesse : on dirige l'interprète studio en langage
//     naturel, sans déformer l'audio) — l'animatrice « pétillante
//     radio FM », l'expert « voix posée de spécialiste invité » :
//     c'est LE levier du rendu « vraie émission de radio ».
//  2. MELOTTS VOIX UNIQUE (dernier secours) — le script entier en une
//     synthèse, SANS les marqueurs de locuteur (on ne fait pas lire
//     « Aya : » à voix haute) : on perd le contraste du dialogue,
//     l'épisode existe quand même (dégradation gracieuse cohérente
//     avec AUDIO-LEARNING-1).
//
// SECT-TTS-4 : le duo Edge Neural (intercalaire SECT-TTS-2) est retiré
// avec toute la couche Edge — mêmes raisons que internal/tts/tts.go
// (MP3 48 kbps « robotique », lecture littérale du script, CLI non
// contractualisé). ConcatMP3/StripID3v2 restent : le worker Voxtral
// (premium opt-in) sert des MP3 à concaténer.
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
	voixPodcastAnimateur = "puck"   // Aya Konan — animatrice vive, enjouée
	voixPodcastExpert    = "charon" // Dr Kouassi Brou — expert posé, précis

	// SECT-TTS-5 — instructions de jeu par personnage (le rendu
	// « émission de radio »). Même mécanisme éprouvé
	// qu'instructionVitesse : une consigne courte en langage naturel
	// PRÉCÉDÉE du texte, jamais mélangée dedans. L'interprète studio
	// Gemini suit la direction, il ne la lit pas.
	consigneJeuAnimateur = "Fais l'animatrice radio vive et souriante d'une émission éducative du soir : rythme entraînant, tonalité pétillante, transitions savourées.\n\n"
	consigneJeuExpert    = "Fais l'expert invité d'une émission de radio : voix posée, chaleureuse et précise, comme un spécialiste qui vulgarise avec passion à l'antenne.\n\n"

	// maxSegmentsPodcast — plafond défensif : un épisode sain de ~6 min
	// fait 18 à 28 répliques (avant fusion) ; au-delà on dégrade en voix
	// unique (un script dégénéré en mitraillette ne doit pas déclencher
	// 200 appels API).
	maxSegmentsPodcast = 60

	// silenceInterlocuteur — respiration insérée entre deux prises de
	// parole de locuteurs DIFFÉRENTS (Gemini/PCM uniquement — un vrai
	// tour de parole d'antenne respire). Les répliques consécutives
	// du MÊME locuteur sont fusionnées : la pause naturelle entre
	// phrases suffit.
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
	// le texte nettoyé — même la chaîne de secours doit sonner humaine,
	// et ne jamais faire lire « Aya : » à voix haute (SECT-TTS-5).
	if len(segments) == 0 || len(segments) > maxSegmentsPodcast {
		s.logger.Info("podcast: script sans dialogue exploitable — voix unique",
			"segments", len(segments), "scriptLen", len(script))
		return s.SyntheseLecture(ctx, texteSansMarqueurs(script, segments), "", "1", "podcast:"+userID)
	}

	// 1. Gemini studio duo (la perle).
	if gem, ok := s.lireProviderRow(ctx, "GOOGLE"); ok && !s.enCooldown("gemini") {
		res, err := s.podcastGemini(ctx, gem, segments)
		if err == nil {
			return res, nil
		}
		s.marquerEchec("gemini", err)
		s.logger.Warn("podcast: duo Gemini échec — bascule MeloTTS voix unique",
			"error", err.Error(), "segments", len(segments))
	}

	// 2. MeloTTS voix unique (dernier secours indépendant de Google).
	if melo, ok := s.lireProviderRow(ctx, "CLOUDFLARE"); ok && !s.enCooldown("melotts") {
		res, err := s.syntheseMeloTTS(ctx, melo, texteSansMarqueurs(script, segments), 1)
		if err == nil {
			return res, nil
		}
		s.marquerEchec("melotts", err)
		s.logger.Warn("podcast: MeloTTS échec", "error", err.Error())
	}

	return nil, fmt.Errorf("synthèse podcast indisponible (tous les fournisseurs gratuits ont échoué)")
}

// texteSansMarqueurs — texte du script pour une lecture MONO-VOIX :
// les marqueurs « Aya : » / « Dr Brou : » (et hérités « Présentateur : » /
// « Expert : ») sont retirés pour ne pas être lus à voix haute, les
// répliques sont jointes par un espace. Sans segments parsés (script
// sans marqueurs), le texte brut est retourné tel quel.
func texteSansMarqueurs(script string, segments []segmentDialogue) string {
	if len(segments) == 0 {
		return script
	}
	var b strings.Builder
	for i, seg := range segments {
		if i > 0 {
			b.WriteByte(' ')
		}
		b.WriteString(seg.Texte)
	}
	return b.String()
}

// podcastGemini — une requête par prise de parole (répliques consécutives
// du même locuteur FUSIONNÉES), voix studio + instruction de jeu selon le
// personnage, puis concaténation PCM + respirations. Un échec quelconque
// → erreur (le PODCAST entier bascule sur la couche suivante — jamais de
// mélange de formats dans un même fichier).
//
// SECT-TTS-5 : la fusion des répliques consécutives d'un même personnage
// réduit le nombre d'appels API (~30 % en moins sur un épisode type) —
// chaque requête économisée est un quota Gemini quotidien préservé.
func (s *Service) podcastGemini(ctx context.Context, gem providerRow, segments []segmentDialogue) (*Result, error) {
	segments = regrouperSegments(segments)
	modele := ""
	wavs := make([][]byte, 0, len(segments))

	for i, seg := range segments {
		vox, consigne := voixPodcastExpert, consigneJeuExpert
		if seg.Locuteur == "animateur" {
			vox, consigne = voixPodcastAnimateur, consigneJeuAnimateur
		}
		res, err := s.segmentAvecSemaphore(ctx, func() (*Result, error) {
			return s.syntheseGemini(ctx, gem, consigne+seg.Texte, vox, 1)
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

// regrouperSegments fusionne les répliques CONSÉCUTIVES d'un même
// locuteur en une seule prise de parole : moins d'appels API (quota),
// et un débit plus naturel (l'expert développe fluidement au lieu de
// mitrailler des répliques courtes). Les respirations restent insérées
// uniquement aux changements de locuteur.
func regrouperSegments(segments []segmentDialogue) []segmentDialogue {
	regroupes := make([]segmentDialogue, 0, len(segments))
	for _, seg := range segments {
		if n := len(regroupes); n > 0 && regroupes[n-1].Locuteur == seg.Locuteur {
			regroupes[n-1].Texte += " " + seg.Texte
			continue
		}
		regroupes = append(regroupes, seg)
	}
	return regroupes
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
//	Aya : Bonjour à toutes et à tous ! Vous écoutez « Révision Express »…
//	<ligne vide>
//	Dr Brou : Bonsoir Aya ! Ravi d'être ce soir dans votre studio…
//
// Les lignes continues sans marqueur sont rattachées au locuteur courant.
//
// Marqueurs reconnus (insensible à la casse/accents) :
//   - animatrice « Aya » : « aya » (SECT-TTS-5) + hérités « présentateur » /
//     « presentateur » / « animateur » / « host » (scripts antérieurs
//     SECT-TTS-3/4 conservés en base) ;
//   - expert « Dr Brou » : « dr brou » / « dr. brou » / « docteur brou » /
//     « brou » / « docteur » (SECT-TTS-5) + hérités « expert » /
//     « professeur ».
//
// La correspondance des préfixes se fait sur la ligne ENTIÈRE en minuscules :
// un marqueur ne peut être qu'un DÉBUT de ligne suivi du séparateur « : »,
// ce qui écarte les faux positifs (une phrase commençant par « Etaient »
// ne peut pas matcher « aya », et « Droit » seul ne matche pas « dr brou »
// car le préfixe court « dr » n'est accepté que devant « brou »).
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
		// estMarqueur : le préfixe doit être suivi (espaces/points mis à
		// part) du séparateur « : » — « Aya : », « Dr. Brou : »… Une ligne
		// de continuation commençant par « Ayant vu cela… » ne matche PAS.
		estMarqueur := func(m string) bool {
			if !strings.HasPrefix(basse, m) {
				return false
			}
			reste := strings.TrimLeft(basse[len(m):], " .")
			return strings.HasPrefix(reste, ":")
		}
		// Animatrice : Aya (SECT-TTS-5) + marqueurs hérités.
		for _, m := range []string{"aya", "présentateur", "presentateur", "animateur", "host"} {
			if estMarqueur(m) {
				marque = "animateur"
				break
			}
		}
		if marque == "" {
			// Expert : Dr Brou (SECT-TTS-5) + marqueurs hérités.
			for _, m := range []string{"dr brou", "dr. brou", "docteur brou", "brou", "docteur", "expert", "professeur"} {
				if estMarqueur(m) {
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
// frame (Voxtral = CBR ; les MP3 historiques Edge restent décodables).
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
