# 10 — Feuille de route

> **Document vivant** — Modifier ce fichier si la roadmap évolue.

## 1. Vue d'ensemble

```
PWA (actuelle)
     ↓
Prototype Desktop (Phase A)
     ↓
Pilote (5 établissements) (Phase B)
     ↓
Version 1.0 (Phase C)
     ↓
Observation (6 mois) (Phase D)
     ↓
SectCore (si nécessaire) (Phase E, conditionnel)
```

## 2. Phases détaillées

### Phase A — Préparation (1 semaine)

**Objectif** : Mettre en place les fondations, valider la faisabilité technique.

| Tâche | Effort | Livrable |
|---|---|---|
| Créer branche Git `desktop-phase-a` | 0,5 j | Branche |
| Créer dossier `desktop/` | 0,5 j | Structure |
| Installer Wails CLI | 0,5 j | `wails doctor` OK |
| Démo : webview charge SECT | 1 j | Fenêtre desktop affichant sect-app.vercel.app |
| Documenter (ce handbook) | 2 j | `docs/desktop/` complet |
| Valider 8 décisions clés | — | Comité technique |

**Critères de passage Phase A → B** :
- ✅ Démo webview fonctionnelle
- ✅ Document d'architecture validé par comité
- ✅ 8 décisions clés validées (budget, Wails, thin wrapper, etc.)
- ✅ Branche mergée sur `main`

### Phase B — Pilote (2-3 jours + 5 établissements)

**Objectif** : Premier binaire utilisable, déployé chez 5 établissements pilotes.

| Tâche | Effort | Livrable |
|---|---|---|
| `app.go` : PrintPDF, ShowNotification, CheckForUpdates | 1 j | Bindings Go |
| Auto-update (GitHub Releases) | 0,5 j | Updater fonctionnel |
| Code signing Windows OV + Apple notarization | 0,5 j | Binaires signés |
| CI/CD GitHub Actions (3 plateformes) | 0,5 j | Pipeline automatisé |
| Tests manuels matrix | 0,5 j | Checklist validée |
| **Sélection 5 établissements pilotes** | — | Liste validée |
| Déploiement pilote | — | 5 étab installés |
| Collecte retours (30j) | — | Rapport pilote |

**Critères de passage Phase B → C** :
- ✅ 5 établissements pilotes installés
- ✅ ≥ 80% satisfaction pilote
- ✅ Crash-free sessions ≥ 99% sur 30j
- ✅ Pas de régression web/PWA
- ✅ SmartScreen ne bloque plus (réputation OV construite)

### Phase C — Version 1.0 (2-4 semaines)

**Objectif** : Release publique stable.

| Tâche | Effort | Livrable |
|---|---|---|
| PrintBatch (certificats/relevés en lot) | 2 j | v1.1.0 |
| DownloadFolder (téléchargement massif) | 2 j | v1.1.0 |
| ListPrinters + GetDefaultPrinter | 1 j | v1.1.0 |
| OpenExternal (liens dans navigateur par défaut) | 0,5 j | v1.1.0 |
| UX improvements (retours pilote) | 3 j | v1.2.0 |
| Documentation utilisateur | 2 j | `/aide/installation` étendu |
| Migration Windows EV (si adoption justifie) | 1 j | v1.3.0 |
| **Release publique v1.0.0** | — | Annonce |

**Critères de passage Phase C → D** :
- ✅ Release publique v1.0.0 stable
- ✅ Documentation utilisateur complète
- ✅ Métriques adoption en place (heartbeat anonyme)

### Phase D — Observation (6 mois)

**Objectif** : Collecter les métriques d'usage pour décider `sectcore`.

| Tâche | Cadence | Livrable |
|---|---|---|
| Collecte métriques (installations, DAU, OS, versions) | Continu | Dashboard `/monitoring` |
| Bug fixes | Au fil de l'eau | Patches v1.x.y |
| Améliorations UX basées sur retours | Mensuel | Releases mineures |
| Analyse trimestrielle adoption | 3 mois, 6 mois | Rapports |

