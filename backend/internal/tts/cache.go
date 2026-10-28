// cache.go — SECT-TTS-4 : cache disque des synthèses de lecture.
//
// POURQUOI : le palier gratuit du TTS Gemini est de 10 requêtes/JOUR et
// PAR MODÈLE (mesuré en production le 2026-10-28, réponse 429 explicite :
// « generate_content_free_tier_requests, limit: 10, model:
// gemini-3.8-flash-tts, description: Generate content requests per day
// limit exceeded on Free Tier »). Sans cache, la onzième lecture de la
// journée bascule sur MeloTTS (voix « machine ») — exactement le
// symptôme « toutes les voix sont devenues robotiques » rapporté par
// l'exploitant. Or l'usage scolaire est massivement RÉPÉTITIF : des
// dizaines d'élèves écoutent les MÊMES pages du même ouvrage.
//
// Le cache sert donc l'audio DÉJÀ synthétisé (frappe = zéro requête API,
// zéro quota consommé, latence disque seulement) :
//   - clé = SHA-256(voix normalisée \x00 vitesse bornée \x00 texte) — la
//     même page lue par toute une classe partage UNE entrée, quel que
//     soit l'élève (l'audio de synthèse ne dépend pas du lecteur) ;
//   - fichier `<clé>.audio` (octets) + sidecar `<clé>.meta`
//     (contentType|provider|modèle) — l'observabilité X-Sect-Tts-*
//     reste EXACTE sur une frappe de cache (fournisseur d'origine) ;
//   - écriture atomique (tmp + rename, miroir du cache PDF de la
//     bibliothèque), permissions 0600, répertoire 0700 ;
//   - éviction du PLUS ANCIEN d'abord au-delà de ~512 Mo (best-effort,
//     jamais bloquant) ; un audio de plus de 32 Mo n'est pas caché ;
//   - posture de sécurité inchangée : seuls des OCTETS audio (jamais le
//     texte extrait) touchent le disque, et uniquement APRÈS le contrôle
//     d'accès du usecase — le cache ne fait que resservir ce que l'API
//     servait déjà aux lecteurs autorisés du même contenu.
package tts

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// cacheAudioDir — cache DISQUE des audios de synthèse (sous le tmp de
// l'instance) : l'instance redémarre → cache vide → re-remplissage
// paresseux (le quota du jour n'est re-consommé que pour les pages
// pas encore entendues depuis le redémarrage).
var cacheAudioDir = filepath.Join(os.TempDir(), "sect-tts-audio")

const (
	// tailleAudioMaxCache — plafond d'un audio cachable (32 Mo : bien
	// au-delà d'une page ; un segment dégénéré ne remplit pas le disque).
	tailleAudioMaxCache = 32 << 20

	// capCacheAudio — capacité totale du cache (~512 Mo : des centaines
	// de pages d'audio). Au-delà : éviction du plus ancien.
	capCacheAudio = 512 << 20
)

// cleCacheSynthese — clé de cache d'une synthèse de lecture. La voix est
// NORMALISÉE (une valeur héritée « edge:henri » et « kore » partagent la
// même entrée — elles produisent le même audio) et la vitesse BORNÉE.
func cleCacheSynthese(texte, voice string, vitesse float64) string {
	h := sha256.Sum256([]byte(normaliserVoix(voice) + "\x00" + fmt.Sprintf("%.3f", vitesse) + "\x00" + texte))
	return hex.EncodeToString(h[:])
}

// lireCacheAudio retourne le résultat caché (nil si absent/corrompu —
// l'appelant resynthétise alors normalement, le cache ne fait jamais
// échouer une lecture).
func (s *Service) lireCacheAudio(cle string) *Result {
	if len(cle) != sha256.Size*2 {
		return nil
	}
	data, err := os.ReadFile(filepath.Join(cacheAudioDir, cle+".audio"))
	if err != nil || len(data) < 64 {
		return nil // absent ou trop court pour être de l'audio honnête
	}

	ct := snifferContentTypeAudio(data)
	provider, model := "cache", ""
	if meta, err := os.ReadFile(filepath.Join(cacheAudioDir, cle+".meta")); err == nil {
		if parties := strings.Split(strings.TrimSpace(string(meta)), "|"); len(parties) == 3 {
			// Le sidecar prime (il connaît le VRAI fournisseur d'origine).
			if parties[0] != "" {
				ct = parties[0]
			}
			provider, model = parties[1], parties[2]
		}
	}
	return &Result{Audio: data, ContentType: ct, Provider: provider, Model: model}
}

// ecrireCacheAudio — écriture best-effort (une erreur de cache n'entrave
// JAMAIS la réponse audio : l'appelant a déjà son résultat en main).
func (s *Service) ecrireCacheAudio(cle string, res *Result) {
	if res == nil || len(res.Audio) < 64 || len(res.Audio) > tailleAudioMaxCache {
		return
	}
	if len(cle) != sha256.Size*2 {
		return
	}
	if err := os.MkdirAll(cacheAudioDir, 0o700); err != nil {
		return
	}

	_ = purgerCacheAudioSiGros()

	base := filepath.Join(cacheAudioDir, cle)
	audioTmp, metaTmp := base+".audio.tmp", base+".meta.tmp"

	meta := strings.Join([]string{res.ContentType, res.Provider, res.Model}, "|") + "\n"
	if os.WriteFile(metaTmp, []byte(meta), 0o600) != nil {
		return
	}
	if os.WriteFile(audioTmp, res.Audio, 0o600) != nil {
		_ = os.Remove(metaTmp)
		return
	}
	// Renommer l'AUDIO en dernier : sa présence est la condition de
	// validité d'une entrée (un meta orphelin est ignoré à la lecture).
	if os.Rename(metaTmp, base+".meta") != nil {
		_ = os.Remove(audioTmp)
		return
	}
	_ = os.Rename(audioTmp, base+".audio")
}

// purgerCacheAudioSiGros — éviction du PLUS ANCIEN d'abord jusqu'à
// repasser sous ~70 % de la capacité (les pages populaires se
// re-remplissent aussitôt). Best-effort, jamais bloquant.
func purgerCacheAudioSiGros() error {
	entries, err := os.ReadDir(cacheAudioDir)
	if err != nil {
		return err
	}

	type fichier struct {
		chemin string
		taille int64
		modif  int64
	}
	var fichiers []fichier
	var total int64
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".audio") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		fichiers = append(fichiers, fichier{
			chemin: filepath.Join(cacheAudioDir, e.Name()),
			taille: info.Size(),
			modif:  info.ModTime().Unix(),
		})
		total += info.Size()
	}
	if total <= capCacheAudio {
		return nil
	}

	sort.Slice(fichiers, func(i, j int) bool { return fichiers[i].modif < fichiers[j].modif })
	cible := int64(capCacheAudio) * 7 / 10
	for _, f := range fichiers {
		if total <= cible {
			break
		}
		cle := strings.TrimSuffix(f.chemin, ".audio")
		_ = os.Remove(f.chemin)
		_ = os.Remove(cle + ".meta")
		total -= f.taille
	}
	return nil
}

// snifferContentTypeAudio — magic bytes (RIFF/WAVE → wav ; trame MPEG ou
// ID3 → mpeg). Défense en profondeur si le sidecar manque.
func snifferContentTypeAudio(data []byte) string {
	if len(data) > 12 && string(data[0:4]) == "RIFF" && string(data[8:12]) == "WAVE" {
		return "audio/wav"
	}
	if len(data) > 3 && (data[0] == 0xFF || string(data[0:3]) == "ID3") {
		return "audio/mpeg"
	}
	return "audio/wav"
}
