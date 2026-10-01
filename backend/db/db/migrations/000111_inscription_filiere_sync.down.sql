-- 000111 down — supprime la fonction de synchronisation Inscription↔filière.
-- Aucune donnée n'est modifiée (les inscriptions clôturées REORIENTE restent
-- en l'état — elles redeviennent éligibles à un re-clôture par le batch,
-- comportement pré-000111).

DROP FUNCTION IF EXISTS public.sync_inscription_filiere_change(text, text, text);
