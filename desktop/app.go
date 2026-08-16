// Package main — Struct App + fonctions natives exposées au frontend via Wails bindings.
//
// SECT-DESKTOP-PHASE-B-1 : Phase B — Thin Wrapper MVP.
//   - GetAppVersion, GetBackendURL, IsDesktop (Phase A)
//   - ShowNotification (Phase B)
//   - PrintPDF, PrintBatch, PrintToPrinter (Phase B)
//   - ListPrinters, GetDefaultPrinter (Phase B)
//   - SelectFolder, SaveFile (Phase B)
//   - CheckForUpdates, QuitAndInstall (Phase B)
//   - OpenExternal (Phase B)
//
// SECT-DESKTOP-PHASE-C-1 : Phase C — Extensions.
//   - OpenFile (Phase C)
//   - DownloadFolder (Phase C)
//   - GetSystemInfo (Phase C)
//
// Voir docs/desktop/04-native-api.md pour l'inventaire complet.
package main

import (
        "context"
        "fmt"
        "io"
        "log/slog"
        "net/http"
        "os"
        "os/exec"
        "path/filepath"
        goruntime "runtime"
        "strings"
        "sync"
        "time"

        "github.com/udevrard7/sect/desktop/internal/notifier"
        "github.com/udevrard7/sect/desktop/internal/printer"
        "github.com/udevrard7/sect/desktop/internal/updater"
        wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
        appVersion = "0.2.0-phase-b"
        backendURL = "https://sect-app.vercel.app"
)

// App est la struct principale exposée au frontend via Wails bindings.
type App struct {
        ctx       context.Context
        notifier  notifier.Notifier
        printer   printer.Printer
        updater   *updater.Updater
        printMu   sync.Mutex // évite impression concurrente
        examMode  bool       // true si l'utilisateur compose un examen (désactive auto-update check)
        examMu    sync.RWMutex
}

// NewApp crée une instance App.
func NewApp() *App {
        return &App{
                notifier: notifier.New(),
                printer:  printer.New(),
                updater:  updater.New(appVersion),
        }
}

// Startup est appelé par Wails au démarrage.
func (a *App) Startup(ctx context.Context) {
        a.ctx = ctx
        slog.Info("SECT Desktop starting",
                "version", appVersion,
                "backend", backendURL,
                "os", goruntime.GOOS,
                "arch", goruntime.GOARCH,
        )

        // Lancer un check d'auto-update en arrière-plan (non bloquant)
        go func() {
                time.Sleep(3 * time.Second) // Laisser l'app démarrer
                info, err := a.updater.Check(context.Background())
                if err != nil {
                        slog.Warn("update check failed", "error", err)
                        return
                }
                if info.Available && !info.ForceRollback {
                        // Notification native : mise à jour disponible
                        msg := fmt.Sprintf("SECT Desktop %s est disponible.", info.Version)
                        if err := a.notifier.Show("Mise à jour disponible", msg); err != nil {
                                slog.Warn("notification failed", "error", err)
                        }
                }
                if info.ForceRollback {
                        slog.Warn("force rollback required", "reason", info.RollbackReason)
                        _ = a.notifier.Show("Mise à jour de sécurité requise", info.RollbackReason)
                }
        }()
}

// Shutdown est appelé par Wails à la fermeture.
func (a *App) Shutdown(ctx context.Context) {
        slog.Info("SECT Desktop shutting down", "version", appVersion)
}

// ============================================================
// PHASE A — Fonctions utilitaires
// ============================================================

// GetAppVersion retourne la version courante du desktop.
func (a *App) GetAppVersion() string {
        return appVersion
}

// GetBackendURL retourne l'URL du backend SECT.
func (a *App) GetBackendURL() string {
        return backendURL
}

// IsDesktop retourne true (détection desktop).
func (a *App) IsDesktop() bool {
        return true
}

// ============================================================
// PHASE B — Notifications
// ============================================================

// ShowNotification affiche une notification native OS.
func (a *App) ShowNotification(title, body string) error {
        if err := a.notifier.Show(title, body); err != nil {
                slog.Error("notification failed", "title", title, "error", err)
                return fmt.Errorf("notification: %w", err)
        }
        slog.Info("notification shown", "title", title)
        return nil
}

// ============================================================
// PHASE B — Impression
// ============================================================

// PrintPDF imprime un fichier PDF sur l'imprimante par défaut (silencieux).
func (a *App) PrintPDF(filePath string) error {
        // Validation (voir docs/desktop/05-security.md)
        abs, err := validatePDFPath(filePath)
        if err != nil {
                return err
        }

        a.printMu.Lock()
        defer a.printMu.Unlock()

        if err := a.printer.Print(abs); err != nil {
                slog.Error("print failed", "file", abs, "error", err)
                return fmt.Errorf("print: %w", err)
        }
        slog.Info("PDF printed", "file", abs)
        return nil
}

