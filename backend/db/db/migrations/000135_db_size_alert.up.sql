-- ============================================================
-- Migration 000135 — SECT-DB-ALERT-1 (ADR-0013 §14.7/§15, D10) :
-- règle système « taille base ≥ 60 % du quota Neon Free ».
--
-- Contexte : le mur stockage du plan Free (1 GiB/branche, mesuré
-- §11.1) est SILENCIEUX — à la limite, Neon REJETTE les écrits
-- (copies d'étudiants en péril en plein examen, ADR-0013 §14.4).
-- La métrique db_size_mb est désormais collectée par
-- monitoring.CollectMetrics (backend) ; cette migration sème la
-- règle qui la rend ACTIONNABLE :
--   - seuil 600 Mo (60 % du GiB) → décision N2/N3 sous 7 jours
--     (§14.7-1) ;
--   - sévérité CRITICAL (c'est le seul mur DUR du plan) ;
--   - cooldown 1440 min : rappel quotidien (métrique lente),
--     pas de spam ;
--   - canaux : in-app + Discord (principal, 000134), pas Slack,
--     pas email (quota transactionnel préservé).
--
-- NB : claims ADMIN requis pour l'INSERT — FORCE RLS posé par
-- 000133, policy AlertingRule_insert = is_admin() OR is_system()
-- (pattern set_config de la migration 000134).
--
-- Down : DELETE de la règle (claims ADMIN également requis).
-- ============================================================

DO $$
DECLARE
    n_rule int;
    sev_ok boolean;
    chan_ok boolean;
BEGIN
    PERFORM set_config('app.claims.role', 'ADMIN', true);
    PERFORM set_config('app.claims.user_id', 'migration-000135', true);

    INSERT INTO "AlertingRule" ("id", "code", "label", "description", "metric", "comparator",
        "threshold", "severite", "enabled", "cooldownMinutes",
        "notifyInApp", "notifyDiscord", "notifySlack", "notifyEmail", "isSystem", "createdById")
    VALUES
        ('rule-db-taille-quota', 'db-taille-quota',
            'Taille base ≥ 60 % du quota Neon Free',
            'pg_database_size ≥ 600 Mo du GiB inclus — à la limite Neon REJETTE les écrits (copies d''étudiants en péril en plein examen, ADR-0013 §14.4). Décision N2/N3 sous 7 jours (§14.7-1).',
            'db_size_mb', 'SUP_EGAL', 600, 'CRITICAL', true, 1440,
            true, true, false, false, true, NULL)
    ON CONFLICT ("code") DO NOTHING;

    -- ASSERTs (pattern 000133/000134)
    SELECT count(*) INTO n_rule FROM "AlertingRule" WHERE "code" = 'db-taille-quota';
    IF n_rule <> 1 THEN
        RAISE EXCEPTION 'ASSERT 000135: règle db-taille-quota attendue (1), % trouvée(s)', n_rule;
    END IF;

    SELECT ("severite" = 'CRITICAL' AND "metric" = 'db_size_mb'
            AND "comparator" = 'SUP_EGAL' AND "threshold" = 600
            AND "enabled" = true AND "cooldownMinutes" = 1440)
        INTO sev_ok FROM "AlertingRule" WHERE "code" = 'db-taille-quota';
    IF NOT sev_ok THEN
        RAISE EXCEPTION 'ASSERT 000135: paramètres de la règle inattendus';
    END IF;

    SELECT ("notifyDiscord" = true AND "notifyInApp" = true
            AND "notifySlack" = false AND "notifyEmail" = false AND "isSystem" = true)
        INTO chan_ok FROM "AlertingRule" WHERE "code" = 'db-taille-quota';
    IF NOT chan_ok THEN
        RAISE EXCEPTION 'ASSERT 000135: canaux de la règle inattendus (Discord principal attendu)';
    END IF;
END $$;
