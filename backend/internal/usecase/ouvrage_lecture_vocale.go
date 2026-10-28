// ouvrage_lecture_vocale.go — SECT-TTS-1 : lecture ORALE d'un ouvrage
// (usecase). Route : GET /api/ouvrages/{id}/lecture-vocale?page&voice&vitesse.
//
// CHAÎNE (0 coût, clés déjà en base — cf internal/tts) :
//
//	PDF (R2, cache disque) → extraction texte de LA page (ledongthuc/pdf,
//	qpdf --decrypt au besoin) → nettoyage prosodique → Gemini TTS studio
//	→ MeloTTS en dernier secours → octets audio (SECT-TTS-4 : la couche
//	Edge est retirée du système — cf internal/tts/tts.go).
//
// SÉCURITÉ (posture BIBLIO-14/15 inchangée) :
//   - visibilité RLS via FindByID (404 si invisible) ;
//   - le TEXTE extrait ne sort JAMAIS du serveur — seul l'audio part ;
//   - audit OUVRAGE_LECTURE comme /flux (c'est un accès de lecture) ;
//   - garde anti-abus : vitesse bornée, page dans les bornes, rate-limit
//     et sémaphore côté service TTS.
package usecase

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/ledongthuc/pdf"
	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// ──────────────────────────────────────────────────────────────────────────
// Bornes & caches
// ──────────────────────────────────────────────────────────────────────────

// maxRunesPageTTS — plafond de texte par synthèse (une page A4 dense ≈
// 4 000 runes ; le TTS Gemini tient largement ce format « long-form »,
// le plafond protège le quota gratuit d'un PDF piégé à page géante).
const maxRunesPageTTS = 4_000

// taillePDFMax — plafond de lecture d'un PDF depuis R2 (200 Mo : bien
// au-delà du quota de dépôt, garde OOM sur un objet corrompu).
const taillePDFMax = 200 << 20

// cachePDFDir — cache DISQUE des PDF (sous le tmp de l'instance) : un
// ouvrage est téléchargé de R2 UNE fois, puis toutes les pages se
// servent localement. L'instance Render/OCI redémarre → cache vide →
// re-téléchargement paresseux. Cap total ~400 Mo, purge au-delà.
var cachePDFDir = filepath.Join(os.TempDir(), "sect-tts-lecture")

// cacheTextePages — texte NETTOYÉ par (ouvrage|page) en mémoire (petit :
// ~4 Ko/page) : la navigation retour-arrière ne re-extrait rien.
var (
	cacheTexteMu sync.Mutex
	cacheTexte   = map[string]string{}
)

var (
	// idPDFValide — l'ID sert de nom de fichier cache : alphanumérique
	// strict (l'ID vient de la DB via FindByID, mais défense en profondeur
	// contre tout chemin injecté un jour).
	idPDFValide = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

	// ligneNumerique — lignes à écarter (numéros de page, traits de
	// séparation, chiffres isolés en pied de page).
	ligneNumerique = regexp.MustCompile(`^[\s]*[0-9ivxlcdmIVXLCDM\s.,—–-]*$`)

	// césureFinDeLigne — « exem-\nple » → « exemple » (livres français
	// justifiés : la quasi-totalité des fins de ligne en césure).
	cesureFinDeLigne = regexp.MustCompile(`([a-zà-öø-ÿ])-\n([a-zà-öø-ÿ])`)

	// ponctuationCollee — « mot.Mot » → « mot. Mot » (sinon la prosodie
	// avale les fins de phrase : le TTS respire sur les ponctuations).
	ponctuationCollee = regexp.MustCompile(`([.,;:!?])([A-Za-zÀ-ÿ])`)

	// blancsMultiples — tous les blancs (retours ligne inclus) → espace
	// simple : le TTS gère la prosodie par la ponctuation.
	blancsMultiples = regexp.MustCompile(`\s+`)
)

// ──────────────────────────────────────────────────────────────────────────
// Usecase
// ──────────────────────────────────────────────────────────────────────────

