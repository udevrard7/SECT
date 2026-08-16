@echo off
REM ============================================================
REM SECT — Mode kiosk pour salles d'examen (Windows)
REM Task ID: SECT-PWA-DESKTOP-1
REM ============================================================
REM
REM Lance SECT en mode plein écran verrouillé sur Chrome.
REM Les étudiants ne peuvent pas ouvrir d'autres onglets ou applications.
REM
REM USAGE :
REM   1. Placez ce fichier sur chaque poste de la salle d'examen
REM   2. Double-cliquez pour lancer SECT en mode kiosk
REM   3. Pour quitter le mode kiosk : Alt+F4
REM
REM Pour un lancement automatique au démarrage de Windows :
REM   - Placez un raccourci vers ce fichier dans :
REM     C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp
REM   - Ou utilisez le Planificateur de tâches (taskschd.msc)
REM
REM PERSONNALISATION :
REM   - Remplacez l'URL ci-dessous par celle de votre établissement si différente
REM   - Pour Edge : remplacez "chrome" par "msedge"
REM ============================================================

title SECT - Mode Examen

REM URL de connexion SECT (page de login)
set SECT_URL=https://sect-app.vercel.app/login

REM Lancement Chrome en mode kiosk
REM Options :
REM   --kiosk              : plein écran verrouillé, pas de barre d'outils
REM   --app=URL            : ouvre dans une fenetre app (title bar minimal)
REM   --disable-translate  : desactive la popup "traduire cette page"
REM   --no-first-run       : pas de wizard de bienvenue Chrome
REM   --no-default-browser-check : pas de popup "definir comme navigateur par defaut"
REM   --disable-popup-blocking : autorise les popups SECT (impression PDF, etc.)
REM   --disable-extensions : desactive les extensions (anti-triche)
REM   --incognito          : (optionnel) session ephemere, pas de cache

start "" chrome --kiosk --app=%SECT_URL% ^
  --disable-translate ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-popup-blocking ^
  --disable-extensions ^
  --overscroll-history-navigation=0 ^
  --disable-pull-to-refresh-effect

REM Ferme la fenetre cmd
exit
