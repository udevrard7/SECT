# ADR-0001 : Utiliser Wails pour l'application desktop SECT

| Champ | Valeur |
|---|---|
| **Statut** | Accepté |
| **Date** | Juillet 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Supersedes** | — |
| **Superseded by** | — |

## Contexte

SECT a besoin d'une application desktop native pour répondre aux cas d'usage non couverts par la PWA (impression en lot, drag-drop fichiers, notifications persistantes, déploiement institutionnel B2B). Plusieurs frameworks desktop existent : Electron, Tauri, Wails.

## Options considérées

### Option A — Electron
- **Stack** : Node.js + Chromium embarqué
- **Taille** : 150-300 Mo
- **Mémoire** : Élevée (process Node + Chromium)
- **Avantages** : Écosystème mature, documentation abondante, plugins nombreux
- **Inconvénients** : Lourd (300 Mo), mémoire élevée, mauvaise cohérence avec le backend Go de SECT

### Option B — Tauri
- **Stack** : Rust + webview système
- **Taille** : 5-20 Mo
- **Mémoire** : Faible
- **Avantages** : Très léger, sécurité rust, performant
- **Inconvénients** : Backend Rust (pas Go), IPC plus complexe, écosystème plus jeune

### Option C — Wails
- **Stack** : Go + webview système
- **Taille** : 10-30 Mo
- **Mémoire** : Faible
- **Avantages** : Cohérence parfaite avec backend Go existant (même langage, même mentalité), bindings Go→TS automatiques, léger
- **Inconvénients** : Écosystème plus petit qu'Electron, v3 encore beta

## Décision

**Adopter Wails** (dernière version stable officiellement recommandée par l'équipe Wails au moment où la Phase B démarre — voir ADR-0001 amendement ci-dessous).

## Justification

1. **Cohérence stack** : SECT a déjà un backend Go mature (222 routes, clean architecture). Wails permet de réutiliser la même compétence Go côté desktop.
2. **Légèreté** : 10-30 Mo vs 150-300 Mo (Electron) — crucial pour des téléchargements en Afrique avec connexions limitées.
3. **Bindings natifs** : Wails génère automatiquement les types TypeScript depuis les méthodes Go, simplifiant l'intégration.
4. **Performance** : Go natif + webview système, pas de runtime Node embarqué.

## Conséquences

### Positives
- Une seule compétence backend (Go) pour cloud + desktop
- Binaires légers, téléchargement rapide
- Performance native

### Négatives
- Écosystème Wails plus petit qu'Electron (moins de plugins tiers)
- Documentation communautaire plus restreinte
- Nécessite de maintenir une expertise Wails dans l'équipe

### Neutral
- Migration v2 → v3 possible quand v3 sera stable (estimé Q4 2026), effort 1-2 jours

## Amendement — Règle de versionnage

Plutôt que de figer "Wails v2" ou "Wails v3", la règle officielle est :

> **Utiliser la dernière version stable officiellement recommandée par l'équipe Wails au moment où la Phase B démarre.**

Cette règle évite que la documentation ne devienne obsolète si la stabilité de v3 évolue entre aujourd'hui et le démarrage du développement. La version exacte sera précisée dans le `go.mod` au démarrage Phase B.

## Références

- [Wails documentation](https://wails.io/docs/reference/intro)
- [Comparaison Wails vs Electron vs Tauri](https://wails.io/guides/comparison)
