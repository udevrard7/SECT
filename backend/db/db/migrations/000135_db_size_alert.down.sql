-- ============================================================
-- Migration 000135 (down) — retire la règle db-taille-quota.
-- La métrique db_size_mb reste dans le catalogue backend (mesurée,
-- évaluable par toute règle future) — seul le seed système part.
-- ============================================================

DO $$
DECLARE
    n_rule int;
BEGIN
    PERFORM set_config('app.claims.role', 'ADMIN', true);
    PERFORM set_config('app.claims.user_id', 'migration-000135-down', true);

    DELETE FROM "AlertingRule" WHERE "code" = 'db-taille-quota';

    SELECT count(*) INTO n_rule FROM "AlertingRule" WHERE "code" = 'db-taille-quota';
    IF n_rule <> 0 THEN
        RAISE EXCEPTION 'ASSERT 000135-down: la règle aurait dû disparaître, % restante(s)', n_rule;
    END IF;
END $$;
