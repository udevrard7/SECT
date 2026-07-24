# SECT Desktop

> Application desktop SECT basée sur Wails v2 (thin wrapper).
> Phase A — Initialisation (voir [`docs/desktop/10-roadmap.md`](../docs/desktop/10-roadmap.md)).

## 🚀 Démarrage rapide

### Prérequis

| Outil | Version | Installation |
|---|---|---|
| Go | 1.24+ | https://go.dev/dl/ |
| Node.js | 24+ | https://nodejs.org/ |
| Wails CLI | v2.13+ | `go install github.com/wailsapp/wails/v2/cmd/wails@latest` |
| GCC/Clang | récent | Linux: `build-essential`, macOS: Xcode CLT, Windows: MSVC |

#### Dépendances système par OS

| OS | Commande d'installation |
|---|---|
| Ubuntu/Debian | `sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev` |
| Fedora | `sudo dnf install gtk3-devel webkit2gtk4.1-devel` |
| macOS | (inclus avec Xcode) |
| Windows | (WebView2 runtime embarqué via `-webview2 embed`) |

### Lancement en mode dev

```bash
cd desktop
make deps    # Installer les dépendances Go + npm
make dev     # Lancer wails dev (hot reload + webview)
```

### Build production

```bash
make build           # Plateforme courante
make build-windows   # Windows .exe (depuis Windows)
make build-macos     # macOS .app (depuis macOS)
make build-linux     # Linux .AppImage (depuis Linux)
```

Le binaire est généré dans `build/bin/`.

## 📁 Structure

```
desktop/
├── main.go                    # Point d'entrée Wails
├── app.go                     # Struct App + fonctions natives exposées
├── wails.json                 # Config Wails
├── go.mod / go.sum            # Module Go indépendant
├── Makefile                   # make dev / build / vet / tidy
│
├── frontend/                  # Frontend Wails (webview)
│   ├── dist/                  # Build statique (index.html charge SECT)
│   ├── src/                   # Bindings générés par Wails (Phase B)
│   ├── package.json
│   └── vite.config.ts
│
├── internal/                  # Code Go interne (Phase B)
│   ├── updater/               # Auto-update (GitHub Releases)
│   ├── printer/               # Impression native
│   ├── notifier/              # Notifications OS
│   └── auth/                  # Cookies JWT
│
├── build/                     # Configs de build par plateforme (Phase B)
│   ├── windows/               # icon.ico, info.json, installer NSIS
│   ├── darwin/                # icon.icns, Info.plist
│   └── linux/                 # .desktop, icon.png
│
├── scripts/                   # Scripts utilitaires (Phase B)
├── test/                      # Tests (Phase B)
│   ├── unit/
│   ├── e2e/
│   └── manual/
└── README.md                  # Ce fichier
```

## 🎯 Phase A — État actuel

| Élément | Statut |
|---|---|
| Structure `desktop/` créée | ✅ |
| `go.mod` + `go.sum` (module indépendant) | ✅ |
| `wails.json` configuré | ✅ |
| `main.go` (point d'entrée Wails) | ✅ |
| `app.go` (3 fonctions natives : GetAppVersion, GetBackendURL, IsDesktop) | ✅ |
| `frontend/dist/index.html` (webview chargeant SECT) | ✅ |
| `go vet` | ✅ 0 erreur |
| `go build` | ✅ Binaire 5.5 Mo généré |
| Wails CLI installé | ✅ v2.13.0 |
| Démo webview (GUI) | ⏳ Nécessite poste desktop avec GUI |
| Fonctions natives (PrintPDF, Notif, etc.) | ⏳ Phase B |
| Auto-update | ⏳ Phase B |
| Code signing | ⏳ Phase B |
| CI/CD GitHub Actions | ⏳ Phase B |

## 🔧 Fonctions Go exposées (Phase A)

| Fonction | Signature | Description |
|---|---|---|
| `GetAppVersion` | `() string` | Version courante du desktop (`0.1.0-phase-a`) |
| `GetBackendURL` | `() string` | URL du backend (`https://sect-app.vercel.app`) |
| `IsDesktop` | `() bool` | Détection desktop (toujours `true`) |

Phase B ajoutera : `PrintPDF`, `PrintBatch`, `ShowNotification`, `CheckForUpdates`, `SelectFolder`, `SaveFile`, `QuitAndInstall`.
→ Voir [`docs/desktop/04-native-api.md`](../docs/desktop/04-native-api.md).

## 📚 Documentation

- [Architecture handbook](../docs/desktop/README.md)
- [Installation & Dev](../docs/desktop/02-installation-dev.md)
- [Roadmap](../docs/desktop/10-roadmap.md)
- [ADR](../docs/desktop/ADR/)

## 🧪 Tester sur un poste desktop

Ce sandbox est headless (pas de GUI). Pour tester la démo webview :

```bash
# Sur un poste Linux desktop (avec libwebkit2gtk installé)
cd desktop
make deps
make dev
# → Une fenêtre s'ouvre, chargeant https://sect-app.vercel.app
```

## 📝 Task IDs

- `SECT-DESKTOP-PHASE-A-1` — Initialisation (ce commit)

---

*Phase A livrée — prêt pour Phase B (thin wrapper MVP).*
