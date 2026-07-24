// Package main — Struct App + fonctions natives exposées au frontend via Wails bindings.
//
// SECT-DESKTOP-PHASE-A-1 : Phase A — démo initiale.
//   - GetAppVersion() : retourne la version courante du desktop (utile pour debug + auto-update)
//   - GetBackendURL() : retourne l'URL du backend (sect-app.vercel.app)
//
// Phase B ajoutera : PrintPDF, PrintBatch, ShowNotification, CheckForUpdates, etc.
// (voir docs/desktop/04-native-api.md)
package main

import (
	"context"
	"log/slog"
)

const (
	// appVersion — version courante du desktop (synchronisée avec wails.json).
	appVersion = "0.1.0-phase-a"

	// backendURL — URL du frontend SECT chargé dans le webview.
	// En production : https://sect-app.vercel.app
	// En dev local : http://localhost:3000 (si frontend Next.js tourne en local)
	backendURL = "https://sect-app.vercel.app"
)

// App est la struct principale exposée au frontend via Wails bindings.
// Toutes ses méthodes publiques sont auto-générées en TypeScript dans frontend/src/bindings.ts.
type App struct {
	ctx context.Context
}

// NewApp crée une instance App.
func NewApp() *App {
	return &App{}
}

// Startup est appelé par Wails au démarrage du webview.
// On stocke le context pour les fonctions qui en ont besoin (dialogs, etc.).
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	slog.Info("SECT Desktop starting",
		"version", appVersion,
		"backend", backendURL,
	)
}

// Shutdown est appelé par Wails à la fermeture de l'app.
// Utile pour flusher les logs, fermer les connexions, etc.
func (a *App) Shutdown(ctx context.Context) {
	slog.Info("SECT Desktop shutting down", "version", appVersion)
}

// GetAppVersion retourne la version courante du desktop.
// Exposé au frontend via window.go.sect.GetAppVersion().
// Utilisé par : auto-update (comparaison version), debug, support.
func (a *App) GetAppVersion() string {
	return appVersion
}

// GetBackendURL retourne l'URL du backend SECT chargé dans le webview.
// Exposé au frontend via window.go.sect.GetBackendURL().
// Utile pour le debug (vérifier qu'on pointe vers la bonne env).
func (a *App) GetBackendURL() string {
	return backendURL
}

// IsDesktop retourne toujours true (permet au frontend de détecter qu'il
// tourne dans le webview Wails et non dans un navigateur standard).
// Le frontend peut aussi détecter via window.go?.sect — cette méthode est un fallback.
func (a *App) IsDesktop() bool {
	return true
}

// Note : les fonctions suivantes seront ajoutées en Phase B (voir roadmap) :
//   - PrintPDF(filePath string) error
//   - PrintBatch(filePaths []string) error
//   - SelectFolder(title string) (string, error)
//   - SaveFile(content []byte, defaultName string) (string, error)
//   - ShowNotification(title, body string) error
//   - CheckForUpdates() (*UpdateInfo, error)
//   - QuitAndInstall() error
//
// Voir docs/desktop/04-native-api.md pour l'inventaire complet.
