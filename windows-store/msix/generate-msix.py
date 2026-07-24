#!/usr/bin/env python3
"""
SECT-PWA-MSIX-1 : prépare la structure staging pour MakeAppx.

Ce script :
  1. Crée un dossier staging/ avec la structure MSIX attendue
  2. Copie AppxManifest.xml
  3. Copie les icônes Store (renommées selon les conventions MSIX)
  4. Crée un fichier AppInfo.json avec l'URL de la PWA
  5. Crée les fichiers de contenu (HTML de redirection vers SECT)

Ensuite, sur Windows, lancer make-msix.ps1 pour packager en .msix.

Usage :
  python3 generate-msix.py
"""

import json
import os
import shutil
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_DIR = SCRIPT_DIR.parent  # windows-store/
ASSETS_SRC = PROJECT_DIR / "assets"
MANIFEST = SCRIPT_DIR / "AppxManifest.xml"
STAGING = SCRIPT_DIR / "staging"

# Mapping icônes source → noms MSIX
# Le manifest référence assets/<name>.png
ICON_MAPPING = {
    "store-logo.png": "store-logo.png",
    "square150x150.png": "square150x150.png",
    "square44x44.png": "square44x44.png",
    "square310x310.png": "square310x310.png",
    "wide310x150.png": "wide310x150.png",
    "icon-512.png": "icon-512.png",
}

# Informations app (depuis pwabuilder-config.json)
APP_INFO = {
    "appName": "SECT",
    "appDisplayName": "SECT — Système d'Évaluation Casse-Tête",
    "publisher": "FTCI",
    "version": "1.0.0.0",
    "pwaUrl": "https://sect-app.vercel.app",
    "startUrl": "/dashboard",
    "packageId": "fr.ftci.sect",
}


def main():
    print("════════════════════════════════════════════════════════════")
    print("  SECT — Préparation structure MSIX")
    print("════════════════════════════════════════════════════════════")
    print()

    # 1. Nettoyer staging/
    if STAGING.exists():
        shutil.rmtree(STAGING)
    STAGING.mkdir(parents=True)
    (STAGING / "assets").mkdir()
    print(f"✓ Dossier staging/ créé : {STAGING}")

    # 2. Copier AppxManifest.xml
    shutil.copy2(MANIFEST, STAGING / "AppxManifest.xml")
    print(f"✓ AppxManifest.xml copié")

    # 3. Copier les icônes
    copied = 0
    for src_name, dst_name in ICON_MAPPING.items():
        src = ASSETS_SRC / src_name
        dst = STAGING / "assets" / dst_name
        if src.exists():
            shutil.copy2(src, dst)
            copied += 1
        else:
            print(f"  ⚠️  Icône manquante : {src}")
    print(f"✓ {copied} icônes copiées dans staging/assets/")

    # 4. Créer AppInfo.json (metadata pour le runtime)
    appinfo = {
        "name": APP_INFO["appName"],
        "displayName": APP_INFO["appDisplayName"],
        "publisher": APP_INFO["publisher"],
        "version": APP_INFO["version"],
        "pwaUrl": APP_INFO["pwaUrl"],
        "startUrl": APP_INFO["pwaUrl"] + APP_INFO["startUrl"],
        "packageId": APP_INFO["packageId"],
    }
    with open(STAGING / "AppInfo.json", "w", encoding="utf-8") as f:
        json.dump(appinfo, f, indent=2, ensure_ascii=False)
    print(f"✓ AppInfo.json créé")

    # 5. Créer index.html (page de redirection vers la PWA)
    # L'app MSIX lance cette page, qui redirige vers SECT.
    index_html = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="0; url=https://sect-app.vercel.app/dashboard" />
  <title>SECT</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #F0F2F5; }
    .loader {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      height: 100vh; font-family: -apple-system, sans-serif;
      color: #0F766E;
    }
    .logo { font-size: 3rem; font-weight: 700; margin-bottom: 1rem; }
    .spinner {
      width: 40px; height: 40px;
      border: 4px solid #E5E7EB; border-top-color: #0F766E;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader">
    <div class="logo">SECT</div>
    <div class="spinner"></div>
  </div>
  <script>
    // Redirection vers la PWA SECT
    window.location.href = "https://sect-app.vercel.app/dashboard";
  </script>
</body>
</html>
"""
    with open(STAGING / "index.html", "w", encoding="utf-8") as f:
        f.write(index_html)
    print(f"✓ index.html créé (redirection vers PWA)")

    # 6. Créer un fichier de configuration Edge WebView2
    # (indique à Windows de lancer l'app dans une fenêtre Edge app-like)
    webview_config = {
        "appUrl": "https://sect-app.vercel.app/dashboard",
        "themeColor": "#84CC16",
        "backgroundColor": "#F0F2F5",
        "displayName": "SECT",
        "navigationMode": "edge",
    }
    with open(STAGING / "webview-config.json", "w", encoding="utf-8") as f:
        json.dump(webview_config, f, indent=2)
    print(f"✓ webview-config.json créé")

    # 7. Résumé
    print()
    print("════════════════════════════════════════════════════════════")
    print(f"  Structure staging/ prête : {STAGING}")
    print("════════════════════════════════════════════════════════════")
    print()
    print("Fichiers :")
    for path in sorted(STAGING.rglob("*")):
        if path.is_file():
            rel = path.relative_to(STAGING)
            size = path.stat().st_size
            print(f"  {rel}  ({size:,} bytes)")

    print()
    print("Prochaine étape (sur Windows) :")
    print("  powershell -ExecutionPolicy Bypass -File make-msix.ps1")
    print()
    print("Ou alternative (pwabuilder.com) :")
    print("  1. Allez sur https://www.pwabuilder.com/")
    print("  2. Entrez : https://sect-app.vercel.app")
    print("  3. Package For Stores → Windows → téléchargez le .zip")


if __name__ == "__main__":
    main()
