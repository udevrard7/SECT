-- ============================================================
-- Migration 000133 — Monitoring P5 (ADR-0012) : règles d'alerte
-- configurables persistées + échantillonnage des requêtes API
-- (p50/p95 par endpoint) + socle de l'alerting externe.
-- ============================================================
-- 1. TABLE "AlertingRule" — remplace les 6 seuils hardcodés du
--    frontend (ADR-0011 §5 « lecture seule ») : seuil, comparateur,
--    sévérité, activation, cooldown et canaux (in-app/Slack/email)
--    deviennent éditables par l'ADMIN et persistés. Les colonnes
--    breachedSince/lastNotifiedAt portent l'état du worker alerting
--    (franchissement en cours + gate anti-spam).
-- 2. TABLE "RequestLog" — un échantillon par requête /api/* (route
--    normalisée au pattern chi, pas l'UUID brut) pour p50/p95, taux
--    d'erreur et volume par endpoint. Télémétrie pure : rétention 7 j
--    (purge horaire côté Go), aucune donnée métier/PII.
-- 3. RLS TO PUBLIC (pattern 000117/000132 — mine sect_app) :
--    AlertingRule : select admin|system, insert admin, update
--    admin|system (le worker ne touche QUE breachedSince/
--    lastNotifiedAt sous claims system), delete admin.
--    RequestLog : insert/delete system, select admin|system.
-- 4. SEEDS idempotents (ON CONFLICT (code) DO NOTHING) : 11 règles
--    système = les 6 seuils ADR-0011 + 5 nouvelles rendues possibles
--    par les tables P5 (db-indisponible, warnings-actifs, p95-api,
--    erreurs-5xx-24h — cf. ADR-0012 §1).
-- 5. FORCE ROW LEVEL SECURITY (pattern 000006 : le propriétaire bypass
--    RLS sauf si FORCE — posé APRÈS les seeds) + ASSERTs de contrôle
--    (pattern 000127/000132).
-- ============================================================

-- ─── 1. Table AlertingRule ───
CREATE TABLE "AlertingRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT NOT NULL,
    "comparator" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "severite" TEXT NOT NULL DEFAULT 'WARNING',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "notifySlack" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "breachedSince" TIMESTAMPTZ,
    "lastNotifiedAt" TIMESTAMPTZ,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertingRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertingRule_code_key" ON "AlertingRule"("code");

-- ─── 2. Table RequestLog ───
CREATE TABLE "RequestLog" (
    "id" BIGSERIAL NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "RequestLog_pkey" PRIMARY KEY ("id")
);

-- Fenêtres 1 h/24 h/7 j (percentile_cont, handlers) + purge 7 j.
CREATE INDEX "RequestLog_createdAt_idx" ON "RequestLog"("createdAt" DESC);

-- ─── 3. RLS (ENABLE + policies ; FORCE posé APRÈS les seeds — cf. §5) ───
ALTER TABLE "AlertingRule" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "AlertingRule_select" ON "AlertingRule";
CREATE POLICY "AlertingRule_select"
    ON "AlertingRule" FOR SELECT
    TO PUBLIC
    USING (is_admin() OR is_system());

DROP POLICY IF EXISTS "AlertingRule_insert" ON "AlertingRule";
CREATE POLICY "AlertingRule_insert"
    ON "AlertingRule" FOR INSERT
    TO PUBLIC
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "AlertingRule_update" ON "AlertingRule";
CREATE POLICY "AlertingRule_update"
    ON "AlertingRule" FOR UPDATE
    TO PUBLIC
    USING (is_admin() OR is_system())
    WITH CHECK (is_admin() OR is_system());

DROP POLICY IF EXISTS "AlertingRule_delete" ON "AlertingRule";
-- Règles système indestructibles : seule une règle custom (isSystem=false)
-- est supprimable, et par l'ADMIN. (Le handler Go refuse aussi — defense
-- in depth : la couche DB garantit l'invariant même en SQL direct.)
CREATE POLICY "AlertingRule_delete"
    ON "AlertingRule" FOR DELETE
    TO PUBLIC
    USING (("isSystem" = false AND is_admin()) OR is_system());

ALTER TABLE "RequestLog" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "RequestLog_insert" ON "RequestLog";
CREATE POLICY "RequestLog_insert"
    ON "RequestLog" FOR INSERT
    TO PUBLIC
    WITH CHECK (is_system());

DROP POLICY IF EXISTS "RequestLog_select" ON "RequestLog";
CREATE POLICY "RequestLog_select"
    ON "RequestLog" FOR SELECT
    TO PUBLIC
    USING (is_admin() OR is_system());

DROP POLICY IF EXISTS "RequestLog_delete" ON "RequestLog";
CREATE POLICY "RequestLog_delete"
    ON "RequestLog" FOR DELETE
    TO PUBLIC
    USING (is_system());

-- ─── 4. Seeds — 11 règles système (idempotent) ───
INSERT INTO "AlertingRule" ("id", "code", "label", "description", "metric", "comparator",
    "threshold", "severite", "enabled", "cooldownMinutes",
    "notifyInApp", "notifySlack", "notifyEmail", "isSystem", "createdById")
VALUES
    ('rule-score-sante-bas', 'score-sante-bas', 'Score santé bas',
        'Score santé plateforme sous 70 — attention requise (même formule que la carte dashboard, ADR-0011)',
        'score_sante', 'INF', 70, 'WARNING', true, 60, true, true, true, true, NULL),
    ('rule-critical-actifs', 'critical-actifs', 'Événements critiques actifs',
        'Tolérance zéro — un critique actif exige une action immédiate',
        'critical_actifs', 'SUP_EGAL', 1, 'CRITICAL', true, 30, true, true, true, true, NULL),
    ('rule-errors-actifs', 'errors-actifs', 'Erreurs actives',
        'Au-delà de 5 erreurs actives, investiguer la cause racine',
        'errors_actifs', 'SUP', 5, 'ERROR', true, 60, true, true, true, true, NULL),
    ('rule-warnings-actifs', 'warnings-actifs', 'Avertissements actifs',
        'Accumulation d''avertissements actifs — dette d''incidents à résorber',
        'warnings_actifs', 'SUP', 10, 'WARNING', true, 120, true, true, true, true, NULL),
    ('rule-backlog-autorisations', 'backlog-autorisations', 'Backlog autorisations',
        'Demandes d''assistance en attente de validation par les responsables',
        'backlog_autorisations', 'SUP', 5, 'WARNING', true, 240, true, true, true, true, NULL),
    ('rule-db-latence', 'db-latence', 'Latence base de données',
        'Ping Neon mesuré à chaque évaluation — au-delà de 1 s, la plateforme est dégradée',
        'db_latency_ms', 'SUP', 1000, 'WARNING', true, 30, true, true, true, true, NULL),
    ('rule-db-indisponible', 'db-indisponible', 'Base de données indisponible',
        'Ping DB en échec — incident majeur (score −30, ADR-0011)',
        'db_down', 'SUP_EGAL', 1, 'CRITICAL', true, 15, true, true, true, true, NULL),
    ('rule-providers-ia-inactifs', 'providers-ia-inactifs', 'Fournisseurs IA actifs',
        'Au moins 1 provider actif requis (génération + correction)',
        'providers_ia_actifs', 'INF', 1, 'ERROR', true, 240, true, true, true, true, NULL),
    ('rule-workers-erreur', 'workers-erreur', 'Workers en erreur',
        'Workers périodiques dont la dernière exécution a échoué',
        'workers_en_erreur', 'SUP_EGAL', 1, 'ERROR', true, 60, true, true, true, true, NULL),
    ('rule-p95-api-lente', 'p95-api-lente', 'Latence p95 API (1 h)',
        '95 % des requêtes API doivent répondre en moins de 3 s',
        'p95_api_ms', 'SUP', 3000, 'WARNING', true, 60, true, true, true, true, NULL),
    ('rule-erreurs-5xx-24h', 'erreurs-5xx-24h', 'Erreurs 5xx (24 h)',
        'Volume de réponses ≥ 500 sur les dernières 24 h',
        'erreurs_5xx_24h', 'SUP', 20, 'ERROR', true, 240, true, true, true, true, NULL)
ON CONFLICT ("code") DO NOTHING;

-- ─── 5. FORCE RLS (ferme le bypass propriétaire — pattern 000006) ───
--    Posé APRÈS les seeds : l'owner insère les 11 règles sans policy,
--    puis le FORCE rend les policies opposables MÊME au propriétaire
--    (une connexion owner sans claims ne voit plus rien — même garanties
--    que le runtime sect_app NOBYPASSRLS).
ALTER TABLE "AlertingRule" FORCE ROW LEVEL SECURITY;
ALTER TABLE "RequestLog" FORCE ROW LEVEL SECURITY;

-- ─── 6. ASSERTs ───
DO $$
DECLARE
    n_rules int;
    n_policies_ar int;
    n_policies_rl int;
    rls_on_ar boolean;
    rls_on_rl boolean;
    rls_force_ar boolean;
    rls_force_rl boolean;
    bad_rules int;
BEGIN
    -- 6.1 Les 11 règles seedées sont là et cohérentes.
    --     NB : FORCE RLS est actif → le SELECT est scoppé par la policy
    --     select (is_admin OR is_system) → on pose les claims de migration
    --     AVANT de compter (revert automatique à la sortie du bloc).
    PERFORM set_config('app.claims.role', 'ADMIN', true);
    PERFORM set_config('app.claims.user_id', 'migration-000133', true);
    SELECT count(*) INTO n_rules FROM "AlertingRule" WHERE "isSystem" = true;
    IF n_rules <> 11 THEN
        RAISE EXCEPTION 'ASSERT 000133: 11 règles système attendues, % trouvées', n_rules;
    END IF;

    -- 6.2 Aucun seed avec métrique/comparateur inconnu (catalogue ADR-0012 §2)
    SELECT count(*) INTO bad_rules FROM "AlertingRule"
    WHERE "metric" NOT IN ('score_sante', 'critical_actifs', 'errors_actifs', 'warnings_actifs',
                           'backlog_autorisations', 'db_latency_ms', 'db_down',
                           'providers_ia_actifs', 'workers_en_erreur', 'p95_api_ms',
                           'erreurs_5xx_24h')
       OR "comparator" NOT IN ('SUP', 'SUP_EGAL', 'INF', 'INF_EGAL')
       OR "severite" NOT IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL');
    IF bad_rules > 0 THEN
        RAISE EXCEPTION 'ASSERT 000133: % règle(s) avec métrique/comparateur/sévérité invalide', bad_rules;
    END IF;

    -- 6.3 RLS + FORCE activés sur les 2 tables
    SELECT relrowsecurity, relforcerowsecurity INTO rls_on_ar, rls_force_ar FROM pg_class WHERE relname = 'AlertingRule';
    SELECT relrowsecurity, relforcerowsecurity INTO rls_on_rl, rls_force_rl FROM pg_class WHERE relname = 'RequestLog';
    IF NOT rls_on_ar OR NOT rls_on_rl OR NOT rls_force_ar OR NOT rls_force_rl THEN
        RAISE EXCEPTION 'ASSERT 000133: RLS + FORCE doivent être activés sur AlertingRule et RequestLog';
    END IF;

    -- 6.4 Les 4 policies AlertingRule + 3 policies RequestLog existent TO PUBLIC
    SELECT count(*) INTO n_policies_ar FROM pg_policies
    WHERE tablename = 'AlertingRule'
      AND policyname IN ('AlertingRule_select', 'AlertingRule_insert',
                         'AlertingRule_update', 'AlertingRule_delete')
      AND roles = '{public}';
    IF n_policies_ar <> 4 THEN
        RAISE EXCEPTION 'ASSERT 000133: 4 policies AlertingRule TO PUBLIC attendues, % trouvées', n_policies_ar;
    END IF;

    SELECT count(*) INTO n_policies_rl FROM pg_policies
    WHERE tablename = 'RequestLog'
      AND policyname IN ('RequestLog_insert', 'RequestLog_select', 'RequestLog_delete')
      AND roles = '{public}';
    IF n_policies_rl <> 3 THEN
        RAISE EXCEPTION 'ASSERT 000133: 3 policies RequestLog TO PUBLIC attendues, % trouvées', n_policies_rl;
    END IF;
END $$;
