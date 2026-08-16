# SECT Desktop

> Application desktop SECT basée sur Wails v2.13 (thin wrapper).
> Phase B + C — Thin Wrapper MVP + Extensions (voir [`docs/desktop/10-roadmap.md`](../docs/desktop/10-roadmap.md)).

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
├── app.go                     # Struct App + 15 fonctions natives (Phase B + C)
├── wails.json                 # Config Wails
├── go.mod / go.sum            # Module Go indépendant
├── Makefile                   # make dev / build / vet / tidy
│
├── frontend/                  # Frontend Wails (webview)
│   ├── dist/index.html        # Webview chargeant https://sect-app.vercel.app
│   ├── package.json
│   └── vite.config.ts
│
├── internal/                  # Code Go interne cross-platform
│   ├── notifier/              # Notifications OS (Win Toast / macOS / Linux notify-send)
│   │   ├── notifier.go        # Interface
│   │   ├── notifier_windows.go # go-toast
│   │   ├── notifier_darwin.go  # osascript
│   │   └── notifier_linux.go   # notify-send
│   ├── printer/               # Impression PDF (Win SumatraPDF / macOS lpr / Linux lpr)
│   │   ├── printer.go         # Interface
│   │   ├── printer_windows.go  # SumatraPDF + wmic
│   │   ├── printer_darwin.go   # lpr + lpstat
│   │   └── printer_linux.go    # lpr + lpstat
│   └── updater/               # Auto-update GitHub Releases
│       └── updater.go         # Check + manifest latest.json + force_rollback
│
├── build/                     # Configs de build par plateforme
│   ├── windows/               # icon.ico, info.json
│   ├── darwin/                # Info.plist, entitlements.plist, icon.iconset/
│   └── linux/                 # sect.desktop, icon.png
│
├── scripts/                   # Scripts utilitaires (signing, packaging)
│   ├── sign-windows.sh        # Signer .exe (signtool)
│   ├── notarize-macos.sh      # Signer + notarize .app (codesign + notarytool)
│   ├── package-linux.sh       # Packager .deb + .rpm (nfpm)
│   └── generate-manifest.sh   # Générer latest.json (auto-update)
│
└── test/                      # Tests (à compléter)
    ├── unit/
    ├── e2e/
    └── manual/
```

## 🎯 Phase B + C — État actuel

| Élément | Statut |
|---|---|
| Structure `desktop/` | ✅ Phase A |
| Wails v2.13.0 installé | ✅ |
| **Icônes natives** (.ico, .icns, .png) | ✅ Phase B |
| **Notifications** (Win Toast / macOS / Linux) | ✅ Phase B |
| **Impression PDF** (PrintPDF, PrintBatch, PrintToPrinter) | ✅ Phase B |
| **Liste imprimantes** (ListPrinters, GetDefaultPrinter) | ✅ Phase B |
| **Dialogues fichier** (SelectFolder, SaveFile) | ✅ Phase B |
| **Auto-update** (CheckForUpdates, manifest GitHub Releases) | ✅ Phase B |
| **SetExamMode** (désactive update pendant examen) | ✅ Phase B |
| **OpenExternal** (URL dans navigateur par défaut) | ✅ Phase B |
| **OpenFile** (ouvrir fichier app par défaut) | ✅ Phase C |
| **DownloadFolder** (téléchargement massif) | ✅ Phase C |
| **GetSystemInfo** (debug/support) | ✅ Phase C |
| **Scripts signing** (Windows, macOS, Linux) | ✅ Phase B |
| **CI/CD GitHub Actions** (build + release) | ✅ Phase B |
| `go vet` | ✅ 0 erreur |
| `go build` | ✅ Binaire 8.7 Mo généré |
| Démo webview (GUI) | ⏳ Nécessite poste desktop avec GUI |
| Code signing réel (certificats) | ⏳ En attente achat (290-390 €/an) |
| Tests E2E (Playwright sur webview) | ⏳ Phase B tardive |
| Auto-update silencieux complet | ⏳ Phase B tardive |

## 🔧 Fonctions Go exposées (Phase B + C)

### Phase A — Utilitaires
| Fonction | Signature | Description |
|---|---|---|
| `GetAppVersion` | `() string` | Version courante (`0.2.0-phase-b`) |
| `GetBackendURL` | `() string` | URL backend (`https://sect-app.vercel.app`) |
| `IsDesktop` | `() bool` | Détection desktop (toujours `true`) |

### Phase B — Notifications
| Fonction | Signature | Description |
|---|---|---|
| `ShowNotification` | `(title, body string) error` | Notification native OS |

### Phase B — Impression
| Fonction | Signature | Description |
|---|---|---|
| `PrintPDF` | `(filePath string) error` | Imprimer PDF (imprimante par défaut, silencieux) |
| `PrintBatch` | `(filePaths []string) error` | Impression en lot (max 100) |
| `PrintToPrinter` | `(filePath, printerName string) error` | Imprimer sur imprimante spécifique |
| `ListPrinters` | `() ([]PrinterInfo, error)` | Liste imprimantes disponibles |
| `GetDefaultPrinter` | `() (string, error)` | Imprimante par défaut |

### Phase B — Dialogues fichier
| Fonction | Signature | Description |
|---|---|---|
| `SelectFolder` | `(title string) (string, error)` | Boîte dialogue sélection dossier |
| `SaveFile` | `(content []byte, defaultName string) (string, error)` | Enregistrer fichier (dialogue) |

### Phase B — Auto-update
| Fonction | Signature | Description |
|---|---|---|
| `CheckForUpdates` | `() (*UpdateInfo, error)` | Vérifier mises à jour (désactivé en mode examen) |
| `SetExamMode` | `(active bool)` | Signaler examen en cours (désactive update check) |
| `QuitAndInstall` | `() error` | Installer mise à jour (Phase B tardive) |

### Phase B + C — Divers
| Fonction | Signature | Description |
|---|---|---|
| `OpenExternal` | `(url string) error` | Ouvrir URL dans navigateur par défaut |
| `OpenFile` | `(filePath string) error` | Ouvrir fichier avec app par défaut OS |
| `DownloadFolder` | `(urls []string, destDir string) (int, error)` | Téléchargement massif (max 50) |
| `GetSystemInfo` | `() (SystemInfo, error)` | Infos système (OS, arch, CPU, appDir) |

## 📚 Documentation

- [Architecture handbook](../docs/desktop/README.md)
- [Installation & Dev](../docs/desktop/02-installation-dev.md)
- [Native API](../docs/desktop/04-native-api.md)
- [Roadmap](../docs/desktop/10-roadmap.md)
- [ADR](../docs/desktop/ADR/)

## 🔐 Sécurité

- **Validation bindings** : tous les inputs sont validés côté Go (path canonique, whitelist extensions)
- **Rate-limit** : `PrintBatch` (max 100), `DownloadFolder` (max 50)
- **Pas de shell brut** : jamais `exec.Command(input_utilisateur)` sans validation
- **Audit log** : tous les appels de bindings sont loggés (`slog.Info`)

→ Voir [`docs/desktop/05-security.md`](../docs/desktop/05-security.md)

## 📝 Task IDs

- `SECT-DESKTOP-PHASE-A-1` — Initialisation
- `SECT-DESKTOP-PHASE-B-1` — Thin Wrapper MVP (ce commit)
- `SECT-DESKTOP-PHASE-C-1` — Extensions (ce commit)

---

*Phase B + C livrées — prêt pour Phase D (observation 6 mois).*
