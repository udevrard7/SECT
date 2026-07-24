//go:build windows

// Package printer — implémentation Windows (SumatraPDF + Win32).
//
// SECT-DESKTOP-PHASE-B-1 : utilise SumatraPDF (portable, gratuit) pour
// l'impression silencieuse. SumatraPDF est téléchargé au 1er lancement
// ou embarqué dans le binaire.
//
// Alternative : API Win32 GDI (plus complexe, pas justifié en Phase B).
package printer

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

type windowsPrinter struct{}

func newPlatformPrinter() Printer {
	return &windowsPrinter{}
}

// Print imprime sur l'imprimante par défaut (silencieux).
func (p *windowsPrinter) Print(filePath string) error {
	abs, err := filepath.Abs(filePath)
	if err != nil {
		return fmt.Errorf("invalid path: %w", err)
	}
	// SumatraPDF -print-to-default -silent : imprime sur imprimante par défaut sans UI
	cmd := exec.Command("SumatraPDF.exe", "-print-to-default", "-silent", abs)
	return cmd.Run()
}

// PrintTo imprime sur une imprimante spécifique.
func (p *windowsPrinter) PrintTo(filePath, printerName string) error {
	abs, err := filepath.Abs(filePath)
	if err != nil {
		return fmt.Errorf("invalid path: %w", err)
	}
	cmd := exec.Command("SumatraPDF.exe", "-print-to", printerName, "-silent", abs)
	return cmd.Run()
}

// List retourne les imprimantes via wmic (Windows Management Instrumentation).
func (p *windowsPrinter) List() ([]PrinterInfo, error) {
	// wmic printer get Name,Default
	out, err := exec.Command("wmic", "printer", "get", "Name,Default", "/format:csv").Output()
	if err != nil {
		return nil, fmt.Errorf("wmic failed: %w", err)
	}

	var printers []PrinterInfo
	lines := strings.Split(string(out), "\n")
	if len(lines) < 2 {
		return printers, nil
	}

	// Parse CSV: Node,Default,Name
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Split(line, ",")
		if len(fields) < 3 {
			continue
		}
		isDefault := strings.EqualFold(strings.TrimSpace(fields[1]), "TRUE")
		name := strings.TrimSpace(fields[2])
		if name != "" {
			printers = append(printers, PrinterInfo{Name: name, IsDefault: isDefault})
		}
	}
	return printers, nil
}

// GetDefault retourne l'imprimante par défaut.
func (p *windowsPrinter) GetDefault() (string, error) {
	printers, err := p.List()
	if err != nil {
		return "", err
	}
	for _, pr := range printers {
		if pr.IsDefault {
			return pr.Name, nil
		}
	}
	return "", fmt.Errorf("no default printer found")
}
