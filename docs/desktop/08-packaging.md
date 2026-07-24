# 08 — Packaging

> **Document vivant** — Modifier ce fichier si la stratégie de packaging évolue.

## 1. Formats par plateforme

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

## 2. Configuration Wails (`wails.json`)

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

## 3. Configuration NSIS (Windows installer)

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

    # Icône menu démarrer + bureau
    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
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

## 4. Configuration macOS (`Info.plist`)

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

## 5. Entitlements macOS (`entitlements.plist`)

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

## 6. Desktop entry Linux (`sect.desktop`)

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

## 7. Icônes

| Plateforme | Format | Tailles | Fichier |
|---|---|---|---|
| Windows | `.ico` (multi-résolution) | 16, 32, 48, 256 | `build/windows/icon.ico` |
| macOS | `.icns` (multi-résolution) | 16, 32, 64, 128, 256, 512, 1024 | `build/darwin/icon.icns` |
| Linux | `.png` | 512x512 | `build/linux/icon.png` |

**Source** : réutiliser le logo SECT existant (`frontend/public/favicon.png` 512x512) et le convertir avec `png2ico` / `iconutil` / `convert`.

## 8. Build commands

```bash
# Windows (sur Windows)
wails build -platform windows/amd64 -clean -webview2 embed

# macOS Universal (sur macOS)
wails build -platform darwin/universal -clean

# Linux (sur Linux)
wails build -platform linux/amd64 -clean

# Package Linux .deb + .rpm (avec nfpm)
nfpm pkg --config nfpm.yaml --target ./build/bin/
```

## 9. Références

- [01 — Architecture](./01-architecture.md)
- [07 — Code signing](./07-code-signing.md)
- [09 — CI/CD](./09-ci-cd.md) (build automatisé)
- [Wails build documentation](https://wails.io/docs/reference/cli#build)
- [NSIS documentation](https://nsis.sourceforge.io/Docs/)
- [create-dmg](https://github.com/sindresorhus/create-dmg)
- [nfpm](https://github.com/goreleaser/nfpm)
