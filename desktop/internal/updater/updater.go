// Package updater — auto-update via GitHub Releases.
//
// SECT-DESKTOP-PHASE-B-1 : auto-update automatique.
//
// Stratégie (voir ADR-0004) :
//   - Server : GitHub Releases (gratuit, CDN global)
//   - Format : latest.json (manifest Wails updater)
//   - URL    : https://github.com/udevrard7/SECT/releases/latest/download/latest.json
//   - Signature : .sig (Minisign) pour vérification intégrité
//   - Canaux : stable, beta, canary
//
// Flux :
//   1. Check() : GET latest.json → compare version courante
//   2. Si update dispo → notification native "Mise à jour disponible"
//   3. DownloadAndInstall() : télécharge binaire + .sig, vérifie, installe
//   4. Au prochain lancement : nouvelle version
//
// Rollback (voir docs/desktop/06-auto-update.md) :
//   - Auto : backup version précédente (.bak), restore si crash 3x
//   - Remote : force_rollback_from dans latest.json
//
// Voir docs/desktop/06-auto-update.md pour le détail.
package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const (
	// defaultManifestURL — URL du manifest auto-update (GitHub Releases latest).
	defaultManifestURL = "https://github.com/udevrard7/SECT/releases/latest/download/latest.json"

	// defaultChannel — canal par défaut (stable | beta | canary).
	defaultChannel = "stable"

	// checkTimeout — timeout pour la requête manifest.
	checkTimeout = 10 * time.Second
)

// Updater gère l'auto-update de SECT Desktop.
type Updater struct {
	currentVersion string
	manifestURL    string
	channel        string
	httpClient     *http.Client
}

// New crée un Updater avec la version courante de l'app.
func New(currentVersion string) *Updater {
	return &Updater{
		currentVersion: currentVersion,
		manifestURL:    defaultManifestURL,
		channel:        defaultChannel,
		httpClient: &http.Client{
			Timeout: checkTimeout,
		},
	}
}

// Manifest représente le fichier latest.json (format Wails updater).
type Manifest struct {
	Version          string             `json:"version"`
	Notes            string             `json:"notes"`
	PubDate          string             `json:"pub_date"`
	Platforms        map[string]Platform `json:"platforms"`
	ForceRollback    *ForceRollback     `json:"force_rollback_from,omitempty"`
}

// Platform décrit un binaire par plateforme (OS/arch).
type Platform struct {
	Signature string `json:"signature"`
	URL       string `json:"url"`
}

// ForceRollback force le downgrade depuis une version buggée.
type ForceRollback struct {
	From   string `json:"from"`
	Reason string `json:"reason"`
}

// UpdateInfo est retourné par Check() — résumé de la mise à jour disponible.
type UpdateInfo struct {
	Version      string `json:"version"`
	Notes        string `json:"notes"`
	Available    bool   `json:"available"`
	ForceRollback bool  `json:"forceRollback"`
	RollbackReason string `json:"rollbackReason,omitempty"`
}

// Check interroge GitHub Releases et compare la version courante.
// Retourne nil si pas de mise à jour (ou en cas d'erreur réseau — fail-safe).
func (u *Updater) Check(ctx context.Context) (*UpdateInfo, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", u.manifestURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", "SECT-Desktop/"+u.currentVersion)

	resp, err := u.httpClient.Do(req)
	if err != nil {
		// Fail-safe : pas d'update si réseau down (ne pas bloquer l'app)
		return &UpdateInfo{Available: false}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return &UpdateInfo{Available: false}, nil
	}

	var manifest Manifest
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		return nil, fmt.Errorf("decode manifest: %w", err)
	}

	info := &UpdateInfo{
		Version: manifest.Version,
		Notes:   manifest.Notes,
	}

	// Force rollback ?
	if manifest.ForceRollback != nil && manifest.ForceRollback.From == u.currentVersion {
		info.ForceRollback = true
		info.RollbackReason = manifest.ForceRollback.Reason
		info.Available = true
		return info, nil
	}

	// Comparaison semver simple (string compare suffit pour x.y.z)
	if manifest.Version != "" && manifest.Version != u.currentVersion {
		info.Available = true
	}

	return info, nil
}

// DownloadAndInstall télécharge et installe la mise à jour.
// Phase B : implémentation simplifiée (ouvre le navigateur sur la release).
// Phase C : téléchargement + vérification signature + install silencieuse.
//
// NOTE : L'implémentation complète (avec signature Minisign + restart) sera
// ajoutée en Phase B tardive. Pour l'instant, on ouvre la page de release
// pour téléchargement manuel — l'auto-update silencieux nécessite plus de
// tests cross-platform.
func (u *Updater) DownloadAndInstall(ctx context.Context, info *UpdateInfo) error {
	// TODO Phase B tardive : implémenter le téléchargement + signature + install
	// Pour l'instant : signaler que l'update doit être manuel
	return fmt.Errorf("auto-update silencieux non implémenté en Phase B — téléchargez manuellement depuis https://github.com/udevrard7/SECT/releases/latest")
}
