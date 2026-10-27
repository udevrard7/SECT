// Package usecase — extraction de texte des documents (SECT-DOC-IA-1).
//
// PANNE CORRIGÉE : avant ce fix, extractText() ne gérait que TXT/MD
// (« v1 », usecase/document.go). Or 100 % des documents réellement déposés
// par les enseignants sont des PDF : le fichier partait bien dans R2 mais
// restait EN_ATTENTE à vie avec erreurAnalyse « extraction de texte non
// disponible pour ce format en Go » — l'analyse IA (chapitres, thèmes,
// résumé) ne pouvait donc JAMAIS se déclencher. Les PDF « ANALYSE » vus en
// démo provenaient du peuplement seed (contenuTexte injecté directement),
// jamais d'un upload réel.
//
// Cette v2 extrait le texte de :
//   - PDF  : pdftotext (paquet Alpine poppler-utils du Dockerfile — même
//     pattern que pdftoppm/qpdf de la bibliothèque), précédé du déchiffrement
//     qpdf pour les « sécurité standard Acrobat » à mot de passe vide
//     (decryptPDF de ouvrage.go, SECT-BIBLIO-7) ;
//   - DOCX : word/document.xml (archive/zip + parsing XML — zéro dépendance) ;
//   - PPTX : ppt/slides/slideN.xml en ordre numérique ;
//   - TXT/MD/MARKDOWN : direct.
//
// Les formats binaires legacy (.doc, .ppt) restent stockés sans analyse
// (message clair retourné). Best-effort GLOBAL : un échec d'extraction ne
// bloque JAMAIS le dépôt du fichier.
package usecase

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"time"
)

// extractionBudget — budget pdftotext : un polycopié de 200 pages se
// convertit en < 2 s ; 45 s = garde-fou large (même discipline que la
// couverture bibliothèque, cf. couvertureBudget — TOUJOURS avec unité).
const extractionBudget = 45 * time.Second

// maxContenuTexteChars — plafond du texte stocké en DB. 400k caractères ≈
// 150-200 pages de texte dense : assez pour l'analyse IA (tronquée à 15k
// côté worker) et la lecture exam-prep, sans faire gonfler les lignes Neon.
const maxContenuTexteChars = 400_000

// minContenuAnalyseChars — en dessous, l'analyse IA n'a pas de matière
// (message explicite plutôt qu'un échec IA abscons).
const minContenuAnalyseChars = 50

// extractionResult — issue d'une extraction.
type extractionResult struct {
	Text      string // texte extrait (vide si !Extracted)
	Extracted bool   // vrai si un texte exploitable a été obtenu
	Note      string // explication humaine quand Extracted=false
}

// extractTextV2 dispatche selon l'extension (SECT-DOC-IA-1).
func extractTextV2(ctx context.Context, filename string, content []byte) extractionResult {
	lower := strings.ToLower(filename)
	switch {
	case strings.HasSuffix(lower, ".txt"), strings.HasSuffix(lower, ".md"), strings.HasSuffix(lower, ".markdown"):
		return finalizeExtraction(string(content))

	case strings.HasSuffix(lower, ".pdf"):
		return extractTextFromPDF(ctx, content)

	case strings.HasSuffix(lower, ".docx"):
		text, err := extractTextFromOOXML(content, "word/document.xml")
		if err != nil {
			return extractionResult{Note: fmt.Sprintf("DOCX illisible : %v", err)}
		}
		return finalizeExtraction(text)

	case strings.HasSuffix(lower, ".pptx"):
		text, err := extractTextFromPptx(content)
		if err != nil {
			return extractionResult{Note: fmt.Sprintf("PPTX illisible : %v", err)}
		}
		return finalizeExtraction(text)

	case strings.HasSuffix(lower, ".doc"), strings.HasSuffix(lower, ".ppt"):
		// Formats binaires OLE legacy : pas d'extraction fiable en Go pur
		// sans dépendance lourde. Le fichier reste stocké/consultable.
		return extractionResult{
			Note: "format binaire legacy (.doc/.ppt) : convertissez le fichier en PDF, DOCX ou PPTX pour activer l'analyse IA",
		}

	default:
		return extractionResult{Note: "format non pris en charge pour l'extraction de texte"}
	}
}

