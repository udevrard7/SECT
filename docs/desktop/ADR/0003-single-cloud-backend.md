# ADR-0003 : Backend cloud unique (pas de sectcore initialement)

| Champ | Valeur |
|---|---|
| **Statut** | Accepté |
| **Date** | Juillet 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Supersedes** | — |
| **Superseded by** | — |

## Contexte

SECT a un backend Go cloud mature (`backend/internal/` : usecase, repository, domain, 222 routes). La question se pose : faut-il extraire une partie de cette logique dans un module partagé `sectcore` réutilisable par le desktop, pour éviter de dupliquer la logique métier ?

## Options considérées

### Option A — Extraire sectcore immédiatement
- **Avantages** : Logique métier écrite une seule fois, desktop et cloud partagent tout
- **Inconvénients** : Refonte majeure (plusieurs semaines), couplage actuel `internal/` fort (usecase↔repository↔pgxpool↔RLS claims), risque de régression élevé

### Option B — Dupliquer la logique métier dans le desktop
- **Avantages** : Pas de refonte, desktop indépendant
- **Inconvénients** : Deux backends à maintenir, bugs de divergence inévitables, double effort

### Option C — Thin wrapper, pas de logique métier (sectcore plus tard si besoin)
- **Avantages** : Architecture simple, desktop = client riche consommant l'API cloud, zero duplication, effort minimal
- **Inconvénients** : Pas de logique métier locale (mais ce n'est pas un besoin identifié à ce stade)

## Décision

**Thin wrapper** : le desktop ne contient **aucune** logique métier. Il consomme les mêmes API REST que le web. `sectcore` n'est pas extrait initialement (Option C).

## Justification

1. **"On ne touche pas à ce qui fonctionne"** : Le backend Go cloud est en production, stable, avec 173 policies RLS. L'extraire en `sectcore` est risqué.
2. **Couplage actuel** : `internal/usecase/` dépend de `repository/` qui dépend de `pgxpool` + claims RLS. Extraire proprement demanderait de définir des interfaces abstraites pour pool, dispatcher, storage — un projet à part entière (3-4 semaines).
3. **Pas de besoin identifié** : Aucun cas d'usage desktop actuel ne justifie de la logique métier locale. Les fonctions natives (print, notif, file dialog) ne sont PAS de la logique métier.
4. **YAGNI** (You Aren't Gonna Need It) : Construire `sectcore` "au cas où" est de l'over-engineering. On construira quand le besoin sera prouvé par les métriques.

## Conséquences

### Positives
- Effort minimal (8 jours Phase A+B vs 3-4 semaines avec sectcore)
- Zero duplication de logique métier
- Backend cloud inchangé (zero risque de régression)
- Décision réversible (sectcore peut être extrait plus tard si besoin)

### Négatives
- Le desktop dépend d'internet (pas de mode hors ligne métier)
- Si un besoin hors ligne apparaît, il faudra extraire sectcore a posteriori

### Mitigation
- Phase D (observation 6 mois) collecte les métriques d'usage
- Si critères ADR-0002 atteints → nouvel ADR pour sectcore
- L'extraction a posteriori reste possible (le code `internal/` est bien structuré)

## Critères de réévaluation

Réévaluer cet ADR si :
- ≥ 3 demandes explicites de mode hors ligne métier complet
- Métriques desktop montrent un usage intensif en zone à connectivité intermittente
- Un client B2B majeur conditionne un contrat au mode hors ligne

## Références

- [Architecture backend SECT](../../README.md#architecture-monorepo)
- [Décisions architecturales desktop](../01-architecture.md)
