-- Migration 000026 — B-5 + B-6 : EtablissementAccess index partiel + policy RLS RESPONSABLE
--
-- B-5 (HIGH) : l'unique index global (adminId, etablissementId) bloquait toute
-- re-demande après un refus/expiration/annulation. Remplacé par un index PARTIEL
-- qui ne couvre que les statuts actifs (EN_ATTENTE + APPROUVE). Ainsi un admin
-- peut recréer une demande pour un établissement après qu'une précédente demande
-- a été REFUSE/EXPIRE/ANNULE.
--
-- B-6 (HIGH) : aucune policy RLS mutation pour RESPONSABLE. Ajout d'une policy
-- FOR UPDATE permettant au RESPONSABLE de muter les demandes de SON établissement
-- (defense-in-depth : actuellement le repo bypass RLS, mais si un futur refactor
-- passe les méthodes sur db.WithTx, le RESPONSABLE conservera ses capacités).
-- On garde la policy modify_admin FOR ALL (is_admin) pour compat.

-- ──────────────────────────────────────────────────────────────────────────
-- B-5 : index unique partiel
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Supprimer l'ancien index unique global
DROP INDEX IF EXISTS "EtablissementAccess_adminId_etablissementId_key";

-- 2. Créer un index unique PARTIEL — ne s'applique qu'aux demandes "actives"
--    (EN_ATTENTE = demande en cours, APPROUVE = accès actif).
--    Les statuts terminaux (REFUSE, EXPIRE, ANNULE) sont exclus → l'admin peut
--    recréer une demande pour le même établissement après un refus/expiration/annulation.
CREATE UNIQUE INDEX "EtablissementAccess_adminId_etablissementId_active_key"
    ON "EtablissementAccess" ("adminId", "etablissementId")
    WHERE "statut" IN ('EN_ATTENTE', 'APPROUVE');

-- ──────────────────────────────────────────────────────────────────────────
-- B-6 : policy RLS mutation pour RESPONSABLE
-- ──────────────────────────────────────────────────────────────────────────

-- Policy FOR UPDATE : un RESPONSABLE peut modifier (approuver/refuser/révoquer)
-- les demandes d'accès qui concernent SON établissement. Defense-in-depth :
-- actuellement le repository bypass RLS (BeginTx sans claims), mais cette policy
-- garantit que si un futur refactor passe les méthodes sur db.WithTx, le
-- RESPONSABLE conservera ses capacités d'approbation.
DROP POLICY IF EXISTS "EtablissementAccess_modify_responsable" ON "EtablissementAccess";
CREATE POLICY "EtablissementAccess_modify_responsable" ON "EtablissementAccess"
    FOR UPDATE TO neondb_owner
    USING (is_responsable() AND "etablissementId" = current_etablissement_id())
    WITH CHECK (is_responsable() AND "etablissementId" = current_etablissement_id());

-- Note : la policy existante "EtablissementAccess_modify_admin" (FOR ALL, is_admin())
-- est conservée telle quelle. Le usecase B-2 empêche l'auto-approbation au niveau
-- applicatif ; la policy RLS reste permissive pour ADMIN (cohérent avec le fait
-- qu'un ADMIN peut révoquer ses propres accès — self-revoke via PATCH).
