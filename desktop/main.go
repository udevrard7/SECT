// Package main — Point d'entrée SECT Desktop (Wails v2).
//
// SECT-DESKTOP-PHASE-A-1 : démo initiale — webview chargeant https://sect-app.vercel.app.
//
// Architecture : thin wrapper (voir docs/desktop/01-architecture.md).
//   - Le webview affiche le frontend Next.js existant (PWA SECT).
//   - Aucune logique métier n'est dupliquée (voir ADR-0003).
//   - Les fonctions Go natives (print, notif, update) seront ajoutées en Phase B.
//
// Lancement :
//   wails dev         (mode dev, hot reload)
//   wails build       (build production)
//
// Doc : https://wails.io/docs/reference/intro
package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Créer une instance App avec les fonctions natives exposées au frontend.
	app := NewApp()

	err := wails.Run(&options.App{
		Title:  "SECT — Système d'Évaluation Casse-Tête",
		Width:  1280,
		Height: 800,
		MinWidth: 1024,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 1},
		OnStartup:        app.Startup,
		OnShutdown:       app.Shutdown,
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar: mac.TitleBarHiddenInset(),
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
