-- Rollback migration 000065
DROP FUNCTION IF EXISTS public.downgrade_b2c_to_solo(text);
DROP FUNCTION IF EXISTS public.expire_b2c_subscriptions();
