-- Migration 000071 — Anti-abus B2B : validation email + admin + 1 essai/étab
-- Task ID: SECT-B2B-ANTI-ABUS
--
-- 5 solutions anti-abus :
-- 1. Vérification email obligatoire (token à cliquer)
-- 2. 1 seul ESSAI par établissement (nom + téléphone unique)
-- 3. 1 seul ESSAI par téléphone
-- 4. Validation admin avant ESSAI (statut EN_ATTENTE_VALIDATION)
-- 5. Email professionnel requis (bloquer gmail/yahoo/hotmail/outlook)

-- ═══ 1. Nouveau statut d'abonnement ═══
ALTER TYPE "StatutAbonnement" ADD VALUE IF NOT EXISTS 'EN_ATTENTE_VALIDATION';

-- ═══ 2. Colonnes sur Etablissement (vérification email + admin) ═══
ALTER TABLE "Etablissement" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Etablissement" ADD COLUMN IF NOT EXISTS "adminValidated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Etablissement" ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT;
ALTER TABLE "Etablissement" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

-- ═══ 3. Index pour anti-doublon (téléphone unique par établissement B2B) ═══
-- Un même téléphone ne peut pas être utilisé pour 2 établissements B2B
CREATE INDEX IF NOT EXISTS "Etablissement_telephone_idx"
    ON "Etablissement" ("telephone")
    WHERE "telephone" IS NOT NULL AND "type" <> 'PERSONNEL';

-- ═══ 4. Fonction create_b2b_subscription modifiée (anti-abus) ═══
DROP FUNCTION IF EXISTS public.create_b2b_subscription(text, text, text, text, text, text, text, text, integer);

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
  o_message text,
  o_verification_token text
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
  v_existing_etab int;
  v_existing_tel int;
  v_email_domain text;
  v_blocked_domains text[] := ARRAY['gmail.com','yahoo.com','yahoo.fr','hotmail.com','outlook.com','live.com','icloud.com','aol.com','mail.com','protonmail.com','tempmail.com'];
  v_token text;
