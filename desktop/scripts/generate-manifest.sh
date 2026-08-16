#!/bin/bash
# SECT-DESKTOP-PHASE-B-1 : générer le manifest latest.json pour l'auto-update.
#
# Usage :
#   ./generate-manifest.sh <version>
#
# Output : latest.json sur stdout (à uploader sur GitHub Release latest).
# Le manifest contient les URLs des binaires par plateforme + signatures.
set -e

VERSION="$1"
if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>" >&2
    exit 1
fi

# Les signatures (.sig) seront générées côté CI après signing.
# Pour l'instant, on met des placeholders vides (à remplacer en CI).

cat <<EOF
{
  "version": "${VERSION}",
  "notes": "SECT Desktop ${VERSION}",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "windows-x86_64": {
      "signature": "",
      "url": "https://github.com/udevrard7/SECT/releases/download/desktop-v${VERSION}/sect-desktop-${VERSION}-windows.exe"
    },
    "darwin-x86_64": {
      "signature": "",
      "url": "https://github.com/udevrard7/SECT/releases/download/desktop-v${VERSION}/sect-desktop-${VERSION}-macos-intel.dmg"
    },
    "darwin-aarch64": {
      "signature": "",
      "url": "https://github.com/udevrard7/SECT/releases/download/desktop-v${VERSION}/sect-desktop-${VERSION}-macos-arm64.dmg"
    },
    "linux-x86_64": {
      "signature": "",
      "url": "https://github.com/udevrard7/SECT/releases/download/desktop-v${VERSION}/sect-desktop-${VERSION}-linux.AppImage"
    }
  }
}
EOF
