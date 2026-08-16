# 03 — Communication Wails ↔ Next.js

> **Document vivant** — Modifier ce fichier si le modèle de communication évolue.

## 1. Deux canaux de communication

| Canal | Direction | Usage |
|---|---|---|
| **API REST** (fetch) | Webview → Backend Go (Render) | Toute la logique métier (auth, examens, etc.) — inchangé |
| **Wails bindings** | Webview → Go local (desktop) | Fonctions natives uniquement (print, notif, file dialog, update) |

```
┌──────────────────────────────────────────────────────────┐
│                    SECT Desktop (Wails)                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Webview (Chromium embedded)           │  │
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

## 2. Exposition des fonctions Go au frontend

Wails génère automatiquement des bindings TypeScript depuis les méthodes Go publiques de la struct `App`.

### 2.1 Côté Go (`app.go`)

```go
package main

import (
    "context"
    "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
    ctx     context.Context
    printer Printer
}

func NewApp() *App {
    return &App{printer: printer.New()}
}

func (a *App) Startup(ctx context.Context) {
    a.ctx = ctx
}

// PrintPDF imprime un PDF localement (exposé au frontend).
func (a *App) PrintPDF(filePath string) error {
    // Validation + logging
    return a.printer.Print(filePath)
}

// SelectFolder ouvre une boîte de dialogue de sélection de dossier.
func (a *App) SelectFolder(title string) (string, error) {
    return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
        Title: title,
    })
}
```

### 2.2 Côté TypeScript (auto-généré par Wails)

```typescript
// frontend/src/bindings.ts (auto-généré)
export namespace sect {
  export function PrintPDF(filePath: string): Promise<void>;
  export function SelectFolder(title: string): Promise<string>;
}
```

### 2.3 Côté Next.js (bridge)

Le bridge détecte si on est dans Wails ou dans un navigateur standard, et fallback proprement si web :

```typescript
// frontend/src/bridge.ts
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
        return null
      }
    }
    return null // Pas d'équivalent web
  },
}
```

## 3. Détection desktop vs web

Le frontend Next.js détecte s'il tourne dans Wails via la présence de `window.go` :

```typescript
// hooks/use-desktop.ts
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    setIsDesktop(typeof window !== 'undefined' && !!window.go?.sect)
  }, [])
  return isDesktop
}
```

Usage :
```tsx
const isDesktop = useIsDesktop()
{isDesktop && (
  <Button onClick={() => desktopBridge.printPDF(pdfUrl)}>
    Imprimer localement
  </Button>
)}
```

## 4. Sécurité des bindings

**Risque** : Les bindings Wails exposent des fonctions Go au JavaScript. Un XSS dans le webview pourrait appeler `PrintPDF` avec un path arbitraire.

**Mitigation** : Valider tous les inputs côté Go.

```go
func (a *App) PrintPDF(filePath string) error {
    // Path canonique
    abs, err := filepath.Abs(filePath)
    if err != nil {
        return fmt.Errorf("invalid path: %w", err)
    }
    // Whitelist extensions
    ext := strings.ToLower(filepath.Ext(abs))
    if ext != ".pdf" {
        return fmt.Errorf("only PDF files supported, got %s", ext)
    }
    // Vérifier existence
    if _, err := os.Stat(abs); err != nil {
        return fmt.Errorf("file not found: %w", err)
    }
    // Logger (audit)
    slog.Info("PrintPDF called", "file", abs)
    return a.printer.Print(abs)
}
```

→ Voir [05 — Security](./05-security.md) pour la stratégie complète.

## 5. Partage de session (cookies JWT)

Le webview Chromium embarqué par Wails partage automatiquement les cookies avec les requêtes `fetch` vers `sect-app.vercel.app`. Le cookie httpOnly `access_token` est donc accessible — **l'auth est transparente**.

→ Voir [05 — Security](./05-security.md) section authentification.

## 6. Références

- [04 — Native API (fonctions Go)](./04-native-api.md)
- [05 — Security](./05-security.md)
- [Wails bindings documentation](https://wails.io/docs/reference/options#bindings)
