#!/bin/bash
# SECT-DESKTOP-PHASE-B-1 : signer + notarize un .app macOS.
#
# Usage :
#   ./notarize-macos.sh <SECT Desktop.app> "<Developer ID>" "<apple_id>" "<app_password>" "<team_id>"
#
# Prérequis : macOS avec Xcode Command Line Tools.
# Les credentials sont stockés dans GitHub Secrets.
set -e

APP_PATH="$1"
DEVELOPER_ID="$2"
APPLE_ID="$3"
APP_PASSWORD="$4"
TEAM_ID="$5"

if [ -z "$APP_PATH" ] || [ -z "$DEVELOPER_ID" ] || [ -z "$APPLE_ID" ]; then
    echo "Usage: $0 <app_path> <developer_id> <apple_id> <app_password> <team_id>"
    exit 1
fi

if [ ! -d "$APP_PATH" ]; then
    echo "Error: $APP_PATH not found"
    exit 1
fi

echo "→ Signing $APP_PATH..."
codesign --force --deep --options runtime \
    --sign "$DEVELOPER_ID" \
    "$APP_PATH"

echo "→ Archiving for notarization..."
ditto -c -k --keepParent "$APP_PATH" sect-desktop.zip

echo "→ Submitting to Apple for notarization (may take 5-15 min)..."
xcrun notarytool submit sect-desktop.zip \
    --apple-id "$APPLE_ID" \
    --password "$APP_PASSWORD" \
    --team-id "$TEAM_ID" \
    --wait

echo "→ Stapling notarization ticket..."
xcrun stapler staple "$APP_PATH"

echo "→ Verifying..."
xcrun stapler validate "$APP_PATH"
spctl --assess --type execute --verbose "$APP_PATH"

# Cleanup
rm -f sect-desktop.zip

echo "✓ Signed + Notarized: $APP_PATH"
