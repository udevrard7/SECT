-- Migration 000069 — Self-service B2B : fonction create_b2b_subscription
-- Task ID: SECT-B2B-FACTURATION
--
-- Permet à un établissement de s'inscrire lui-même (sans intervention admin).
-- Crée : Établissement + RESPONSABLE + abonnement ESSAI (14 jours).
-- L'admin valide ensuite (ESSAI → ACTIF) via updateAbonnement.

CREATE OR REPLACE FUNCTION public.create_b2b_subscription(
  p_etab_nom text,
  p_etab_type text,
  p_etab_ville text,
  p_etab_pays text,
  p_etab_telephone text,
  p_resp_name text,
  p_resp_email text,
  p_resp_password_hash text,
  p_nb_etudiants_estime integer DEFAULT 50
)
RETURNS TABLE(
  o_user_id text,
  o_user_email text,
  o_user_name text,
  o_etablissement_id text,
  o_etablissement_nom text,
  o_abonnement_id text,
  o_abonnement_statut text,
  o_essai_jours integer,
  o_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id text;
  v_etab_id text;
  v_abo_id text;
  v_existing_count int;
BEGIN
  -- 1. Anti-doublon email
  SELECT count(*) INTO v_existing_count
  FROM "User" WHERE "email" = lower(trim(p_resp_email));
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'EMAIL_EXISTS';
  END IF;

  -- 2. Générer les IDs
  v_user_id := 'usr_b2b_' || replace(gen_random_uuid()::text, '-', '');
  v_etab_id := 'etab_b2b_' || replace(gen_random_uuid()::text, '-', '');
  v_abo_id := 'abo_b2b_' || replace(gen_random_uuid()::text, '-', '');

  -- 3. Créer l'Établissement
  INSERT INTO "Etablissement" (
    "id", "nom", "type", "ville", "pays", "telephone", "actif",
    "certWatermarkEnabled", "certWatermarkOpacity", "createdAt", "updatedAt"
  ) VALUES (
    v_etab_id, p_etab_nom, COALESCE(p_etab_type, 'UNIVERSITE'),
    p_etab_ville, COALESCE(p_etab_pays, 'Côte d''Ivoire'), p_etab_telephone, true,
    false, 0.1, NOW(), NOW()
  );

  -- 4. Créer le RESPONSABLE
  INSERT INTO "User" (
    "id", "email", "name", "password", "role",
    "etablissementId", "actif", "mustChangePwd", "loginAttempts",
    "createdAt", "updatedAt"
  ) VALUES (
    v_user_id, lower(trim(p_resp_email)), p_resp_name, p_resp_password_hash,
    'RESPONSABLE'::"Role", v_etab_id, true, false, 0, NOW(), NOW()
  );

  -- 5. Créer l'abonnement ESSAI (14 jours)
  INSERT INTO "Abonnement" (
    "id", "etablissementId", "planId", "statut", "dateDebut", "dateFin",
    "periodeEssaiJours", "montantPaye", "renouvellementAuto",
    "nbrEtudiantsPayes", "createdAt", "updatedAt"
  ) VALUES (
    v_abo_id, v_etab_id, 'plan_b2b_institutionnel',
    'ESSAI'::"StatutAbonnement", NOW(), NOW() + INTERVAL '14 days',
    14, 0, false,
    p_nb_etudiants_estime, NOW(), NOW()
  );

  -- 6. Retourner
  RETURN QUERY SELECT
    v_user_id, lower(trim(p_resp_email)), p_resp_name,
    v_etab_id, p_etab_nom, v_abo_id,
    'ESSAI'::text, 14,
    'Inscription réussie. Votre période d''essai de 14 jours a commencé. Notre équipe vous contactera pour finaliser votre abonnement.'::text;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_b2b_subscription(text, text, text, text, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_b2b_subscription(text, text, text, text, text, text, text, text, integer) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.create_b2b_subscription(text, text, text, text, text, text, text, text, integer) TO sect_app;
GRANT EXECUTE ON FUNCTION public.create_b2b_subscription(text, text, text, text, text, text, text, text, integer) TO PUBLIC;
