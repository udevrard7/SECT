-- Migration 000136 — SECT-INFRA-MONITOR-1 (11 octobre 2026) :
-- règles système du monitoring d'INFRASTRUCTURE hybride (addendum
-- ADR-0012 — le P5 regardait l'application ; l'option C a construit
-- une infrastructure qui n'était surveillée par AUCUNE règle).
--
-- Trois règles, mesurées LOCALEMENT (réplique 5433, /proc, staging
-- backup — discipline CU ADR-0013 §13.3 : ne jamais réveiller Neon
-- pour surveiller Neon) :
--
--   1. replica-fraicheur — RPO vécu de la voie D : now() − max(createdAt
--      RequestLog) SUR LA RÉPLIQUE. ≥ 90 min = 3 fenêtres grille M1
--      manquées (la réplique pré-positionnée n'est plus à 30 min).
--      WARNING : à ce stade la voie B (backup) reste le chemin nominal.
--   2. backup-fraicheur — âge du dernier backup chiffré (fichier
--      last_success du staging) : SEUIL ALIGNÉ SUR LE WATCHDOG §5-3
--      (36 h) — c'est le RPO de la voie B. CRITICAL : au-delà, un
--      incident Neon perdrait > 36 h de données.
--   3. disque-libre — statfs / de la VM OCI : le maillon fragile
--      (ADR-0013 §3) porte API + réplique + DR — un disque plein
--      les tuerait TOUS ENSEMBLE. ≤ 15 % = CRITICAL.
--
-- NB : ces métriques sont INDISPONIBLES (jamais 0) sur une instance
-- sans réplique/staging (Render standby) — Evaluate rend ok=false,
-- la règle ne peut pas se déclencher sur une mesure absente.
-- NB : claims ADMIN requis pour l'INSERT — FORCE RLS posé par 000133,
-- policy AlertingRule_insert = is_admin() OR is_system() (pattern
-- set_config de 000134/000135). Down : DELETE des 3 règles.

DO $$
DECLARE
    n_total int; n_replica int; n_backup int; n_disk int;
    params_ok boolean; chans_ok boolean;
BEGIN
    PERFORM set_config('app.claims.role', 'ADMIN', true);
    PERFORM set_config('app.claims.user_id', 'migration-000136', true);

    INSERT INTO "AlertingRule" ("id", "code", "label", "description", "metric", "comparator",
        "threshold", "severite", "enabled", "cooldownMinutes",
        "notifyInApp", "notifyDiscord", "notifySlack", "notifyEmail", "isSystem", "createdById")
    VALUES
        ('rule-replica-fraicheur', 'replica-fraicheur',
            'Fraîcheur réplique ≥ 90 min (voie D dégradée)',
            'now() − max(createdAt RequestLog) sur la réplique 5433 : au-delà de 90 minutes, 3 fenêtres de la grille M1 (ADR-0013 §13.2) ont été manquées — la réplique pré-positionnée (voie D, RPO 30 min) est dégradée. Investiguer sect-replica-sync.timer + les slots réplication côté Neon (runbook §3.8-A).',
            'replica_lag_min', 'SUP_EGAL', 90, 'WARNING', true, 720,
            true, true, false, false, true, NULL),
        ('rule-backup-fraicheur', 'backup-fraicheur',
            'Dernier backup > 36 h (voie B en péril)',
            'Âge du fichier last_success du pipeline sect_backup (chiffré age → Object Storage). Seuil ALIGNÉ sur le watchdog §5-3 du runbook (36 h de silence = alerte). Au-delà, la voie B (restore break-glass, RPO 24 h théorique) perdrait PLUS de 36 h de données — canal Discord doublé avec le watchdog, assumé (CRITICAL).',
            'backup_age_h', 'SUP_EGAL', 36, 'CRITICAL', true, 720,
            true, true, false, false, true, NULL),
        ('rule-disque-libre', 'disque-libre',
            'Disque VM ≤ 15 % (maillon fragile)',
            'statfs / de la VM OCI (ADR-0013 §3 : le maillon le plus fragile). Un disque plein tuerait SIMULTANÉMENT l''API, la réplique sect_replica (voie D), le cluster de restore 5433 (voie B) et les logs — caddy inclus. À 15 % il reste ~7 Go sur 48 : purger docker (prune) et auditer /var/lib/sect-backup.',
            'disk_free_pct', 'INF_EGAL', 15, 'CRITICAL', true, 1440,
            true, true, false, false, true, NULL)
    ON CONFLICT ("code") DO NOTHING;

    -- ASSERTs (pattern 000133/000134/000135)
    SELECT count(*) INTO n_total FROM "AlertingRule" WHERE "code" IN ('replica-fraicheur', 'backup-fraicheur', 'disque-libre');
    IF n_total <> 3 THEN
        RAISE EXCEPTION 'ASSERT 000136: 3 règles système attendues, % trouvée(s)', n_total;
    END IF;

    SELECT count(*) INTO n_replica FROM "AlertingRule"
        WHERE "code" = 'replica-fraicheur' AND "metric" = 'replica_lag_min'
          AND "comparator" = 'SUP_EGAL' AND "threshold" = 90 AND "severite" = 'WARNING';
    SELECT count(*) INTO n_backup FROM "AlertingRule"
        WHERE "code" = 'backup-fraicheur' AND "metric" = 'backup_age_h'
          AND "comparator" = 'SUP_EGAL' AND "threshold" = 36 AND "severite" = 'CRITICAL';
    SELECT count(*) INTO n_disk FROM "AlertingRule"
        WHERE "code" = 'disque-libre' AND "metric" = 'disk_free_pct'
          AND "comparator" = 'INF_EGAL' AND "threshold" = 15 AND "severite" = 'CRITICAL';
    IF n_replica <> 1 OR n_backup <> 1 OR n_disk <> 1 THEN
        RAISE EXCEPTION 'ASSERT 000136: paramètres inattendus (replica=%, backup=%, disk=%)', n_replica, n_backup, n_disk;
    END IF;

    SELECT ("notifyDiscord" = true AND "notifyInApp" = true
            AND "notifySlack" = false AND "notifyEmail" = false AND "isSystem" = true)
        INTO chans_ok FROM "AlertingRule" WHERE "code" = 'replica-fraicheur';
    IF NOT chans_ok THEN
        RAISE EXCEPTION 'ASSERT 000136: canaux inattendus (Discord principal attendu, pattern 000134/000135)';
    END IF;
END $$;
