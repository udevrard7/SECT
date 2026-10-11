-- ============================================================
-- SECT-REPLICA-3 (ADR-0013 §6 phase 3 / §16.6) — resync des
-- SÉQUENCES après promotion de la base locale.
--
-- CONTEXTE : la réplication logique ne réplique PAS les séquences
-- (seules les tables publiées le sont — §16.6, limite documentée).
-- Toute promotion de la base locale (réplique complète ou restore
-- break-glass) DOIT resynchroniser chaque séquence avec le max()
-- de SA colonne propriétaire AVANT d'accepter des écritures —
-- sinon nextval() rend des IDs déjà attribués (collision clé
-- primaire au premier INSERT).
--
-- MODE D'EMPLOI (promotion — runbook oci-hybrid §3.8) :
--   sudo -n -u postgres /usr/lib/postgresql/18/bin/psql \
--     -p 5433 -d sect_replica -v ON_ERROR_STOP=1 \
--     -f /opt/sect/replica/resync_sequences.sql
--
-- PIÈGE (prouvé drill #38127309915) : setval() reçoit le nom de
-- séquence en CHAÎNE — un nom non quoté y est FOLDÉ en minuscules
-- (« RequestLog_id_seq » → requestlog_id_seq inexistant). On
-- utilise pg_get_serial_sequence() qui retourne le nom PROPREMENT
-- QUOTÉ (et couvre serial ET identity — les deux directions de
-- pg_depend).
--
-- SÉMANTIQUE :
--   - séquence possédée par une colonne : setval(max(colonne)) si
--     des lignes existent, sinon setval(1, false) → nextval() = 1
--     (état « jamais servie ») ;
--   - séquences AUTONOMES (aucune colonne propriétaire) : listées
--     en NOTICE à resynchroniser À LA MAIN selon la sémantique
--     métier (aucun max() inférable par le catalogue).
--
-- IDEMPOTENT : rejouable sans risque (recalcule les mêmes valeurs).
-- LECTURE SEULE pour les données — ne touche qu'aux séquences.
-- ============================================================

DO $$
DECLARE
    r           record;
    v_max       bigint;
    v_done      int := 0;
BEGIN
    -- ── 1. Séquences possédées par une colonne (serial + identity) ──
    -- pg_get_serial_sequence retourne le nom QUOTÉ (ex. public."RequestLog_id_seq")
    -- et NULL si la colonne n'a pas de séquence — les deux directions de
    -- pg_depend (deptype 'a' serial / 'i' identity) sont couvertes.
    FOR r IN
        SELECT n.nspname  AS tab_schema,
               c.relname  AS tab_name,
               a.attname  AS col_name,
               pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) AS seq_name
        FROM pg_class c
        JOIN pg_namespace n  ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
                           AND a.attnum > 0
                           AND NOT a.attisdropped
        WHERE c.relkind IN ('r', 'p')
          AND n.nspname = 'public'
    LOOP
        CONTINUE WHEN r.seq_name IS NULL;

        EXECUTE format('SELECT COALESCE(max(%I), 0) FROM %I.%I',
                       r.col_name, r.tab_schema, r.tab_name) INTO v_max;

        IF v_max >= 1 THEN
            EXECUTE format('SELECT setval(%L, %s, true)',
                           r.seq_name, v_max);
            RAISE NOTICE 'resync % (max %.% = %)', r.seq_name, r.tab_name, r.col_name, v_max;
        ELSE
            EXECUTE format('SELECT setval(%L, 1, false)',
                           r.seq_name);
            RAISE NOTICE 'resync % (table % vide → 1)', r.seq_name, r.tab_name;
        END IF;
        v_done := v_done + 1;
    END LOOP;

    RAISE NOTICE '── % séquence(s) resynchronisée(s) sur max() de leur colonne ──', v_done;

    -- ── 2. Séquences autonomes (aucune colonne propriétaire) ──
    FOR r IN
        SELECT n.nspname AS seq_schema, c.relname AS seq_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'S'
          AND n.nspname = 'public'
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE (d.objid = c.oid OR d.refobjid = c.oid)
                AND d.deptype IN ('a', 'i'))
    LOOP
        RAISE NOTICE 'SÉQUENCE AUTONOME % : max() NON inférable — resync MANUELLE requise (sémantique métier)',
                     quote_ident(r.seq_schema) || '.' || quote_ident(r.seq_name);
    END LOOP;
END $$;

-- ── Preuve : état final lisible par l'exploitant ──
-- (pg_sequences n'expose PAS is_called — last_value suffit comme preuve
-- de resync ; next_value réel = last_value + 1 pour une séquence servie.)
SELECT schemaname,
       sequencename,
       last_value
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;
