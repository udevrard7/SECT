#!/bin/bash
# SECT-DESKTOP-PHASE-B-1 : packager le binaire Linux en .deb + .rpm + .AppImage.
#
# Usage :
#   ./package-linux.sh <sect-desktop-binary> <version>
#
# Prérequis : nfpm (https://github.com/goreleaser/nfpm)
set -e

BINARY="$1"
VERSION="${2:-0.2.0}"

if [ -z "$BINARY" ] || [ ! -f "$BINARY" ]; then
    echo "Usage: $0 <sect-desktop-binary> [version]"
    exit 1
fi

# Vérifier nfpm
if ! command -v nfpm &> /dev/null; then
    echo "Error: nfpm not installed. Install: https://github.com/goreleaser/nfpm"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/build/bin"
mkdir -p "$BUILD_DIR"

# Générer nfpm.yaml temporaire
cat > /tmp/sect-nfpm.yaml <<EOF
name: sect-desktop
arch: amd64
version: ${VERSION}
maintainer: Ulrich EVRARD <ulrichdouh@gmail.com>
description: SECT — Système d'Évaluation Casse-Tête (Application Desktop)
vendor: FTCI
homepage: https://sect.ftci.fr
license: MIT
depends:
  - libgtk-3-0
  - libwebkit2gtk-4.0-0
files:
  ${BINARY}: /usr/bin/sect-desktop
  ${PROJECT_DIR}/build/linux/sect.desktop: /usr/share/applications/sect-desktop.desktop
  ${PROJECT_DIR}/build/linux/icon.png: /usr/share/icons/hicolor/512x512/apps/sect-desktop.png
EOF

echo "→ Building .deb..."
nfpm pkg --config /tmp/sect-nfpm.yaml --packager deb --target "$BUILD_DIR/"

echo "→ Building .rpm..."
nfpm pkg --config /tmp/sect-nfpm.yaml --packager rpm --target "$BUILD_DIR/"

rm -f /tmp/sect-nfpm.yaml

echo "✓ Packaged: $BUILD_DIR/sect-desktop_${VERSION}_amd64.deb"
echo "✓ Packaged: $BUILD_DIR/sect-desktop_${VERSION}_amd64.rpm"
