// Package printer — impression PDF native cross-platform.
//
// SECT-DESKTOP-PHASE-B-1 : impression desktop OS-level.
// - Windows : SumatraPDF -print-to-default (portable, silencieux)
// - macOS : lpr (CUPS natif)
// - Linux : lpr (CUPS natif)
//
// Usage :
//   p := printer.New()
//   p.Print("/path/to/file.pdf")
//   printers, _ := p.List()
//
// Voir docs/desktop/04-native-api.md.
package printer

// Printer est l'interface cross-platform pour l'impression native.
type Printer interface {
	// Print imprime un fichier PDF sur l'imprimante par défaut.
	Print(filePath string) error

	// PrintTo imprime un fichier PDF sur une imprimante spécifique.
	PrintTo(filePath, printerName string) error

	// List retourne la liste des imprimantes disponibles.
	List() ([]PrinterInfo, error)

	// GetDefault retourne le nom de l'imprimante par défaut.
	GetDefault() (string, error)
}

// PrinterInfo décrit une imprimante disponible.
type PrinterInfo struct {
	Name      string `json:"name"`
	IsDefault bool   `json:"isDefault"`
}

// New retourne l'implémentation Printer selon l'OS courant.
func New() Printer {
	return newPlatformPrinter()
}
