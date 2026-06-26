# Contribuer à SECT

## Processus de développement

1. **Fork** le projet
2. Créer une branche (`git checkout -b feature/ma-fonctionnalite`)
3. **Committer** avec un message clair (convention conventional commits)
4. **Push** vers la branche (`git push origin feature/ma-fonctionnalite`)
5. Ouvrir une **Pull Request**

## Conventions de commit

```
type(scope): description courte

type: feat | fix | refactor | docs | chore | security | perf | test
scope: frontend | backend | db | auth | api | ci
```

Exemples :
```
feat(backend): ajout endpoint /api/documents/{id}/download
fix(frontend): page login affiche maintenant le formulaire
security(backend): GetClientIP lit CF-Connecting-IP en priorité
```

## Structure du monorepo

- `frontend/` — Next.js 16 (UI uniquement, déployé sur Vercel)
- `backend/` — Go 1.24 (API REST, déployé sur Render)

## Sécurité

- **JAMAIS** de credentials en clair dans le code (utiliser `.env`, jamais committé)
- **JAMAIS** de mots de passe, tokens, ou clés API dans les commits
- Les secrets vont dans : `.env` (local), Vercel dashboard, Render dashboard, GitHub Secrets
- Utiliser `.env.example` pour documenter les variables nécessaires

## Tests

```bash
# Backend
cd backend && go test ./...

# Frontend
cd frontend && bun run lint
```

## Code style

- **Go** : `gofmt -w .` (obligatoire, vérifié par CI)
- **TypeScript** : ESLint (`bun run lint`)
- Pas de `any` en TypeScript (sauf transition)
