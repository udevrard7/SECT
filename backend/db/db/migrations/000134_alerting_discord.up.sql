-- ============================================================
-- Migration 000134 — Alerting externe : canal Discord + refus du
-- canal email par défaut (SECT-MONITORING-DISCORD-1, 2026-10-05).
--
-- Décision produit : les alertes du monitoring partent par WEBHOOK
-- DISCORD (DISCORD_WEBHOOK_URL) — les emails restent réservés aux
-- transactionnels (reset password, invitations, factures) pour
-- préserver le quota Resend. Le mailer transactionnel est INTACT.
--
-- 1. Colonne "notifyDiscord" (NOT NULL, défaut true — canal
--    principal : les règles existantes et futures l'ont activé).
-- 2. UPDATE : notifyEmail = false sur TOUTES les règles (le canal
--    reste réactivable par règle depuis l'UI, et ALERTING_EMAIL_TO
--    reste supporté côté backend — cf. config.go).
-- 3. ASSERTs : colonne présente NOT NULL défaut true, plus AUCUNE
--    règle avec notifyEmail actif.
--
-- NB : claims ADMIN requis pour l'UPDATE — FORCE RLS posé par 000133,
-- la policy AlertingRule_update exige is_admin() OR is_system().
-- ============================================================

ALTER TABLE "AlertingRule" ADD COLUMN "notifyDiscord" BOOLEAN NOT NULL DEFAULT true;

DO $$
DECLARE
    n_rules int;
    n_email_on int;
    has_discord boolean;
    discord_nullable text;
    discord_default text;
BEGIN
    PERFORM set_config('app.claims.role', 'ADMIN', true);
    PERFORM set_config('app.claims.user_id', 'migration-000134', true);

    -- Décision produit : canal email d'alerting OFF partout.
    UPDATE "AlertingRule" SET "notifyEmail" = false, "updatedAt" = now();

    -- ASSERTs
    SELECT count(*) INTO n_rules FROM "AlertingRule";
    IF n_rules < 11 THEN
        RAISE EXCEPTION 'ASSERT 000134: au moins 11 règles système attendues, % trouvées', n_rules;
    END IF;

    SELECT count(*) INTO n_email_on FROM "AlertingRule" WHERE "notifyEmail" = true;
    IF n_email_on <> 0 THEN
        RAISE EXCEPTION 'ASSERT 000134: notifyEmail doit être false sur toutes les règles (% restantes)', n_email_on;
    END IF;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'AlertingRule' AND column_name = 'notifyDiscord') INTO has_discord;
    IF NOT has_discord THEN
        RAISE EXCEPTION 'ASSERT 000134: colonne notifyDiscord absente';
    END IF;

    SELECT is_nullable, column_default INTO discord_nullable, discord_default
    FROM information_schema.columns
    WHERE table_name = 'AlertingRule' AND column_name = 'notifyDiscord';
    IF discord_nullable <> 'NO' OR discord_default IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'ASSERT 000134: notifyDiscord doit être NOT NULL DEFAULT true (nullable=%, default=%)',
            discord_nullable, discord_default;
    END IF;
END $$;
