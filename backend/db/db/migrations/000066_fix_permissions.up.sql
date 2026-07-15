-- Migration 000066 — Fix permissions fonctions B2C pour sect_app
-- Task ID: SECT-B2C-EXPIRE
--
-- Problème : en production, Render utilise l'utilisateur sect_app (pas neondb_owner).
-- Les fonctions downgrade_b2c_to_solo et expire_b2c_subscriptions (migration 000065)
-- n'ont GRANT que pour neondb_owner → 42501 permission denied en production.
--
-- Fix : GRANT EXECUTE à sect_app sur toutes les fonctions B2C. sect_app est le rôle
-- applicatif (pooler Neon), il doit pouvoir exécuter les fonctions SECURITY DEFINER.

-- Fonctions B2C qui nécessitent EXECUTE pour sect_app :
GRANT EXECUTE ON FUNCTION public.create_b2c_subscription(text, text, text, text, text, text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.confirm_b2c_payment(text, text, text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.create_b2c_facture(text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.renew_b2c_subscription(text, text, text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.renew_b2c_subscription(text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_b2c_subscriptions() TO sect_app;
GRANT EXECUTE ON FUNCTION public.downgrade_b2c_to_solo(text) TO sect_app;

-- Note : grant à PUBLIC aussi pour compatibilité (les fonctions SECURITY DEFINER
-- s'exécutent avec les droits du owner, pas de l'appelant — le GRANT EXECUTE
-- contrôle juste qui peut appeler la fonction, pas les données qu'elle touche).
REVOKE EXECUTE ON FUNCTION public.expire_b2c_subscriptions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.downgrade_b2c_to_solo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_b2c_subscriptions() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.downgrade_b2c_to_solo(text) TO PUBLIC;
