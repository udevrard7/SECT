# 11 — Gouvernance technique

> **Document vivant** — Principes garde-fous pour l'évolution du desktop SECT.

## 1. Principes fondamentaux

Ces principes servent de **garde-fous** au fil de l'évolution du projet. Toute déviation doit faire l'objet d'un ADR validé.

### Principe 1 — Le backend cloud est l'unique source de vérité

> PostgreSQL Neon (avec RLS 173 policies) reste l'unique source de vérité. Le desktop ne duplique aucune donnée métier localement.

**Conséquence** : Pas de DB locale, pas de sync, pas de cache métier (le cache IndexedDB du webview couvre les besoins PWA).

→ Voir [ADR-0002 : Pas de DB locale](./ADR/0002-no-local-database.md)

### Principe 2 — Aucune logique métier dupliquée sans ADR

> Aucune logique métier ne doit être dupliquée dans le client desktop sans ADR validé par le comité technique.

**Conséquence** : Si une fonctionnalité desktop nécessite de la logique métier (calculs, validations, transformations), elle doit soit :
- (a) Appeler l'API cloud (default)
- (b) Faire l'objet d'un ADR justifiant la duplication (exceptionnel)

→ Voir [ADR-0003 : Backend cloud unique](./ADR/0003-single-cloud-backend.md)

### Principe 3 — Toute fonctionnalité desktop doit démontrer une valeur ajoutée

> Toute fonctionnalité desktop doit démontrer une valeur ajoutée par rapport au Web.

**Conséquence** : Avant d'ajouter une fonction native, valider la matrice de décisions.

→ Voir [12 — Matrice de décisions](./12-decision-matrix.md)

### Principe 4 — Les mises à jour desktop ne doivent jamais interrompre une session d'examen

> Les mises à jour desktop ne doivent jamais interrompre une session d'examen en cours.

**Conséquence** :
- L'auto-update ne se déclenche **jamais** pendant qu'un examen est en cours
- L'auto-update propose (ne force pas) — l'utilisateur garde le contrôle
- Si l'utilisateur est sur `/passation` (page d'examen), `CheckForUpdates()` est désactivé

**Implémentation** :
```go
// desktop/app.go
func (a *App) CheckForUpdates() (*UpdateInfo, error) {
    // Désactiver si l'utilisateur compose un examen
    // (détecté via l'URL courante du webview)
    currentURL := runtime.GetURL(a.ctx)
    if strings.Contains(currentURL, "/passation") {
        return nil, nil  // Pas de check pendant examen
    }
    return a.updater.Check()
}
```

### Principe 5 — Le Web reste la plateforme de référence

> Le Web (PWA) reste la plateforme de référence. Le desktop est un client riche complémentaire, non un remplaçant.

**Conséquence** :
- Toute fonctionnalité desktop doit avoir un fallback web (même dégradé)
- Si une feature ne fonctionne qu'en desktop, elle doit être marquée "bonus desktop"
- Le roadmap web n'est jamais bloqué par le desktop

## 2. Processus de décision

### 2.1 Ajout d'une fonctionnalité desktop

1. **Demande** : issue GitHub labellisée `desktop-feature`
2. **Analyse** : valider la [matrice de décisions](./12-decision-matrix.md)
   - Si web suffit → fermer l'issue ("use web")
   - Si desktop apporte valeur → continuer
3. **ADR si logique métier** : si la feature nécessite de la logique métier locale, créer un ADR
4. **Implémentation** : dans `desktop/internal/` + bindings Wails
5. **Tests** : unitaires + manuels (matrice de test)
6. **Documentation** : mise à jour de [04 — Native API](./04-native-api.md)
7. **Release** : via CI/CD (tag `desktop-v*`)

### 2.2 Modification d'une décision architecturale

1. **Demande** : issue GitHub labellisée `architecture-change`
2. **ADR** : créer un nouvel ADR ou amender l'existant
3. **Validation** : comité technique (Ulrich EVRARD + équipe)
4. **Mise à jour documentation** : tous les fichiers impactés
5. **Migration** : si breaking change, plan de migration

### 2.3 Comité technique

**Composition** :
- Ulrich EVRARD (CTO, décideur final)
- 1-2 développeurs backend Go
- 1 développeur frontend Next.js
- 1 ops/devops (CI/CD, signing)

**Cadence** :
- À la demande (quand un ADR est proposé)
- Revue trimestrielle des métriques desktop (Phase D)

## 3. Conventions de code

### 3.1 Go (desktop)

- `go fmt` obligatoire
- `go vet ./...` : 0 erreur
- `go build ./...` : 0 erreur
- Nommage : PascalCase pour exports, camelCase pour interne
- Commentaires sur toutes les fonctions exportées
- Validation inputs sur toutes les fonctions exposées au frontend

### 3.2 TypeScript (bridge)

- `tsc --noEmit` : 0 erreur
- `eslint` : 0 erreur 0 warning
- Types stricts (pas de `any`)
- Le bridge doit toujours avoir un fallback web

### 3.3 Commits

- Conventional Commits (français) : `SECT-DESKTOP-<TASK>: description`
- Exemples :
  - `SECT-DESKTOP-PHASE-A-1: initialisation dossier desktop + Wails`
  - `SECT-DESKTOP-PRINT-BATCH: impression en lot (certificats)`
  - `fix(desktop): crash au démarrage Windows 10`

## 4. Tests

### 4.1 Avant chaque release

Checklist de test manuel (voir [02 — Installation & Dev](./02-installation-dev.md)) :
- [ ] Windows 11 : installation fraîche + login + impression PDF
- [ ] macOS 14 ARM : idem
- [ ] Ubuntu 24.04 : `.AppImage` + `.deb`
- [ ] Auto-update : v1.1.0 → v1.2.0
- [ ] Rollback : forcer crash → auto-restore
- [ ] SmartScreen : pas d'avertissement (OV: réputation, EV: bypass)
- [ ] Gatekeeper macOS : `spctl --assess` passe
- [ ] Notifications natives : s'affichent dans Action Center
- [ ] Cookies persistants : fermer/rouvrir → session conservée

### 4.2 Tests automatisés

| Type | Outil | Cadence |
|---|---|---|
| Unit Go | `go test` | Chaque push |
| E2E webview | Playwright | Chaque push |
| Smoke CI | GitHub Actions | Chaque push (3 plateformes) |
| Signature | `signtool verify`, `spctl` | Post-signing |

## 5. Métriques de gouvernance

| Métrique | Source | Cadence | Seuil alerte |
|---|---|---|---|
| Crash-free sessions | Sentry / heartbeat | Temps réel | < 99.5% |
| Auto-update success rate | Telemetry updater | Hebdo | < 90% |
| Adoption (installations actives) | Heartbeat | Hebdo | < 50 après 3 mois → décision abandon |
| NPS desktop | Survey post-install | Mensuel | < 0 → investigation |
| Désinstallations | Endpoint `/api/desktop/uninstall` | Hebdo | > 30% → investigation |
| SmartScreen reports | Retours users | Continu | > 5 → migration EV |

## 6. Références

- [10 — Roadmap](./10-roadmap.md)
- [12 — Decision matrix](./12-decision-matrix.md)
- [ADR/](./ADR/) — Architecture Decision Records
- [Conventional Commits](https://www.conventionalcommits.org/)
