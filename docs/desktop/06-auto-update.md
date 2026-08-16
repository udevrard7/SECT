# 06 — Auto-update

> **Document vivant** — Modifier ce fichier si la stratégie d'auto-update évolue.

## 1. Stratégie : GitHub Releases

**Décision** : Utiliser **GitHub Releases** comme backend d'auto-update.

→ Voir [ADR-0004 : GitHub Releases](./ADR/0004-github-release.md)

### Avantages
- Gratuit (inclus dans le plan GitHub gratuit)
- CDN global (GitHub cache)
- Versioning natif (tags Git)
- Téléchargement public (pas d'auth)

### Inconvénients
- Binaires publics (mais pas de secret dedans)
- Rate-limit GitHub API (60 req/h anonyme, 5000 req/h authentifié)

## 2. Format des releases

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

## 3. Format `latest.json` (Wails updater)

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

URL fixe (toujours la latest) :
```
https://github.com/udevrard7/SECT/releases/latest/download/latest.json
```

## 4. Flux d'auto-update

```
1. Au démarrage, CheckForUpdates() interroge latest.json

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

## 5. Canaux de mise à jour

| Canal | Tag Git | Audience | Stabilité |
|---|---|---|---|
| `stable` | `v1.2.0` | Tous les utilisateurs | Production |
| `beta` | `v1.2.0-beta.1` | Testeurs volontaires | Pre-release |
| `canary` | `v1.2.0-canary.20260723` | Équipe interne | Nightly |

**Implémentation** : L'app interroge le canal configuré (paramètre dans Settings).

## 6. Rollback strategy

### 6.1 Auto-rollback (automatique)

L'installer garde la version précédente (`sect-desktop-1.1.0.bak`). Si le nouveau binaire crash 3x au démarrage, l'app restaure automatiquement la version précédente.

### 6.2 Force rollback (remote kill switch)

Si une mise à jour casse l'app à grande échelle :

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
4. Téléchargement + installation de la version `1.1.0`.
5. Log + alerte admin.

### 6.3 Manuel

L'utilisateur peut désinstaller + réinstaller une version antérieure (toutes les releases restent sur GitHub).

### 6.4 Abandon desktop (scénario pessimiste)

Si le desktop n'atteint pas ses objectifs après 6 mois :
1. Arrêt des releases (plus de tags `desktop-v*`)
2. Notification utilisateurs : bannière "SECT Desktop ne sera plus maintenu"
3. Auto-update vers version finale affichant message de fin de support
4. Suppression du dossier `desktop/` du repo
5. **PWA reste** la seule solution desktop (déjà fonctionnelle, aucune dépendance)

→ Voir [10 — Roadmap](./10-roadmap.md) section rollback

## 7. Coût

| Poste | Coût |
|---|---|
| GitHub Releases | 0 € (gratuit) |
| Bandwidth (CDN) | 0 € (GitHub CDN gratuit pour releases publiques) |
| Stockage | Illimité |
| **Total** | **0 €/an** |

## 8. Implémentation

```go
// internal/updater/updater.go
package updater

type Updater struct {
    currentVersion string
    manifestURL    string  // https://github.com/.../latest.json
    channel        string  // stable | beta | canary
}

type UpdateInfo struct {
    Version     string `json:"version"`
    Notes       string `json:"notes"`
    PubDate     string `json:"pub_date"`
    ForceRollback *struct {
        From   string `json:"from"`
        Reason string `json:"reason"`
    } `json:"force_rollback_from,omitempty"`
}

func (u *Updater) Check() (*UpdateInfo, error) {
    // GET manifestURL → parse JSON → compare versions
}

func (u *Updater) DownloadAndInstall(info *UpdateInfo) error {
    // 1. Download binaire + .sig
    // 2. Verify signature
    // 3. Backup current version
    // 4. Install new version
    // 5. Relaunch
}
```

## 9. Références

- [ADR-0004 : GitHub Releases](./ADR/0004-github-release.md)
- [05 — Security](./05-security.md) (vérification signature)
- [10 — Roadmap](./10-roadmap.md) (plan de rollback)
