//go:build darwin

// Package notifier — implémentation macOS (osascript).
//
// SECT-DESKTOP-PHASE-B-1 : utilise osascript (AppleScript) pour afficher
// une notification via Notification Center. Simple, pas de dépendance externe.
// Pour des notifications plus riches (boutons, images), il faudrait passer
// à une lib native (ex: gen2brain/beeep) — pas justifié en Phase B.
package notifier

import (
	"fmt"
	"os/exec"
	"strings"
)

type darwinNotifier struct{}

func newPlatformNotifier() Notifier {
	return &darwinNotifier{}
}

func (n *darwinNotifier) Show(title, body string) error {
	// Échapper les guillemets doubles (sécurité AppleScript)
	title = strings.ReplaceAll(title, `"`, `\"`)
	body = strings.ReplaceAll(body, `"`, `\"`)

	// osascript -e 'display notification "body" with title "title"'
	script := fmt.Sprintf(`display notification "%s" with title "%s"`, body, title)
	return exec.Command("osascript", "-e", script).Run()
}
