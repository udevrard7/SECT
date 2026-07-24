# 04 — Native API (fonctions Go exposées au frontend)

> **Document vivant** — Modifier ce fichier quand une fonction native est ajoutée/supprimée.

## 1. Inventaire des fonctions

### 1.1 Phase B — MVP (thin wrapper initial)

| Fonction | Signature | Usage | Cross-platform |
|---|---|---|---|
| `PrintPDF` | `(filePath string) error` | Imprimer un PDF localement | ✅ Win/macOS/Linux |
| `PrintBatch` | `(filePaths []string) error` | Impression en lot (certificats, relevés) | ✅ |
| `SelectFolder` | `(title string) (string, error)` | Boîte dialogue sélection dossier | ✅ |
| `SaveFile` | `(content []byte, defaultName string) (string, error)` | Enregistrer un fichier (download natif) | ✅ |
| `ShowNotification` | `(title, body string) error` | Notification native OS | ✅ |
| `CheckForUpdates` | `() (UpdateInfo, error)` | Vérifier mises à jour | ✅ |
| `QuitAndInstall` | `() error` | Quitter + installer mise à jour | ✅ |
| `GetAppVersion` | `() string` | Version courante app desktop | ✅ |

### 1.2 Phase C — Extensions progressives

| Fonction | Signature | Usage |
|---|---|---|
| `OpenFile` | `(filePath string) error` | Ouvrir fichier avec app par défaut OS |
| `ListPrinters` | `() ([]PrinterInfo, error)` | Liste imprimantes disponibles |
| `GetDefaultPrinter` | `() (string, error)` | Imprimante par défaut |
| `DownloadFolder` | `(urls []string, destDir string) error` | Téléchargement massif |
| `WatchFolder` | `(path string) error` | Watcher dossier (sync auto) |
| `GetSystemInfo` | `() (SystemInfo, error)` | OS, RAM, CPU (debug/support) |
| `OpenExternal` | `(url string) error` | Ouvrir URL dans navigateur par défaut |

## 2. Exemple détaillé — PrintPDF (cross-platform)

### 2.1 Interface

```go
// internal/printer/printer.go
package printer

import "runtime"

type Printer interface {
    Print(filePath string) error
    List() ([]PrinterInfo, error)
    GetDefault() (string, error)
}

type PrinterInfo struct {
    Name      string `json:"name"`
    IsDefault bool   `json:"isDefault"`
}

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

### 2.2 Implémentation Windows

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
    // SumatraPDF (portable) -print-to-default silently
    abs, err := filepath.Abs(filePath)
    if err != nil {
        return err
    }
    cmd := exec.Command("SumatraPDF.exe", "-print-to-default", "-silent", abs)
    return cmd.Run()
}
```

### 2.3 Implémentation macOS

```go
// internal/printer/printer_darwin.go
//go:build darwin

package printer

import "os/exec"

type darwinPrinter struct{}

func (p *darwinPrinter) Print(filePath string) error {
    // `lpr` (CUPS) natif macOS
    return exec.Command("lpr", filePath).Run()
}
```

### 2.4 Implémentation Linux

```go
// internal/printer/printer_linux.go
//go:build linux

package printer

import "os/exec"

type linuxPrinter struct{}

func (p *linuxPrinter) Print(filePath string) error {
    // `lpr` (CUPS) natif Linux
    return exec.Command("lpr", filePath).Run()
}
```

## 3. Exemple détaillé — ShowNotification

### 3.1 Interface

```go
// internal/notifier/notifier.go
package notifier

type Notifier interface {
    Show(title, body string) error
}

func New() Notifier {
    // switch runtime.GOOS ...
}
```

### 3.2 Windows (Toast XML)

```go
// internal/notifier/notifier_windows.go
// Utilise PowerShell + BurntToast ou Win32 API
// (via go-ole ou syscall)
```

### 3.3 macOS (NSUserNotification)

```go
// internal/notifier/notifier_darwin.go
// Utilise `osascript -e 'display notification "body" with title "title"'`
func (n *darwinNotifier) Show(title, body string) error {
    return exec.Command("osascript", "-e",
        `display notification "`+body+`" with title "`+title+`"`).Run()
}
```

### 3.4 Linux (libnotify / dbus)

```go
// internal/notifier/notifier_linux.go
// Utilise `notify-send` (libnotify)
func (n *linuxNotifier) Show(title, body string) error {
    return exec.Command("notify-send", title, body).Run()
}
```

## 4. Matrice de décisions fonctionnelles

Avant d'ajouter une fonction native, valider la matrice :

> **Cette fonctionnalité apporte-t-elle une valeur que le Web ne peut pas offrir ?**

| Fonction | Web | Desktop | Décision |
|---|---|---|---|
| Création examen | ✅ | ✅ | Web uniquement |
| Correction | ✅ | ✅ | Web |
| Notifications | ⚠️ | ✅ | Desktop |
| Impression | ⚠️ | ✅ | Desktop |
| Webcam | ✅ | ✅ | Web |
| Scanner PDF | ❌ | ✅ | Desktop |
| Dossiers locaux | ❌ | ✅ | Desktop |

→ Voir [12 — Matrice de décisions](./12-decision-matrix.md) pour la matrice complète.

## 5. Sécurité des bindings

Toutes les fonctions exposées doivent :
- ✅ Valider les inputs (path canonique, whitelist extensions, length limits)
- ✅ Logger les appels (audit)
- ✅ Rate-limit les fonctions coûteuses (PrintBatch, DownloadFolder)
- ✅ Jamais exécuter de commande shell avec input utilisateur non validé

→ Voir [05 — Security](./05-security.md) pour les détails.

## 6. Références

- [03 — Communication Wails ↔ Next.js](./03-communication.md)
- [05 — Security](./05-security.md)
- [12 — Matrice de décisions](./12-decision-matrix.md)
