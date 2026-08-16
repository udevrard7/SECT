//go:build windows

// Package notifier — implémentation Windows (Toast XML via go-toast).
//
// SECT-DESKTOP-PHASE-B-1 : utilise git.sr.ht/~jackmordaunt/go-toast/v2
// qui enveloppe l'API Win32 Toast (notify icon + XML template).
package notifier

import (
        toast "git.sr.ht/~jackmordaunt/go-toast/v2"
)

type windowsNotifier struct{}

func newPlatformNotifier() Notifier {
        return &windowsNotifier{}
}

func (n *windowsNotifier) Show(title, body string) error {
        notification := toast.Notification{
                AppID: "SECT Desktop",
                Title: title,
                Body:  body,
        }
        return notification.Push()
}
