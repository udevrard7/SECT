-- 000056 down: supprime la fonction create_b2c_subscription (version 000056).
--
-- NOTE : la migration 000058 recréé cette fonction via CREATE OR REPLACE avec une
-- signature étendue (+ p_periode_abonnement). Si 000058 a déjà été appliquée,
-- ce down ne doit être exécuté qu'après le down de 000058 (ordre inverse golang-migrate).
-- On utilise DROP FUNCTION IF EXISTS (safe dans les deux cas).

DROP FUNCTION IF EXISTS public.create_b2c_subscription(text, text, text, text, text);
