-- ============================================================
-- Migration 000129 DOWN — retire le helper user_display_name
-- (aucun consommateur restant après le revert du code P4).
-- ============================================================

DROP FUNCTION IF EXISTS public.user_display_name(text);
