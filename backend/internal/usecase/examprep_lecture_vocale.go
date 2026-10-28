// examprep_lecture_vocale.go — SECT-TTS-3 : lecture ORALE des documents
// exam-prep (usecase). Route :
// GET /api/exam-prep/documents/{id}/lecture-vocale?segment&voice&vitesse.
//
// MÊME chaîne 0 coût que la bibliothèque (internal/tts :
// Gemini studio → Edge Neural → MeloTTS) et MÊME posture de sécurité :
//   - contrôle d'accès strict (étudiant : filière + niveau de l'UE du
//     document — EXAM-PREP-READER-SECURITY-FIX-1, via GetDocumentForReader,
//     source unique de vérité partagée avec /read) ;
//   - le TEXTE ne sort JAMAIS du serveur — seuls des octets audio partent ;
//   - anti-abus embarqué (rate-limit 15/min/utilisateur, sémaphore 3,
//     vitesse bornée, segments plafonnés) côté service TTS ;
//   - pas d'audit dédié : comme /read, c'est un acte de consultation.
//
// Le texte est DÉJÀ en base (Document.contenuTexte, extrait au dépôt) :
// aucune extraction PDF ici — on découpe en SEGMENTS de ~3 800 runes
// (équivalent « page » du lecteur vocal bibliothèque : avance
// automatique, préchargement, cache mémoire par document).
package usecase

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/udevrard7/sect/backend/internal/db"
	"github.com/udevrard7/sect/backend/internal/domain"
)

// maxRunesSegmentDoc — plafond de texte par segment (cohérent avec
// maxRunesPageTTS de la bibliothèque : ~4 000 runes par synthèse, le
// long-form confortable du TTS Gemini).
const maxRunesSegmentDoc = 3_800

// cacheDocSegments — segments NETTOYÉS par document (mémoire : quelques
// Ko par support — le retour-arrière ne re-découpe rien). Purge simple
// au-delà de 200 documents (les supports populaires se re-remplissent
// aussitôt).
var (
	cacheDocMu       sync.Mutex
	cacheDocSegments = map[string][]string{}
)

var (
	// ligneDecorativeDoc — lignes à écarter (folios, séparateurs,
	// en-têtes de page extraits du PDF source).
	ligneDecorativeDoc = regexp.MustCompile(`^[\s]*[0-9ivxlcdmIVXLCDM\s.,—–\-|_/]*$`)

	// markdownEpars — symboles de mise en forme qui se prononcent mal
	// (« **gras** », « ## titre », puces) : le contenuTexte provient de
	// l'extraction du dépôt, il peut traîner des artefacts markdown.
	markdownEpars = regexp.MustCompile(`(?m)^#{1,6}\s+|[*_` + "`" + `]{1,3}|^[-•]\s+`)

	// blancsDoc — normalisation des blancs pour la prosodie.
	blancsDoc = regexp.MustCompile(`[ \t]+`)
)

// GetDocumentLectureVocale — audio d'un SEGMENT de document (lecture
// orale). Segment 1-based ; le total est retourné dans NbPages (même
// contrat frontend que la bibliothèque).
func (uc *ExamPrepUseCase) GetDocumentLectureVocale(ctx context.Context, claims db.SessionClaims, documentID string, segment int, voice, vitesse string) (*domain.LectureVocaleResult, error) {
	// 1. Contrôle d'accès + contenu : GetDocumentForReader est la source
	// unique (étudiant : filière + niveau ; enseignant : libre ; 403/404
	// sinon — jamais de fuite d'existence).
	doc, err := uc.GetDocumentForReader(ctx, claims, documentID)
	if err != nil {
		return nil, err
	}

	if uc.tts == nil {
		return nil, &domain.ValidationError{Field: "tts", Message: "lecture vocale non configurée sur cette instance"}
	}
	if doc.ContenuTexte == nil || strings.TrimSpace(*doc.ContenuTexte) == "" {
		return nil, &domain.ValidationError{
			Field:   "contenuTexte",
			Message: "ce document ne contient pas de texte extractible — la lecture vocale nécessite un support textuel",
		}
	}

	// 2. Segments (cache mémoire — découpage une seule fois par document).
	segments := uc.segmentsDocument(doc.ID, *doc.ContenuTexte)
	if len(segments) == 0 {
		return nil, &domain.ValidationError{
			Field:   "contenuTexte",
			Message: "ce document ne contient pas de texte exploitable pour la lecture vocale",
		}
	}
	if segment < 1 || segment > len(segments) {
		return nil, &domain.ValidationError{
			Field:   "segment",
			Message: fmt.Sprintf("segment %d hors bornes (document de %d parties)", segment, len(segments)),
		}
	}

	// 3. Synthèse (chaîne gratuite, anti-abus embarqué).
	res, err := uc.tts.SyntheseLecture(ctx, segments[segment-1], voice, vitesse, claims.UserID)
	if err != nil {
		slog.Warn("exam-prep: synthèse vocale en échec", "documentId", doc.ID, "segment", segment, "error", err)
		return nil, &domain.TTSIndisponibleError{
			Message: "lecture vocale momentanément indisponible (fournisseurs gratuits saturés ou en échec) — réessayez dans quelques minutes",
		}
	}

	return &domain.LectureVocaleResult{
		Audio:       res.Audio,
		ContentType: res.ContentType,
		Provider:    res.Provider,
		Model:       res.Model,
		NbPages:     len(segments),
	}, nil
}