// PrintBatch imprime plusieurs PDF en lot (certificats, relevés).
// Rate-limité à 1 impression à la fois pour éviter la surcharge.
func (a *App) PrintBatch(filePaths []string) error {
        if len(filePaths) == 0 {
                return fmt.Errorf("empty file list")
        }
        if len(filePaths) > 100 {
                return fmt.Errorf("too many files (max 100, got %d)", len(filePaths))
        }

        a.printMu.Lock()
        defer a.printMu.Unlock()

        var errors []string
        printed := 0
        for _, fp := range filePaths {
                abs, err := validatePDFPath(fp)
                if err != nil {
                        errors = append(errors, fmt.Sprintf("%s: %v", fp, err))
                        continue
                }
                if err := a.printer.Print(abs); err != nil {
                        errors = append(errors, fmt.Sprintf("%s: %v", abs, err))
                        continue
                }
                printed++
        }

        slog.Info("batch print completed", "total", len(filePaths), "printed", printed, "errors", len(errors))
        if len(errors) > 0 {
                return fmt.Errorf("%d/%d imprimés. Erreurs: %s", printed, len(filePaths), strings.Join(errors, "; "))
        }
        return nil
}

// PrintToPrinter imprime un PDF sur une imprimante spécifique.
func (a *App) PrintToPrinter(filePath, printerName string) error {
        abs, err := validatePDFPath(filePath)
        if err != nil {
                return err
        }
        if printerName == "" {
                return fmt.Errorf("printerName required")
        }
        a.printMu.Lock()
        defer a.printMu.Unlock()
        return a.printer.PrintTo(abs, printerName)
}

// ListPrinters retourne la liste des imprimantes disponibles.
func (a *App) ListPrinters() ([]printer.PrinterInfo, error) {
        return a.printer.List()
}

// GetDefaultPrinter retourne le nom de l'imprimante par défaut.
func (a *App) GetDefaultPrinter() (string, error) {
        return a.printer.GetDefault()
}

// ============================================================
// PHASE B — Dialogues fichier
// ============================================================

// SelectFolder ouvre une boîte de dialogue de sélection de dossier.
// Retourne le chemin du dossier sélectionné, ou "" si annulé.
func (a *App) SelectFolder(title string) (string, error) {
        if title == "" {
                title = "Sélectionner un dossier"
        }
        dir, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
                Title: title,
        })
        if err != nil {
                return "", fmt.Errorf("dialog: %w", err)
        }
        return dir, nil
}

// SaveFile enregistre un contenu binaire dans un fichier (dialogue "Enregistrer sous").
// Retourne le chemin du fichier enregistré.
func (a *App) SaveFile(content []byte, defaultName string) (string, error) {
        if len(content) == 0 {
                return "", fmt.Errorf("content is empty")
        }
        if defaultName == "" {
                defaultName = "sect-export.txt"
        }

        path, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
                Title:           "Enregistrer sous",
                DefaultFilename: defaultName,
        })
        if err != nil {
                return "", fmt.Errorf("dialog: %w", err)
        }
        if path == "" {
                return "", nil // User cancelled
        }

        if err := os.WriteFile(path, content, 0644); err != nil {
                return "", fmt.Errorf("write: %w", err)
        }
        slog.Info("file saved", "path", path, "bytes", len(content))
        return path, nil
}

// ============================================================
// PHASE B — Auto-update
// ============================================================

// CheckForUpdates vérifie si une mise à jour est disponible.
// Désactivé pendant les examens (voir docs/desktop/11-governance.md principe 4).
func (a *App) CheckForUpdates() (*updater.UpdateInfo, error) {
        // Principe 4 : pas de check pendant un examen
        a.examMu.RLock()
        examMode := a.examMode
        a.examMu.RUnlock()
        if examMode {
                slog.Info("update check skipped (exam in progress)")
                return &updater.UpdateInfo{Available: false}, nil
        }
        return a.updater.Check(context.Background())
}

// SetExamMode signale au desktop si l'utilisateur compose un examen.
// Quand examMode=true, l'auto-update check est désactivé (principe 4 gouvernance).
// Le frontend Next.js appelle cette fonction au montage/démontage de la page /passation.
func (a *App) SetExamMode(active bool) {
        a.examMu.Lock()
        a.examMode = active
        a.examMu.Unlock()
        slog.Info("exam mode", "active", active)
}

// QuitAndInstall télécharge et installe la mise à jour, puis redémarre.
// Phase B : ouvre la page de release (auto-update silencieux en Phase B tardive).
func (a *App) QuitAndInstall() error {
        return a.updater.DownloadAndInstall(context.Background(), &updater.UpdateInfo{
                Version: "latest",
        })
}

// ============================================================
// PHASE B — Liens externes
// ============================================================