// GetLectureVocale — audio d'une page d'ouvrage (lecture orale).
//
// Sémantique LECTURE (comme /flux) : visibilité RLS via FindByID, audit
// OUVRAGE_LECTURE, le flag telechargementAutorise ne s'applique PAS (la
// consultation orale est de la lecture, pas un acte de téléchargement —
// et l'audio de synthèse n'est de toute façon pas le fichier d'origine).
func (uc *OuvrageUseCase) GetLectureVocale(ctx context.Context, claims db.SessionClaims, id string, page int, voice, vitesse string, ip string) (*domain.LectureVocaleResult, error) {
	// 1. Visibilité (RLS — 404 si invisible : jamais de fuite d'existence).
	o, err := uc.ouvrageRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// 2. Pré-requis techniques (messages actionnables, comme /flux).
	if o.CheminStockage == nil || *o.CheminStockage == "" {
		return nil, &domain.ValidationError{Field: "fichier", Message: "fichier non stocké pour cet ouvrage (mode DB-only)"}
	}
	if uc.storage == nil {
		return nil, &domain.ValidationError{Field: "fichier", Message: "stockage non configuré — la lecture vocale nécessite la configuration R2"}
	}
	if uc.ttsService == nil {
		return nil, &domain.ValidationError{Field: "tts", Message: "lecture vocale non configurée sur cette instance"}
	}

	// 3. Octets du PDF (cache disque : R2 n'est téléchargé qu'une fois).
	data, err := uc.octetsPDFLecture(ctx, o.ID, *o.CheminStockage)
	if err != nil {
		return nil, fmt.Errorf("récupération du PDF: %w", err)
	}

	// 4. Texte de la page (cache mémoire + déchiffrement au besoin).
	texte, nbPages, err := uc.textePageLecture(ctx, o.ID, data, page)
	if err != nil {
		return nil, err
	}
	if page < 1 || page > nbPages {
		return nil, &domain.ValidationError{
			Field:   "page",
			Message: fmt.Sprintf("page %d hors bornes (document de %d pages)", page, nbPages),
		}
	}
	if strings.TrimSpace(texte) == "" {
		return nil, &domain.ValidationError{
			Field:   "page",
			Message: "cette page ne contient pas de texte extractible (document probablement scanné) — la lecture vocale nécessite un PDF textuel",
		}
	}

	// 5. Synthèse (chaîne gratuite Gemini → MeloTTS — Edge retiré SECT-TTS-4).
	res, err := uc.ttsService.SyntheseLecture(ctx, texte, voice, vitesse, claims.UserID)
	if err != nil {
		slog.Warn("bibliothèque: synthèse vocale en échec", "ouvrageId", o.ID, "page", page, "error", err)
		return nil, &domain.TTSIndisponibleError{
			Message: "lecture vocale momentanément indisponible (fournisseurs gratuits saturés ou en échec) — réessayez dans quelques minutes",
		}
	}

	// 6. Audit de lecture (best-effort, même trace que /flux : c'est une
	// lecture, l'audio de synthèse n'est pas un téléchargement du fichier).
	auditErr := uc.ouvrageRepo.AuditLecture(ctx, domain.OuvrageAuditEntry{
		OuvrageID:       o.ID,
		Titre:           o.Titre,
		Categorie:       o.Categorie,
		ActorUserID:     claims.UserID,
		ActorEmail:      claims.Email,
		ActorIP:         ip,
		EtablissementID: o.EtablissementID,
		ExpiresIn:       0,
	})
	if auditErr != nil {
		slog.Warn("bibliothèque: audit de lecture (vocale) échoué (audio servi quand-même)", "ouvrageId", o.ID, "error", auditErr)
	}

	return &domain.LectureVocaleResult{
		Audio:       res.Audio,
		ContentType: res.ContentType,
		Provider:    res.Provider,
		Model:       res.Model,
		NbPages:     nbPages,
	}, nil
}

// ──────────────────────────────────────────────────────────────────────────
// Cache disque des PDF
// ──────────────────────────────────────────────────────────────────────────

