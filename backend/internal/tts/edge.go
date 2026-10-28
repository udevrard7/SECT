// edge.go — SECT-TTS-2 : couche complémentaire EDGE NEURAL TTS (0 €).
//
// Le service « Read Aloud » de Microsoft Edge expose les voix NEURALES
// Azure (fr-FR-DeniseNeural, fr-FR-HenriNeural…) — la meilleure qualité
// française hors Gemini — SANS clé API et SANS quota : illimité, 0 €.
// C'est l'option complémentaire validée par l'exploitant pour muscler
// la chaîne SECT-TTS-1 sans toucher à l'objectif 0 coût.
//
// PRUDENCE D'INGÉNIERIE (pourquoi Edge n'est PAS le primaire) :
//   - l'endpoint wss://speech.platform.bing.com n'est PAS une API
//     publique contractualisée : c'est le flux reverse-engineered du
//     navigateur, protégé par un jeton DRM « Sec-MS-GEC » v2 (SHA-256
//     custom + CS64, déjà 2 ruptures publiques) que la communauté
//     edge-tts suit à chaque durcissement Microsoft ;
//   - un port Go natif de ce DRM casserait à la prochaine évolution :
//     on délègue au CLI `edge-tts` (pip, installé au build du conteneur
//     — cf Dockerfile) ; binaire ABSENT → couche silencieusement
//     inactive, la chaîne Gemini → MeloTTS reste intacte ;
//   - la ToS Microsoft réserve ce flux au navigateur Edge : toléré de
//     facto à l'échelle communautaire, mais une plateforme commerciale
//     ne doit pas en DÉPENDRE — d'où sa place de complément (secours +
//     choix explicite), jamais de primaire.
//
// INTÉGRATION :
//   - voix « edge:xxx » → routage DIRECT (choix utilisateur conscient
//     dans le lecteur) ; en échec, l'écoute bascule sur la chaîne
//     normale : elle ne s'arrête jamais ;
//   - sinon, secours n°2 ENTRE Gemini et MeloTTS : qualité Neural
//     Azure > MeloTTS, illimité, indépendant de Google ET Cloudflare.
package tts

