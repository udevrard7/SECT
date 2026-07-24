# SECT — MSIX Package (Microsoft Store)

> Génération autonome du package `.msix` pour Microsoft Store.
> **Alternative à pwabuilder.com** — 100% local, sans dépendance externe.

## 🎯 Deux méthodes

### Méthode A — Script local (MakeAppx, recommandé)

**Avantage** : 100% local, reproductible, versionné dans le repo.

**Prérequis** : Windows 10/11 + Windows SDK (MakeAppx.exe)

```bash
# 1. Préparer la structure staging/ (marche sur Linux/macOS/Windows)
cd windows-store/msix
python3 generate-msix.py

# 2. Packager en .msix (sur Windows)
powershell -ExecutionPolicy Bypass -File make-msix.ps1
```

**Output** : `windows-store/packages/sect-1.0.0.0.msix`

### Méthode B — pwabuilder.com (web, plus simple)

Si vous n'avez pas Windows SDK :

1. Allez sur **https://www.pwabuilder.com/**
2. Entrez l'URL : `https://sect-app.vercel.app`
3. Cliquez **Start** → attendez l'analyse (30s)
4. Cliquez **Package For Stores** → **Windows**
5. Remplissez les infos depuis `pwabuilder-config.json` :
   - Package ID : `fr.ftci.sect`
   - App name : `SECT`
   - Publisher : `FTCI`
   - Version : `1.0.0.0`
6. Cliquez **Generate** → téléchargez le `.zip`
7. Décompressez dans `windows-store/packages/`

## 📁 Structure

```
windows-store/msix/
├── AppxManifest.xml         # Manifest MSIX (Identity, VisualElements, Capabilities)
├── generate-msix.py         # Prépare staging/ (Linux/macOS/Windows)
├── make-msix.ps1            # Packaging final (Windows + MakeAppx)
└── staging/                 # Structure générée (gitignored)
    ├── AppxManifest.xml     # Copie du manifest
    ├── AppInfo.json         # Metadata app (URL PWA, version)
    ├── index.html           # Redirection vers https://sect-app.vercel.app/dashboard
    ├── webview-config.json  # Config Edge WebView2
    └── assets/              # 6 icônes MSIX
        ├── store-logo.png   # 300x300
        ├── square150x150.png
        ├── square44x44.png
        ├── square310x310.png
        ├── wide310x150.png
        └── icon-512.png
```

## 🔧 Détails techniques

### AppxManifest.xml

| Élément | Valeur | Description |
|---|---|---|
| `Identity Name` | `fr.ftci.sect` | Package ID (domaine inversé) |
| `Identity Publisher` | `CN=FTCI` | Éditeur |
| `Identity Version` | `1.0.0.0` | Version (Major.Minor.Build.Revision) |
| `DisplayName` | `SECT — Système d'Évaluation Casse-Tête` | Nom affiché |
| `Capabilities` | `internetClient`, `webcam`, `microphone` | Permissions |
| `TargetDeviceFamily` | `Windows.Desktop 10.0.19041.0+` | Windows 10 2004+ |

### index.html (point d'entrée)

L'app MSIX lance `index.html` qui redirige immédiatement vers `https://sect-app.vercel.app/dashboard`. La PWA se charge ensuite dans le webview Edge.

### Pourquoi pas de code embarqué ?

SECT est une **PWA** — le code métier est sur Vercel (frontend) + Render (backend). L'app MSIX est un **wrapper** qui lance la PWA dans une fenêtre native Windows. Aucune logique métier n'est dupliquée (voir ADR-0003).

## 📦 Soumission au Store

Une fois le `.msix` généré :

1. **Créer un compte** Partner Center : https://partner.microsoft.com/dashboard/registration
2. **Réserver le nom** : "SECT"
3. **Uploader** le `.msix` dans Submit > Packages
4. **Remplir le listing** depuis `../store-listing.json` (FR + EN)
5. **Uploader les screenshots** depuis `../assets/screenshots/`
6. **Soumettre** → certification 24-48h

→ Voir `../README.md` pour le guide complet 7 étapes.

## 🔄 Mises à jour

Pour publier une nouvelle version :

1. Mettre à jour `Version` dans `AppxManifest.xml` (ex: `1.0.0.0` → `1.1.0.0`)
2. Mettre à jour `version` dans `generate-msix.py` (`APP_INFO["version"]`)
3. Régénérer : `python3 generate-msix.py && powershell -File make-msix.ps1`
4. Soumettre la nouvelle version dans Partner Center

## 🆚 Comparaison MakeAppx vs pwabuilder.com

| Critère | MakeAppx (local) | pwabuilder.com (web) |
|---|---|---|
| Dépendance | Windows SDK | Navigateur web |
| Reproductibilité | ✅ Versionné dans repo | ⚠️ Dépend du service |
| Coût | 0 € | 0 € |
| Vitesse | ~5s | ~2 min |
| Personnalisation | ✅ Total (manifest) | Limitée |
| Recommandé | ✅ Production | Découverte / test |

## 📝 Task IDs

- `SECT-PWA-MSIX-1` — Génération MSIX autonome (ce dossier)
