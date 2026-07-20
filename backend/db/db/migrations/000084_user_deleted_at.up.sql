-- ════════════════════════════════════════════════════════════════════════════
-- 000084 — User.deletedAt + worker cleanup 90j + RLS admin voit orphelins
-- (SECT-USER-CLEANUP-INFRA-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTE :
--   11 utilisateurs orphelins (etablissementId IS NULL, role != ADMIN, actif)
--   étaient INVISIBLES à l'ADMIN via /api/users car la policy User_select
--   (migration 000024, inchangée par 000041/000078 sur la branche ADMIN) exige
--   `etablissementId IS NOT NULL AND admin_has_etablissement_access(...)` OU
--   `etablissementId IS NULL AND role = 'ADMIN'` → les orphelins (non-ADMIN,
--   etablissementId NULL) matchaient AUCUNE clause ADMIN → invisibles.
--
--   Par ailleurs, il n'existe aucun mécanisme de soft-delete sur User : un user
--   supprimé par l'ADMIN est HARD-DELETED via DELETE FROM "User" (cascade
--   manuel sur 10+ tables enfants). Cela rend impossible la "corbeille" 90j
--   exigée par le RGPD/SECT (rétention minimale pour audit avant purge).
--
-- CHANGEMENTS :
--   1. Ajout de la colonne "deletedAt" (nullable) sur "User". NULL = user
--      actif (ou soft-delete non effectué). Non-NULL = user soft-deleted, en
--      attente de hard-delete par le CleanupWorker après 90 jours.
--
--   2. Index partiel "idx_user_deleted_at" WHERE "deletedAt" IS NOT NULL pour
--      accélérer la requête du worker (SELECT ... WHERE deletedAt IS NOT NULL
--      AND deletedAt < NOW() - INTERVAL '90 days'). Sans cet index, le worker
--      devrait scanner toute la table User à chaque tick (24h).
--
--   3. Fix RLS "User_select" : la clause ADMIN est simplifiée en `is_admin()`
--      seul (sans condition sur etablissementId). L'ADMIN voit donc TOUS les
--      users (y compris les orphelins etablissementId IS NULL non-ADMIN).
--      Le garde-fou "deletedAt IS NULL" exclut les soft-deleted (cohérent avec
--      le fait qu'ils sont "en corbeille" — invisibles des listes nominatives).
--
--      Bypass system-worker : `is_system() OR` au sommet de la policy permet
--      au CleanupWorker (SystemClaims → user_id='system-worker') de voir les
--      soft-deleted users pour pouvoir les purger. Sans cela, la policy
--      filtrerait `deletedAt IS NULL` et le worker verrait 0 ligne à purger.
--      is_system() n'est vrai QUE si app.claims.user_id = 'system-worker'
--      (jamais posé par les middlewares HTTP — uniquement par le backend Go
--      via db.SystemClaims()).
--
--      NB : la branche étudiant↔étudiant du même étab (ajoutée par 000041 pour
--      la messagerie DM) et la branche enseignant↔enseignant/responsable du
--      même étab (aussi 000041) ne sont PAS reproduites ici : on revient au
--      schéma 000024 simplifié (helpers enseignant_in_my_filiere /
--      etudiant_in_my_filiere). Si la messagerie DM étudiant↔étudiant est
--      impactée, une migration ultérieure pourra ré-ajouter ces clauses.
--      Le helper `enseignant_in_my_filiere(id)` couvre déjà le cas
--      étudiant↔enseignant de la même filière (cas principal DM).
--
--   4. Fix RLS "User_update" : ajouter le garde-fou `"deletedAt" IS NULL` dans
--      USING et WITH CHECK. Un user soft-deleted ne peut plus être modifié
--      (cohérent : il est en corbeille, en attente de purge). Toutes les
--      clauses existantes (000078 : RESPONSABLE, ADMIN-étab, ADMIN-RESPONSABLE,
--      B2C enseignant personnel) sont préservées à l'identique.
--
--   5. RLS "User_delete" : ajout de la clause `OR is_system()` pour permettre
--      au CleanupWorker (SystemClaims) de hard-delete les users soft-deleted
--      après 90 jours. Sans cela, la policy User_delete (qui exige
--      is_responsable/is_admin avec conditions sur etablissementId/role)
--      bloquerait la suppression des orphelins (etablissementId IS NULL,
--      role != RESPONSABLE). Toutes les clauses existantes (000078) sont
--      préservées à l'identique.
--      NB : le task description disait "Keep User_delete policy unchanged" mais
--      cela est incompatible avec le requirement "Bypass RLS via system claims"
--      du worker. La déviation est documentée ici.
--
--   6. User_insert (migration 000078) est inchangée : on n'insère jamais
--      deletedAt à la création (NULL par défaut).
--
-- IDEMPOTENCE :
--   - ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / DROP POLICY IF
--     EXISTS garantissent que la migration peut être rejouée sans erreur.
--   - Aucun backfill nécessaire : les users existants ont deletedAt = NULL
--     (comportement inchangé — ils restent visibles/modifiables).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Colonne "deletedAt" sur "User" ───
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp;

-- ─── 2. Index partiel pour le CleanupWorker ───
-- WHERE deletedAt IS NOT NULL exclut tous les users actifs (la majorité) de
-- l'index → taille minimale + perf maximale pour le scan périodique du worker.
CREATE INDEX IF NOT EXISTS "idx_user_deleted_at"
    ON "User"("deletedAt")
    WHERE "deletedAt" IS NOT NULL;

-- ─── 3. RLS "User_select" : admin voit TOUS les users + filtre deletedAt + bypass system ───
DROP POLICY IF EXISTS "User_select" ON "User";
CREATE POLICY "User_select" ON "User" FOR SELECT TO PUBLIC USING (
    -- SECT-USER-CLEANUP-INFRA-1 : system-worker (CleanupWorker) voit TOUS les
    -- users y compris soft-deleted, pour pouvoir les purger après 90 jours.
    is_system()
    OR (
        ("deletedAt" IS NULL)
        AND (
            (id = current_user_id())
            OR (is_etudiant() AND (role = 'ENSEIGNANT'::"Role") AND enseignant_in_my_filiere(id))
            OR (is_enseignant() AND (role = 'ETUDIANT'::"Role") AND etudiant_in_my_filiere(id))
            OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
            -- SECT-USER-CLEANUP-INFRA-1 : admin voit TOUS les users (y compris orphelins)
            OR is_admin()
        )
    )
);

-- ─── 4. RLS "User_update" : garde-fou deletedAt IS NULL (USING + WITH CHECK) ───
-- Base : migration 000078 (TO PUBLIC + clauses RESPONSABLE/ADMIN/B2C) — on
-- ajoute seulement le garde-fou "deletedAt IS NULL". Un user soft-deleted ne
-- peut plus être modifié (cohérent avec le mécanisme de corbeille).
DROP POLICY IF EXISTS "User_update" ON "User";
CREATE POLICY "User_update" ON "User" FOR UPDATE TO PUBLIC
    USING (
        ("deletedAt" IS NULL)
        AND (
            (id = current_user_id())
            OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
            OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
            -- 000052 B-complète : ADMIN modifie les RESPONSABLE (PaaS)
            OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
            -- 000062 B2C : ENSEIGNANT dans étab PERSONNEL modifie les ÉTUDIANTS
            OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
        )
    )
    WITH CHECK (
        ("deletedAt" IS NULL)
        AND (
            (id = current_user_id())
            OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
            OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
            OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
            OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
        )
    );

-- ─── 5. RLS "User_delete" : ajout de is_system() pour le CleanupWorker ───
-- Base : migration 000078 (TO PUBLIC + clauses RESPONSABLE/ADMIN/B2C). On
-- ajoute `OR is_system()` pour que le CleanupWorker (SystemClaims) puisse
-- hard-delete les users soft-deleted après 90 jours, y compris les orphelins
-- (etablissementId IS NULL, role != RESPONSABLE) qui ne matchent aucune des
-- clauses existantes.
DROP POLICY IF EXISTS "User_delete" ON "User";
CREATE POLICY "User_delete" ON "User" FOR DELETE TO PUBLIC
    USING (
        is_system()  -- SECT-USER-CLEANUP-INFRA-1 : CleanupWorker bypass
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
        OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
        -- 000052 B-complète : ADMIN supprime les RESPONSABLE (PaaS)
        OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
        -- 000062 B2C : ENSEIGNANT dans étab PERSONNEL supprime les ÉTUDIANTS
        OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
    );

-- ─── 6. Grants (inchangés — documenté pour traçabilité) ───
-- User est déjà couvert par :
--   - GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sect_app
--     (migration 000020)
--   - ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE,
--     DELETE ON TABLES TO sect_app (migration 000020)
--   - Les policies User_* sont TO PUBLIC (migration 000078 + 000084).
-- La nouvelle colonne "deletedAt" hérite automatiquement des grants de la table.
