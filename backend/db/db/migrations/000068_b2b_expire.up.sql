-- Migration 000068 — Expiration + relance B2B
-- Task ID: SECT-B2B-FACTURATION
--
-- Objectif : étendre l'expiration et la relance aux abonnements B2B.
-- 1. Fonction expire_b2b_subscriptions : expire les ESSAI (14j) + ACTIF (dateFin < NOW())
-- 2. La fonction retourne aussi le type d'expiration (ESSAI_EXPIRE vs ABONNEMENT_EXPIRE)
--    pour que le worker envoie le bon email.

CREATE OR REPLACE FUNCTION public.expire_b2b_subscriptions()
RETURNS TABLE(
  o_abonnement_id text,
  o_user_email text,
  o_user_name text,
  o_etab_nom text,
  o_plan_nom text,
  o_expire_reason text,  -- 'ESSAI_EXPIRE' ou 'ABONNEMENT_EXPIRE'
  o_date_fin timestamp without time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Expire les abonnements B2B :
  -- 1. ESSAI dont dateDebut + periodeEssaiJours < NOW() (essai expiré)
  -- 2. ACTIF dont dateFin < NOW() (abonnement annuel expiré)
  --
  -- On filtre par branche='B2B' pour ne pas toucher les B2C (gérés par expire_b2c_subscriptions).
  RETURN QUERY
  WITH expired AS (
    UPDATE "Abonnement"
    SET "statut" = 'EXPIRE'::"StatutAbonnement", "updatedAt" = NOW()
    WHERE "deletedAt" IS NULL
      AND (
        -- ESSAI expiré : dateDebut + periodeEssaiJours < NOW()
        ("statut" = 'ESSAI'
         AND "dateDebut" + ("periodeEssaiJours" || ' days')::interval < NOW())
        -- ACTIF expiré : dateFin < NOW()
        OR ("statut" = 'ACTIF'
         AND "dateFin" IS NOT NULL
         AND "dateFin" < NOW())
      )
      AND "etablissementId" IN (
        SELECT e."id" FROM "Etablissement" e
        WHERE e."type" IS NULL OR e."type" <> 'PERSONNEL'
      )  -- exclure les étab PERSONNEL (B2C)
    RETURNING "id", "etablissementId", "planId", "statut", "dateDebut", "dateFin"
  )
  SELECT e."id", u."email", u."name", etab."nom", p."nom",
    CASE
      WHEN e."statut" = 'ESSAI' THEN 'ESSAI_EXPIRE'
      ELSE 'ABONNEMENT_EXPIRE'
    END,
    e."dateFin"
  FROM expired e
  JOIN "Etablissement" etab ON etab."id" = e."etablissementId"
  JOIN "User" u ON u."etablissementId" = e."etablissementId" AND u."role" = 'RESPONSABLE'
  JOIN "Plan" p ON p."id" = e."planId";
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.expire_b2b_subscriptions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_b2b_subscriptions() TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.expire_b2b_subscriptions() TO sect_app;
GRANT EXECUTE ON FUNCTION public.expire_b2b_subscriptions() TO PUBLIC;
