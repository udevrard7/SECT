-- Down 000136 — retire les 3 règles système du monitoring
-- d'infrastructure (SECT-INFRA-MONITOR-1). Claims ADMIN requis
-- (FORCE RLS, pattern 000135-down).

DO $$
DECLARE
    n_left int;
BEGIN
    PERFORM set_config('app.claims.role', 'ADMIN', true);
    PERFORM set_config('app.claims.user_id', 'migration-000136-down', true);

    DELETE FROM "AlertingRule"
        WHERE "code" IN ('replica-fraicheur', 'backup-fraicheur', 'disque-libre') AND "isSystem" = true;

    SELECT count(*) INTO n_left FROM "AlertingRule"
        WHERE "code" IN ('replica-fraicheur', 'backup-fraicheur', 'disque-libre');
    IF n_left <> 0 THEN
        RAISE EXCEPTION 'ASSERT 000136-down: règles résiduelles (%)', n_left;
    END IF;
END $$;
