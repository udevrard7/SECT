# ADR-0002 : Aucune base de données locale dans le client desktop

| Champ | Valeur |
|---|---|
| **Statut** | Accepté |
| **Date** | Juillet 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Supersedes** | — |
| **Superseded by** | — |

## Contexte

L'application desktop SECT pourrait théoriquement embarquer une base de données locale (SQLite, BoltDB, BadgerDB) pour offrir un mode hors ligne complet. La question se pose : doit-on dupliquer une partie du modèle de données PostgreSQL dans le client desktop ?

## Options considérées

### Option A — SQLite local avec synchronisation
- **Avantages** : Mode hors ligne complet, sync différée
- **Inconvénients** : Duplication du modèle de données, conflits de sync complexes, RLS Neon (173 policies) non applicable localement, maintenance double

### Option B — Cache local léger (IndexedDB via webview)
- **Avantages** : Déjà en place (PWA l'utilise), pas de duplication de schéma, simple
- **Inconvénients** : Pas de vrai mode hors ligne métier (seulement cache lecture)

### Option C — Aucune base de données locale
- **Avantages** : Une seule source de vérité (PostgreSQL Neon), RLS respecté, architecture simple, aucune duplication
- **Inconvénients** : Pas de mode hors ligne métier (mais la PWA + cache IndexedDB couvre les besoins examen)

## Décision

**Aucune base de données locale** dans le client desktop (Option C).

## Justification

1. **RLS Neon = colonne vertébrale de sécurité** : 173 policies sur 67 tables. Isoler une partie du modèle localement casserait ce modèle de sécurité multi-tenant.
2. **Single source of truth** : PostgreSQL Neon reste l'unique source de vérité. Évite les conflits de sync et les incohérences.
3. **13 workers cloud 24/7** : IA, correction, surveillance, expiration — ces workers doivent tourner sur le cloud, pas sur un desktop qui peut s'éteindre.
4. **Coût maintenance** : Une DB locale doublerait la surface de test et de maintenance. Le bénéfice (hors ligne métier) ne justifie pas ce coût à ce stade.

## Conséquences

### Positives
- Architecture simple (client riche en ligne, pas de sync)
- RLS respecté (sécurité multi-tenant intacte)
- Maintenance minimale (un seul backend)
- Pas de conflits de données

### Négatives
- Pas de mode hors ligne métier complet
- Les utilisateurs desktop doivent avoir une connexion internet (déjà le cas pour la PWA)

### Mitigation
- Le cache IndexedDB du webview (déjà en place pour la PWA) couvre les besoins examen (soumissions différées, pages visitées en cache)
- Si un besoin hors ligne métier fort apparaît après 6 mois d'observation, un nouvel ADR évaluera l'extraction de `sectcore` (voir ADR-0003)

## Critères de réévaluation

Cet ADR sera réévalué si **tous** les critères suivants sont atteints après 6 mois d'observation (Phase D) :
- ≥ 500 installations desktop actives
- ≥ 30% des établissements B2B l'utilisent
- ≥ 3 demandes explicites de mode hors ligne complet
- NPS desktop ≥ 40

Dans ce cas, un nouvel ADR (ex: ADR-0006) évaluera l'extraction de `sectcore` et l'ajout d'une DB locale.

## Références

- [RLS Neon documentation SECT](../../README.md#sécurité)
- [Cache IndexedDB PWA](../../frontend/public/sw.js)