// OpenExternal ouvre une URL dans le navigateur par défaut de l'OS.
func (a *App) OpenExternal(url string) error {
        if !strings.HasPrefix(url, "https://") && !strings.HasPrefix(url, "http://") {
                return fmt.Errorf("only http(s) URLs are allowed")
        }
        switch goruntime.GOOS {
        case "windows":
                return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
        case "darwin":
                return exec.Command("open", url).Start()
        default: // linux
                return exec.Command("xdg-open", url).Start()
        }
}

// ============================================================
// PHASE C — Extensions
// ============================================================

// OpenFile ouvre un fichier avec l'application par défaut de l'OS.
func (a *App) OpenFile(filePath string) error {
        abs, err := filepath.Abs(filePath)
        if err != nil {
                return fmt.Errorf("invalid path: %w", err)
        }
        if _, err := os.Stat(abs); err != nil {
                return fmt.Errorf("file not found: %w", err)
        }

        switch goruntime.GOOS {
        case "windows":
                return exec.Command("rundll32", "url.dll,FileProtocolHandler", abs).Start()
        case "darwin":
                return exec.Command("open", abs).Start()
        default: // linux
                return exec.Command("xdg-open", abs).Start()
        }
}

// DownloadFolder télécharge plusieurs URLs vers un dossier local.
// Retourne le nombre de fichiers téléchargés avec succès.
func (a *App) DownloadFolder(urls []string, destDir string) (int, error) {
        if len(urls) == 0 {
                return 0, fmt.Errorf("empty url list")
        }
        if len(urls) > 50 {
                return 0, fmt.Errorf("too many urls (max 50, got %d)", len(urls))
        }
        if destDir == "" {
                return 0, fmt.Errorf("destDir required")
        }
        if err := os.MkdirAll(destDir, 0755); err != nil {
                return 0, fmt.Errorf("create dir: %w", err)
        }

        client := &http.Client{Timeout: 5 * time.Minute}
        downloaded := 0
        var errors []string

        for i, url := range urls {
                if !strings.HasPrefix(url, "https://") && !strings.HasPrefix(url, "http://") {
                        errors = append(errors, fmt.Sprintf("url %d: invalid scheme", i+1))
                        continue
                }
                filename := filepath.Base(url)
                if filename == "" || filename == "/" {
                        filename = fmt.Sprintf("download-%d", i+1)
                }
                destPath := filepath.Join(destDir, filename)

                if err := downloadFile(client, url, destPath); err != nil {
                        errors = append(errors, fmt.Sprintf("%s: %v", filename, err))
                        continue
                }
                downloaded++
        }

        slog.Info("download folder completed", "total", len(urls), "downloaded", downloaded, "errors", len(errors))
        if len(errors) > 0 {
                return downloaded, fmt.Errorf("%d/%d téléchargés. Erreurs: %s", downloaded, len(urls), strings.Join(errors, "; "))
        }
        return downloaded, nil
}

// GetSystemInfo retourne des infos système (debug/support).
type SystemInfo struct {
        OS       string `json:"os"`
        Arch     string `json:"arch"`
        NumCPU   int    `json:"numCpu"`
        AppDir   string `json:"appDir"`
}

// GetSystemInfo retourne des informations système pour le support/debug.
func (a *App) GetSystemInfo() (SystemInfo, error) {
        exe, _ := os.Executable()
        dir := filepath.Dir(exe)
        return SystemInfo{
                OS:     goruntime.GOOS,
                Arch:   goruntime.GOARCH,
                NumCPU: goruntime.NumCPU(),
                AppDir: dir,
        }, nil
}

// ============================================================
// Helpers
// ============================================================

// validatePDFPath valide un chemin de fichier PDF (sécurité bindings).
// Voir docs/desktop/05-security.md.
func validatePDFPath(filePath string) (string, error) {
        abs, err := filepath.Abs(filePath)
        if err != nil {
                return "", fmt.Errorf("invalid path: %w", err)
        }
        ext := strings.ToLower(filepath.Ext(abs))
        if ext != ".pdf" {
                return "", fmt.Errorf("only PDF files are supported, got %s", ext)
        }
        if _, err := os.Stat(abs); err != nil {
                return "", fmt.Errorf("file not found: %w", err)
        }
        return abs, nil
}

// downloadFile télécharge une URL vers un fichier local.
func downloadFile(client *http.Client, url, destPath string) error {
        resp, err := client.Get(url)
        if err != nil {
                return err
        }
        defer resp.Body.Close()
        if resp.StatusCode != http.StatusOK {
                return fmt.Errorf("HTTP %d", resp.StatusCode)
        }
        out, err := os.Create(destPath)
        if err != nil {
                return err
        }
        defer out.Close()
        _, err = io.Copy(out, resp.Body)
        return err
}
