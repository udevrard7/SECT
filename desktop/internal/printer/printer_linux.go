//go:build linux

// Package printer — implémentation Linux (CUPS lpr + lpstat).
//
// SECT-DESKTOP-PHASE-B-1 : identique à macOS (CUPS est le standard sur les 2 OS).
package printer

import (
	"fmt"
	"os/exec"
	"strings"
)

type linuxPrinter struct{}

func newPlatformPrinter() Printer {
	return &linuxPrinter{}
}

// Print imprime sur l'imprimante par défaut.
func (p *linuxPrinter) Print(filePath string) error {
	return exec.Command("lpr", filePath).Run()
}

// PrintTo imprime sur une imprimante spécifique.
func (p *linuxPrinter) PrintTo(filePath, printerName string) error {
	return exec.Command("lpr", "-P", printerName, filePath).Run()
}

// List retourne les imprimantes via lpstat.
func (p *linuxPrinter) List() ([]PrinterInfo, error) {
	out, err := exec.Command("lpstat", "-p", "-d").Output()
	if err != nil {
		return nil, fmt.Errorf("lpstat failed: %w", err)
	}

	var printers []PrinterInfo
	var defaultName string

	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "system default destination:") {
			defaultName = strings.TrimPrefix(line, "system default destination:")
			defaultName = strings.TrimSpace(defaultName)
		} else if strings.HasPrefix(line, "printer ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				name := parts[1]
				printers = append(printers, PrinterInfo{
					Name:      name,
					IsDefault: name == defaultName,
				})
			}
		}
	}
	return printers, nil
}

// GetDefault retourne l'imprimante par défaut.
func (p *linuxPrinter) GetDefault() (string, error) {
	out, err := exec.Command("lpstat", "-d").Output()
	if err != nil {
		return "", err
	}
	line := strings.TrimSpace(string(out))
	if strings.HasPrefix(line, "system default destination:") {
		name := strings.TrimPrefix(line, "system default destination:")
		return strings.TrimSpace(name), nil
	}
	return "", fmt.Errorf("no default printer")
}