// octetsPDFLecture retourne les octets du PDF (cache disque en premier,
// sinon téléchargement R2 → fichier). Purge simple au-delà de ~400 Mo.
func (uc *OuvrageUseCase) octetsPDFLecture(ctx context.Context, ouvrageID, cheminStockage string) ([]byte, error) {
	if !idPDFValide.MatchString(ouvrageID) || os.MkdirAll(cachePDFDir, 0o700) != nil {
		// Cache indisponible (ID inattendu ou tmp non créable) : lecture
		// directe en RAM (cas défensif — les IDs de la DB passent le
		// filtre et le tmp existe toujours en pratique).
		return uc.telechargerPDFEnRAM(ctx, cheminStockage)
	}

	chemin := filepath.Join(cachePDFDir, ouvrageID+".pdf")
	if data, err := os.ReadFile(chemin); err == nil && len(data) > 0 {
		return data, nil
	}

	// Télécharger en fichier temporaire puis rename atomique (une requête
	// concurrente ne lit jamais un demi-fichier).
	body, _, _, err := uc.storage.DownloadStream(ctx, cheminStockage)
	if err != nil {
		return nil, err
	}
	defer func() { _ = body.Close() }()

	tmp, err := os.CreateTemp(cachePDFDir, "dl-*.part")
	if err != nil {
		return uc.telechargerPDFEnRAM(ctx, cheminStockage)
	}
	tmpNom := tmp.Name()
	defer func() { _ = os.Remove(tmpNom) }()

	if _, err := io.Copy(tmp, io.LimitReader(body, taillePDFMax)); err != nil {
		_ = tmp.Close()
		return nil, fmt.Errorf("téléchargement du PDF: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return nil, err
	}

	// Cap disque : si le cache dépasse 400 Mo, purge (les ouvrages
	// populaires se re-remplissent aussitôt — egress R2 gratuit).
	_ = purgerCacheSiGros()

	if err := os.Rename(tmpNom, chemin); err != nil {
		return nil, err
	}
	return os.ReadFile(chemin)
}

// telechargerPDFEnRAM — fallback sans cache disque.
func (uc *OuvrageUseCase) telechargerPDFEnRAM(ctx context.Context, cheminStockage string) ([]byte, error) {
	body, _, _, err := uc.storage.DownloadStream(ctx, cheminStockage)
	if err != nil {
		return nil, err
	}
	defer func() { _ = body.Close() }()
	return io.ReadAll(io.LimitReader(body, taillePDFMax))
}

// purgerCacheSiGros supprime les fichiers du cache si le total dépasse
// ~400 Mo (best-effort : une erreur de purge n'interrompt pas la lecture).
func purgerCacheSiGros() error {
	entries, err := os.ReadDir(cachePDFDir)
	if err != nil {
		return err
	}
	var total int64
	for _, e := range entries {
		if info, err := e.Info(); err == nil {
			total += info.Size()
		}
	}
	if total < 400<<20 {
		return nil
	}
	for _, e := range entries {
		if !e.IsDir() {
			_ = os.Remove(filepath.Join(cachePDFDir, e.Name()))
		}
	}
	slog.Info("bibliothèque: cache disque PDF (lecture vocale) purgé", "avantMo", total>>20)
	return nil
}

// ──────────────────────────────────────────────────────────────────────────
// Extraction du texte de page
// ──────────────────────────────────────────────────────────────────────────

// textePageLecture extrait (et nettoie) le texte d'une page. Cache mémoire
// par (ouvrage|page). PDF chiffré « Acrobat standard, mot de passe vide »
// → decryptPDF (qpdf) une seule fois, puis le fichier cache est REMPLACÉ
// par la version déchiffrée (les pages suivantes lisent directement).
func (uc *OuvrageUseCase) textePageLecture(ctx context.Context, ouvrageID string, data []byte, page int) (string, int, error) {
	cle := fmt.Sprintf("%s|%d", ouvrageID, page)

	cacheTexteMu.Lock()
	if t, ok := cacheTexte[cle]; ok {
		cacheTexteMu.Unlock()
		n, errNb := nbPagesPDF(data)
		return t, n, errNb
	}
	cacheTexteMu.Unlock()

	texte, nbPages, err := extraireTextePage(data, page)
	if err == nil && strings.TrimSpace(texte) == "" {
		// Peut-être chiffré (RC4 standard, mot de passe vide) : tenter
		// qpdf une seule fois pour CET ouvrage.
		if dec := decryptPDF(ctx, data); dec != nil {
			if t2, n2, err2 := extraireTextePage(dec, page); err2 == nil && strings.TrimSpace(t2) != "" {
				texte, nbPages = t2, n2
				// Remplacer le cache disque par la version déchiffrée et
				// invalider le texte mis en cache pour cet ouvrage (les
				// pages extraites du PDF chiffré étaient vides).
				if idPDFValide.MatchString(ouvrageID) {
					if err := os.MkdirAll(cachePDFDir, 0o700); err == nil {
						_ = os.WriteFile(filepath.Join(cachePDFDir, ouvrageID+".pdf"), dec, 0o600)
					}
				}
				cacheTexteMu.Lock()
				for k := range cacheTexte {
					if strings.HasPrefix(k, ouvrageID+"|") {
						delete(cacheTexte, k)
					}
				}
				t := nettoyerTexteTTS(texte)
				cacheTexte[cle] = t
				cacheTexteMu.Unlock()
				return t, nbPages, nil
			}
		}
	}

	t := nettoyerTexteTTS(texte)
	cacheTexteMu.Lock()
	cacheTexte[cle] = t
	cacheTexteMu.Unlock()
	return t, nbPages, err
}

// extraireTextePage — extraction GÉOMÉTRIQUE d'une page (ledongthuc/pdf).
//
// GetPlainText colle les mots quand un PDF positionne ses lignes par Td
// (mesuré en réel sur un PDF du siècle dernier : « mot.Mot » sans aucun
// séparateur — inaudible en TTS). On reconstruit donc le texte depuis
// les chunks positionnés (p.Content().Text) :
//   - saut de Y → nouvelle ligne ;
//   - écart horizontal entre la fin d'un chunk et le début du suivant →
//     espace manquant (les générateurs n'émettent pas toujours les
//     espaces explicitement) ;
//   - l'ordre est celui du flux de contenu (ordre de lecture des
//     générateurs standards — les livres sont mono-colonne).
func extraireTextePage(content []byte, page int) (string, int, error) {
	r, err := pdf.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return "", 0, err
	}
	n := r.NumPage()
	if page < 1 || page > n {
		return "", n, nil
	}
	p := r.Page(page)
	if p.V.IsNull() {
		return "", n, nil
	}

	chunks := p.Content().Text
	if len(chunks) == 0 {
		// Fallback historique (certains PDFs exotiques) — mieux collé que
		// rien : la dégradation reste propre (page « sans texte » si vide).
		txt, err := p.GetPlainText(nil)
		if err != nil {
			return "", n, nil
		}
		return txt, n, nil
	}

	var sb strings.Builder
	const yInconnu = -1e9
	dernierY := yInconnu
	derniereFinX := yInconnu
	derniereTaille := 0.0

	for _, ch := range chunks {
		if ch.S == "" {
			continue
		}
		taille := ch.FontSize
		if taille <= 0 {
			taille = 12 // taille inconnue (certains PDFs) : heuristique standard
		}
		if dernierY != yInconnu {
			if abs64(ch.Y-dernierY) > max64(2, taille*0.5) {
				// Nouvelle ligne (tolérance : demi-corps de caractère — les
				// chunks d'une même ligne oscillent légèrement en Y). Pas de
				// saut de valeur : la fin X du PREMIER chunk de la ligne sert
				// de référence à la suivante (réaffectée après le if).
				sb.WriteByte('\n')
			} else if derniereFinX != yInconnu {
				// Même ligne : espace si écart horizontal significatif.
				cart := ch.X - derniereFinX
				if cart > max64(0.8, taille*0.2) && !finitParEspace(sb.String()) && !commenceParEspace(ch.S) {
					sb.WriteByte(' ')
				}
			}
		}
		sb.WriteString(ch.S)
		dernierY = ch.Y
		derniereFinX = ch.X + ch.W
		derniereTaille = taille
	}
	_ = derniereTaille
	return sb.String(), n, nil
}

