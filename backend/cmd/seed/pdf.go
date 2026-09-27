// Générateur PDF minimal (sans dépendance externe) pour le seed.
//
// Produit des PDF multi-pages valides : texte Helvetica 11pt, encodage
// WinAnsi (accents français OK), pagination automatique, titre en gras.
// Usage exclusif : cmd/seed — reconstitue les fichiers PDF correspondant
// aux documents déjà analysés (contenuTexte) pour les uploader sur R2.
package main

import (
	"bytes"
	"fmt"
	"strings"
)

type pdfPage struct {
	lines []pdfLine
}

type pdfLine struct {
	text string
	bold bool
	size float64
}

const (
	pageW      = 595.28 // A4
	pageH      = 841.89
	marginX    = 56.0
	marginTop  = 72.0
	marginBot  = 64.0
	lineHeight = 16.0
	wrapWidth  = 92 // caractères par ligne (Helvetica 11pt ≈ largeur utile)
)

// buildPDF construit un PDF à partir d'un titre et d'un corps de texte.
func buildPDF(title, body string) []byte {
	var pages []pdfPage
	cur := pdfPage{}

	flushPage := func() {
		if len(cur.lines) > 0 {
			pages = append(pages, cur)
			cur = pdfPage{}
		}
	}

	// Page de titre
	cur.lines = append(cur.lines,
		pdfLine{text: "SECT — Système d'Évaluation Casse-Tête", bold: true, size: 12},
		pdfLine{text: "", bold: false, size: 11},
		pdfLine{text: title, bold: true, size: 16},
		pdfLine{text: "", bold: false, size: 11},
	)
	// Corps
	for _, raw := range strings.Split(body, "\n") {
		for _, ln := range wrapLine(raw, wrapWidth) {
			cur.lines = append(cur.lines, pdfLine{text: ln, bold: false, size: 11})
			if float64(len(cur.lines))*lineHeight >= pageH-marginTop-marginBot {
				pages = append(pages, cur)
				cur = pdfPage{}
			}
		}
	}
	flushPage()
	if len(pages) == 0 {
		pages = append(pages, pdfPage{lines: []pdfLine{{text: " ", bold: false, size: 11}}})
	}

	// ── Assemblage des objets PDF ──
	// Objets : 1=Catalog, 2=Pages, 3=F1(Helvetica), 4=F2(Helvetica-Bold),
	// puis pour la page i (0-based) : (5+2i)=Page, (6+2i)=Contents.
	var buf bytes.Buffer
	objOffsets := make([]int, 0, 4+2*len(pages))

	writeObj := func(content string) {
		objOffsets = append(objOffsets, buf.Len())
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", len(objOffsets), content)
	}

	writeObj("<< /Type /Catalog /Pages 2 0 R >>")

	kids := make([]string, len(pages))
	for i := range pages {
		kids[i] = fmt.Sprintf("%d 0 R", 5+2*i)
	}
	writeObj(fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), len(pages)))

	writeObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
	writeObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")

	for i, p := range pages {
		pageObj := fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>",
			pageW, pageH, 6+2*i)
		writeObj(pageObj)

		var content bytes.Buffer
		y := pageH - marginTop
		for _, ln := range p.lines {
			font := "/F1"
			if ln.bold {
				font = "/F2"
			}
			enc := winAnsi(ln.text)
			if strings.TrimSpace(ln.text) != "" {
				fmt.Fprintf(&content, "BT %s %.0f Tf %.1f %.1f Td (%s) Tj ET\n", font, ln.size, marginX, y, escapePDF(enc))
			}
			y -= lineHeight
		}
		stream := content.Bytes()
		writeObj(fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream))
	}

	// ── xref + trailer ──
	xrefOffset := buf.Len()
	nObj := len(objOffsets) + 1 // +1 pour l'objet 0 (free)
	fmt.Fprintf(&buf, "xref\n0 %d\n", nObj)
	buf.WriteString("0000000000 65535 f \n")
	for _, off := range objOffsets {
		fmt.Fprintf(&buf, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", nObj, xrefOffset)

	return buf.Bytes()
}

// wrapLine découpe une ligne longue en plusieurs lignes ≤ width caractères,
// en coupant sur les espaces (coupe dure si un mot dépasse).
func wrapLine(s string, width int) []string {
	s = strings.TrimRight(s, " \t\r")
	if len(s) <= width {
		return []string{s}
	}
	var out []string
	words := strings.Split(s, " ")
	cur := ""
	for _, w := range words {
		switch {
		case cur == "":
			cur = w
		case len(cur)+1+len(w) <= width:
			cur += " " + w
		default:
			out = append(out, cur)
			cur = w
		}
		// mot seul plus long que la largeur : coupe dure
		for len(cur) > width {
			out = append(out, cur[:width])
			cur = cur[width:]
		}
	}
	if cur != "" {
		out = append(out, cur)
	}
	if len(out) == 0 {
		return []string{""}
	}
	return out
}

// escapePDF échappe les caractères spéciaux d'une chaîne PDF.
func escapePDF(b []byte) string {
	var out bytes.Buffer
	for _, c := range b {
		switch c {
		case '(', ')', '\\':
			out.WriteByte('\\')
			out.WriteByte(c)
		case '\n', '\r', '\t':
			out.WriteByte(' ')
		default:
			if c < 32 {
				out.WriteByte(' ')
			} else {
				out.WriteByte(c)
			}
		}
	}
	return out.String()
}

// winAnsi encode une chaîne UTF-8 en Windows-1252 (WinAnsiEncoding PDF).
// Les caractères non représentables sont remplacés par '?' (ou translittérés).
func winAnsi(s string) []byte {
	repl := map[rune]string{
		'→': " -> ", '←': " <- ", '€': "EUR", 'œ': "oe", 'Œ': "OE",
		'…': "...", '•': "-", '–': "-", '—': "-", '™': "(TM)",
		'’': "'", '‘': "'", '“': "\"", '”': "\"", '″': "\"",
		'₀': "0", '₁': "1", '₂': "2", '₃': "3", '⁰': "0", '¹': "1", '²': "2", '³': "3",
	}
	var out bytes.Buffer
	for _, r := range s {
		if s2, ok := repl[r]; ok {
			out.WriteString(s2)
			continue
		}
		if r < 256 { // Latin-1 : identique en CP1252
			out.WriteByte(byte(r))
			continue
		}
		if r >= 0x2018 && r <= 0x201D {
			out.WriteByte(byte(r - 0x2018 + 0x91)) // quotes CP1252
			continue
		}
		out.WriteByte('?')
	}
	return out.Bytes()
}
