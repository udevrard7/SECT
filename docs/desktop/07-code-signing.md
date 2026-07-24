# 07 — Code signing

> **Document vivant** — Modifier ce fichier si la stratégie de signing évolue.

## 1. Pourquoi signer ?

| OS | Sans signing | Avec signing |
|---|---|---|
| Windows | SmartScreen bloque 80% des installations | Aucun avertissement |
| macOS | Gatekeeper bloque 100% ("développeur non vérifié") | "Éditeur vérifié" |
| Linux | Pas de blocage | Recommandé pour dépôts APT/RPM |

**Sans signing, l'adoption desktop est tuée silencieusement.**

→ Voir [ADR-0005 : Code signing obligatoire](./ADR/0005-code-signing.md)

## 2. Certificats requis

| Plateforme | Certificat | Fournisseur | Coût annuel | Délai |
|---|---|---|---|---|
| Windows | Code Signing OV | Sectigo, DigiCert | 200-300 €/an | 1-3 jours |
| Windows (recommandé scale) | Code Signing EV | Sectigo, DigiCert | 350-450 €/an | 3-7 jours |
| macOS | Apple Developer ID Application | Apple | 99 $/an (~90 €) | 1-2 jours |
| macOS (notarization) | Inclus Apple Developer ID | Apple | 0 € | Automatique |
| Linux | GPG key (auto-générée) | — | 0 € | Immédiat |

**Total Phase B** : 290-390 €/an (OV + Apple)
**Total Phase D (avec EV)** : 440-540 €/an

## 3. OV vs EV (Windows)

| Critère | OV (Organization Validation) | EV (Extended Validation) |
|---|---|---|
| Coût | 200-300 €/an | 350-450 €/an |
| SmartScreen | Build réputation (15-30 installations) puis OK | Bypass immédiat |
| Affichage | "Éditeur vérifié" | "Éditeur vérifié" + nom entreprise |
| Hardware token | Non | **Oui** (USB requis pour signer) |
| Recommandation | Début (budget limité) | Production (adoption maximale) |

**Stratégie SECT** : commencer avec **OV** (Phase B), migrer vers **EV** quand l'adoption le justifie (Phase D, ≥ 100 installs).

## 4. Process de signing

### 4.1 Windows (signtool)

```bash
# scripts/sign-windows.sh
#!/bin/bash
set -e

CERT_FILE="$1"    # sect-codesign.pfx
CERT_PASS="$2"
EXE_PATH="$3"

signtool sign \
    /f "$CERT_FILE" \
    /p "$CERT_PASS" \
    /t http://timestamp.digicert.com \
    /fd SHA256 \
    "$EXE_PATH"

signtool verify /pa /v "$EXE_PATH"
```

### 4.2 macOS (codesign + notarization)

```bash
# scripts/notarize-macos.sh
#!/bin/bash
set -e

APP_PATH="$1"
DEVELOPER_ID="$2"      # "Developer ID Application: Ulrich EVRARD (XXX)"
APPLE_ID="$3"
APP_PASSWORD="$4"      # App-specific password
TEAM_ID="$5"

# 1. Signer l'app
codesign --force --deep --options runtime \
    --sign "$DEVELOPER_ID" \
    "$APP_PATH"

# 2. Archiver pour notarization
ditto -c -k --keepParent "$APP_PATH" sect-desktop.zip

# 3. Soumettre à Apple
xcrun notarytool submit sect-desktop.zip \
    --apple-id "$APPLE_ID" \
    --password "$APP_PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait

# 4. Stapler le ticket
xcrun stapler staple "$APP_PATH"

# 5. Vérifier
xcrun stapler validate "$APP_PATH"
spctl --assess --type execute --verbose "$APP_PATH"
```

### 4.3 Linux (GPG)

```bash
# Pas de signing requis pour les .AppImage/.deb/.rpm
# Recommandé : signer les .deb/.rpm avec GPG pour les dépôts APT/YUM
gpg --detach-sign --armor sect-desktop-1.2.0-linux.deb
```

## 5. Stockage des certificats (sécurité)

| Élément | Stockage | Accès |
|---|---|---|
| Certificat Windows `.pfx` | GitHub Secrets (base64) | CI uniquement |
| Mot de passe certificat Windows | GitHub Secrets | CI uniquement |
| Apple Developer ID (clé privée) | GitHub Secrets (base64) | CI uniquement |
| Apple app-specific password | GitHub Secrets | CI uniquement |
| Team ID Apple | GitHub Secrets | CI uniquement |
| GPG key Linux | GitHub Secrets | CI uniquement |

**Règles** :
- ❌ **Jamais** committer de certificat dans le repo
- ❌ **Jamais** stocker en clair sur une machine de dev
- ✅ Toujours passer par GitHub Secrets (chiffré au repos)
- ✅ Accessible uniquement aux workflows GitHub Actions

## 6. Renouvellement

| Certificat | Validité | Renouvellement |
|---|---|---|
| Windows OV | 1-3 ans | 30j avant expiration |
| Windows EV | 1-2 ans | 30j avant expiration (hardware token à recharger) |
| Apple Developer ID | 1 an | Automatique tant que le compte est actif (99 $/an) |

## 7. Critères de migration OV → EV

Migrer vers EV si **tous** les critères :
- ≥ 100 installations desktop actives
- Retours utilisateurs sur avertissement SmartScreen récurrents
- Demande explicite d'un client B2B majeur
- Budget validé (450 €/an au lieu de 300 €/an)

## 8. Références

- [ADR-0005 : Code signing](./ADR/0005-code-signing.md)
- [05 — Security](./05-security.md)
- [09 — CI/CD](./09-ci-cd.md) (signing automatisé en CI)
- [Windows Code Signing](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/driver-signing)
- [Apple Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
