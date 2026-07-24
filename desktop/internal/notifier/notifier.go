// Package notifier — notifications natives cross-platform.
//
// SECT-DESKTOP-PHASE-B-1 : notifications desktop OS-level.
// - Windows : Win32 Toast (via go-toast)
// - macOS : osascript display notification
// - Linux : notify-send (libnotify)
//
// Usage :
//   n := notifier.New()
//   n.Show("SECT", "Nouveau résultat disponible")
//
// Voir docs/desktop/04-native-api.md.
package notifier

// Notifier est l'interface cross-platform pour les notifications OS.
type Notifier interface {
	// Show affiche une notification native avec un titre et un corps.
	Show(title, body string) error
}

// New retourne l'implémentation Notifier selon l'OS courant.
func New() Notifier {
	return newPlatformNotifier()
}
