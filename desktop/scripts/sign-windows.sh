#!/bin/bash
# SECT-DESKTOP-PHASE-B-1 : signer un .exe Windows avec signtool.
#
# Usage :
#   ./sign-windows.sh <cert.pfx> <password> <file.exe>
#
# Prérequis : Windows SDK (signtool.exe) ou Visual Studio.
# Le certificat .pfx est stocké dans GitHub Secrets (base64).
set -e

CERT_FILE="$1"
CERT_PASS="$2"
EXE_PATH="$3"

if [ -z "$CERT_FILE" ] || [ -z "$CERT_PASS" ] || [ -z "$EXE_PATH" ]; then
    echo "Usage: $0 <cert.pfx> <password> <file.exe>"
    exit 1
fi

if [ ! -f "$EXE_PATH" ]; then
    echo "Error: $EXE_PATH not found"
    exit 1
fi

# Trouver signtool (Windows SDK)
SIGNTOOL=$(which signtool 2>/dev/null || find "/c/Program Files (x86)/Windows Kits" -name "signtool.exe" 2>/dev/null | head -1)
if [ -z "$SIGNTOOL" ]; then
    echo "Error: signtool.exe not found. Install Windows SDK."
    exit 1
fi

echo "→ Signing $EXE_PATH..."
"$SIGNTOOL" sign \
    /f "$CERT_FILE" \
    /p "$CERT_PASS" \
    /t http://timestamp.digicert.com \
    /fd SHA256 \
    "$EXE_PATH"

echo "→ Verifying signature..."
"$SIGNTOOL" verify /pa /v "$EXE_PATH"

# Cleanup du certificat
rm -f "$CERT_FILE"

echo "✓ Signed: $EXE_PATH"
