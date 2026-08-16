#!/bin/bash
# ============================================================
# SECT — Mode kiosk pour salles d'examen (Linux)
# Task ID: SECT-PWA-DESKTOP-1
# ============================================================
#
# Lance SECT en mode plein écran verrouillé sur Chrome/Chromium.
# Les étudiants ne peuvent pas ouvrir d'autres onglets ou applications.
#
# USAGE :
#   1. Placez ce fichier sur chaque poste de la salle d'examen
#   2. Rendez-le exécutable : chmod +x sect-kiosk-linux.sh
#   3. Lancez-le : ./sect-kiosk-linux.sh
#   4. Pour quitter le mode kiosk : Ctrl+Shift+Q ou Alt+F4
#
# Lancement automatique au démarrage :
#   - Ajoutez ce script dans ~/.config/autostart/sect-kiosk.desktop
#   - Ou dans /etc/xdg/autostart/ pour tous les utilisateurs
#
# PERSONNALISATION :
#   - Remplacez l'URL ci-dessous par celle de votre établissement si différente
#   - Pour Firefox : utilisez firefox --kiosk (syntaxe différente)
# ============================================================

set -e

# URL de connexion SECT (page de login)
SECT_URL="https://sect-app.vercel.app/login"

# Détecter le navigateur disponible (Chrome > Chromium > Firefox)
if command -v google-chrome >/dev/null 2>&1; then
  BROWSER="google-chrome"
elif command -v chromium-browser >/dev/null 2>&1; then
  BROWSER="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  BROWSER="chromium"
elif command -v firefox >/dev/null 2>&1; then
  # Firefox kiosk mode (depuis Firefox 71)
  exec firefox --kiosk "$SECT_URL" \
    --disable-translate \
    --no-remote
else
  echo "❌ Aucun navigateur compatible trouvé (Chrome, Chromium ou Firefox requis)."
  echo "   Installez Google Chrome :"
  echo "     sudo apt install google-chrome-stable"
  echo "   ou Chromium :"
  echo "     sudo apt install chromium-browser"
  exit 1
fi

# Lancement Chrome/Chromium en mode kiosk
exec "$BROWSER" --kiosk --app="$SECT_URL" \
  --disable-translate \
  --no-first-run \
  --no-default-browser-check \
  --disable-popup-blocking \
  --disable-extensions \
  --overscroll-history-navigation=0 \
  --disable-pull-to-refresh-effect