// finalizeExtraction normalise et valide le texte extrait.
func finalizeExtraction(text string) extractionResult {
	clean := normalizeExtractedText(text)
	if len([]rune(clean)) < minContenuAnalyseChars {
		return extractionResult{
			Note: "aucun texte exploitable extrait — le fichier est peut-être un scan (images) ; l'OCR n'est pas encore disponible",
		}
	}
	return extractionResult{Text: clean, Extracted: true}
}

// normalizeExtractedText — nettoie le texte brut : espaces/tabulations,
// retours à la ligne multiples, caractères de contrôle, plafond.
func normalizeExtractedText(s string) string {
	// Caractères de contrôle sauf \n et \t → espace.
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r == '\n' || r == '\t' {
			b.WriteRune(r)
			continue
		}
		if r < 0x20 || r == 0x7f {
			b.WriteRune(' ')
			continue
		}
		b.WriteRune(r)
	}
	out := b.String()
	out = strings.ReplaceAll(out, "\r\n", "\n")
	out = strings.ReplaceAll(out, "\r", "\n")
	out = strings.ReplaceAll(out, "\t", "  ")
	// 3+ retours à la ligne → 2.
	for strings.Contains(out, "\n\n\n") {
		out = strings.ReplaceAll(out, "\n\n\n", "\n\n")
	}
	// Espaces multiples (hors indentation en début de ligne conservée).
	out = regexp.MustCompile(`[ \t]{3,}`).ReplaceAllString(out, "  ")
	out = strings.TrimSpace(out)
	if r := []rune(out); len(r) > maxContenuTexteChars {
		out = string(r[:maxContenuTexteChars]) + "\n\n… [texte tronqué]"
	}
	return out
}

// ── PDF : pdftotext (poppler) ──

// extractTextFromPDF extrait le texte d'un PDF via pdftotext. Best-effort :
// outil absent (dev local sans poppler) → Note explicite, jamais d'erreur
// bloquante. decryptPDF d'abord : les PDFs « sécurité standard Acrobat » à
// mot de passe utilisateur vide rendraient un texte vide.
func extractTextFromPDF(ctx context.Context, content []byte) extractionResult {
	pdftotext, err := exec.LookPath("pdftotext")
	if err != nil {
		return extractionResult{
			Note: "pdftotext absent du serveur (poppler-utils) — dépôt conservé, extraction impossible dans cet environnement",
		}
	}

	if dec := decryptPDF(ctx, content); dec != nil {
		content = dec
	}

	in, err := os.CreateTemp("", "sect-doc-*.pdf")
	if err != nil {
		return extractionResult{Note: fmt.Sprintf("temp in: %v", err)}
	}
	inName := in.Name()
	defer func() { _ = os.Remove(inName) }()
	if _, err := in.Write(content); err != nil {
		_ = in.Close()
		return extractionResult{Note: fmt.Sprintf("write in: %v", err)}
	}
	if err := in.Close(); err != nil {
		return extractionResult{Note: fmt.Sprintf("close in: %v", err)}
	}

	ctxExtract, cancel := context.WithTimeout(ctx, extractionBudget)
	defer cancel()
	// -layout : préserve la mise en page (listes, titres, colonnes) — le
	// découpage en chapitres par l'IA en sort nettement plus pertinent.
	// Sortie sur stdout ("-").
	cmd := exec.CommandContext(ctxExtract, pdftotext, "-layout", "-enc", "UTF-8", inName, "-")
	out, err := cmd.Output()
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) && len(ee.Stderr) > 0 {
			return extractionResult{Note: fmt.Sprintf("pdftotext: %v (sortie: %.200s)", err, string(ee.Stderr))}
		}
		return extractionResult{Note: fmt.Sprintf("pdftotext: %v", err)}
	}
	return finalizeExtraction(string(out))
}

