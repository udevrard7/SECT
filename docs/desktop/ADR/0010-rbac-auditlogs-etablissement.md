# ADR-0010 : RBAC du journal d'audit par établissement — fermeture du dernier god-mode lecture (ADR-0009 bis)

| Champ | Valeur |
|---|---|
| **Statut** | Accepté (prolongement direct d'ADR-0009) |
| **Date** | Octobre 2026 |
| **Décideurs** | Ulrich EVRARD (CTO), équipe technique |
| **Parent** | ADR-0009 (resserrement des audits pédagogiques) |
| **Supersedes** | Le « L'ADMIN bypass » de SECT-ETABLISSEMENT-AUDIT-1 (000083) |

## Contexte

ADR-0009 a fermé le god-mode lecture des **audits pédagogiques**
(`bibliotheque_activite_etablissement` 000124, `conformite_referentiels_etablissement`
000126) : l'établissement sondé doit être celui des claims pour TOUS les
rôles. Le worklog de livraison signalait alors une dette résiduelle du
**même type** : le journal d'audit par établissement.

`GET /api/etablissements/{id}/audit-logs` (SECT-ETABLISSEMENT-AUDIT-1)
donnait à l'ADMIN global un « god-mode lecture » en deux couches :

1. **Handler** (`audit_handlers.go`) :
   `claims.Role != "ADMIN" && claims.EtablissementID != etabID → 403`
   — l'ADMIN contourne le check, **sans motif, sans approbation, sans
   trace**, pour N'IMPORTE QUEL établissement (même sans aucun
   EtablissementAccess).
2. **RLS** `AuditLog_select` (000083) : branche `is_admin()` → toutes
   les lignes passent au niveau DB.

Le journal d'audit est la donnée la plus sensible du cloisonnement
tenant : il contient **qui a fait quoi, quand, depuis quelle IP**, pour
chaque acteur de l'établissement. C'est exactement le type de donnée
que le paradoxe de gouvernance d'ADR-0009 interdit de lire
silencieusement — un ADMIN ne peut pas s'auto-approuver un accès de
2 h avec motif (B-2 CRITICAL) mais lisait le journal complet,
indéfiniment, via ce endpoint.

**Contrainte architecturale** : la policy `AuditLog_select` est
**partagée** avec la console plateforme `/api/logs`
(`logsListReal`, `RequireRole("ADMIN")` — 000083/monitoring). Cette
console est la vue légitime du **propriétaire SaaS** (support,
sécurité, litige) : elle doit continuer de voir TOUTES les lignes. On
ne peut donc pas retirer `is_admin()` de la policy sans casser la
console plateforme.

## Décision

**Le journal d'audit d'un établissement exige un `etablissementId` de
claims égal à l'établissement consulté — pour TOUS les rôles** (même
règle qu'ADR-0009). L'ADMIN global reçoit 403 ; l'ADMIN **en mode
assistance** (JWT avec etab, accès APPROUVE par le RESPONSABLE) passe
naturellement. La console plateforme `/api/logs` est **inchangée**.

### 1. Migration 000131 — fonction SECURITY DEFINER `etablissement_audit_logs`

Nouvelle fonction (pattern 000124/000126/000130) : `LANGUAGE sql`,
`SECURITY DEFINER`, `SET search_path TO 'public'`, paramètres
`p_etablissement_id` + filtres (`p_action`, `p_entite`, `p_date_from`,
`p_date_to`, `p_search`). Le cloisonnement vit dans le `WHERE` :

- `current_setting('app.claims.role', true) IN ('RESPONSABLE', 'ADMIN')`
- `current_setting('app.claims.etablissement_id', true) = p_etablissement_id`
  (en WHERE, `NULL = 'x'` → NULL → ligne exclue : sûr, cf. 000130).

`SECURITY DEFINER` exécute en tant que propriétaire (BYPASSRLS) — c'est
précisément pourquoi la fonction **RÉ-IMPOSE** l'accès sur les claims
de la transaction appelante : la policy partagée `AuditLog_select`
(bypass `is_admin()`) ne peut plus être la seule garde SQL de ce
endpoint. La pagination (LIMIT/OFFSET) reste côté Go sur le résultat ;
`totalCount` par un `SELECT count(*)` sur la même fonction.

### 2. Handler + repo Go (defense in depth, 2e couche)

- `listEtablissementAuditLogs` : plus de bypass ADMIN —
  `claims.EtablissementID != etabID → 403` pour tous, message orientant
  vers le mode assistance.
- `AuthRepository.ListByEtablissement` : le SQL inline devient un appel
  à `etablissement_audit_logs` (count + page dans la même tx WithTx —
  les claims restent posées en GUC).

### 3. Frontend — l'onglet Audit suit les claims, pas le sélecteur

`responsable-parametres-page.tsx` : l'établissement de l'onglet Audit
est **dérivé du store** (`user.etablissementId`) — RESPONSABLE → son
étab ; ADMIN assistance → l'étab du JWT ; ADMIN global → carte
`AssistancePrompt` (lien vers `/acces-etablissements`). Le sélecteur
global ADMIN de la page reste pour les onglets **management**
(informations, sécurité, IP, accès) qui suivent la philosophie
`EtablissementAccess` (check DB, `ValidateAccessForEtablissement`) —
un périmètre différent, délibérément conservé.

### Ce qui NE change PAS

- **La console plateforme `/api/logs`** (`logsListReal`, ADMIN-only) :
  vue légitime du propriétaire SaaS, policy `AuditLog_select`
  `is_admin()` intacte. C'est le distinguo fondamental : lecture
  **transverse plateforme** = rôle ADMIN ; lecture **d'un
  établissement** = claims de cet établissement (RESPONSABLE ou
  assistance).
- Les endpoints management de la page Paramètres (Update, watermark,
  sécurité, IP) : philosophie EtablissementAccess (check DB) —
  inchangés.
- `/api/monitoring` : console plateforme, inchangé.

## Conséquences

- L'ADMIN global ne peut plus lire le journal d'audit d'un
  établissement sans consentement ; il passe par la voie **consentie et
  tracée** (assistance : motif + approbation RESPONSABLE + 24 h max +
  AuditLog), cohérent avec B-2 et ADR-0009.
- Zero-rupture : la fonction est créée AVANT le déploiement du code
  (l'ancien code ne l'appelle pas) ; le rollback croise DROP FUNCTION +
  revert code.
- E2E : ADMIN global → 403 (était 200) ; RESPONSABLE propre étab → 200
  + lignes ; cross-etab → 403 ; ADMIN assistance → 200 ; filtres
  (action/entite/dates/search) et pagination fonctionnels au travers
  de la fonction ; `/api/logs` ADMIN global → 200 (non-régression
  console plateforme).
- La règle ADR-0009 est réaffirmée pour tout le reste : **tout
  endpoint « par établissement » exige l'égalité claims.etab ↔
  paramètre, sans exception ADMIN** ; la lecture transverse reste
  réservée aux consoles plateforme explicitement ADMIN-only.