BEGIN
  -- ═══ SOLUTION 5 : Email professionnel requis ═══
  v_email_domain := lower(split_part(p_resp_email, '@', 2));
  IF v_email_domain = ANY(v_blocked_domains) THEN
    RAISE EXCEPTION 'EMAIL_NOT_PROFESSIONAL';
  END IF;

  -- Anti-doublon email (déjà existant)
  SELECT count(*) INTO v_existing_count
  FROM "User" WHERE "email" = lower(trim(p_resp_email));
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'EMAIL_EXISTS';
  END IF;

  -- ═══ SOLUTION 2 : 1 seul essai par établissement (nom) ═══
  SELECT count(*) INTO v_existing_etab
  FROM "Etablissement" e
  JOIN "Abonnement" a ON a."etablissementId" = e."id"
  WHERE lower(e."nom") = lower(trim(p_etab_nom))
    AND a."statut" IN ('ESSAI', 'ACTIF', 'EN_ATTENTE_VALIDATION')
    AND a."deletedAt" IS NULL;
  IF v_existing_etab > 0 THEN
    RAISE EXCEPTION 'ETAB_ALREADY_EXISTS';
  END IF;

  -- ═══ SOLUTION 3 : 1 seul essai par téléphone ═══
  IF p_etab_telephone IS NOT NULL AND trim(p_etab_telephone) <> '' THEN
    SELECT count(*) INTO v_existing_tel
    FROM "Etablissement" e
    JOIN "Abonnement" a ON a."etablissementId" = e."id"
    WHERE e."telephone" = trim(p_etab_telephone)
      AND (e."type" IS NULL OR e."type" <> 'PERSONNEL')
      AND a."statut" IN ('ESSAI', 'ACTIF', 'EN_ATTENTE_VALIDATION')
      AND a."deletedAt" IS NULL;
    IF v_existing_tel > 0 THEN
      RAISE EXCEPTION 'PHONE_ALREADY_USED';
    END IF;
  END IF;

  -- Générer les IDs
  v_user_id := 'usr_b2b_' || replace(gen_random_uuid()::text, '-', '');
  v_etab_id := 'etab_b2b_' || replace(gen_random_uuid()::text, '-', '');
  v_abo_id := 'abo_b2b_' || replace(gen_random_uuid()::text, '-', '');
  v_token := replace(gen_random_uuid()::text, '-', '');

  -- Créer l'Établissement (emailVerified=false, adminValidated=false)
  INSERT INTO "Etablissement" (
    "id", "nom", "type", "ville", "pays", "telephone", "actif",
    "certWatermarkEnabled", "certWatermarkOpacity",
    "emailVerified", "adminValidated", "emailVerificationToken",
    "createdAt", "updatedAt"
  ) VALUES (
    v_etab_id, p_etab_nom, COALESCE(p_etab_type, 'UNIVERSITE'),
    p_etab_ville, COALESCE(p_etab_pays, 'Côte d''Ivoire'), p_etab_telephone, true,
    false, 0.1,
    false, false, v_token,
    NOW(), NOW()
  );

  -- Créer le RESPONSABLE (actif=false jusqu'à validation email)
  INSERT INTO "User" (
    "id", "email", "name", "password", "role",
    "etablissementId", "actif", "mustChangePwd", "loginAttempts",
    "createdAt", "updatedAt"
  ) VALUES (
    v_user_id, lower(trim(p_resp_email)), p_resp_name, p_resp_password_hash,
    'RESPONSABLE'::"Role", v_etab_id, false, false, 0, NOW(), NOW()
  );

  -- ═══ SOLUTION 4 : Abonnement EN_ATTENTE_VALIDATION (pas ESSAI direct) ═══
  INSERT INTO "Abonnement" (
    "id", "etablissementId", "planId", "statut", "dateDebut",
    "periodeEssaiJours", "montantPaye", "renouvellementAuto",
    "nbrEtudiantsPayes", "createdAt", "updatedAt"
  ) VALUES (
    v_abo_id, v_etab_id, 'plan_b2b_institutionnel',
    'EN_ATTENTE_VALIDATION'::"StatutAbonnement", NOW(),
    14, 0, false,
    p_nb_etudiants_estime, NOW(), NOW()
  );

  RETURN QUERY SELECT
    v_user_id, lower(trim(p_resp_email)), p_resp_name,
    v_etab_id, p_etab_nom, v_abo_id,
    'EN_ATTENTE_VALIDATION'::text,
    'Inscription reçue. Vérifiez votre email pour confirmer votre adresse, puis notre équipe validera votre établissement.'::text,
    v_token;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_b2b_subscription(text, text, text, text, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_b2b_subscription(text, text, text, text, text, text, text, text, integer) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.create_b2b_subscription(text, text, text, text, text, text, text, text, integer) TO sect_app;
GRANT EXECUTE ON FUNCTION public.create_b2b_subscription(text, text, text, text, text, text, text, text, integer) TO PUBLIC;

-- ═══ 5. Fonction verify_b2b_email (clic sur le lien email) ═══
CREATE OR REPLACE FUNCTION public.verify_b2b_email(
  p_token text
)
RETURNS TABLE(
  o_success boolean,
  o_etablissement_id text,
  o_etablissement_nom text,
  o_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_etab_id text;
  v_etab_nom text;
BEGIN
  SELECT "id", "nom" INTO v_etab_id, v_etab_nom
  FROM "Etablissement"
  WHERE "emailVerificationToken" = p_token AND "emailVerified" = false;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ''::text, ''::text, 'Token invalide ou déjà utilisé'::text;
    RETURN;
  END IF;

  UPDATE "Etablissement"
  SET "emailVerified" = true,
      "emailVerifiedAt" = NOW(),
      "emailVerificationToken" = NULL,
      "updatedAt" = NOW()
  WHERE "id" = v_etab_id;

  -- Activer le compte RESPONSABLE (peut se connecter mais établissement pas encore validé)
  UPDATE "User" SET "actif" = true, "updatedAt" = NOW()
  WHERE "etablissementId" = v_etab_id AND "role" = 'RESPONSABLE';

  RETURN QUERY SELECT true, v_etab_id, v_etab_nom,
    'Email vérifié. Notre équipe va valider votre établissement sous 24h.'::text;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.verify_b2b_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_b2b_email(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.verify_b2b_email(text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.verify_b2b_email(text) TO PUBLIC;

-- ═══ 6. Fonction validate_b2b_establishment (admin approuve → ESSAI démarre) ═══
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
