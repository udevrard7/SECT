//go:build linux

// Package notifier — implémentation Linux (notify-send / libnotify).
//
// SECT-DESKTOP-PHASE-B-1 : utilise notify-send (libnotify) qui est le standard
// sur tous les desktops Linux (GNOME, KDE, XFCE). Disponible par défaut sur
// la plupart des distributions.
package notifier

import (
	"fmt"
	"os/exec"
)

type linuxNotifier struct{}

func newPlatformNotifier() Notifier {
	return &linuxNotifier{}
}

func (n *linuxNotifier) Show(title, body string) error {
	// Vérifier que notify-send est installé
	if _, err := exec.LookPath("notify-send"); err != nil {
		return fmt.Errorf("notify-send not installed (libnotify required): %w", err)
	}

	// notify-send TITLE BODY
	// Options : -u critical (haute priorité), -i icon, -a app-name
	return exec.Command("notify-send",
		"--app-name=SECT Desktop",
		"--urgency=normal",
		title,
		body,
	).Run()
}