// segmentsDocument découpe le contenu textuel en segments lisibles d'une
// traite (~3 800 runes), aux frontières de PHRASES (jamais en plein mot) :
//   - nettoyage TTS : artefacts markdown, lignes décoratives, blancs ;
//   - coupes préférées sur « . », « ! », « ? », « ; » puis « \n » ;
//   - un paragraphe plus long que le plafond est coupé à la phrase la
//     plus proche de la cible.
func (uc *ExamPrepUseCase) segmentsDocument(documentID, contenu string) []string {
	cacheDocMu.Lock()
	if segs, ok := cacheDocSegments[documentID]; ok {
		cacheDocMu.Unlock()
		return segs
	}
	cacheDocMu.Unlock()

	texte := nettoyerTexteDocument(contenu)

	var segments []string
	var courant strings.Builder
	courantRunes := 0

	flush := func() {
		if s := strings.TrimSpace(courant.String()); s != "" {
			segments = append(segments, s)
		}
		courant.Reset()
		courantRunes = 0
	}

	phrases := couperPhrases(texte)
	for _, phrase := range phrases {
		n := utf8.RuneCountInString(phrase)
		if n == 0 {
			continue
		}
		// Phrase isolée plus longue que le plafond : coupe dure aux runes
		// (garde-fou — la phrase a déjà été coupée aux « . » si possible).
		for n > maxRunesSegmentDoc {
			r := []rune(phrase)
			flush()
			segments = append(segments, string(r[:maxRunesSegmentDoc]))
			phrase = string(r[maxRunesSegmentDoc:])
			n = utf8.RuneCountInString(phrase)
		}
		if courantRunes+n+1 > maxRunesSegmentDoc {
			flush()
		}
		if courant.Len() > 0 {
			courant.WriteString(" ")
			courantRunes++
		}
		courant.WriteString(phrase)
		courantRunes += n
	}
	flush()

	// Cache + purge au-delà de 200 documents (petit : ~4 Ko/segment).
	cacheDocMu.Lock()
	if len(cacheDocSegments) >= 200 {
		cacheDocSegments = map[string][]string{}
	}
	cacheDocSegments[documentID] = segments
	cacheDocMu.Unlock()

	return segments
}

// nettoyerTexteDocument prépare le contenu pour la synthèse.
func nettoyerTexteDocument(contenu string) string {
	lignes := strings.Split(strings.ReplaceAll(contenu, "\r\n", "\n"), "\n")
	var garde []string
	for _, l := range lignes {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		if ligneDecorativeDoc.MatchString(l) {
			continue
		}
		garde = append(garde, l)
	}
	s := strings.Join(garde, "\n")

	// Artefacts markdown épars (gras/titres/puces) : le TTS les
	// prononcerait sinon (symboles bizarres en pleine phrase).
	s = markdownEpars.ReplaceAllString(s, "")

	// Aérer la ponctuation collée (« mot.Mot » → « mot. Mot ») : la
	// prosodie respire sur la ponctuation (miroir exact de la
	// bibliothèque — ouvrage_lecture_vocale.go, même paquet usecase).
	s = ponctuationCollee.ReplaceAllString(s, "$1 $2")

	// Blancs multiples → espace simple (les sauts de ligne portent déjà
	// leur info de coupe aux endroits utiles).
	s = blancsDoc.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

// couperPhrases découpe un texte en phrases (frontières « . », « ! »,
// « ? », « ; », « \n »), en conservant la ponctuation finale.
func couperPhrases(texte string) []string {
	var phrases []string
	var courant strings.Builder
	for _, r := range texte {
		courant.WriteRune(r)
		if r == '.' || r == '!' || r == '?' || r == ';' || r == '\n' {
			if s := strings.TrimSpace(courant.String()); s != "" {
				phrases = append(phrases, s)
			}
			courant.Reset()
		}
	}
	if s := strings.TrimSpace(courant.String()); s != "" {
		phrases = append(phrases, s)
	}
	return phrases
}
