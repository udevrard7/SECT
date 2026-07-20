-- ════════════════════════════════════════════════════════════════════════════
-- 000083 — AuditLog : colonnes etablissementId + reason + RLS scoping par étab
-- (SECT-ETABLISSEMENT-AUDIT-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTE :
--   Un RESPONSABLE peut révoquer un lien d'inscription étudiante (cf. usecase
--   StudentSignupLinkUseCase.Revoke). Cette action doit être journalisée dans
--   AuditLog AVEC l'ID de l'établissement + une raison optionnelle, pour que
--   le RESPONSABLE puisse consulter TOUTES les actions d'audit de SON étab via
--   le nouveau endpoint GET /api/etablissements/{id}/audit-logs.
--
-- CHANGEMENTS :
--   1. Ajout de 2 colonnes sur AuditLog :
--        - "etablissementId" text REFERENCES "Etablissement"("id") ON DELETE SET NULL
--          (nullable pour backward compat — les lignes existantes restent NULL)
--        - "reason" text (raison optionnelle saisie par l'acteur — ex: motif de
--          révocation manuelle).
--
--   2. Index partiel pour le scoping par établissement (la requête la plus
--      fréquente du RESPONSABLE est WHERE "etablissementId" = $1 ORDER BY
--      "createdAt" DESC). WHERE "etablissementId" IS NOT NULL exclut les lignes
--      système globales de l'index (gain de place + perf).
--
--   3. Backfill : pour les lignes existantes où userId IS NOT NULL mais
--      etablissementId IS NULL, on récupère l'étab de l'acteur via JOIN "User".
--      Les lignes où userId IS NULL restent à etablissementId = NULL (système
--      global) — la policy RLS tightened les rend invisibles aux RESPONSABLE
--      (sauf si on leur attribue explicitement un etablissementId).
--
--   4. Tightening RLS policy "AuditLog_select" :
--        AVANT (migration 000024) : un RESPONSABLE pouvait voir TOUTES les
--          lignes userId IS NULL (système) — fuite multi-tenant car les lignes
--          système d'un étab A étaient visibles par le RESPONSABLE de l'étab B.
--        APRÈS : un RESPONSABLE ne voit les lignes userId IS NULL QUE si
--          etablissementId = current_etablissement_id(). Le leak est corrigé.
--        L'ADMIN (is_admin()) garde accès à tout (journal plateforme).
--
--   5. Grants : AuditLog est déjà couvert par GRANT SELECT, INSERT, UPDATE,
--      DELETE ON ALL TABLES IN SCHEMA public TO sect_app (migration 000020) +
--      ALTER DEFAULT PRIVILEGES. Les policies AuditLog_select + AuditLog_insert
--      sont TO PUBLIC. Aucun changement de grants nécessaire — on le documente
--      ici pour traçabilité.
--
-- IDEMPOTENCE :
--   - ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / DROP POLICY IF
--     EXISTS garantissent que la migration peut être rejouée sans erreur.
--   - La clause UPDATE ... WHERE "etablissementId" IS NULL est idempotente
--     (ne modifie rien au 2e run car la condition devient fausse).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Nouvelles colonnes sur AuditLog ───
ALTER TABLE "AuditLog"
    ADD COLUMN IF NOT EXISTS "etablissementId" text REFERENCES "Etablissement"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "reason" text;

-- ─── 2. Index partiel pour le scoping par établissement ───
CREATE INDEX IF NOT EXISTS "idx_auditlog_etab_created"
    ON "AuditLog"("etablissementId", "createdAt" DESC)
    WHERE "etablissementId" IS NOT NULL;

-- ─── 3. Backfill etablissementId depuis l'acteur (JOIN User) ───
-- Pour les lignes existantes où userId IS NOT NULL mais etablissementId IS NULL,
-- on récupère l'établissement de l'acteur. Les lignes userId IS NULL (système)
-- restent à etablissementId = NULL — elles seront invisibles aux RESPONSABLE
-- après tightening de la policy RLS (sauf si on leur attribue explicitement un
-- etablissementId via un UPDATE ultérieur).
UPDATE "AuditLog" a
SET "etablissementId" = u."etablissementId"
FROM "User" u
WHERE a."userId" = u."id"
  AND a."etablissementId" IS NULL
  AND u."etablissementId" IS NOT NULL;

-- ─── 4. Tightening RLS policy "AuditLog_select" ───
-- AVANT (migration 000024) :
--   is_admin()
--   OR ("userId" = current_user_id())
--   OR (is_responsable() AND (
--        "userId" = current_user_id()
--        OR ("userId" IS NOT NULL AND user_in_my_etab("userId"))
--        OR "userId" IS NULL  -- ← LEAK : tous les system entries sont visibles
--   ))
--
-- APRÈS : la clause "userId" IS NULL est remplacée par
--   ("userId" IS NULL AND "etablissementId" = current_etablissement_id())
-- ce qui restreint les system entries à l'étab du RESPONSABLE courant.
DROP POLICY IF EXISTS "AuditLog_select" ON "AuditLog";
CREATE POLICY "AuditLog_select" ON "AuditLog" FOR SELECT TO PUBLIC USING (
    is_admin()
    OR ("userId" = current_user_id())
    OR (is_responsable() AND (
        "userId" = current_user_id()
        OR ("userId" IS NOT NULL AND user_in_my_etab("userId"))
        OR ("userId" IS NULL AND "etablissementId" = current_etablissement_id())
    ))
);

-- ─── 5. Grants (inchangés — documenté pour traçabilité) ───
-- AuditLog est déjà couvert par :
--   - GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sect_app
--     (migration 000020 ligne 147)
--   - ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE,
--     DELETE ON TABLES TO sect_app (migration 000020 ligne 150)
--   - Les policies AuditLog_select + AuditLog_insert_system sont TO PUBLIC
--     (migrations 000024 + 000007).
-- Aucun GRANT additionnel nécessaire — les nouvelles colonnes héritent des
-- grants de la table.
