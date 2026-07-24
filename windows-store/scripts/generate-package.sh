#!/bin/bash
# SECT-PWA-STORE-1 : générer le package MSIX pour Microsoft Store via PWA Builder.
#
# Prérequis :
#   - Node.js 18+
#   - npm install -g @pwabuilder/cli  (ou utiliser npx)
#
# Usage :
#   ./generate-package.sh [--sign]
#
# Output :
#   windows-store/packages/sect-1.0.0.0.msix          (package non signé)
#   windows-store/packages/sect-1.0.0.0.msixbundle    (bundle multi-arch)
#
# Pour soumettre au Store : uploader le .msix dans le Partner Center.
# Le Store signe automatiquement l'app (pas besoin de certificat !).
#
# Voir windows-store/README.md pour le processus complet.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PACKAGES_DIR="$SCRIPT_DIR/packages"
CONFIG_FILE="$SCRIPT_DIR/pwabuilder-config.json"

# Lire la version depuis le config
VERSION=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['version'])")
APP_NAME=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['appName'])")

echo "════════════════════════════════════════════════════════════"
echo "  SECT — Génération du package Microsoft Store (PWA Builder)"
echo "  App: $APP_NAME | Version: $VERSION"
echo "════════════════════════════════════════════════════════════"
echo ""

mkdir -p "$PACKAGES_DIR"

# 1. Vérifier que Node.js est installé
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non installé. Installez Node.js 18+ depuis https://nodejs.org/"
    exit 1
fi

# 2. Générer le package via PWA Builder CLI
# PWA Builder analyse le manifest + SW et génère un MSIX prêt pour le Store.
echo "→ Lancement de PWA Builder CLI..."
echo "  URL PWA : https://sect-app.vercel.app"
echo "  Manifest : https://sect-app.vercel.app/manifest.json"
echo ""

npx --yes @pwabuilder/pwa-install \
    --url "https://sect-app.vercel.app" \
    --name "$APP_NAME" \
    --package-id "fr.ftci.sect" \
    --version "$VERSION" \
    --platform windows \
    --output "$PACKAGES_DIR" \
    2>&1 || {
    echo ""
    echo "⚠️  Si PWA Builder CLI échoue, utilisez l'outil web :"
    echo "  1. Allez sur https://www.pwabuilder.com/"
    echo "  2. Entrez l'URL : https://sect-app.vercel.app"
    echo "  3. Cliquez 'Start' → attendez l'analyse"
    echo "  4. Cliquez 'Package For Stores' → sélectionnez 'Windows'"
    echo "  5. Remplissez les infos depuis pwabuilder-config.json"
    echo "  6. Téléchargez le .zip généré"
    echo "  7. Décompressez dans $PACKAGES_DIR/"
    echo ""
    exit 1
}

echo ""
echo "✓ Package généré dans : $PACKAGES_DIR/"
ls -lh "$PACKAGES_DIR/" 2>/dev/null || echo "(vide — utilisez l'outil web pwabuilder.com)"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Prochaines étapes :"
echo "  1. Créer un compte Partner Center :"
echo "     https://partner.microsoft.com/dashboard/registration"
echo "  2. Réserver le nom d'app : 'SECT'"
echo "  3. Uploader le .msix dans : Submit > Packages"
echo "  4. Remplir le Store listing depuis store-listing.json"
echo "  5. Soumettre pour certification (24-48h)"
echo "════════════════════════════════════════════════════════════"
