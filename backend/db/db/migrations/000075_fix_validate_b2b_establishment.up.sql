-- Migration 000075 — FIX validate_b2b_establishment : structure mismatch 42804
-- Task ID: SECT-B2B-VALIDATE-FIX-1
--
-- Bug : impossible de valider l'essai d'une nouvelle inscription B2B.
-- L'admin clique "Valider" → HTTP 500 "erreur: ERROR: structure of query does
-- not match function result type (SQLSTATE 42804)".
--
-- Cause racine :
--   La fonction validate_b2b_establishment() déclare son retour avec
--   o_date_fin timestamp WITHOUT time zone, mais le RETURN QUERY final fait :
--     RETURN QUERY SELECT true, v_abo_id, 'ESSAI'::text,
--       NOW() + INTERVAL '14 days',   -- ← timestamp WITH time zone !
--       '...'::text;
--   PostgreSQL refuse le mismatch timestamptz → timestamp au moment d'exécuter
--   ce RETURN QUERY (uniquement sur le chemin succès, pas sur les chemins
--   d'erreur qui utilisent NULL::timestamp correctement typé).
--
--   Conséquence : toute validation d'un établissement réellement éligible
--   (emailVerified=true, adminValidated=false, abonnement EN_ATTENTE_VALIDATION)
--   échoue en 42804. Seules les validations d'établissements inexistants /
--   non vérifiés "fonctionnaient" (retour prématuré avant le RETURN QUERY final).
--
-- Fix : caster NOW() + INTERVAL '14 days' en timestamp (without time zone)
--   dans le RETURN QUERY final, pour matcher exactement la signature déclarée.
--   On en profite pour uniformiser : le SELECT interne utilise aussi NOW()+INTERVAL
--   pour mettre à jour Abonnement.dateFin, mais comme Abonnement.dateFin est
--   timestamp without time zone, PostgreSQL fait la conversion implicite
--   (aucune erreur là). Seul le RETURN QUERY final exige un cast explicite car
--   il doit matcher la signature TABLE(...) de la fonction.
--
-- Approche : CREATE OR REPLACE FUNCTION avec le corps corrigé.
-- La signature reste identique (mêmes colonnes, mêmes types) → pas de casse
-- pour les appelants Go (b2b_anti_abus.go:validateB2BEstablishment).
--
-- Auteur : udevrard7 <ulrichdouh@gmail.com>

-- ═══ Remplacement de la fonction avec cast explicite ::timestamp ═══
CREATE OR REPLACE FUNCTION public.validate_b2b_establishment(
  p_etablissement_id text
)
RETURNS TABLE(
  o_success boolean,
  o_abonnement_id text,
  o_statut text,
  o_date_fin timestamp without time zone,
  o_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_abo_id text;
  v_email_verified boolean;
  v_admin_validated boolean;
  v_date_fin timestamp without time zone;
BEGIN
  SELECT "emailVerified", "adminValidated"
  INTO v_email_verified, v_admin_validated
  FROM "Etablissement" WHERE "id" = p_etablissement_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ''::text, ''::text, NULL::timestamp, 'Établissement introuvable'::text;
    RETURN;
  END IF;

  IF NOT v_email_verified THEN
    RETURN QUERY SELECT false, ''::text, ''::text, NULL::timestamp, 'Email non vérifié par le responsable'::text;
    RETURN;
  END IF;

  IF v_admin_validated THEN
    RETURN QUERY SELECT false, ''::text, ''::text, NULL::timestamp, 'Déjà validé'::text;
    RETURN;
  END IF;

  -- Marquer comme validé par l'admin
  UPDATE "Etablissement" SET "adminValidated" = true, "updatedAt" = NOW()
  WHERE "id" = p_etablissement_id;

  -- Passer l'abonnement EN_ATTENTE_VALIDATION → ESSAI (14 jours)
  SELECT "id" INTO v_abo_id
  FROM "Abonnement"
  WHERE "etablissementId" = p_etablissement_id
    AND "statut" = 'EN_ATTENTE_VALIDATION'
    AND "deletedAt" IS NULL
  ORDER BY "createdAt" DESC LIMIT 1;

  IF v_abo_id IS NULL THEN
    RETURN QUERY SELECT false, ''::text, ''::text, NULL::timestamp, 'Aucun abonnement en attente'::text;
    RETURN;
  END IF;

  -- Date de fin d'essai = NOW() + 14 jours, castée en timestamp (without time zone)
  -- pour matcher la signature de la fonction et la colonne Abonnement.dateFin.
  v_date_fin := (NOW() + INTERVAL '14 days')::timestamp;

  UPDATE "Abonnement"
  SET "statut" = 'ESSAI'::"StatutAbonnement",
      "dateFin" = v_date_fin,
      "updatedAt" = NOW()
  WHERE "id" = v_abo_id;

  RETURN QUERY SELECT true, v_abo_id, 'ESSAI'::text,
    v_date_fin,
    'Établissement validé. Période d''essai de 14 jours démarrée.'::text;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_b2b_establishment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_b2b_establishment(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.validate_b2b_establishment(text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.validate_b2b_establishment(text) TO PUBLIC;
