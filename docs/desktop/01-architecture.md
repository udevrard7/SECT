# 01 — Architecture

> **Document vivant** — Modifier ce fichier si l'architecture desktop évolue.

## 1. Vue d'ensemble

```
┌─────────────────────────────────────┐
│         SECT Desktop (Wails)        │
│  ┌───────────────────────────────┐  │
│  │   Webview (Next.js + React)   │  │
│  │   https://sect-app.vercel.app │  │
│  └────────────┬──────────────────┘  │
│               │ Wails bindings       │
│  ┌────────────▼──────────────────┐  │
│  │   Go (fonctions natives)      │  │
│  │   - Print, Notif, File dialog │  │
│  │   - Auto-update               │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
              │ HTTPS
              ▼
┌─────────────────────────────────────┐
│    API Go Cloud (Render, inchangé)  │
│    PostgreSQL (Neon, inchangé)      │
└─────────────────────────────────────┘
```

## 2. Décisions architecturales clés

### 2.1 Thin wrapper (pas de logique métier)

Le desktop est un **thin wrapper** autour du web. Aucune logique métier n'est dupliquée. Le desktop consomme les **mêmes API REST** que le web.

→ Voir [ADR-0003 : Backend cloud unique](./ADR/0003-single-cloud-backend.md)

### 2.2 Un seul backend, deux clients

```
                    ┌─────────────────┐
                    │  Backend Go     │
                    │  (Render)       │
                    │  222 routes     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │  Web/PWA    │  │  Desktop    │  │  Mobile     │
     │  (Vercel)   │  │  (Wails)    │  │  (PWA)      │
     └─────────────┘  └─────────────┘  └─────────────┘
```

### 2.3 Architecture inchangée

**On ne touche pas à ce qui fonctionne** :
- Backend Go (Render) — inchangé
- PostgreSQL (Neon) — inchangé
- RLS (173 policies) — inchangé
- Vercel (frontend) — inchangé
- Next.js — inchangé

### 2.4 Module Go desktop indépendant

`desktop/go.mod` est un module Go **séparé** de `backend/go.mod`. Le desktop peut être versionné, buildé et testé indépendamment.

→ Voir [02 — Installation & Développement](./02-installation-dev.md)

## 3. Diagramme de composants

```
desktop/
├── main.go              → Point d'entrée Wails
├── app.go               → Struct App + méthodes exposées au frontend
├── wails.json           → Config Wails
├── go.mod               → Module Go indépendant
│
├── internal/            → Code Go interne (non exposé)
│   ├── updater/         → Auto-update (GitHub Releases)
│   ├── printer/         → Impression native cross-platform
│   ├── notifier/        → Notifications OS
│   └── auth/            → Gestion cookies JWT
│
├── frontend/            → Frontend Wails (build statique)
│   ├── index.html
│   └── src/
│       ├── main.ts      → Init Wails
│       ├── bindings.ts  → Auto-généré (types Go → TS)
│       └── bridge.ts    → Wrapper API native
│
├── build/               → Configs de build par plateforme
│   ├── windows/         → icon.ico, info.json, installer NSIS
│   ├── darwin/          → icon.icns, Info.plist, entitlements
│   └── linux/           → .desktop, icon.png
│
├── scripts/             → Scripts utilitaires (signing, packaging)
├── .github/workflows/   → CI/CD
└── test/                → Tests (unit, e2e, manual)
```

## 4. Diagramme de séquence — Démarrage

```
User → SECT Desktop.exe
  → Wails startup
    → Load webview (https://sect-app.vercel.app)
      → proxy.ts check cookies
        → if access_token OU refresh_token → /dashboard
        → else → /login
    → CheckForUpdates() (async, non-bloquant)
      → GET github.com/.../latest.json
      → if newer version → notification native "Mise à jour disponible"
  → User interagit avec SECT (web)
    → fetch /api/* → Backend Render (HTTPS)
    → window.go.sect.* → Go local (bindings Wails)
```

## 5. Diagramme de déploiement

```
┌─────────────────────────────────────────────────────────┐
│  Build (GitHub Actions)                                 │
│  ├─ Windows runner → sect-desktop.exe (signed OV)       │
│  ├─ macOS runner  → sect-desktop.dmg (signed + notar.)  │
│  └─ Linux runner  → sect-desktop.AppImage + .deb + .rpm │
└────────────────────┬────────────────────────────────────┘
                     │ upload
                     ▼
┌─────────────────────────────────────────────────────────┐
│  GitHub Releases (CDN global, gratuit)                  │
│  ├─ latest.json (manifest auto-update)                  │
│  ├─ sect-desktop-1.2.0-windows.exe                      │
│  ├─ sect-desktop-1.2.0-macos.dmg                        │
│  └─ sect-desktop-1.2.0-linux.AppImage                   │
└────────────────────┬────────────────────────────────────┘
                     │ download
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Postes utilisateurs (Windows / macOS / Linux)          │
│  └─ SECT Desktop (auto-update au démarrage)             │
└─────────────────────────────────────────────────────────┘
```

## 6. Références

- [ADR-0001 : Wails](./ADR/0001-use-wails.md)
- [ADR-0002 : Pas de DB locale](./ADR/0002-no-local-database.md)
- [ADR-0003 : Backend cloud unique](./ADR/0003-single-cloud-backend.md)
- [03 — Communication Wails ↔ Next.js](./03-communication.md)
- [08 — Packaging](./08-packaging.md)
- [09 — CI/CD](./09-ci-cd.md)
