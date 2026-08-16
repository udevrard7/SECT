# 02 — Installation & Développement

> **Document vivant** — Modifier ce fichier si les prérequis dev ou la procédure changent.

## 1. Prérequis

| Outil | Version | Usage |
|---|---|---|
| Go | 1.24+ | Build desktop + bindings |
| Node.js | 24+ | Build frontend Wails |
| Wails CLI | Dernière stable (voir ADR-0001) | Scaffolding + build |
| Git | 2.40+ | Versioning |
| NGC (clang/gcc) | récent | Build CGO (Linux/macOS) |
| WebView2 | Embarqué (Wails -webview2 embed) | Windows |

### Prérequis par plateforme

| OS | Spécifique |
|---|---|
| Windows | Visual Studio Build Tools (C++), WebView2 runtime |
| macOS | Xcode Command Line Tools, `create-dmg` (`brew install create-dmg`) |
| Linux | `libgtk-3-dev`, `libwebkit2gtk-4.1-dev` (Ubuntu/Debian) |

## 2. Installation (Phase A)

```bash
# 1. Installer Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# 2. Vérifier l'installation
wails doctor

# 3. Cloner le repo SECT (si pas déjà fait)
git clone https://github.com/udevrard7/SECT.git
cd SECT/desktop

# 4. Installer les dépendances frontend Wails
cd frontend && npm install && cd ..

# 5. Installer les dépendances Go
go mod download
```

## 3. Développement local

### 3.1 Lancer en mode dev (hot reload)

```bash
cd desktop
wails dev
```

- Ouvre une fenêtre desktop avec le webview
- Charge `http://localhost:5173` (frontend Wails dev server) en local
- Hot reload sur modification Go ET frontend
- Bindings Wails régénérés automatiquement

### 3.2 Mode dev avec SECT prod (debug)

Pour pointer le webview vers SECT prod au lieu du dev server local :

```bash
# Éditer frontend/src/main.ts pour charger https://sect-app.vercel.app
# au lieu de http://localhost:5173
wails dev
```

Utile pour tester les bindings Go (print, notif) contre le vrai SECT.

## 4. Build de production

### 4.1 Build par plateforme

```bash
# Windows (sur Windows)
wails build -platform windows/amd64 -clean -webview2 embed

# macOS (sur macOS)
wails build -platform darwin/universal -clean

# Linux (sur Linux)
wails build -platform linux/amd64 -clean
```

Output : `desktop/build/bin/sect-desktop.{exe|app|AppImage}`

### 4.2 Build multi-plateforme (CI/CD)

Le build multi-plateforme se fait via GitHub Actions (un runner par OS).

→ Voir [09 — CI/CD](./09-ci-cd.md)

## 5. Tests

### 5.1 Tests unitaires Go

```bash
cd desktop
go test ./internal/... -v
```

Couvre : `internal/updater`, `internal/printer`, `internal/notifier`, `internal/auth`.

### 5.2 Tests E2E (Playwright sur webview)

```bash
cd desktop/test/e2e
npx playwright test
```

Couvre : login, navigation, appels bindings Go.

### 5.3 Tests manuels

Checklist par release : voir [11 — Governance](./11-governance.md) section tests.

## 6. Debug

### 6.1 Logs desktop

Les logs Wails sont écrits dans :
- Windows : `%APPDATA%/sect-desktop/logs/`
- macOS : `~/Library/Logs/sect-desktop/`
- Linux : `~/.config/sect-desktop/logs/`

### 6.2 DevTools webview

En mode dev (`wails dev`), les DevTools Chromium sont accessibles via **Clic droit → Inspect** dans le webview.

En production, ajouter un flag caché (ex: `--devtools`) pour activer les DevTools :
```go
// main.go
debug := flag.Bool("devtools", false, "Enable DevTools")
flag.Parse()
err := wails.Run(&options.App{
    // ...
    Debug: options.Debug{OpenInspectorOnStart: *debug},
})
```

## 7. Structure du module Go

`desktop/go.mod` :
```go
module github.com/udevrard7/sect/desktop

go 1.24

require (
    github.com/wailsapp/wails/v2 v2.10.1  // version stable au moment Phase B
    github.com/sqweek/dialog v0.0.0-20240111080647-60c23ceca3a5
    github.com/adrg/xdg v0.5.3
)
```

**Indépendant de `backend/go.mod`** : pas de coupling accidentel avec le backend cloud.

## 8. Références

- [Wails installation guide](https://wails.io/docs/guides/installation)
- [Wails CLI reference](https://wails.io/docs/reference/cli)
- [01 — Architecture](./01-architecture.md)
- [ADR-0001 : Wails](./ADR/0001-use-wails.md)
