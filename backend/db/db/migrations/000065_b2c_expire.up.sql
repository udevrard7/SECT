-- Migration 000065 — Expiration auto + downgrade B2C
-- Task ID: SECT-B2C-EXPIRE
--
-- Objectif : à l'expiration d'un abonnement Premium (dateFin < NOW()), passer
-- le statut ACTIF → EXPIRE pour bloquer l'accès. Le prof peut alors :
--   1. Renouveler (revenir à Premium)
--   2. Rétrograder en Prof Solo gratuit (downgrade)
--
-- 1. Fonction expire_b2c_subscriptions() : passe ACTIF→EXPIRE pour les abonnements
--    dont dateFin < NOW(). Appelée par un worker périodique (1h).
-- 2. Fonction downgrade_b2c_to_solo() : rétrograde un abonnement Premium EXPIRE
--    vers un plan Solo gratuit (change le planId + statut ACTIF + dateFin NULL).

-- ═══ 1. Fonction expire_b2c_subscriptions ═══
-- Passe tous les abonnements ACTIF avec dateFin < NOW() à EXPIRE.
-- Retourne le nombre d'abonnements expirés + la liste (pour envoi email).
-- Idempotente : un abonnement déjà EXPIRE n'est pas touché.
CREATE OR REPLACE FUNCTION public.expire_b2c_subscriptions()
RETURNS TABLE(
  o_abonnement_id text,
  o_user_email text,
  o_user_name text,
  o_plan_nom text,
  o_plan_prix double precision,
  o_date_fin timestamp without time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Sélectionner + mettre à jour en une fois (RETURNING)
  RETURN QUERY
  WITH expired AS (
    UPDATE "Abonnement"
    SET "statut" = 'EXPIRE'::"StatutAbonnement", "updatedAt" = NOW()
    WHERE "statut" = 'ACTIF'
      AND "dateFin" IS NOT NULL
      AND "dateFin" < NOW()
      AND "deletedAt" IS NULL
    RETURNING "id", "etablissementId", "planId", "dateFin"
  )
  SELECT e."id", u."email", u."name", p."nom", p."prixMensuel", e."dateFin"
  FROM expired e
  JOIN "User" u ON u."etablissementId" = e."etablissementId" AND u."role" = 'ENSEIGNANT'
  JOIN "Plan" p ON p."id" = e."planId";
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.expire_b2c_subscriptions FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_b2c_subscriptions TO neondb_owner;

-- ═══ 2. Fonction downgrade_b2c_to_solo ═══
-- Rétrograde un abonnement Premium EXPIRE vers Prof Solo gratuit.
-- - Change le planId vers plan_b2c_prof_solo
-- - Statut → ACTIF (Solo est toujours actif, gratuit)
-- - dateFin → NULL (Pas d'expiration pour gratuit)
-- - relanceEnvoyee → false (reset)
-- - Conserve l'historique (l'ancien abonnement Premium reste dans Facture)
--
-- Le prof peut continuer à utiliser SECT en mode gratuit (limité : 2 classes,
-- 40 étudiants, 3 épreuves IA/mois). S'il veut revenir à Premium, il fait un
-- renouvellement (/paiement/renouvellement) qui créera un nouvel abonnement.
CREATE OR REPLACE FUNCTION public.downgrade_b2c_to_solo(
  p_abonnement_id text
)
RETURNS TABLE(
  o_success boolean,
  o_abonnement_id text,
  o_new_plan_id text,
  o_new_plan_nom text,
  o_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_statut text;
  v_current_plan_id text;
  v_etab_id text;
BEGIN
  -- 1. Vérifier que l'abonnement existe
  SELECT a."statut"::text, a."planId", a."etablissementId"
  INTO v_current_statut, v_current_plan_id, v_etab_id
  FROM "Abonnement" a
  WHERE a."id" = p_abonnement_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, p_abonnement_id, ''::text, ''::text, 'Abonnement introuvable'::text;
    RETURN;
  END IF;

  -- 2. Vérifier qu'il est EXPIRE (on ne rétrograde pas un abonnement ACTIF)
  IF v_current_statut <> 'EXPIRE' THEN
    RETURN QUERY SELECT false, p_abonnement_id, v_current_plan_id, ''::text,
      'Abonnement non expiré (statut: ' || v_current_statut || ')'::text;
    RETURN;
  END IF;

  -- 3. Vérifier qu'on vient bien d'un plan Premium (B2C payant)
  -- (on ne rétrograde pas un abonnement Solo → Solo, pas de sens)
  IF v_current_plan_id = 'plan_b2c_prof_solo' THEN
    RETURN QUERY SELECT false, p_abonnement_id, v_current_plan_id, 'Prof Solo'::text,
      'Abonnement déjà en Prof Solo'::text;
    RETURN;
  END IF;

  -- 4. Rétrograder : changer le planId vers Solo + activer
  UPDATE "Abonnement"
  SET "planId" = 'plan_b2c_prof_solo',
      "statut" = 'ACTIF'::"StatutAbonnement",
      "dateFin" = NULL,
      "renouvellementAuto" = false,
      "relanceEnvoyee" = false,
      "montantPaye" = 0,
      "updatedAt" = NOW()
  WHERE "id" = p_abonnement_id;

  RETURN QUERY SELECT true, p_abonnement_id, 'plan_b2c_prof_solo'::text, 'Prof Solo'::text,
    'Rétrogradé en Prof Solo gratuit'::text;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.downgrade_b2c_to_solo FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.downgrade_b2c_to_solo TO neondb_owner;
