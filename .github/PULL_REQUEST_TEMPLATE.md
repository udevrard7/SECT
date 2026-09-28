## Résumé

<!-- Décrivez le changement en 1 à 3 phrases : quoi et pourquoi. -->

## Type de changement

- [ ] `feat` — nouvelle fonctionnalité
- [ ] `fix` — correction de bug
- [ ] `chore` — maintenance / dépendances
- [ ] `ci` — intégration ou déploiement continu
- [ ] `docs` — documentation
- [ ] `refactor` / `perf` / `test` / `style`

## Checklist

- [ ] Le titre suit les Conventional Commits — `type(scope): description` (cf. [CONTRIBUTING.md](../CONTRIBUTING.md))
- [ ] Frontend touché : `bun run lint` et `bun run test` passent
- [ ] Backend touché : `go build ./...` et `go vet ./...` passent
- [ ] Nouvelle migration : paire `.up.sql` / `.down.sql` numérotée à la suite des 105 existantes
- [ ] Nouvelle variable d'env : documentée dans `.env.example` et `render.yaml` (`sync: false` si secrète)
- [ ] Pas de secret dans le diff (clés, mots de passe, URLs de connexion)
- [ ] Worklog mis à jour ([docs/worklog.md](../docs/worklog.md)) si évolution notable

## Notes de test

<!-- Comment avez-vous vérifié ? Captures d'écran pour l'UI, commandes jouées, etc. -->
