# Documentation SECT

Index central de la documentation du monorepo.

| Dossier / fichier | Contenu |
|---|---|
| [`worklog.md`](./worklog.md) | Journal des évolutions (Task IDs `SECT-*`) — chaque tâche notable y append une section |
| [`desktop/`](./desktop/README.md) | Vision, installation, CI/CD, matrice de décisions + 5 ADR (Architecture Decision Records) |
| [`mobile/`](./mobile/rbac-analysis.md) | Analyses mobile (RBAC multi-plateforme) |
| [`ops/`](./ops/git-history-cleanup-runbook.md) | Runbooks ops (nettoyage historique git `filter-repo` — planifié) |
| [`../frontend/docs/design-system.md`](../frontend/docs/design-system.md) | Design system frontend (tokens, composants DS) |
| [`../.github/CI-CD.md`](../.github/CI-CD.md) | Les 6 workflows GitHub Actions : triggers, secrets, normes |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Conventions de commit, structure, sécurité, tests |
| [`../.github/SECURITY.md`](../.github/SECURITY.md) | Politique de divulgation des vulnérabilités |

## Environnements & déploiement

| Composant | Plateforme | URL / déclencheur |
|---|---|---|
| Frontend | Vercel (projet `sect-app`) | https://sect.ftci.fr (l'URL `sect-app.vercel.app` redirige en 308) |
| Backend | Render (service `SECT`) | https://sect-zead.onrender.com — autoDeploy sur push `main` (rootDir `backend/`) |
| Base | Neon PostgreSQL | 105 migrations appliquées (golang-migrate) |
| Stockage | Cloudflare R2 | bucket `sect-documents` (documents, podcasts, soumissions) |

> ⚠️ Les changements de variables d'environnement Render nécessitent un
> déploiement manuel (l'autoDeploy ne réagit qu'aux push git).
> Les fichiers hors `backend/` ne déclenchent pas non plus l'autoDeploy
> (rootDir) — ex. `render.yaml` à la racine.

## Gestion des versions

- **`v0.1.0` posé le 2026-09-29** (première release, exercice pipelines) —
  schéma : `v*` (mobile, workflow `mobile-release.yml`) et `desktop-v*`
  (desktop, workflow `release-desktop.yml`).
- Backend/frontend : déploiement continu, le SHA du commit est la référence.
- ⚠️ Un éventuel nettoyage d'historique git (`filter-repo`, voir
  [`ops/git-history-cleanup-runbook.md`](./ops/git-history-cleanup-runbook.md))
  réécrira les tags — re-vérifier `git tag -l` après.
