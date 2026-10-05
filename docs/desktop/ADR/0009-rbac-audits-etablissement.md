# ADR-0009 : Resserrer le RBAC des audits pédagogiques — l'ADMIN global passe par le mode assistance

| Champ | Valeur |
|---|---|
| **Statut** | Accepté (correctif de gouvernance sur ADR-0007 §P2/§P3) |
| **Date** | Octobre 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Parent** | ADR-0007 (bibliothèque numérique §P2/§P3) |
| **Supersedes** | Le « god-mode lecture ADMIN » de 000124/000126 |

## Contexte

Le RBAC de SECT distingue deux personas que le code actuel mélange :

1. **L'ADMIN PaaS** — propriétaire de la plateforme, **sans établissement**.
   Il gère la plateforme (abonnements, validation B2B, curation G1 du
   catalogue, gouvernance R2/licences). La gestion d'un établissement
   repose sur son RESPONSABLE.
2. **Le RESPONSABLE** — dirige SON établissement. Les outils de pilotage
   pédagogique (activité de lecture, audit de conformité aux référentiels)
   lui sont destinés.

Deux mécanismes coexistent pourtant :

- **EtablissementAccess + mode assistance** (hardening B-2/B-8/B-10/E4/E9) :
  l'ADMIN demande l'accès avec **motif**, le **RESPONSABLE approuve**
  (auto-approbation interdite — « escalation de privilèges »), durée
  **max 24 h**, auto-révocation, **audit trail** dans AuditLog. Le JWT
  d'assistance porte alors un `etablissementId`.
- **Le god-mode lecture** (000124 `bibliotheque_activite_etablissement`,
  000126 `conformite_referentiels_etablissement`, usecases Go miroirs) :
  `role = 'ADMIN' OR etab = claims` — l'ADMIN global consulte
  **silencieusement, sans trace, sans consentement** les agrégats de
  lecture et les scores de conformité (« le cours de M. X couvre 40 % du
  référentiel ») de **n'importe quel** établissement.

Le paradoxe : le code interdit à l'ADMIN de s'auto-approuver un accès
de 2 h avec motif (B-2 CRITICAL)… mais lui permet de lire les mêmes
données indéfiniment via un autre endpoint. La conformité **note des
enseignants** : c'est une donnée pédagogique interne à l'établissement,
et un frein commercial (quel directeur adopte un SaaS où l'éditeur
évalue ses profs en silence ?).

## Décision

**Les audits pédagogiques par établissement (activité de lecture,
conformité aux référentiels) exigent un `etablissementId` de claims
égal à l'établissement sondé — pour TOUS les rôles.** L'ADMIN global
(nouveau JWT sans etab) reçoit 403 ; l'ADMIN **en mode assistance**
(JWT avec etab, accès APPROUVE par le RESPONSABLE) passe naturellement.

### 1. Migration 000130 — `CREATE OR REPLACE` des deux fonctions

- `conformite_referentiels_etablissement` : le double `IF` devient
  `role ∈ (RESPONSABLE, ADMIN)` **ET**
  `current_setting('app.claims.etablissement_id', true) IS DISTINCT FROM p_etablissement_id → RETURN`.
  `IS DISTINCT FROM` et non `<>` : un claims absent (NULL) ne doit pas
  passer (`NULL <> 'x'` → NULL → IF faux — piège plpgsql).
- `bibliotheque_activite_etablissement` : le `WHERE` supprime la branche
  `role = 'ADMIN' OR` — ne reste que
  `current_setting('app.claims.etablissement_id', true) = p_etablissement_id`
  (en WHERE, `NULL = 'x'` → NULL → ligne exclue : sûr).

`CREATE OR REPLACE` : déploiement **zéro-rupture** (l'ancien code Go +
nouvelle fonction → l'ADMIN global reçoit 200 avec liste vide, aucun
crash ; ENS/RESP inchangés).

### 2. Usecases Go — même resserrement (defense in depth, 2e couche)

- `AlignementUseCase.ConformiteEtablissement` : plus de bypass ADMIN —
  `claims.EtablissementID != etablissementID → 403` pour tous.
- `OuvrageUseCase.ActiviteEtablissement` : identique.

Message d'erreur explicite : l'ADMIN global est orienté vers le mode
assistance (accès à demander au RESPONSABLE).

### 3. Frontend — suppression des sélecteurs globaux

- `conformite-page.tsx` : retrait du sélecteur d'établissement ADMIN
  global (`etabsQuery`) → carte « mode assistance requis » avec lien
  vers `/acces-etablissements`.
- `bibliotheque-page.tsx` (vue Activité) : idem — l'ADMIN global voit
  la carte d'orientation, plus le sélecteur + les stats d'autrui.
  (Le sélecteur du **formulaire de dépôt G1** reste : curation catalogue
  = rôle plateforme, hors périmètre.)

### Ce qui NE change PAS

- Le catalogue, la corbeille, le dépôt/curation G1, les propositions
  d'ouvrages, les abonnements : rôle plateforme légitime, inchangé.
- Les policies RLS `is_admin()` sur Ouvrage/OuvrageSection : curation
  G1 (écriture catalogue) — inchangées. Seuls les **audits par
  établissement** sont resserrés.
- Les métriques PaaS globales éventuelles (adoption, volumétrie) :
  hors périmètre — un endpoint agrégé **anonymisé** reste possible
  en P5 si besoin produit.

## Conséquences

- L'ADMIN global perd la lecture silencieuse des audits par
  établissement ; il gagne la voie **consentie et tracée** (mode
  assistance : motif + approbation RESPONSABLE + 24 h max + AuditLog).
- Cohérence philosophique retrouvée avec EtablissementAccess (B-2).
- E2E : ADMIN global → 403 sur les 2 endpoints ; RESPONSABLE/ENS
  propre etab → 200 ; ADMIN assistance → 200 ; cross-etab → 403.
- La leçon est consignée pour P5 : tout nouvel agrégat « par
  établissement » exige l'égalité claims.etab ↔ paramètre, sans
  exception ADMIN.
