# 09 — CI/CD

> **Document vivant** — Modifier ce fichier si le pipeline CI/CD évolue.

## 1. Stratégie

| Workflow | Déclencheur | Action |
|---|---|---|
| `build.yml` | Push sur `desktop/**` | Build 3 plateformes (sans signing), upload artifacts |
| `release.yml` | Tag `desktop-v*` | Build + signing + upload GitHub Release |

## 2. Workflow `build.yml` (chaque push)

```yaml
# .github/workflows/build-desktop.yml
name: Build Desktop

on:
  push:
    paths:
      - 'desktop/**'
      - '.github/workflows/build-desktop.yml'
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

      - name: Install Linux deps
        if: matrix.platform.os == 'ubuntu-latest'
        run: |
          sudo apt update
          sudo apt install -y libgtk-3-dev libwebkit2gtk-4.1-dev

      - name: Install Wails CLI
        run: go install github.com/wailsapp/wails/v2/cmd/wails@latest

      - name: Install frontend deps
        working-directory: desktop/frontend
        run: npm ci

      - name: Build
        working-directory: desktop
        run: wails build -platform ${{ matrix.platform.target }} -clean

      - uses: actions/upload-artifact@v4
        with:
          name: sect-desktop-${{ matrix.platform.os }}
          path: desktop/build/bin/*
```

## 3. Workflow `release.yml` (sur tag)

```yaml
# .github/workflows/release-desktop.yml
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

      - name: Install Linux deps
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt update
          sudo apt install -y libgtk-3-dev libwebkit2gtk-4.1-dev

      - name: Install Wails CLI
        run: go install github.com/wailsapp/wails/v2/cmd/wails@latest

      - name: Install frontend deps
        working-directory: desktop/frontend
        run: npm ci

      - name: Build
        working-directory: desktop
        run: wails build -platform ${{ matrix.platform }} -clean -webview2 embed

      # --- Signing Windows ---
      - name: Sign Windows exe
        if: matrix.os == 'windows-latest'
        env:
          CERT_FILE: ${{ secrets.WINDOWS_CODESIGN_PFX }}
          CERT_PASS: ${{ secrets.WINDOWS_CODESIGN_PASS }}
        run: |
          echo "$CERT_FILE" | base64 -d > sect-codesign.pfx
          desktop/scripts/sign-windows.sh sect-codesign.pfx "$CERT_PASS" desktop/build/bin/*.exe
          rm sect-codesign.pfx  # Cleanup

      # --- Signing + Notarization macOS ---
      - name: Sign + Notarize macOS app
        if: matrix.os == 'macos-latest'
        env:
          DEVELOPER_ID: ${{ secrets.APPLE_DEVELOPER_ID }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APP_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
          TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          KEYCHAIN_PASSWORD: ${{ secrets.APPLE_KEYCHAIN_PASSWORD }}
        run: |
          echo "${{ secrets.APPLE_DEVELOPER_KEY }}" | base64 -d > developer-key.p12
          security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security import developer-key.p12 -k build.keychain -P "$KEYCHAIN_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" build.keychain

          desktop/scripts/notarize-macos.sh "desktop/build/bin/SECT Desktop.app" \
            "$DEVELOPER_ID" "$APPLE_ID" "$APP_PASSWORD" "$TEAM_ID"

      # --- Package Linux ---
      - name: Package Linux (.deb, .rpm)
        if: matrix.os == 'ubuntu-latest'
        run: desktop/scripts/package-linux.sh desktop/build/bin/sect-desktop

      # --- Generate latest.json ---
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

## 4. Secrets GitHub Actions requis

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

## 5. Scripts utilitaires

| Script | Rôle |
|---|---|
| `desktop/scripts/sign-windows.sh` | Signer .exe avec signtool |
| `desktop/scripts/notarize-macos.sh` | Signer + notarize .app |
| `desktop/scripts/package-linux.sh` | Build .deb + .rpm avec nfpm |
| `desktop/scripts/generate-manifest.sh` | Générer `latest.json` (Wails updater format) |

## 6. Process de release

### 6.1 Créer une release

```bash
# 1. Mettre à jour la version dans desktop/wails.json
# 2. Mettre à jour RELEASE-NOTES.md
# 3. Commit + tag
git add desktop/wails.json docs/desktop/RELEASE-NOTES.md
git commit -m "desktop-v1.2.0: impression en lot + notifications natives"
git tag desktop-v1.2.0
git push origin desktop-v1.2.0

# 4. GitHub Actions déclenche release.yml automatiquement
# 5. Vérifier la release sur https://github.com/udevrard7/SECT/releases
```

### 6.2 Pre-release (beta/canary)

```bash
git tag desktop-v1.3.0-beta.1
git push origin desktop-v1.3.0-beta.1
# → release.yml marque la release comme "prerelease: true"
```

### 6.3 Rollback (force_rollback)

```bash
# Éditer latest.json sur la release latest
# Ajouter "force_rollback_from" + "rollback_reason"
# Commit + re-upload sur la release
```

→ Voir [06 — Auto-update](./06-auto-update.md) section rollback.

## 7. Coût

| Poste | Coût |
|---|---|
| GitHub Actions (build) | Gratuit (2000 min/mois pour public repos) |
| GitHub Releases (stockage + CDN) | Gratuit |
| **Total CI/CD** | **0 €/mois** |

## 8. Références

- [07 — Code signing](./07-code-signing.md)
- [08 — Packaging](./08-packaging.md)
- [06 — Auto-update](./06-auto-update.md)
- [GitHub Actions documentation](https://docs.github.com/en/actions)
- [softprops/action-gh-release](https://github.com/softprops/action-gh-release)