import (
	"context"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ──────────────────────────────────────────────────────────────────────────
// Voix Neural françaises (liste blanche — mesuré : edge-tts --list-voices)
// ──────────────────────────────────────────────────────────────────────────

// voixEdgeFR — les voix fr-FR RÉELLEMENT exposées par l'endpoint. Les
// variantes régionales (fr-CA/BE/CH) existent aussi mais restent hors
// proposition : le français hexagonal est la référence des apprenants.
var voixEdgeFR = map[string]string{
	"denise":   "fr-FR-DeniseNeural",
	"eloise":   "fr-FR-EloiseNeural",
	"henri":    "fr-FR-HenriNeural",
	"remy":     "fr-FR-RemyMultilingualNeural",
	"vivienne": "fr-FR-VivienneMultilingualNeural",
}

// voixEdgeDepuisParam détecte le préfixe « edge: » (choix EXPLICITE du
// lecteur) et résout la voix Azure (liste blanche, défaut Denise — la
// défense en profondeur blanchit toute valeur inconnue, comme les voix
// studio Gemini).
func voixEdgeDepuisParam(voice string) (string, bool) {
	v := strings.ToLower(strings.TrimSpace(voice))
	if !strings.HasPrefix(v, "edge:") {
		return "", false
	}
	cle := strings.TrimPrefix(v, "edge:")
	if nom, ok := voixEdgeFR[cle]; ok {
		return nom, true
	}
	for _, nom := range voixEdgeFR {
		if strings.EqualFold(cle, nom) {
			return nom, true
		}
	}
	return voixEdgeFR["denise"], true
}

// voixEdgeContinuite — bascule Gemini→Edge : on garde le GENRE de la
// voix studio choisie (l'auditeur qui écoute « Charon » au masculin ne
// bascule pas sur une voix féminine en milieu de chapitre).
var voixEdgeContinuite = map[string]string{
	"puck":       "fr-FR-HenriNeural",
	"charon":     "fr-FR-HenriNeural",
	"fenrir":     "fr-FR-HenriNeural",
	"orus":       "fr-FR-HenriNeural",
	"sadaltager": "fr-FR-HenriNeural",
}

// voixEdgeParDefaut — voix de secours Edge (voix studio féminine ou
// inconnue → Denise).
const voixEdgeParDefaut = "fr-FR-DeniseNeural"

// ──────────────────────────────────────────────────────────────────────────
// Binaire edge-tts (sous-processus best-effort)
// ──────────────────────────────────────────────────────────────────────────

// Le CLI est résolu UNE fois par processus (LookPath). Absent → chaîne
// vide → couche inactive : le service ne casse JAMAIS parce qu'un outil
// optionnel manque (rollback d'image, base non reconstruite…). Une
// installation à chaud nécessite un redémarrage de l'instance —
// documenté, assumé (les déploiements reconstruisent l'image).
var (
	edgeBinOnce   sync.Once
	edgeBinChemin string
)

func binaireEdge() string {
	edgeBinOnce.Do(func() {
		if p, err := exec.LookPath("edge-tts"); err == nil {
			edgeBinChemin = p
		}
	})
	return edgeBinChemin
}

// syntheseEdge — exécute le CLI et lit le MP3 produit.
//
//   - le texte passe par FICHIER (jamais en argv : une page pleine
//     dépasse allègrement les conventions de ligne de commande, et le
//     fichier évite tout souci de quoting) ;
//   - la vitesse devient un SSML rate en pourcentage : Edge accélère la
//     PROSODIE du modèle neuronal (vrai contrôle TTS), pas un simple
//     resampling — plus fidèle que la lecture accélérée du navigateur ;
//   - 403 dans la sortie = Microsoft refuse (DRM durci, IP…) →
//     httpError → cooldown long, comme les autres providers.
func (s *Service) syntheseEdge(ctx context.Context, text, voixAzure string, vitesse float64) (*Result, error) {
	bin := binaireEdge()
	if bin == "" {
		return nil, fmt.Errorf("edge-tts non installé sur cette instance (couche inactive)")
	}

	// Garde-fou : borner en absolu aussi pour les appels internes sans
	// deadline (le ctx HTTP coupe déjà à la déconnexion du client).
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 2*time.Minute)
		defer cancel()
	}

	dir, err := os.MkdirTemp("", "sect-edge-tts-")
	if err != nil {
		return nil, err
	}
	defer func() { _ = os.RemoveAll(dir) }()

	fichierTexte := filepath.Join(dir, "page.txt")
	fichierAudio := filepath.Join(dir, "page.mp3")
	if err := os.WriteFile(fichierTexte, []byte(text), 0o600); err != nil {
		return nil, err
	}

	pct := int(math.Round((vitesse - 1) * 100))
	rate := fmt.Sprintf("%+d%%", pct)

	cmd := exec.CommandContext(ctx, bin,
		"--voice", voixAzure,
		"--rate", rate,
		"--file", fichierTexte,
		"--write-media", fichierAudio,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		msg := strings.TrimSpace(string(out))
		if strings.Contains(msg, "403") {
			return nil, &httpError{status: 403, body: coupeMsg(msg, 200)}
		}
		return nil, fmt.Errorf("edge-tts échec: %w — %s", err, coupeMsg(msg, 200))
	}

	audio, err := os.ReadFile(fichierAudio)
	if err != nil {
		return nil, err
	}
	// MP3 : trame MPEG (0xFF…) ou tag ID3. Trop court = échec honnête
	// (un fichier quasi vide serait un silence servi pour du son).
	if len(audio) < 64 || (audio[0] != 0xFF && string(audio[:3]) != "ID3") {
		return nil, fmt.Errorf("edge-tts sortie invalide (%d octets)", len(audio))
	}
	return &Result{
		Audio:       audio,
		ContentType: "audio/mpeg",
		Provider:    "edge",
		Model:       voixAzure,
	}, nil
}

// coupeMsg tronque un message de diagnostic proprement.
func coupeMsg(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
