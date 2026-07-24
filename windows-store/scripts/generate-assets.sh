#!/bin/bash
# SECT-PWA-STORE-1 : préparer les assets visuels pour le Microsoft Store.
#
# Le Store nécessite :
#   - Store logo 300x300 (carré)
#   - Square 150x150 (tile moyenne)
#   - Square 44x44 (tile petite)
#   - Wide 310x150 (bannière)
#   - Screenshots (au moins 1, recommandé 3-5)
#
# Ce script génère les icônes depuis frontend/public/favicon.png (512x512).
# Les screenshots doivent être capturés manuellement depuis l'app en production.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../assets"
SRC="$(dirname "$(dirname "$SCRIPT_DIR")")/frontend/public/favicon.png"

mkdir -p "$ASSETS_DIR"

if [ ! -f "$SRC" ]; then
    echo "❌ Source icon not found: $SRC"
    exit 1
fi

echo "→ Génération des icônes Store depuis $SRC..."

python3 <<'PYEOF'
from PIL import Image
import os

src = os.path.expanduser("$(dirname $(dirname $(dirname $(dirname os.path.realpath(__file__)))))")
# Actually just use the path passed via environment
PYEOF

# Use Python with explicit paths
python3 -c "
from PIL import Image
import os

src = '$SRC'
assets = '$ASSETS_DIR'
img = Image.open(src)

# Microsoft Store required icons
icons = {
    'store-logo.png': (300, 300),
    'square150x150.png': (150, 150),
    'square44x44.png': (44, 44),
    'square310x310.png': (310, 310),
    'wide310x150.png': (310, 150),
    'icon-512.png': (512, 512),  # For PWA Builder
}

for name, size in icons.items():
    w, h = size
    if w == h:
        resized = img.resize((w, h), Image.LANCZOS)
    else:
        # Wide banner : resize + crop center
        ratio = max(w / img.width, h / img.height)
        new_size = (int(img.width * ratio), int(img.height * ratio))
        resized = img.resize(new_size, Image.LANCZOS)
        # Crop center
        left = (resized.width - w) // 2
        top = (resized.height - h) // 2
        resized = resized.crop((left, top, left + w, top + h))
    resized.save(os.path.join(assets, name), 'PNG')
    print(f'  ✓ {name} ({w}x{h})')

print(f'\\n✓ {len(icons)} icônes générées dans {assets}/')
"

echo ""
echo "→ Screenshots à capturer manuellement :"
echo "  1. Ouvrez https://sect-app.vercel.app/dashboard (login admin)"
echo "  2. Capturez (Win+Shift+S ou outil de capture) :"
echo "     - dashboard.png : tableau de bord (1920x1080)"
echo "     - epreuves.png : page épreuves (1920x1080)"
echo "     - correction.png : page correction (1920x1080)"
echo "  3. Placez-les dans $ASSETS_DIR/screenshots/"
echo ""
echo "⚠️  Le Store nécessite au moins 1 screenshot (recommandé 3-5)."
echo "   Format : PNG, entre 1366x768 et 3840x2160, ratio 16:9."
mkdir -p "$ASSETS_DIR/screenshots"
echo ""
echo "✓ Dossier screenshots/ créé (vide — à remplir manuellement)"