func abs64(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

func max64(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

// finitParEspace / commenceParEspace — évitent les espaces doublés
// (certains chunks portent déjà leurs espaces).
func finitParEspace(s string) bool {
	return s != "" && (s[len(s)-1] == ' ' || s[len(s)-1] == '\n' || s[len(s)-1] == '\t')
}

func commenceParEspace(s string) bool {
	return s != "" && (s[0] == ' ' || s[0] == '\n' || s[0] == '\t')
}

// nbPagesPDF — juste le total de pages.
func nbPagesPDF(content []byte) (int, error) {
	r, err := pdf.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return 0, err
	}
	return r.NumPage(), nil
}

// nettoyerTexteTTS prépare le texte pour la synthèse :
//   - écarter les lignes « décoratives » (numéros de page, séparateurs) ;
//   - recoudre les césures de fin de ligne (« exem-\nple » → « exemple ») ;
//   - aérer la ponctuation collée (« mot.Mot » → « mot. Mot » — sinon la
//     prosodie avale les fins de phrase) ;
//   - normaliser les blancs en espaces simples (une seule « phrase »
//     continue par page : le TTS gère lui-même la ponctuation) ;
//   - plafonner à maxRunesPageTTS.
func nettoyerTexteTTS(texte string) string {
	lignes := strings.Split(texte, "\n")
	var garde []string
	for _, l := range lignes {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		// Ligne purement numérique/séparation (pied de page, folio).
		if ligneNumerique.MatchString(l) {
			continue
		}
		garde = append(garde, l)
	}
	s := strings.Join(garde, "\n")

	// Césures : recoudre AVANT de normaliser les blancs (la fin de ligne
	// doit rester repérable par \n).
	s = cesureFinDeLigne.ReplaceAllString(s, "$1$2")
	s = ponctuationCollee.ReplaceAllString(s, "$1 $2")
	s = blancsMultiples.ReplaceAllString(s, " ")
	s = recollerLettresIsolees(s)
	s = strings.TrimSpace(s)

	if utf8.RuneCountInString(s) > maxRunesPageTTS {
		runes := []rune(s)
		s = string(runes[:maxRunesPageTTS])
	}
	return s
}

// ──────────────────────────────────────────────────────────────────────────
// Défense anti-« épellation » (SECT-TTS-4)
// ──────────────────────────────────────────────────────────────────────────

// seuilRunLettres — nombre minimal de jetons mono-lettre consécutifs pour
// recoller : 5. Le français réel ne présente JAMAIS cinq lettres isolées
// d'affilée séparées par un espace (« il y a » en compte deux), tandis
// qu'un artefact d'extraction épelle des mots entiers. Les sigles courts
// (« H T T P » = 4) restent donc épelés — c'est leur lecture attendue.
const seuilRunLettres = 5

// recollerLettresIsolees recolle les runs de LETTRES ISOLÉES séparées par
// des espaces simples (« L e t t r e s » → « Lettres ») : artefact
// d'extraction PDF quand chaque glyphe est positionné séparément avec des
// avancées larges — un moteur TTS littéral ÉPELLE lettre à lettre au lieu
// de lire le mot (constat utilisateur réel à l'origine de SECT-TTS-4).
// Traitement par LIGNE : les retours à la ligne ne participent jamais aux
// runs (un jeton portant un \n n'est pas mono-lettre).
func recollerLettresIsolees(s string) string {
	if !strings.Contains(s, " ") {
		return s
	}
	lignes := strings.Split(s, "\n")
	for i, l := range lignes {
		lignes[i] = recollerRunsMonoLettres(l)
	}
	return strings.Join(lignes, "\n")
}

// recollerRunsMonoLettres recolle, DANS UNE LIGNE, les runs d'au moins
// seuilRunLettres jetons mono-lettre en un seul mot (les autres jetons
// sont recopiés tels quels, espaces préservés).
func recollerRunsMonoLettres(ligne string) string {
	mots := strings.Split(ligne, " ")
	sortie := make([]string, 0, len(mots))
	for i := 0; i < len(mots); {
		j := i
		for j < len(mots) && estMonoLettre(mots[j]) {
			j++
		}
		if j == i { // jeton normal (pas mono-lettre) : avancer d'un
			sortie = append(sortie, mots[i])
			i++
			continue
		}
		if j-i >= seuilRunLettres {
			sortie = append(sortie, strings.Join(mots[i:j], ""))
		} else {
			sortie = append(sortie, mots[i:j]...)
		}
		i = j
	}
	return strings.Join(sortie, " ")
}

// estMonoLettre — le jeton est EXACTEMENT une lettre (« L », « é »…).
func estMonoLettre(mot string) bool {
	r, taille := utf8.DecodeRuneInString(mot)
	return taille == len(mot) && unicode.IsLetter(r)
}
