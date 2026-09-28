# Contribuer à SECT

## Processus de développement

1. **Fork** le projet
2. Créer une branche (`git checkout -b feature/ma-fonctionnalite`)
3. **Committer** avec un message clair (convention conventional commits)
4. **Push** vers la branche (`git push origin feature/ma-fonctionnalite`)
5. Ouvrir une **Pull Request** (le template .github/PULL_REQUEST_TEMPLATE.md
   s'applique automatiquement ; les zones sensibles exigent une review
   CODEOWNERS)

## Conventions de commit

```
type(scope): description courte

type: feat | fix | refactor | docs | chore | ci | build | perf | test | style | revert
scope: frontend | backend | db | auth | api | ci | mobile | desktop | repo | config
```

Exemples :
```
feat(backend): ajout endpoint /api/documents/{id}/download
fix(frontend): page login affiche maintenant le formulaire
ci: épinglage des actions GitHub par SHA
```

> Historique : une partie des anciens commits suit un style maison
> (`SECT-MOBILE-FOCUS-3:`). Tout nouveau commit doit suivre les
> Conventional Commits ci-dessus.

## Structure du monorepo

- `frontend/` — Next.js 16 (UI, déployé sur Vercel → `sect.ftci.fr`)
- `backend/` — Go 1.27 (API REST, déployé sur Render)
- `mobile/` — Kotlin Multiplatform (Android + iOS, CI GitHub Actions)
- `desktop/` — Wails v2 (Windows/macOS/Linux, releases sur tags `desktop-v*`)
- `db/` (via `backend/db/db/migrations/`) — 105 migrations golang-migrate
- `docs/` — worklog, documentation desktop/mobile, design system

## Sécurité

- **JAMAIS** de credentials en clair dans le code (utiliser `.env`, jamais committé)
- **JAMAIS** de mots de passe, tokens, ou clés API dans les commits
- Les secrets vont dans : `.env` (local), Vercel dashboard, Render dashboard, GitHub Secrets
- Utiliser `.env.example` pour documenter les variables nécessaires
  (frontend et backend en ont un versionné)
- Les vulnérabilités se signalent par email — voir [SECURITY.md](.github/SECURITY.md),
  jamais en ticket public

## Tests

```bash
# Backend
cd backend && go build ./... && go vet ./...
# (aucun fichier _test.go pour l'instant — la CI valide compilation + lint)

# Frontend
cd frontend && bun run lint && bun run test && bun run build
```

## Code style

- **Go** : `gofmt -w .` (obligatoire, vérifié par CI via `.golangci.yml`)
- **TypeScript** : ESLint (`bun run lint`)
- Pas de `any` en TypeScript (sauf transition)
- `go test ./... -race` doit rester vert (CI)
