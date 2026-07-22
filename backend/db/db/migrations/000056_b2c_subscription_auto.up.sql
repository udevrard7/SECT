-- Migration 000056 — Souscription B2C auto (étab personnel + user + abonnement)
-- Task ID: SECT-B2C-SOUSCRIPTION-AUTO
--
-- Objectif : Permettre à un enseignant freelance de s'inscrire seul (sans auth,
-- sans admin) à un plan B2C (Prof Solo / Prof Premium). Le système crée
-- automatiquement :
--   1. Un Etablissement "personnel" (type PERSONNEL)
--   2. Un User ENSEIGNANT rattaché à cet étab
--   3. Un Abonnement ACTIF liant l'étab au plan B2C
-- Le tout en une transaction atomique via une fonction SECURITY DEFINER.
--
-- Sécurité :
--   - Anti-doublon : si un User avec l'email existe déjà → ConflictError.
--   - Plan doit être actif ET branche='B2C' (sinon → erreur).
--   - Mot de passe hashé bcrypt côté backend (passé en paramètre déjà hashé).
--   - Fonction SECURITY DEFINER pour bypass RLS (création sans auth).

-- ═══ 1. Ajout type 'PERSONNEL' pour Etablissement (si enum) ═══
-- Etablissement.type est TEXT (pas enum), donc pas besoin de modification.

-- ═══ 2. Fonction SECURITY DEFINER create_b2c_subscription ═══
CREATE OR REPLACE FUNCTION public.create_b2c_subscription(
  p_plan_id text,
  p_user_name text,
  p_user_email text,
  p_user_password_hash text,
  p_ville text DEFAULT NULL
)
RETURNS TABLE(
  o_user_id text,
  o_user_email text,
  o_user_name text,
  o_user_role text,
  o_etablissement_id text,
  o_etablissement_nom text,
  o_abonnement_id text,
  o_abonnement_statut text,
  o_abonnement_date_fin timestamp without time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id text;
  v_etab_id text;
  v_abo_id text;
  v_plan_branche text;
  v_plan_actif boolean;
  v_plan_prix_mensuel double precision;
  v_plan_prix_annuel double precision;
  v_date_fin timestamp without time zone;
  v_etab_nom text;
  v_existing_user_count int;
BEGIN
  -- 1. Valider le plan : doit être actif ET branche='B2C'
  SELECT "branche", "actif", "prixMensuel", "prixAnnuel"
  INTO v_plan_branche, v_plan_actif, v_plan_prix_mensuel, v_plan_prix_annuel
  FROM "Plan"
  WHERE "id" = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND';
  END IF;
  IF v_plan_branche <> 'B2C' OR NOT v_plan_actif THEN
    RAISE EXCEPTION 'PLAN_NOT_B2C';
  END IF;

  -- 2. Anti-doublon : vérifier que l'email n'existe pas déjà
  SELECT count(*) INTO v_existing_user_count
  FROM "User"
  WHERE "email" = lower(trim(p_user_email));

  IF v_existing_user_count > 0 THEN
    RAISE EXCEPTION 'EMAIL_EXISTS';
  END IF;

  -- 3. Générer les IDs (CUID-like via gen_random_uuid)
  v_user_id := 'usr_b2c_' || replace(gen_random_uuid()::text, '-', '');
  v_etab_id := 'etab_b2c_' || replace(gen_random_uuid()::text, '-', '');
  v_abo_id := 'abo_b2c_' || replace(gen_random_uuid()::text, '-', '');

  -- 4. Créer l'Etablissement personnel
  v_etab_nom := 'Espace personnel — ' || p_user_name;
  INSERT INTO "Etablissement" (
    "id", "nom", "type", "ville", "pays", "actif",
    "certWatermarkEnabled", "certWatermarkOpacity",
    "createdAt", "updatedAt"
  ) VALUES (
    v_etab_id, v_etab_nom, 'PERSONNEL', p_ville, 'Côte d''Ivoire', true,
    false, 0.1,
    NOW(), NOW()
  );

  -- 5. Créer le User ENSEIGNANT (rattaché à l'étab personnel)
  INSERT INTO "User" (
    "id", "email", "name", "password", "role",
    "etablissementId", "actif", "mustChangePwd",
    "loginAttempts", "createdAt", "updatedAt"
  ) VALUES (
    v_user_id,
    lower(trim(p_user_email)),
    p_user_name,
    p_user_password_hash,
    'ENSEIGNANT'::"Role",
    v_etab_id,
    true,
    false,
    0,
    NOW(), NOW()
  );

  -- 6. Calculer la date de fin d'abonnement
  -- B2C : pour Prof Solo (gratuit) → pas de date de fin (null = illimité).
  -- Pour Prof Premium (payant) → +30 jours (mensuel par défaut).
  IF v_plan_prix_mensuel = 0 THEN
    v_date_fin := NULL; -- gratuit, pas d'expiration
  ELSE
    v_date_fin := NOW() + INTERVAL '30 days';
  END IF;

  -- 7. Créer l'Abonnement (statut ACTIF directement, pas d'essai pour B2C)
  INSERT INTO "Abonnement" (
    "id", "etablissementId", "planId", "statut",
    "dateDebut", "dateFin", "periodeEssaiJours",
    "montantPaye", "renouvellementAuto",
    "createdAt", "updatedAt"
  ) VALUES (
    v_abo_id,
    v_etab_id,
    p_plan_id,
    'ACTIF'::"StatutAbonnement",
    NOW(),
    v_date_fin,
    0, -- pas de période d'essai en B2C
    v_plan_prix_mensuel,
    v_plan_prix_mensuel > 0, -- renouvellement auto seulement si payant
    NOW(), NOW()
  );

  -- 8. Retourner le résultat
  RETURN QUERY SELECT
    v_user_id,
    lower(trim(p_user_email)),
    p_user_name,
    'ENSEIGNANT'::text,
    v_etab_id,
    v_etab_nom,
    v_abo_id,
    'ACTIF'::text,
    v_date_fin;
END;
$function$;

-- ═══ 3. Revoke public execute, grant explicit (sécurité) ═══
REVOKE EXECUTE ON FUNCTION public.create_b2c_subscription FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_b2c_subscription TO neondb_owner;
