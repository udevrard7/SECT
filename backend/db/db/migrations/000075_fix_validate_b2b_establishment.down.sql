-- Migration 000075 (DOWN) — Restaure la version bugée de validate_b2b_establishment
-- Task ID: SECT-B2B-VALIDATE-FIX-1
--
-- Rollback : recrée la fonction avec le corps original (bug 42804 présent).
-- À n'utiliser que si le fix introduit une régression.
-- Auteur : udevrard7 <ulrichdouh@gmail.com>

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

  UPDATE "Etablissement" SET "adminValidated" = true, "updatedAt" = NOW()
  WHERE "id" = p_etablissement_id;

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

  UPDATE "Abonnement"
  SET "statut" = 'ESSAI'::"StatutAbonnement",
      "dateFin" = NOW() + INTERVAL '14 days',
      "updatedAt" = NOW()
  WHERE "id" = v_abo_id;

  RETURN QUERY SELECT true, v_abo_id, 'ESSAI'::text,
    NOW() + INTERVAL '14 days',
    'Établissement validé. Période d''essai de 14 jours démarrée.'::text;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_b2b_establishment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_b2b_establishment(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.validate_b2b_establishment(text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.validate_b2b_establishment(text) TO PUBLIC;