// ── DOCX / PPTX : OOXML (zip + XML), zéro dépendance ──

// extractTextFromOOXML lit UNE entrée XML d'une archive OOXML et en extrait
// le texte (<w:t>/<a:t> paragraphe par paragraphe).
func extractTextFromOOXML(content []byte, entryName string) (string, error) {
	zr, err := zip.NewReader(bytesReader(content), int64(len(content)))
	if err != nil {
		return "", fmt.Errorf("archive illisible (fichier corrompu ?) : %w", err)
	}
	for _, f := range zr.File {
		if f.Name != entryName {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return "", fmt.Errorf("ouverture %s : %w", entryName, err)
		}
		defer func() { _ = rc.Close() }()
		return xmlTextFromReader(rc)
	}
	return "", fmt.Errorf("entrée %s introuvable (fichier %s non standard)", entryName, entryName)
}

// extractTextFromPptx parcourt ppt/slides/slideN.xml en ordre NUMÉRIQUE
// (slide10 sinon passe après slide2 avec un tri lexicographique).
func extractTextFromPptx(content []byte) (string, error) {
	zr, err := zip.NewReader(bytesReader(content), int64(len(content)))
	if err != nil {
		return "", fmt.Errorf("archive illisible (fichier corrompu ?) : %w", err)
	}

	type slideEntry struct {
		n    int
		file *zip.File
	}
	var slides []slideEntry
	for _, f := range zr.File {
		var n int
		if _, err := fmt.Sscanf(f.Name, "ppt/slides/slide%d.xml", &n); err == nil {
			slides = append(slides, slideEntry{n: n, file: f})
		}
	}
	if len(slides) == 0 {
		return "", fmt.Errorf("aucune diapositive dans l'archive")
	}
	sort.Slice(slides, func(i, j int) bool { return slides[i].n < slides[j].n })

	var pages []string
	for _, s := range slides {
		rc, err := s.file.Open()
		if err != nil {
			continue // diapositive illisible → on saute, best-effort
		}
		text, err := xmlTextFromReader(rc)
		_ = rc.Close()
		if err == nil && strings.TrimSpace(text) != "" {
			pages = append(pages, text)
		}
	}
	return strings.Join(pages, "\n\n"), nil
}

// xmlTextFromReader extrait le texte d'un flux XML OOXML : éléments <…:t>
// (w:t Word, a:t DrawingML) concaténés, <…:p> = fin de paragraphe,
// <…:br> = saut de ligne, <…:tab> = espace.
func xmlTextFromReader(r io.Reader) (string, error) {
	dec := xml.NewDecoder(r)
	dec.Strict = false // tolérant aux entités/namespace exotiques des éditeurs

	var b strings.Builder
	inText := false
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("XML: %w", err)
		}
		switch el := tok.(type) {
		case xml.StartElement:
			switch el.Name.Local {
			case "t": // w:t (Word) / a:t (DrawingML)
				inText = true
			case "p": // w:p / a:p : fin de paragraphe
				if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
					b.WriteByte('\n')
				}
			case "br", "cr":
				b.WriteByte('\n')
			case "tab":
				b.WriteString("  ")
			}
		case xml.CharData:
			if inText {
				b.Write(el)
			}
		case xml.EndElement:
			if el.Name.Local == "t" {
				inText = false
				b.WriteByte(' ')
			}
		}
	}
	return b.String(), nil
}

// bytesReader — helper mince (bytes.NewReader, io.ReaderAt requis par
// zip.NewReader) ; centralisé au cas où un cap mémoire serait ajouté sur
// les très gros fichiers.
func bytesReader(b []byte) *bytes.Reader {
	return bytes.NewReader(b)
}