**Critères de passage Phase D → E** (tous obligatoires) :
- [ ] ≥ 500 installations desktop actives
- [ ] ≥ 30% des établissements B2B l'utilisent
- [ ] ≥ 3 demandes explicites de mode hors ligne complet
- [ ] NPS desktop ≥ 40
- [ ] Crash-free sessions ≥ 99.5%
- [ ] Aucune régression web/PWA attribuée au desktop

**Si un seul critère n'est pas atteint** : on reste en thin wrapper indéfiniment (Phase D prolongée).

### Phase E — SectCore (conditionnel, 3-4 semaines)

**Objectif** : Extraire la logique métier partagée entre cloud et desktop.

**Déclenché uniquement si tous les critères Phase D sont atteints.**

| Tâche | Effort | Livrable |
|---|---|---|
| Nouvel ADR-0006 : sectcore extraction | 1 j | ADR validé |
| Extraire `internal/` → `pkg/sectcore/` | 1 sem | Module partagé |
| Définir interfaces abstraites (pool, dispatcher, storage) | 3 j | Interfaces |
| Adapter backend cloud pour utiliser sectcore | 2 j | Backend migré |
| Adapter desktop pour utiliser sectcore | 2 j | Desktop migré |
| Tests non-régression (cloud + desktop) | 2 j | Suite tests |
| **Release v2.0.0 avec sectcore** | — | Annonce |

## 3. Releases prévues

| Version | Date cible | Phase | Contenu |
|---|---|---|---|
| v0.1.0-alpha | Fin Phase A | A | Démo webview (interne) |
| v0.9.0-beta | Fin Phase B | B | Pilote 5 établissements |
| v1.0.0 | Phase C | C | Release publique stable |
| v1.1.0 | Mois 2 | C | PrintBatch + DownloadFolder |
| v1.2.0 | Mois 3 | C | UX improvements |
| v1.3.0 | Mois 4 | D | Bug fixes + EV signing |
| v2.0.0 | Mois 6+ (si justifié) | E | sectcore + mode hors ligne partiel |

## 4. Plan de rollback

### 4.1 Bug critique sur une version

**Action** : `force_rollback` dans `latest.json` → tous les clients downgradent.
**Délai** : < 1h.

→ Voir [06 — Auto-update](./06-auto-update.md) section rollback.

### 4.2 Crash systématique au démarrage

**Action** : Auto-rollback version précédente (backup `.bak`).
**Délai** : Automatique (3 crashes consécutifs).

### 4.3 Adoption catastrophique (< 50 installs en 3 mois)

**Action** : Abandon desktop, focus PWA.
**Délai** : Décision produit après 3 mois d'observation.

Procédure :
1. Arrêt des releases (plus de tags `desktop-v*`)
2. Notification utilisateurs : bannière "SECT Desktop ne sera plus maintenu"
3. Auto-update vers version finale affichant message de fin de support
4. Suppression du dossier `desktop/` du repo (commit `SECT-DESKTOP-SUNSET-1`)
5. **PWA reste** la seule solution desktop (déjà fonctionnelle, aucune dépendance au desktop Wails)

**Conséquence** : Aucun impact sur le backend, le frontend, la PWA, les utilisateurs web/mobile. Le desktop était un client comme un autre, son retrait est transparent.

## 5. Critères d'abandon (scénario pessimiste)

Abandonner le desktop si après 3 mois :
- ❌ < 50 installations actives
- ❌ NPS desktop < 0
- ❌ > 30% de désinstallations
- ❌ Aucun établissement B2B ne l'utilise

**Décision** : comité technique + Ulrich EVRARD. L'abandon est **non-faille** (le desktop est isolé, sa suppression n'impacte rien d'autre).

## 6. Références

- [11 — Governance](./11-governance.md) (principes garde-fous)
- [12 — Decision matrix](./12-decision-matrix.md) (critères par fonctionnalité)
- [06 — Auto-update](./06-auto-update.md) (rollback technique)
- [ADR-0003 : Backend cloud unique](./ADR/0003-single-cloud-backend.md) (sectcore conditionnel)
