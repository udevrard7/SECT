# SECT Desktop — Architecture & Plan de Déploiement

> Document de référence pour l'application desktop SECT basée sur Wails.
> Ce document doit être validé **avant** d'écrire la moindre ligne de code.

| Élément | Valeur |
|---|---|
| **Statut** | Brouillon — à valider par le comité technique |
| **Auteur** | Ulrich EVRARD (udevrard7) |
| **Date** | Juillet 2026 |
| **Task ID** | `SECT-DESKTOP-ARCH-1` |
| **Version** | 1.0 |
| **Stack** | Wails v2 + Go 1.24 + Next.js 16 (webview) |
| **Licence** | MIT (héritée du projet SECT) |

---

## 📑 Table des matières

1. [Vision et objectifs](#1-vision-et-objectifs)
2. [Décisions architecturales clés](#2-décisions-architecturales-clés)
3. [Arborescence du dossier `desktop/`](#3-arborescence-du-dossier-desktop)
4. [Communication Wails ↔ Next.js](#4-communication-wails--nextjs)
5. [Fonctions Go natives exposées au frontend](#5-fonctions-go-natives-exposées-au-frontend)
6. [Stratégie d'authentification](#6-stratégie-dauthentification)
7. [Mises à jour automatiques](#7-mises-à-jour-automatiques)
8. [Code signing et certificats](#8-code-signing-et-certificats)
9. [Packaging multi-plateforme](#9-packaging-multi-plateforme)
10. [Pipeline CI/CD GitHub Actions](#10-pipeline-cicd-github-actions)
11. [Matrice de test](#11-matrice-de-test)
12. [Métriques d'adoption](#12-métriques-dadoption)
13. [Plan de rollback](#13-plan-de-rollback)
14. [Coûts et budget](#14-coûts-et-budget)
15. [Feuille de route](#15-feuille-de-route)
16. [Risques et mitigations](#16-risques-et-mitigations)
17. [Glossaire](#17-glossaire)

---

## 1. Vision et objectifs

### 1.1 Pourquoi une app desktop SECT ?

SECT est aujourd'hui une PWA (Progressive Web App) installable sur desktop Chrome/Edge. Cette PWA couvre **~85% des besoins** desktop. L'app Wails native vise les **15% restants** qui justifient un investissement supplémentaire :

| Cas d'usage | PWA | Wails | Justification Wails |
|---|---|---|---|
| **Passation d'examen** | ✅ Suffisant | ❌ Inutile | PWA + kiosk mode couvre déjà |
| **Correction de copies (drag-drop fichiers)** | ⚠️ Partiel | ✅ Natif | Drag-drop multi-fichiers + accès FS |
| **Impression en lot (certificats, relevés)** | ⚠️ 1 par 1 | ✅ Batch | File d'attente impression native |
| **Téléchargement massif de documents** | ⚠️ Limité | ✅ Natif | Sélection dossier, progress, retry |
| **Notifications natives persistantes** | ⚠️ Web Push | ✅ OS-level | Action center Windows, Notification Center macOS |
| **Mises à jour automatiques** | ⚠️ Manuelles | ✅ Silent | Background updater |
| **Déploiement B2B institutionnel** | ⚠️ "Site web" | ✅ ".exe" | GPO, SCCM, perception "logiciel" |

### 1.2 Objectifs mesurables

| Objectif | Métrique | Cible 6 mois |
|---|---|---|
| Adoption desktop | % établissements B2B avec ≥1 install desktop | 30% |
| Stabilité | Crash-free sessions | ≥ 99.5% |
| Satisfaction | NPS desktop | ≥ 40 |
| Réduction support | Tickets "impossible d'installer" | -60% vs PWA |
| Auto-update | % utilisateurs sur dernière version après 7j | ≥ 80% |

### 1.3 Non-objectifs (ce qu'on ne fait PAS)

- ❌ Pas de duplication de la logique métier (pas de `sectcore` dans un premier temps)
- ❌ Pas d'accès direct à PostgreSQL depuis le desktop
- ❌ Pas de mode hors ligne complet (le desktop reste un client riche en ligne)
- ❌ Pas de support mobile (la PWA couvre déjà Android/iOS)
- ❌ Pas de rewrite du frontend (le Next.js existant est réutilisé tel quel)

---

## 2. Décisions architecturales clés

### 2.1 Wails v2 (pas v3)

**Décision** : Utiliser **Wails v2** (stable), pas Wails v3 (encore en beta en juillet 2026).

**Justification** :
- Wails v2 est rock-solid, documenté, éprouvé en production
- Wails v3 a une API en flux (breaking changes possibles)
- Wails v3 a moins de plugins tiers et de documentation communautaire
- Migration v2 → v3 possible quand v3 sera stable (Q4 2026 estimé)

**Risque** : Wails v2 sera déprécié quand v3 sortira. Mitigation : le code Wails v2 est portable vers v3 avec un effort modéré (1-2 jours), l'API est similaire.

### 2.2 Thin wrapper (pas de logique métier)

**Décision** : Le desktop est un **thin wrapper** autour du web. Aucune logique métier n'est dupliquée.

**Architecture** :
```
┌─────────────────────────────────────┐
│         SECT Desktop (Wails)        │
│  ┌───────────────────────────────┐  │
│  │   Webview (Next.js + React)   │  │
│  │   https://sect-app.vercel.app │  │
│  └────────────┬──────────────────┘  │
│               │ Wails bindings       │
│  ┌────────────▼──────────────────┐  │
│  │   Go (fonctions natives)      │  │
│  │   - Print, Notif, File dialog │  │
│  │   - Auto-update               │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
              │ HTTPS
              ▼
┌─────────────────────────────────────┐
│    API Go Cloud (Render, inchangé)  │
│    PostgreSQL (Neon, inchangé)      │
└─────────────────────────────────────┘
```

**Conséquence** : Le desktop consomme les **mêmes API REST** que le web. Aucune duplication.

### 2.3 Un seul backend, deux clients

**Décision** : Backend Go cloud (Render) inchangé. Le desktop est un client comme le web.

```
                    ┌─────────────────┐
                    │  Backend Go     │
                    │  (Render)       │
                    │  222 routes     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │  Web/PWA    │  │  Desktop    │  │  Mobile     │
     │  (Vercel)   │  │  (Wails)    │  │  (PWA)      │
     └─────────────┘  └─────────────┘  └─────────────┘
```

### 2.4 Pas de sectcore (dans un premier temps)

**Décision** : Ne pas extraire `sectcore` de `backend/internal/`. Le desktop n'a **aucune** logique métier.

**Condition de réévaluation** : Si après 6 mois, les métriques montrent un besoin fort de mode hors ligne complet, on envisagera l'extraction `sectcore`. Sinon, on ne le fait jamais (coût maintenance > bénéfice).

---

## 3. Arborescence du dossier `desktop/`

Le dossier `desktop/` est **totalement indépendant** du backend et du frontend. Il peut être buildé, testé et déployé sans toucher au reste du monorepo.

```
sect/
├── backend/                    # API Go (Render, inchangé)
├── frontend/                   # Next.js (Vercel, inchangé)
├── desktop/                    # ← NOUVEAU : app Wails
│   ├── main.go                 # Point d'entrée Wails
│   ├── app.go                  # Struct App + méthodes exposées
│   ├── wails.json              # Config Wails (nom, version, icônes)
│   ├── go.mod                  # Module Go indépendant
│   ├── go.sum
│   │
│   ├── internal/               # Code Go interne (non exposé au frontend)
│   │   ├── updater/            # Logique auto-update (vérification, download, apply)
│   │   │   ├── updater.go
│   │   │   ├── github.go       # Client GitHub Releases API
│   │   │   └── verifier.go     # Vérification signature binaires
│   │   ├── printer/            # Logique impression native
│   │   │   ├── printer.go      # Interface cross-platform
│   │   │   ├── printer_windows.go  # Win32 printing
│   │   │   ├── printer_darwin.go   # macOS printing (CUPS)
│   │   │   └── printer_linux.go    # Linux printing (CUPS)
│   │   ├── notifier/           # Notifications natives OS
│   │   │   ├── notifier.go
│   │   │   ├── notifier_windows.go # Toast XML (Windows 10+)
│   │   │   ├── notifier_darwin.go  # NSUserNotification / UNUserNotificationCenter
│   │   │   └── notifier_linux.go   # libnotify / dbus
│   │   └── auth/               # Gestion cookies/auth partagés avec webview
│   │       └── cookiejar.go    # Persistance cookies JWT entre sessions
│   │
│   ├── frontend/               # Frontend Wails (build statique)
│   │   ├── index.html          # Point d'entrée (charge le webview SECT)
│   │   ├── src/
│   │   │   ├── main.ts         # Init Wails + chargement SECT
│   │   │   ├── bindings.ts     # Auto-généré par Wails (types Go → TS)
│   │   │   └── bridge.ts       # Wrapper API native pour le webview
│   │   ├── package.json
│   │   └── vite.config.ts      # Vite pour le build
│   │
│   ├── build/                  # Configs de build par plateforme
│   │   ├── windows/
│   │   │   ├── info.json       # Métadonnées .exe (version, company, icon)
│   │   │   ├── icon.ico        # Icône Windows (multi-résolution)
│   │   │   └── installer/      # Config NSIS (installer .exe)
│   │   │       └── sect.nsi
│   │   ├── darwin/
│   │   │   ├── Info.plist      # Métadonnées .app
│   │   │   ├── icon.icns       # Icône macOS (multi-résolution)
│   │   │   └── entitlements.plist  # Permissions (network, file, camera)
│   │   └── linux/
│   │       ├── sect.desktop     # Desktop entry (menu applications)
│   │       └── icon.png         # Icône 512x512
│   │
│   ├── scripts/                # Scripts utilitaires
│   │   ├── sign-windows.sh     # Signer .exe avec signtool
│   │   ├── notarize-macos.sh   # Notarization Apple
│   │   └── package-linux.sh    # Build .AppImage + .deb + .rpm
│   │
│   ├── .github/                # CI/CD spécifique desktop
│   │   └── workflows/
│   │       ├── build.yml       # Build sur chaque push (3 plateformes)
│   │       └── release.yml     # Release sur tag (signing + upload)
│   │
│   ├── test/                   # Tests
│   │   ├── unit/               # Tests Go unitaires
│   │   ├── e2e/                # Tests end-to-end (playwright sur webview)
│   │   └── manual/             # Checklists de test manuel par plateforme
│   │
│   ├── docs/                   # Doc desktop
│   │   ├── INSTALL.md          # Guide installation par plateforme
│   │   ├── TROUBLESHOOTING.md  # Problèmes connus
│   │   └── RELEASE-NOTES.md    # Notes de version
│   │
│   ├── README.md               # Doc du dossier desktop/
│   └── Makefile                # make dev / make build / make release
│
├── render.yaml                 # Backend (inchangé)
├── vercel.json                 # Frontend (inchangé)
├── worklog.md                  # Worklog projet (inchangé)
└── README.md                   # README monorepo (inchangé)
```

### 3.1 Justifications de l'arborescence

| Dossier | Raison |
|---|---|
| `desktop/` à la racine | Indépendance totale du backend/frontend. Peut être supprimé sans impacter le reste. |
| `internal/` | Convention Go : code non-exportable hors module. Sépare la logique des bindings. |
| `frontend/` dans `desktop/` | Wails embarque son propre frontend léger (Vite + TS) qui charge le webview SECT. |
| `build/` par plateforme | Configs spécifiques OS (icônes, installers, entitlements). |
| `scripts/` séparé de CI | Les scripts de signing sont réutilisables en local (debug) et en CI. |
| `test/manual/` | Le desktop ne peut pas être 100% automatisé (imprimantes, notifications réelles). |

### 3.2 Module Go indépendant

`desktop/go.mod` est un module Go **séparé** de `backend/go.mod` :

```go
module github.com/udevrard7/sect/desktop

go 1.24

require (
    github.com/wailsapp/wails/v2 v2.10.1
    github.com/sqweek/dialog v0.0.0-20240111080647-60c23ceca3a5  // File dialogs
    github.com/gen2brain/beep v1.2.0  // Sons natifs (optionnel)
    github.com/adrg/xdg v0.5.3  // Paths XDG (Linux)
)
```

**Avantage** : Le desktop peut être versionné, buildé et testé indépendamment du backend. Pas de coupling accidentel.

---

## 4. Communication Wails ↔ Next.js

### 4.1 Architecture de communication

```
┌──────────────────────────────────────────────────────────┐
│                    SECT Desktop (Wails)                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Webview (Chromium embedded)           │  │
│  │                                                    │  │
│  │   ┌──────────────────────────────────────────┐     │  │
│  │   │  Next.js (sect-app.vercel.app)           │     │  │
│  │   │                                          │     │  │
│  │   │  fetch('/api/auth/login')  ──────► API Go (Render)  │
│  │   │                                          │     │  │
│  │   │  window.go.sect.PrintPDF(…) ◄── Wails bindings    │
│  │   │       │                                  │     │  │
│  │   │       └── app.go: PrintPDF() method      │     │  │
│  │   └──────────────────────────────────────────┘     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Deux canaux de communication

| Canal | Direction | Usage |
|---|---|---|
| **API REST** (fetch) | Webview → Backend Go (Render) | Toute la logique métier (auth, examens, etc.) — inchangé |
| **Wails bindings** | Webview → Go local (desktop) | Fonctions natives uniquement (print, notif, file dialog, update) |

### 4.3 Exposition des fonctions Go au frontend

Wails génère automatiquement des bindings TypeScript depuis les méthodes Go exposées. Le frontend Next.js peut appeler ces fonctions via `window.go.sect.MethodName()`.

**Côté Go** (`app.go`) :
```go
package main

import (
    "context"
    "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App est la struct principale exposée au frontend.
type App struct {
    ctx context.Context
}

// NewApp crée une instance App.
func NewApp() *App {
    return &App{}
}

// Startup est appelé par Wails au démarrage.
func (a *App) Startup(ctx context.Context) {
    a.ctx = ctx
}

// PrintPDF imprime un PDF localement (fonction native desktop).
// Exposé au frontend via window.go.sect.PrintPDF(filePath).
func (a *App) PrintPDF(filePath string) error {
    return a.printer.Print(filePath)
}

// SelectFolder ouvre une boîte de dialogue de sélection de dossier.
func (a *App) SelectFolder(title string) (string, error) {
    return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
        Title: title,
    })
}
```

**Côté TypeScript** (auto-généré par Wails) :
```typescript
// frontend/src/bindings.ts (auto-généré)
export namespace sect {
  export function PrintPDF(filePath: string): Promise<void>;
  export function SelectFolder(title: string): Promise<string>;
  // ...
}
```

**Côté Next.js** (bridge) :
```typescript
// frontend/src/bridge.ts
// Wrapper qui détecte si on est dans Wails ou dans un navigateur standard.
// Si Wails : appelle la fonction native. Sinon : fallback web.

export const desktopBridge = {
  isDesktop(): boolean {
    return typeof window !== 'undefined' && !!window.go?.sect
  },

  async printPDF(filePath: string): Promise<void> {
    if (this.isDesktop()) {
      return window.go.sect.PrintPDF(filePath)
    }
    // Fallback web : ouvrir le PDF dans un nouvel onglet
    window.open(filePath, '_blank')
  },

  async selectFolder(title = 'Sélectionner un dossier'): Promise<string | null> {
    if (this.isDesktop()) {
      try {
        return await window.go.sect.SelectFolder(title)
      } catch {
        return null // User cancelled
      }
    }
    // Fallback web : pas d'équivalent, retourner null
    return null
  },
}
```

### 4.4 Détection desktop vs web

Le frontend Next.js détecte s'il tourne dans Wails via la présence de `window.go` :

```typescript
// Hook use-desktop.ts
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    setIsDesktop(typeof window !== 'undefined' && !!window.go?.sect)
  }, [])
  return isDesktop
}
```

Usage dans les composants :
```tsx
const isDesktop = useIsDesktop()
{isDesktop && <Button onClick={() => desktopBridge.printPDF(pdfUrl)}>Imprimer localement</Button>}
```

### 4.5 Partage de session entre webview et backend

Le webview Chromium embarqué par Wails partage automatiquement les cookies avec les requêtes `fetch` vers `sect-app.vercel.app`. Le cookie httpOnly `access_token` posé par le backend Go est donc accessible — **l'auth est transparente**, l'utilisateur se connecte une fois dans le webview et sa session persiste.

---

## 5. Fonctions Go natives exposées au frontend

### 5.1 Inventaire des fonctions (Phase B — MVP)

| Fonction | Signature | Usage | Phase |
|---|---|---|---|
| `PrintPDF` | `(filePath string) error` | Imprimer un PDF localement | B |
| `PrintBatch` | `(filePaths []string) error` | Impression en lot (certificats, relevés) | B |
| `SelectFolder` | `(title string) (string, error)` | Boîte dialogue sélection dossier | B |
| `SaveFile` | `(content []byte, defaultName string) (string, error)` | Enregistrer un fichier (download natif) | B |
| `ShowNotification` | `(title, body string) error` | Notification native OS | B |
| `CheckForUpdates` | `() (UpdateInfo, error)` | Vérifier mises à jour disponibles | B |
| `QuitAndInstall` | `() error` | Quitter + installer mise à jour téléchargée | B |
| `GetAppVersion` | `() string` | Version courante de l'app desktop | B |

### 5.2 Fonctions Phase C (extensions progressives)

| Fonction | Signature | Usage | Phase |
|---|---|---|---|
| `OpenFile` | `(filePath string) error` | Ouvrir un fichier avec l'app par défaut OS | C |
| `ListPrinters` | `() ([]PrinterInfo, error)` | Liste imprimantes disponibles | C |
| `GetDefaultPrinter` | `() (string, error)` | Imprimante par défaut | C |
| `DownloadFolder` | `(urls []string, destDir string) error` | Téléchargement massif | C |
| `WatchFolder` | `(path string) error` | Watcher dossier (sync auto) | C |
| `GetSystemInfo` | `() (SystemInfo, error)` | OS, RAM, CPU (debug/support) | C |
| `OpenExternal` | `(url string) error` | Ouvrir URL dans navigateur par défaut | C |

### 5.3 Exemple détaillé : PrintPDF

```go
// internal/printer/printer.go
package printer

import (
    "fmt"
    "runtime"
)

type Printer interface {
    Print(filePath string) error
    List() ([]PrinterInfo, error)
    GetDefault() (string, error)
}

type PrinterInfo struct {
    Name     string `json:"name"`
    IsDefault bool  `json:"isDefault"`
}

// New retourne l'implémentation Printer selon l'OS.
func New() Printer {
    switch runtime.GOOS {
    case "windows":
        return &windowsPrinter{}
    case "darwin":
        return &darwinPrinter{}
    case "linux":
        return &linuxPrinter{}
    default:
        return &unsupportedPrinter{os: runtime.GOOS}
    }
}
```

```go
// internal/printer/printer_windows.go
//go:build windows

package printer

import (
    "os/exec"
    "path/filepath"
)

type windowsPrinter struct{}

func (p *windowsPrinter) Print(filePath string) error {
    // Utilise SumatraPDF (portable) ou l'API Win32.
    // SumatraPDF est le plus simple : -print-to-default silently.
    abs, err := filepath.Abs(filePath)
    if err != nil {
        return err
    }
    cmd := exec.Command("SumatraPDF.exe", "-print-to-default", "-silent", abs)
    return cmd.Run()
}
```

### 5.4 Sécurité des bindings

**Risque** : Les bindings Wails exposent des fonctions Go au JavaScript. Un XSS dans le webview pourrait appeler `PrintPDF` avec un path arbitraire.

**Mitigation** :
- Valider tous les inputs côté Go (path canonique, whitelist extensions)
- Jamais exécuter de commandes shell avec input utilisateur non validé
- Logger tous les appels de bindings (audit)
- Rate-limit les fonctions coûteuses (PrintBatch)

```go
func (a *App) PrintPDF(filePath string) error {
    // Valider le path
    abs, err := filepath.Abs(filePath)
    if err != nil {
        return fmt.Errorf("invalid path: %w", err)
    }
    // Whitelist extensions
    ext := strings.ToLower(filepath.Ext(abs))
    if ext != ".pdf" {
        return fmt.Errorf("only PDF files are supported, got %s", ext)
    }
    // Vérifier existence
    if _, err := os.Stat(abs); err != nil {
        return fmt.Errorf("file not found: %w", err)
    }
    // Logger
    slog.Info("PrintPDF called", "file", abs)
    return a.printer.Print(abs)
}
```

---

## 6. Stratégie d'authentification

### 6.1 Principe : transparence totale

L'utilisateur se connecte **une fois** dans le webview. Sa session (cookies JWT) persiste entre les lancements de l'app. Aucune auth spécifique desktop.

### 6.2 Flux d'authentification

```
1. Utilisateur lance SECT Desktop
2. Webview charge https://sect-app.vercel.app/login
3. Utilisateur saisit email + mot de passe
4. Next.js POST /api/go-auth/login → Backend Go (Render)
5. Backend pose cookies httpOnly (access_token 15min + refresh_token 7j)
6. Webview stocke les cookies dans son cookie jar persistant
7. Utilisateur navigue → cookies envoyés automatiquement
8. Au prochain lancement : webview charge /dashboard (cookies présents → auth OK)
```

### 6.3 Persistance des cookies

Wails v2 utilise un webview Chromium avec un cookie jar **persistant par défaut** (dossier `~/.config/sect-desktop/` sur Linux, `%APPDATA%/sect-desktop/` sur Windows, `~/Library/Application Support/sect-desktop/` sur macOS).

**Conséquence** : La session persiste entre lancements. L'utilisateur ne se reconnecte que si le `refresh_token` (7j) expire.

### 6.4 Gestion du refresh

Le proxy Next.js (`proxy.ts`) laisse passer si `access_token` OU `refresh_token` est présent. Le client-side (`auth-store.refreshSession`) fait le refresh automatique. **Ce mécanisme fonctionne tel quel dans le webview** — aucune adaptation nécessaire.

### 6.5 Déconnexion

L'utilisateur se déconnecte via le menu SECT (bouton "Déconnexion" existant). Le backend invalide le refresh token, les cookies sont supprimés du cookie jar. Au prochain lancement, webview charge `/login`.

### 6.6 Multi-comptes (mode assistance)

SECT supporte le "switch account" (ADMIN → mode assistance sur un établissement). Ce mécanisme est **100% web** (store Zustand + API). Fonctionne tel quel dans le webview.

### 6.7 Sécurité

| Risque | Mitigation |
|---|---|
| Vol de cookies (malware local) | Cookies httpOnly + Secure + SameSite=Lax (déjà en place) |
| Session partagée entre utilisateurs OS | Cookie jar isolé par profil OS (Wails default) |
| XSS dans webview | CSP strict (héritée de Next.js) + validation bindings Go |
| Token dans logs | Jamais logger les cookies (middleware logging les exclut déjà) |

---

## 7. Mises à jour automatiques

### 7.1 Stratégie : GitHub Releases comme serveur de releases

**Décision** : Utiliser **GitHub Releases** comme backend d'auto-update.

**Avantages** :
- Gratuit (pas de serveur à maintenir)
- CDN global (GitHub cache)
- Versioning natif (tags Git)
- Téléchargement public (pas d'auth)

**Inconvénients** :
- Binaires publics (mais pas de secret dedans)
- Rate-limit GitHub API (60 req/h anonyme, 5000 req/h authentifié)

### 7.2 Format des releases

Chaque release GitHub contient :

```
SECT-Desktop-v1.2.0
├── sect-desktop-1.2.0-windows.exe       # Installer Windows signé
├── sect-desktop-1.2.0-windows.exe.sig   # Signature (vérification intégrité)
├── sect-desktop-1.2.0-macos.dmg         # Installer macOS notarisé
├── sect-desktop-1.2.0-macos.dmg.sig
├── sect-desktop-1.2.0-linux.AppImage    # Linux AppImage
├── sect-desktop-1.2.0-linux.deb         # Debian/Ubuntu
├── sect-desktop-1.2.0-linux.rpm         # Fedora/RHEL
├── sect-desktop-1.2.0-linux.AppImage.sig
├── latest.json                          # Manifest auto-update (Wails format)
└── RELEASE-NOTES-1.2.0.md               # Notes de version
```

### 7.3 Format `latest.json` (Wails updater)

```json
{
  "version": "1.2.0",
  "notes": "## SECT Desktop 1.2.0\n\n- Impression en lot\n- Notifications natives\n- Fix crash démarrage Windows",
  "pub_date": "2026-07-23T10:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6...",
      "url": "https://github.com/udevrard7/SECT/releases/download/v1.2.0/sect-desktop-1.2.0-windows.exe"
    },
    "darwin-x86_64": {
      "signature": "...",
      "url": "https://github.com/udevrard7/SECT/releases/download/v1.2.0/sect-desktop-1.2.0-macos.dmg"
    },
    "darwin-aarch64": {
      "signature": "...",
      "url": "https://github.com/udevrard7/SECT/releases/download/v1.2.0/sect-desktop-1.2.0-macos-arm64.dmg"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://github.com/udevrard7/SECT/releases/download/v1.2.0/sect-desktop-1.2.0-linux.AppImage"
    }
  }
}
```

### 7.4 Flux d'auto-update

```
1. Au démarrage, CheckForUpdates() interroge :
   https://github.com/udevrard7/SECT/releases/latest/download/latest.json

2. Compare version courante vs version latest.json

3. Si mise à jour disponible :
   - Notification native : "SECT 1.2.0 disponible"
   - Bouton "Télécharger et installer" (ou auto si configuré)

4. Téléchargement en arrière-plan (avec progress bar optionnel)

5. Vérification signature (.sig) — abandon si invalide

6. Au prochain lancement (ou immédiat si user clique "Installer") :
   - Quitter l'app
   - Exécuter l'installer silencieusement
   - Relancer la nouvelle version

7. En cas d'échec :
   - Restaurer version précédente (backup automatique)
   - Log erreur + notification
```

### 7.5 Canaux de mise à jour

| Canal | Description | Audience |
|---|---|---|
| `stable` | Versions production | Tous les utilisateurs |
| `beta` | Versions pre-release | Testeurs volontaires |
| `canary` | Builds nightly | Équipe interne |

**Implémentation** : 3 tags Git par release (`v1.2.0`, `v1.2.0-beta.1`, `v1.2.0-canary.20260723`). L'app interroge le canal configuré.

### 7.6 Rollback strategy

Si une mise à jour casse l'app :
1. **Auto-rollback** : l'installer garde la version précédente (`sect-desktop-1.1.0.bak`). Si le nouveau binaire crash 3x au démarrage, l'app restaure automatiquement la version précédente.
2. **Manuel** : l'utilisateur peut désinstaller + réinstaller une version antérieure (toutes les releases restent sur GitHub).
3. **Remote kill switch** : un flag `force_rollback` dans `latest.json` force tous les clients à downgrader.

### 7.7 Coût

- **GitHub Releases** : gratuit (inclus dans le plan GitHub gratuit)
- **Bandwidth** : GitHub CDN gratuit pour les releases publiques
- **Stockage** : illimité sur GitHub Releases

---

## 8. Code signing et certificats

### 8.1 Pourquoi signer ?

Sur **Windows**, un `.exe` non signé déclenche **SmartScreen** (écran bleu "Windows a protégé votre ordinateur"). **80% des utilisateurs abandonnent**. C'est un tueur d'adoption silencieux.

Sur **macOS**, un `.app` non signé affiche "Impossible d'ouvrir car le développeur ne peut pas être vérifié". L'utilisateur doit faire *Clic droit → Ouvrir* (contre-intuitif).

Sur **Linux**, pas de signing requis (mais recommandé pour les dépôts APT/RPM).

### 8.2 Certificats requis

| Plateforme | Certificat | Fournisseur | Coût annuel | Délai d'obtention |
|---|---|---|---|---|
| Windows | Code Signing OV (Organization Validation) | Sectigo, DigiCert | 200-300 €/an | 1-3 jours |
| Windows (recommandé) | Code Signing EV (Extended Validation) | Sectigo, DigiCert | 350-450 €/an | 3-7 jours (vérification entreprise) |
| macOS | Apple Developer ID Application | Apple | 99 $/an | 1-2 jours (compte existant) |
| macOS (notarization) | Inclus dans Apple Developer ID | Apple | 0 € | Automatique |
| Linux | GPG key (auto-générée) | — | 0 € | Immédiat |

### 8.3 OV vs EV (Windows)

| Critère | OV (Organization Validation) | EV (Extended Validation) |
|---|---|---|
| Coût | 200-300 €/an | 350-450 €/an |
| SmartScreen | Build réputation (15-30 installations) | Bypass immédiat |
| Affichage | "Éditeur vérifié" | "Éditeur vérifié" + nom entreprise |
| Hardware token | Non | **Oui** (USB requis pour signer) |
| Recommandation | Début (budget limité) | Production (adoption maximale) |

**Recommandation SECT** : commencer avec **OV** (Phase B), migrer vers **EV** quand l'adoption le justifie (Phase D).

### 8.4 Process de signing

#### Windows (signtool)

```bash
# scripts/sign-windows.sh
#!/bin/bash
set -e

CERT_FILE="$1"    # sect-codesign.pfx
CERT_PASS="$2"    # Mot de passe du certificat
EXE_PATH="$3"     # sect-desktop-1.2.0-windows.exe

signtool sign \
    /f "$CERT_FILE" \
    /p "$CERT_PASS" \
    /t http://timestamp.digicert.com \
    /fd SHA256 \
    "$EXE_PATH"

# Vérifier la signature
signtool verify /pa /v "$EXE_PATH"
```

#### macOS (codesign + notarization)

```bash
# scripts/notarize-macos.sh
#!/bin/bash
set -e

APP_PATH="$1"          # SECT Desktop.app
DEVELOPER_ID="$2"      # Developer ID Application: Ulrich EVRARD (XXXXXXXXXX)
APPLE_ID="$3"          # ulrichdouh@gmail.com
APP_PASSWORD="$4"      # App-specific password (appleid.apple.com)
TEAM_ID="$5"           # Team ID

# 1. Signer l'app
codesign --force --deep --options runtime \
    --sign "$DEVELOPER_ID" \
    "$APP_PATH"

# 2. Archiver pour notarization
ditto -c -k --keepParent "$APP_PATH" sect-desktop.zip

# 3. Soumettre à Apple pour notarization
xcrun notarytool submit sect-desktop.zip \
    --apple-id "$APPLE_ID" \
    --password "$APP_PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait

# 4. Stapler le ticket de notarization
xcrun stapler staple "$APP_PATH"

# 5. Vérifier
xcrun stapler validate "$APP_PATH"
spctl --assess --type execute --verbose "$APP_PATH"
```

### 8.5 Stockage des certificats (sécurité)

| Élément | Stockage | Accès |
|---|---|---|
| Certificat Windows `.pfx` | GitHub Secrets (base64) | CI uniquement |
| Mot de passe certificat Windows | GitHub Secrets | CI uniquement |
| Apple Developer ID (clé privée) | GitHub Secrets (base64) | CI uniquement |
| Apple app-specific password | GitHub Secrets | CI uniquement |
| Team ID Apple | GitHub Secrets | CI uniquement |
| GPG key Linux | GitHub Secrets | CI uniquement |

**Jamais** committer de certificat dans le repo. **Jamais** stocker en clair sur une machine de dev.

### 8.6 Renouvellement

| Certificat | Validité | Renouvellement |
|---|---|---|
| Windows OV | 1-3 ans | 30j avant expiration |
| Windows EV | 1-2 ans | 30j avant expiration (hardware token à recharger) |
| Apple Developer ID | 1 an | Automatique tant que le compte est actif (99 $/an) |

---

## 9. Packaging multi-plateforme

### 9.1 Formats par plateforme

| Plateforme | Format | Outil | Taille estimée |
|---|---|---|---|
| Windows | `.exe` (installer NSIS) | Wails build + NSIS | 15-25 Mo |
| Windows | `.msi` (optionnel) | WiX | 15-25 Mo |
| macOS Intel | `.dmg` | Wails build + create-dmg | 20-30 Mo |
| macOS Apple Silicon | `.dmg` | Wails build + create-dmg | 20-30 Mo |
| macOS Universal | `.dmg` (Intel + ARM) | Wails build -universal | 35-45 Mo |
| Linux | `.AppImage` | Wails build | 15-25 Mo |
| Linux | `.deb` (Debian/Ubuntu) | Wails build + nfpm | 15-25 Mo |
| Linux | `.rpm` (Fedora/RHEL) | Wails build + nfpm | 15-25 Mo |
| Linux | `.snap` (optionnel) | snapcraft | 30-40 Mo |

### 9.2 Configuration Wails (`wails.json`)

```json
{
  "$schema": "https://wails.io/schemas/config.v2.json",
  "name": "SECT Desktop",
  "outputfilename": "sect-desktop",
  "frontend:install": "npm install",
  "frontend:build": "npm run build",
  "frontend:dev:watcher": "npm run dev",
  "frontend:dev:serverUrl": "auto",
  "author": {
    "name": "Ulrich EVRARD",
    "email": "ulrichdouh@gmail.com"
  },
  "info": {
    "companyName": "FTCI",
    "productName": "SECT Desktop",
    "productVersion": "1.0.0",
    "copyright": "Copyright © 2026 FTCI",
    "comments": "Système d'Évaluation Casse-Tête — Application Desktop"
  },
  "wailsjsdir": "./frontend/src",
  "version": "1.0.0"
}
```

### 9.3 Configuration NSIS (Windows installer)

```nsi
; build/windows/installer/sect.nsi
!define APP_NAME "SECT Desktop"
!define APP_VERSION "1.0.0"
!define APP_PUBLISHER "FTCI"
!define APP_URL "https://sect.ftci.fr"
!define APP_EXE "sect-desktop.exe"

Name "${APP_NAME}"
OutFile "sect-desktop-${APP_VERSION}-installer.exe"
InstallDir "$PROGRAMFILES\${APP_NAME}"
RequestExecutionLevel admin

Page directory
Page instfiles

Section "Install"
    SetOutPath "$INSTDIR"
    File "..\..\bin\${APP_EXE}"
    
    # Icône menu démarrer
    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
    
    # Icône bureau
    CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
    
    # Désinstalleur
    WriteUninstaller "$INSTDIR\uninstall.exe"
    
    # Entrée Programs and Features
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "DisplayName" "${APP_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "UninstallString" "$INSTDIR\uninstall.exe"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "DisplayVersion" "${APP_VERSION}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "Publisher" "${APP_PUBLISHER}"
SectionEnd

Section "Uninstall"
    Delete "$INSTDIR\${APP_EXE}"
    Delete "$INSTDIR\uninstall.exe"
    RMDir "$INSTDIR"
    
    Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
    RMDir "$SMPROGRAMS\${APP_NAME}"
    Delete "$DESKTOP\${APP_NAME}.lnk"
    
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd
```

### 9.4 Configuration macOS (`Info.plist`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>SECT Desktop</string>
    <key>CFBundleDisplayName</key>
    <string>SECT</string>
    <key>CFBundleIdentifier</key>
    <string>fr.ftci.sect.desktop</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSCameraUsageDescription</key>
    <string>SECT utilise la caméra pour la photo d'identité anti-fraude lors des examens.</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>SECT utilise le microphone pour les notifications audio (optionnel).</string>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <false/>
    </dict>
</dict>
</plist>
```

### 9.5 Entitlements macOS (`entitlements.plist`)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
</dict>
</plist>
```

### 9.6 Desktop entry Linux (`sect.desktop`)

```ini
[Desktop Entry]
Name=SECT Desktop
Comment=Système d'Évaluation Casse-Tête
Exec=/usr/bin/sect-desktop %U
Icon=sect-desktop
Terminal=false
Type=Application
Categories=Education;Office;
MimeType=application/pdf;
StartupWMClass=sect-desktop
```

---

## 10. Pipeline CI/CD GitHub Actions

### 10.1 Workflow de build (chaque push)

```yaml
# desktop/.github/workflows/build.yml
name: Build Desktop

on:
  push:
    paths:
      - 'desktop/**'
  pull_request:
    paths:
      - 'desktop/**'

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        platform:
          - { os: windows-latest, target: windows/amd64 }
          - { os: macos-latest, target: darwin/universal }
          - { os: ubuntu-latest, target: linux/amd64 }
    
    runs-on: ${{ matrix.platform.os }}
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-go@v5
        with:
          go-version: '1.24'
      
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      
      - name: Install Wails CLI
        run: go install github.com/wailsapp/wails/v2/cmd/wails@latest
      
      - name: Install frontend deps
        working-directory: desktop
        run: npm ci
        working-directory: desktop/frontend
      
      - name: Build
        working-directory: desktop
        run: wails build -platform ${{ matrix.platform.target }} -clean
      
      - uses: actions/upload-artifact@v4
        with:
          name: sect-desktop-${{ matrix.platform.os }}
          path: desktop/build/bin/*
```

### 10.2 Workflow de release (sur tag)

```yaml
# desktop/.github/workflows/release.yml
name: Release Desktop

on:
  push:
    tags:
      - 'desktop-v*'  # ex: desktop-v1.2.0

jobs:
  release:
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: windows-latest, platform: windows/amd64, artifact: sect-desktop.exe }
          - { os: macos-latest, platform: darwin/universal, artifact: sect-desktop.dmg }
          - { os: ubuntu-latest, platform: linux/amd64, artifact: sect-desktop.AppImage }
    
    runs-on: ${{ matrix.os }}
    permissions:
      contents: write  # Pour créer GitHub Release
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-go@v5
        with:
          go-version: '1.24'
      
      - name: Install Wails CLI
        run: go install github.com/wailsapp/wails/v2/cmd/wails@latest
      
      - name: Build
        working-directory: desktop
        run: wails build -platform ${{ matrix.platform }} -clean -webview2 embed
      
      # --- Signing (Windows) ---
      - name: Sign Windows exe
        if: matrix.os == 'windows-latest'
        env:
          CERT_FILE: ${{ secrets.WINDOWS_CODESIGN_PFX }}
          CERT_PASS: ${{ secrets.WINDOWS_CODESIGN_PASS }}
        run: |
          echo "$CERT_FILE" | base64 -d > sect-codesign.pfx
          desktop/scripts/sign-windows.sh sect-codesign.pfx "$CERT_PASS" desktop/build/bin/*.exe
      
      # --- Signing + Notarization (macOS) ---
      - name: Sign + Notarize macOS app
        if: matrix.os == 'macos-latest'
        env:
          DEVELOPER_ID: ${{ secrets.APPLE_DEVELOPER_ID }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APP_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
          TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          KEYCHAIN_PASSWORD: ${{ secrets.APPLE_KEYCHAIN_PASSWORD }}
        run: |
          # Importer clé privée dans keychain
          echo "${{ secrets.APPLE_DEVELOPER_KEY }}" | base64 -d > developer-key.p12
          security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security import developer-key.p12 -k build.keychain -P "$KEYCHAIN_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" build.keychain
          
          # Signer + notarize
          desktop/scripts/notarize-macos.sh "desktop/build/bin/SECT Desktop.app" \
            "$DEVELOPER_ID" "$APPLE_ID" "$APP_PASSWORD" "$TEAM_ID"
      
      # --- Package Linux ---
      - name: Package Linux (.deb, .rpm)
        if: matrix.os == 'ubuntu-latest'
        run: |
          desktop/scripts/package-linux.sh desktop/build/bin/sect-desktop
      
      # --- Générer latest.json ---
      - name: Generate latest.json
        run: |
          VERSION=${GITHUB_REF#refs/tags/desktop-v}
          desktop/scripts/generate-manifest.sh "$VERSION" > latest.json
      
      # --- Upload GitHub Release ---
      - name: Upload to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            desktop/build/bin/*
            latest.json
          generate_release_notes: true
          draft: false
          prerelease: ${{ contains(github.ref, 'beta') || contains(github.ref, 'rc') }}
```

### 10.3 Secrets GitHub Actions requis

| Secret | Description | Utilisé par |
|---|---|---|
| `WINDOWS_CODESIGN_PFX` | Certificat Windows (base64) | sign-windows.sh |
| `WINDOWS_CODESIGN_PASS` | Mot de passe certificat Windows | sign-windows.sh |
| `APPLE_DEVELOPER_ID` | "Developer ID Application: Ulrich EVRARD (XXX)" | notarize-macos.sh |
| `APPLE_DEVELOPER_KEY` | Clé privée Developer ID (base64 .p12) | notarize-macos.sh |
| `APPLE_ID` | Apple ID (email) | notarize-macos.sh |
| `APPLE_APP_PASSWORD` | App-specific password | notarize-macos.sh |
| `APPLE_TEAM_ID` | Team ID Apple | notarize-macos.sh |
| `APPLE_KEYCHAIN_PASSWORD` | Mot de passe keychain temporaire | notarize-macos.sh |

---

## 11. Matrice de test

### 11.1 Plateformes supportées

| OS | Version | Architecture | Support | Priorité |
|---|---|---|---|---|
| Windows 11 | 23H2+ | x64 | ✅ Officiel | P0 |
| Windows 10 | 22H2+ | x64 | ✅ Officiel | P0 |
| Windows 10 | 1809+ | x64 | ⚠️ Best-effort | P1 |
| macOS 14 | Sonoma | ARM64 (Apple Silicon) | ✅ Officiel | P0 |
| macOS 13 | Ventura | ARM64 | ✅ Officiel | P0 |
| macOS 12 | Monterey | x64 (Intel) | ⚠️ Best-effort | P1 |
| Ubuntu 24.04 | LTS | x64 | ✅ Officiel | P0 |
| Ubuntu 22.04 | LTS | x64 | ✅ Officiel | P0 |
| Fedora 40 | | x64 | ⚠️ Best-effort | P2 |
| Debian 12 | Bookworm | x64 | ⚠️ Best-effort | P2 |

### 11.2 Tests automatisés

| Type | Outil | Couverture |
|---|---|---|
| Unit tests Go | `go test` | `internal/updater`, `internal/printer`, `internal/notifier` |
| E2E webview | Playwright | Login, navigation, bindings Go |
| Smoke tests CI | GitHub Actions | Build sur 3 plateformes à chaque push |
| Signature | `signtool verify`, `spctl` | Post-signing |

### 11.3 Tests manuels (checklist par release)

**Avant chaque release** :

- [ ] Windows 11 : installation fraîche + lancement + login + impression PDF
- [ ] Windows 10 : idem
- [ ] macOS 14 ARM : installation fraîche + lancement + login + impression
- [ ] macOS 13 ARM : idem
- [ ] Ubuntu 24.04 : `.AppImage` + `.deb`
- [ ] Auto-update : v1.1.0 → v1.2.0 (téléchargement + install + redémarrage)
- [ ] Rollback : forcer crash nouveau binaire → auto-restore v1.1.0
- [ ] SmartScreen Windows : vérifier pas d'avertissement (OV: build réputation, EV: bypass)
- [ ] Gatekeeper macOS : `spctl --assess` passe
- [ ] Notifications natives : s'affichent dans Action Center (Win) / Notification Center (macOS)
- [ ] Cookies persistants : fermer/rouvrir → session conservée
- [ ] Multi-comptes : switch account fonctionne
- [ ] Offline : affichage page `/maintenance` si backend down

### 11.4 Matrice de régression

| Scénario | Plateformes testées | Fréquence |
|---|---|---|
| Build complet | Windows, macOS, Linux | Chaque push |
| Installation fraîche | Windows 11, macOS 14, Ubuntu 24.04 | Chaque release |
| Auto-update | Windows 11, macOS 14 | Chaque release |
| Auth + session | Toutes | Chaque release |
| Print PDF | Windows 11, macOS 14 | Chaque release |
| Notifications | Windows 11, macOS 14 | Chaque release |

---

## 12. Métriques d'adoption

### 12.1 Pourquoi mesurer ?

L'analyse préconise d'observer les usages pendant plusieurs mois avant de décider du `sectcore`. Les métriques sont **essentielles** pour cette décision.

### 12.2 Métriques collectées (anonymisées)

| Métrique | Source | Cadence | Objectif |
|---|---|---|---|
| Installations actives | Compteur au démarrage (POST /api/desktop/heartbeat) | Quotidien | Adoption |
| DAU (Daily Active Users) desktop | Idem | Quotidien | Rétention |
| Version courante | User-Agent custom | Quotidien | Adoption updates |
| OS | User-Agent | Quotidien | Support priorités |
| Crash reports | Sentry (optionnel) | Temps réel | Stabilité |
| Fonctions natives utilisées | Compteur par binding Go | Hebdo | Décider sectcore |
| Temps moyen session | Différence start/stop | Hebdo | Engagement |
| Désinstallations | Endpoint /api/desktop/uninstall | Temps réel | Churn |

### 12.3 Endpoint backend (à ajouter)

```
POST /api/desktop/heartbeat
Body: { "appVersion": "1.2.0", "os": "darwin-arm64", "timestamp": "..." }
Response: 204 No Content

POST /api/desktop/uninstall
Body: { "appVersion": "1.2.0", "os": "darwin-arm64", "reason": "user_uninstall" }
Response: 204 No Content
```

**Privacy** : Aucune donnée personnelle (pas d'userID, pas d'IP stockée). Compteur anonyme agrégé.

### 12.4 Dashboard d'adoption

Page admin existante (`/monitoring`) étendue avec :
- Nombre d'installations desktop actives (30j glissants)
- Répartition par OS
- Version la plus utilisée
- Top 5 fonctions natives utilisées
- Crash-free sessions %

### 12.5 Critères de décision sectcore

On extraira `sectcore` **seulement si** après 6 mois :
- ≥ 500 installations desktop actives
- ≥ 30% des établissements B2B l'utilisent
- ≥ 3 demandes explicites de mode hors ligne complet
- NPS desktop ≥ 40

Sinon, on reste en thin wrapper indéfiniment.

---

## 13. Plan de rollback

### 13.1 Scénarios de rollback

| Scénario | Action | Délai |
|---|---|---|
| Bug critique sur une version | `force_rollback` dans `latest.json` | < 1h |
| Crash systématique au démarrage | Auto-rollback version précédente (bak) | Automatique |
| Adoption catastrophique (< 50 installs en 3 mois) | Abandon desktop, focus PWA | Décision produit |
| Faille sécurité | Retrait GitHub Releases + notification users | < 24h |

### 13.2 Procédure `force_rollback`

1. Éditer `latest.json` sur GitHub Releases :
```json
{
  "version": "1.1.0",
  "force_rollback_from": "1.2.0",
  "rollback_reason": "Crash au démarrage sur Windows 10",
  ...
}
```

2. L'app desktop, au prochain `CheckForUpdates()`, détecte `force_rollback_from` correspondant à sa version.
3. Notification utilisateur : "Une mise à jour de sécurité est disponible."
4. Téléchargement + installation de la version `1.1.0` (version précédente stable).
5. Log + alerte admin.

### 13.3 Abandon desktop (scénario pessimiste)

Si le desktop n'atteint pas ses objectifs après 6 mois :

1. **Arrêt des releases** : plus de tags `desktop-v*`.
2. **Notification utilisateurs** : bannière dans l'app "SECT Desktop ne sera plus maintenu à partir du JJ/MM/AAAA. Utilisez la version web/PWA."
3. **Auto-update vers version finale** : la dernière release affiche un message de fin de support au démarrage.
4. **Suppression du dossier `desktop/`** du repo (commit `SECT-DESKTOP-SUNSET-1`).
5. **PWA reste** la seule solution desktop (déjà fonctionnelle, aucune dépendance au desktop Wails).

**Conséquence** : Aucun impact sur le backend, le frontend, la PWA, les utilisateurs web/mobile. Le desktop était un client comme un autre, son retrait est transparent.

---

## 14. Coûts et budget

### 14.1 Coûts récurrents annuels

| Poste | Coût annuel | Détail |
|---|---|---|
| Certificat Windows OV | 200-300 € | Sectigo/DigiCert |
| Apple Developer Program | 99 € (≈ 90 €) | Obligatoire pour notarization |
| GitHub Releases | 0 € | Inclus dans le plan gratuit |
| Sentry (crash reports, optionnel) | 0-260 € | Free tier (5K events/mois) ou Team (26 €/mois) |
| Domaine (déjà existant) | 0 € | sect.ftci.fr |
| **Total annuel** | **290-650 €** | |

### 14.2 Coûts ponctuels (Phase B)

| Poste | Coût | Détail |
|---|---|---|
| Certificat Windows OV (achat initial) | Inclus ci-dessus | |
| Hardware token EV (si EV) | 50-100 € | USB token (YubiKey ou similaire) |
| **Total ponctuel** | **0-100 €** | |

### 14.3 Effort de développement

| Phase | Durée | Effort | Livrable |
|---|---|---|---|
| Phase A — Préparation | 1 semaine | 5 jours | Dossier `desktop/` + Wails installé + démo |
| Phase B — Thin Wrapper MVP | 2-3 jours | 3 jours | v1.0.0 : webview + print + notif + auto-update |
| Phase C — Extensions | 2-4 semaines | 10-20 jours | v1.1.0 : file handlers, batch download, printers |
| Phase D — Évaluation | 6 mois | 0 (observation) | Décision sectcore oui/non |
| Phase E (conditionnel) — sectcore | 3-4 semaines | 15-20 jours | Extraction logique métier partagée |

**Total Phase A+B** : **8 jours** (1.6 semaine). C'est l'investissement minimal pour avoir une app desktop fonctionnelle et signée.

### 14.4 ROI estimé

| Métrique | Avant desktop | Après desktop (6 mois) |
|---|---|---|
| Tickets support "impossible d'installer" | ~10/mois | ~4/mois (-60%) |
| Établissements B2B demandant un .exe | ~3/mois | 0 (satisfaits) |
| Perception "logiciel institutionnel" | Faible (site web) | Élevée (.exe signé) |
| Coût annuel | 0 € | 290-650 € |
| **ROI** | — | **Positif dès 6 mois** si adoption ≥ 30% B2B |

---

## 15. Feuille de route

### 15.1 Calendrier

```
Semaine 1 (Phase A)     : Préparation
  ├─ Créer dossier desktop/
  ├─ Installer Wails v2
  ├─ Démo : webview charge sect-app.vercel.app
  └─ Documenter (ce fichier, version finale)

Semaine 2-3 (Phase B)   : Thin Wrapper MVP
  ├─ app.go : PrintPDF, ShowNotification, CheckForUpdates
  ├─ Auto-update (GitHub Releases)
  ├─ Code signing Windows OV + Apple notarization
  ├─ CI/CD GitHub Actions (3 plateformes)
  ├─ Tests manuels matrix
  └─ Release v1.0.0

Mois 2-3 (Phase C)      : Extensions progressives
  ├─ PrintBatch (certificats/relevés en lot)
  ├─ DownloadFolder (téléchargement massif)
  ├─ ListPrinters + GetDefaultPrinter
  ├─ OpenExternal (liens dans navigateur par défaut)
  └─ Release v1.1.0

Mois 4-6 (Phase D)      : Observation
  ├─ Collecte métriques adoption
  ├─ Bug fixes
  ├─ Améliorations UX basées sur retours
  └─ Release v1.2.0, v1.3.0 (itérations)

Mois 6+ (Phase E, conditionnel) : sectcore
  ├─ Si métriques atteintes : extraire sectcore
  ├─ Sinon : rester thin wrapper
  └─ Décision comité technique
```

### 15.2 Releases prévues

| Version | Date cible | Contenu |
|---|---|---|
| v1.0.0 | Fin semaine 3 | Thin wrapper + print + notif + auto-update |
| v1.1.0 | Mois 2 | PrintBatch + DownloadFolder + ListPrinters |
| v1.2.0 | Mois 3 | OpenExternal + UX improvements |
| v1.3.0 | Mois 4 | Bug fixes + métriques |
| v2.0.0 | Mois 6+ (si justifié) | sectcore + mode hors ligne partiel |

### 15.3 Critères de passage Phase D → E

Valider **tous** les critères suivants avant d'envisager `sectcore` :
- [ ] ≥ 500 installations desktop actives
- [ ] ≥ 30% des établissements B2B l'utilisent
- [ ] ≥ 3 demandes explicites de mode hors ligne
- [ ] NPS desktop ≥ 40
- [ ] Crash-free sessions ≥ 99.5%
- [ ] Aucune régression web/PWA attribuée au desktop

Si **un seul** critère n'est pas atteint, on reste en thin wrapper.

---

## 16. Risques et mitigations

### 16.1 Risques techniques

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Wails v2 déprécié (v3 sort) | Moyenne | Faible | Migration v2→v3 = 1-2 jours (API similaire) |
| Webview2 non installé (Windows) | Faible | Élevé | `-webview2 embed` (embarque le runtime) |
| SmartScreen bloque .exe (OV) | Élevée (début) | Moyen | Build réputation (15-30 installs) puis OK. Ou EV. |
| Apple notarization échoue | Faible | Élevé | Pre-check en CI, logs détaillés |
| Auto-update casse l'app | Faible | Élevé | Auto-rollback + backup version précédente |
| Cookies perdus (webview reset) | Très faible | Moyen | Cookie jar persistant Wails (vérifié) |
| Crash sur OS non testé | Moyenne | Moyen | Matrice de test + best-effort support |

### 16.2 Risques produit

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Adoption faible (< 50 installs en 3 mois) | Moyenne | Moyen | Phase D = observation, rollback possible |
| Duplication de efforts (desktop vs web) | Faible | Élevé | Thin wrapper = pas de logique métier dupliquée |
| Maintenance double (web + desktop) | Moyenne | Moyen | Max 10% du temps dev après Phase B |
| Attentes utilisateurs irréalistes | Moyenne | Faible | Doc claire : "client en ligne, pas offline complet" |

### 16.3 Risques sécurité

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| XSS dans webview appelle bindings malveillants | Faible | Élevé | CSP strict + validation inputs Go + rate-limit |
| Vol de cookies (malware local) | Faible | Élevé | Cookies httpOnly + Secure (déjà en place) |
| Certificat signing compromis | Très faible | Critique | Rotation immédiate + revoke + re-release |
| Binaires modifiés (MITM download) | Faible | Élevé | Signature .sig vérifiée par updater |

---

## 17. Glossaire

| Terme | Définition |
|---|---|
| **Wails** | Framework Go pour apps desktop avec frontend web. Alternative légère à Electron. |
| **Thin wrapper** | App desktop qui ne fait qu'afficher le web + quelques fonctions natives. Pas de logique métier. |
| **sectcore** | Module Go partagé entre le backend cloud et le desktop (logique métier). Non implémenté dans un premier temps. |
| **Webview** | Composant qui affiche du contenu web dans une app native. Wails utilise WebView2 (Windows), WKWebView (macOS), WebKitGTK (Linux). |
| **Code signing** | Signature numérique d'un binaire pour prouver son origine. Obligatoire pour éviter SmartScreen (Windows) et Gatekeeper (macOS). |
| **Notarization** | Process Apple qui scanne l'app pour malware et délivre un "ticket" staplé au binaire. Obligatoire pour macOS. |
| **SmartScreen** | Filtre anti-malware Windows. Bloque les .exe non signés ou sans réputation. |
| **Gatekeeper** | Équivalent macOS de SmartScreen. Bloque les .app non signés/non notarisés. |
| **OV (Organization Validation)** | Type de certificat code signing Windows. Vérification entreprise basique. |
| **EV (Extended Validation)** | Type de certificat code signing Windows. Vérification entreprise stricte, bypass SmartScreen immédiat. |
| **AppImage** | Format d'app Linux portable (un fichier, pas d'installation). |
| **NSIS** | Nullsoft Scriptable Install System. Créateur d'installers Windows. |
| **GitHub Releases** | Service GitHub pour héberger des binaires versionnés liés à un tag Git. |
| **PWA** | Progressive Web App. Site web installable sur desktop/mobile avec fonctionnalités natives. |
| **DAU** | Daily Active Users. Nombre d'utilisateurs actifs par jour. |
| **NPS** | Net Promoter Score. Score de satisfaction (-100 à +100). |
| **Rollback** | Retour à une version précédente d'un logiciel. |
| **Force rollback** | Rollback forcé à distance via un flag dans le manifest de mise à jour. |

---

## 📌 Décisions en attente de validation

Avant de démarrer la Phase A, valider les points suivants :

- [ ] **Budget** : 290-650 €/an accepté pour signing + Apple Developer
- [ ] **Wails v2** (pas v3) validé comme choix technologique
- [ ] **Thin wrapper** (pas de sectcore) validé comme approche initiale
- [ ] **GitHub Releases** validé comme serveur d'auto-update
- [ ] **Certificat OV** (début) avec migration EV si adoption validé
- [ ] **Matrice de support** : Windows 10/11, macOS 12+, Ubuntu 22.04+ validée
- [ ] **Métriques anonymisées** acceptées (privacy review)
- [ ] **Plan de rollback** (abandon desktop si < 50 installs/3 mois) validé

Une fois ces points validés, la Phase A peut démarrer.

---

## 🔗 Références

- [Wails v2 documentation](https://wails.io/docs/reference/intro)
- [Apple Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Introduction/Introduction.html)
- [Apple Notarization Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Windows Code Signing](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/driver-signing)
- [SmartScreen Reputation](https://learn.microsoft.com/en-us/windows/security/threat-protection/microsoft-defender-smartscreen/microsoft-defender-smartscreen-overview)
- [GitHub Releases API](https://docs.github.com/en/rest/releases/releases)
- [NSIS Documentation](https://nsis.sourceforge.io/Docs/)
- [create-dmg (macOS)](https://github.com/sindresorhus/create-dmg)
- [nfpm (Linux packaging)](https://github.com/goreleaser/nfpm)

---

**Fin du document — SECT-DESKTOP-ARCH-1 v1.0**

*Document à valider par le comité technique avant démarrage de la Phase A.*
*Toute modification doit faire l'objet d'un commit avec bump de version (v1.1, v1.2, etc.).*
