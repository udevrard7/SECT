-- ============================================================
-- Migration 000132 — Durcissement MonitoringEvent + helper de
-- comptage sécurité établissements (ADR-0011 : monitoring « couteau
-- suisse », alignement dashboard ↔ /monitoring).
-- ============================================================
-- 1. INDEX partiel (statut ACTIF, createdAt DESC) : les compteurs
--    (activeCount/criticalCount/errorCount/warningCount) et les
--    listes ORDER BY createdAt des endpoints monitoring faisaient
--    du seq scan. L'index existant 000031 ne couvre que le DELETE
--    du lazy cleanup (RESOLU > 24 h).
-- 2. NORMALISATION RLS TO PUBLIC (pattern 000117 — mine sect_app) :
--    les 3 policies MonitoringEvent étaient TO neondb_owner dans le
--    repo alors que la prod les a TO PUBLIC (drift vérifié) — après
--    bascule du runtime vers sect_app elles deviendraient inopérantes
--    (deny-all : events vides, mutations 404, recorder INSERT bloqué).
--    On aligne le repo sur la prod : TO PUBLIC.
-- 3. HELPER SECURITY DEFINER admin_securite_etablissements_counts()
--    (pattern 000130/000131 : re-check des claims is_admin à
--    l'intérieur, même BYPASSRLS) : compte RÉEL des établissements
--    avec proctoringActif / verificationIdentite (SecuritySettings).
--    Remplace les « hardcodé 0 » de statsAdmin (score santé plafonné
--    à −20 à vie — ADR-0011 §1).
-- 4. ASSERTs de contrôle (pattern 000127).
-- ============================================================

-- ─── 1. Index partiel pour les ACTIFs (compteurs + listes) ───
CREATE INDEX IF NOT EXISTS "MonitoringEvent_actif_created_idx"
    ON "MonitoringEvent" ("createdAt" DESC)
    WHERE "statut" = 'ACTIF';

-- ─── 2. Normalisation des policies TO PUBLIC ───
--    (dropper les anciennes TO neondb_owner du repo ; en prod elles
--    sont déjà TO PUBLIC → DROP IF EXISTS ne casse rien, les CREATE
--    OR REPLACE sont des no-ops sémantiques.)

DROP POLICY IF EXISTS "MonitoringEvent_select_admin" ON "MonitoringEvent";
DROP POLICY IF EXISTS "MonitoringEvent_insert_system" ON "MonitoringEvent";
DROP POLICY IF EXISTS "MonitoringEvent_modify_admin" ON "MonitoringEvent";

CREATE POLICY "MonitoringEvent_select_admin"
    ON "MonitoringEvent" FOR SELECT
    TO PUBLIC
    USING (is_admin());

CREATE POLICY "MonitoringEvent_insert_system"
    ON "MonitoringEvent" FOR INSERT
    TO PUBLIC
    WITH CHECK (is_system() OR is_admin());

CREATE POLICY "MonitoringEvent_modify_admin"
    ON "MonitoringEvent" FOR ALL
    TO PUBLIC
    USING (is_admin())
    WITH CHECK (is_admin());

-- ─── 3. Helper comptage sécurité (re-check claims, pattern 000131) ───
--    LANGUAGE sql : le re-check vit dans un WHERE où NULL = 'x' → NULL
--    → ligne exclue (le « piège plpgsql » NULL <> x → IF faux ne
--    s'applique pas — cf. 000130 pour l'analyse complète).
CREATE OR REPLACE FUNCTION public.admin_securite_etablissements_counts()
RETURNS TABLE(proteges int, verification int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        count(*) FILTER (WHERE ss."proctoringActif" = true)::int,
        count(*) FILTER (WHERE ss."verificationIdentite" = true)::int
    FROM "SecuritySettings" ss
    JOIN "Etablissement" e ON e."id" = ss."etablissementId"
    WHERE e."actif" = true
      -- Re-check des claims (defense in depth — l'appelant est déjà
      -- ADMIN via RequireRole, mais la fonction reste sûr même appelée
      -- par erreur avec d'autres claims). NB : un agrégat sans GROUP BY
      -- rend TOUJOURS une ligne — le deny se manifeste par des compteurs
      -- à 0 (vérifié : ADMIN → valeurs réelles ; ENSEIGNANT/system-worker/
      -- claims NULL → (0,0)).
      AND current_setting('app.claims.role', true) = 'ADMIN'
      AND current_setting('app.claims.user_id', true) <> ''
      AND current_setting('app.claims.user_id', true) <> 'system-worker';
$$;

-- ─── 4. ASSERTs ───
DO $$
DECLARE
    pol_count int;
    pol_roles text;
    idx_exists boolean;
    fn_exists boolean;
BEGIN
    -- 4.1 Les 3 policies existent TO PUBLIC
    SELECT count(*) INTO pol_count
    FROM pg_policies
    WHERE tablename = 'MonitoringEvent'
      AND policyname IN ('MonitoringEvent_select_admin',
                         'MonitoringEvent_insert_system',
                         'MonitoringEvent_modify_admin')
      AND roles = '{public}';
    IF pol_count <> 3 THEN
        RAISE EXCEPTION 'ASSERT 000132.1 échoué : %/3 policies MonitoringEvent TO PUBLIC (attendu 3)', pol_count;
    END IF;

    -- 4.2 Aucune policy résiduelle TO neondb_owner
    SELECT count(*) INTO pol_count
    FROM pg_policies
    WHERE tablename = 'MonitoringEvent'
      AND roles = '{neondb_owner}';
    IF pol_count <> 0 THEN
        RAISE EXCEPTION 'ASSERT 000132.2 échoué : % policy(ies) MonitoringEvent TO neondb_owner résiduelle(s)', pol_count;
    END IF;

    -- 4.3 Index partiel ACTIF présent
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'MonitoringEvent'
          AND indexname = 'MonitoringEvent_actif_created_idx'
    ) INTO idx_exists;
    IF NOT idx_exists THEN
        RAISE EXCEPTION 'ASSERT 000132.3 échoué : index MonitoringEvent_actif_created_idx absent';
    END IF;

    -- 4.4 Helper présent et SECURITY DEFINER
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_securite_etablissements_counts'
          AND p.prosecdef
    ) INTO fn_exists;
    IF NOT fn_exists THEN
        RAISE EXCEPTION 'ASSERT 000132.4 échoué : fonction admin_securite_etablissements_counts absente ou non SECURITY DEFINER';
    END IF;
END $$;
