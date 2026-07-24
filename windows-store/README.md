# SECT — Microsoft Store (PWA Packaging)

> Publication de SECT sur le Microsoft Store via PWA Builder.
> **0 €, 0 ligne de code** — la PWA existante est packagée en app Windows Store.

## 🎯 Pourquoi le Store ?

| Sans Store | Avec Store |
|---|---|
| SmartScreen bloque 80% des installations | ✅ **Bypass total** (le Store valide l'app) |
| `.exe` non signé = "potentiellement dangereux" | ✅ "App vérifiée par Microsoft" |
| Pas d'auto-update natif | ✅ Auto-update via le Store |
| Distribution manuelle (GitHub Releases) | ✅ Installation en 1 clic depuis le Store |
| Pas de visibilité | ✅ Découvrable dans le Store (recherche "éducation") |

## 📋 Prérequis

| Élément | Statut | Détail |
|---|---|---|
| PWA manifest (9/9 critères Chrome) | ✅ | `sect-app.vercel.app/manifest.json` |
| Service Worker | ✅ | `sect-app.vercel.app/sw.js` |
| HTTPS | ✅ | Vercel + HSTS preload |
| Icônes 192/512/maskable | ✅ | `frontend/public/favicon.png` (512x512) |
| Compte Microsoft Partner Center | ⏳ | À créer (gratuit pour apps gratuites) |

## 🚀 Processus complet (étape par étape)

### Étape 1 — Générer les assets Store

```bash
cd /home/z/sect-work/SECT
./windows-store/scripts/generate-assets.sh
```

Génère 6 icônes Store depuis `frontend/public/favicon.png` :
- `store-logo.png` (300x300) — logo principal du Store
- `square150x150.png` — tile moyenne
- `square44x44.png` — tile petite
- `square310x310.png` — tile large
- `wide310x150.png` — bannière
- `icon-512.png` — pour PWA Builder

### Étape 2 — Capturer les screenshots

L'admin doit capturer 3-5 screenshots depuis l'app en production :

```bash
# Ouvrir SECT en production
# Login admin : ulrichdouh@gmail.com

# Capturer (Win+Shift+S) :
# 1. Tableau de bord (dashboard) → assets/screenshots/dashboard.png
# 2. Page épreuves → assets/screenshots/epreuves.png
# 3. Page correction → assets/screenshots/correction.png
# 4. Page surveillance → assets/screenshots/surveillance.png
# 5. Page exam-prep → assets/screenshots/exam-prep.png
```

**Format** : PNG, 1920x1080 (16:9), entre 1366x768 et 3840x2160.

### Étape 3 — Générer le package MSIX

#### Option A — PWA Builder CLI (automatisé)

```bash
cd windows-store
./scripts/generate-package.sh
```

Génère `packages/sect-1.0.0.0.msix` (package non signé — le Store signera).

#### Option B — PWA Builder Web (manuel, plus visuel)

1. Allez sur **https://www.pwabuilder.com/**
2. Entrez l'URL : `https://sect-app.vercel.app`
3. Cliquez **Start** → attendez l'analyse (30s)
4. Vérifiez le score PWA (devrait être ≥ 90)
5. Cliquez **Package For Stores** → sélectionnez **Windows**
6. Remplissez les infos depuis `pwabuilder-config.json` :
   - Package ID : `fr.ftci.sect`
   - App name : `SECT`
   - Publisher : `FTCI`
   - Version : `1.0.0.0`
7. Cliquez **Generate** → téléchargez le `.zip`
8. Décompressez dans `windows-store/packages/`

### Étape 4 — Créer un compte Partner Center

1. Allez sur **https://partner.microsoft.com/dashboard/registration**
2. Connectez-vous avec un compte Microsoft (ulrichdouh@gmail.com)
3. Type de compte : **Individuel** (suffisant pour apps gratuites)
4. Remplissez les infos :
   - Nom affiché : FTCI (ou votre nom)
   - Pays : Côte d'Ivoire (ou France)
5. Acceptez le contrat développeur
6. **Coût : 0 €** (gratuit pour les apps gratuites individuelles)

> ⚠️ Si le compte "Individuel" n'est pas disponible pour votre pays, choisissez "Entreprise" (nécessite un compte bancaire pour vérification, mais reste gratuit pour les apps gratuites).

### Étape 5 — Réserver le nom d'app

1. Dans le Partner Center → **New app**
2. Nom : `SECT` (réservez le nom)
3. Le nom est réservé 1 an (renouvelable)

### Étape 6 — Soumettre le package

1. Dans l'app réservée → **Start submission**
2. Section **Packages** :
   - Uploader `sect-1.0.0.0.msix` (généré à l'étape 3)
   - Le Store affiche automatiquement les infos du package
3. Section **Store listings** :
   - Langue : Français (France) + English (US)
   - Copier le contenu depuis `store-listing.json` (champs `fr-FR` et `en-US`)
   - Uploader les screenshots (étape 2)
   - Uploader le store logo (`store-logo.png` 300x300)
4. Section **Properties** :
   - Category : Education
   - Subcategory : Productivity
   - Age rating : 13+ (voir `store-listing.json`)
5. Section **Age ratings** :
   - Remplir le questionnaire IARC (auto-rempli depuis `store-listing.json`)
6. Section **Pricing and availability** :
   - Price : Free
   - Markets : All markets (ou sélectionner pays cibles)
7. Section **Submission options** :
   - Notes for certification : "PWA package generated via PWA Builder. App requires internet connection. Backend API: https://sect-zead.onrender.com"

### Étape 7 — Soumettre pour certification

1. Cliquez **Submit to the Store**
2. Statut : **In review** (24-48h)
3. Microsoft vérifie :
   - L'app ne crash pas au lancement
   - Pas de malware (scan antivirus)
   - Le manifest est valide
   - La PWA répond en HTTPS
4. Si validé : **In the Store** 🎉
5. Si rejeté : corrections + resoumission (gratuit, illimité)

## 📦 Structure

```
windows-store/
├── README.md                    # Ce fichier (guide complet)
├── pwabuilder-config.json       # Config PWA Builder (package ID, version, etc.)
├── store-listing.json           # Listing Store (description FR + EN, keywords)
├── assets/                      # Icônes + screenshots
│   ├── store-logo.png           # 300x300 (généré)
│   ├── square150x150.png        # 150x150 (généré)
│   ├── square44x44.png          # 44x44 (généré)
│   ├── square310x310.png        # 310x310 (généré)
│   ├── wide310x150.png          # 310x150 (généré)
│   ├── icon-512.png             # 512x512 (généré)
│   └── screenshots/             # 3-5 screenshots (à capturer)
├── scripts/
│   ├── generate-package.sh      # Génère MSIX via PWA Builder CLI
│   └── generate-assets.sh       # Génère icônes Store depuis favicon
└── packages/                    # MSIX générés (gitignored)
```

## 🔄 Mises à jour

Pour publier une nouvelle version :

1. Mettre à jour `version` dans `pwabuilder-config.json` (ex: `1.0.0.0` → `1.1.0.0`)
2. Régénérer le package : `./scripts/generate-package.sh`
3. Dans Partner Center → **New submission** → uploader le nouveau `.msix`
4. Soumettre (24-48h pour certification)

Le Store gère l'auto-update : les utilisateurs reçoivent automatiquement la nouvelle version.

## 🆚 Comparaison avec le desktop Wails

| Critère | PWA Store (cette solution) | Desktop Wails |
|---|---|---|
| Coût | **0 €** | 290-390 €/an (signing) |
| Effort dev | **0 jour** (PWA existante) | Phase A+B livrées (8 jours) |
| SmartScreen | **Bypass total** (Store) | OV : réputation à construire |
| Auto-update | **Natif Store** | GitHub Releases (à finaliser) |
| Fonctions natives | Web Push + File API | Print PDF, notif natives, etc. |
| Distribution | **Store Microsoft** (1 clic) | GitHub Releases (manuel) |
| Kiosk mode | Chrome `--kiosk --app=URL` | Wails webview |

**Conclusion** : Le Store PWA couvre 90% des besoins desktop à **0 €**. Le Wails reste pertinent pour les 10% restants (impression en lot, drag-drop fichiers) si l'adoption le justifie.

## 📚 Ressources

- [PWA Builder](https://www.pwabuilder.com/) — Génération du package
- [Microsoft Partner Center](https://partner.microsoft.com/) — Soumission Store
- [PWA Store documentation](https://docs.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/) — Doc officielle
- [Store policies](https://docs.microsoft.com/en-us/windows/uwp/publish/store-policies) — Règles du Store

## 📝 Task IDs

- `SECT-PWA-STORE-1` — Packaging Microsoft Store (ce dossier)

---

*Solution 0 € pour distribution Windows desktop — bypass SmartScreen, auto-update natif.*
