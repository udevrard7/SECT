-- Migration 000058 — Paiement B2C Prof Premium (statut EN_ATTENTE_PAIEMENT)
-- Task ID: SECT-B2C-PAIEMENT
--
-- Objectif : Prof Premium (4 900 FCFA/mois) nécessite un paiement avant activation.
-- L'abonnement est créé avec statut EN_ATTENTE_PAIEMENT, puis passe à ACTIF
-- après confirmation du paiement (endpoint /api/subscriptions/b2c/{id}/confirm-payment).
--
-- Prof Solo (gratuit) reste ACTIF directement (pas de paiement).
--
-- V1 : simulation de paiement (page factice "Payer 4 900 FCFA" → succès simulé).
-- V2 : intégration CinetPay (Mobile Money + cartes).

-- ═══ 1. Ajout statut EN_ATTENTE_PAIEMENT à l'enum ═══
ALTER TYPE "StatutAbonnement" ADD VALUE IF NOT EXISTS 'EN_ATTENTE_PAIEMENT';

-- ═══ 2. Colonnes paiement sur Abonnement ═══
ALTER TABLE "Abonnement" ADD COLUMN IF NOT EXISTS "methodePaiement" TEXT;
ALTER TABLE "Abonnement" ADD COLUMN IF NOT EXISTS "datePaiement" TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE "Abonnement" ADD COLUMN IF NOT EXISTS "referenceTransaction" TEXT;
ALTER TABLE "Abonnement" ADD COLUMN IF NOT EXISTS "periodeAbonnement" TEXT DEFAULT 'mensuel';
-- 'mensuel' = paiement manuel chaque mois, 'auto' = prélèvement automatique

-- ═══ 3. Recréer la fonction create_b2c_subscription avec logique paiement ═══
-- Prof Solo (prixMensuel = 0) → statut ACTIF directement
-- Prof Premium (prixMensuel > 0) → statut EN_ATTENTE_PAIEMENT
CREATE OR REPLACE FUNCTION public.create_b2c_subscription(
  p_plan_id text,
  p_user_name text,
  p_user_email text,
  p_user_password_hash text,
  p_ville text DEFAULT NULL,
  p_periode_abonnement text DEFAULT 'mensuel'
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
  o_abonnement_date_fin timestamp without time zone,
  o_abonnement_montant double precision,
  o_payment_required boolean
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
  v_statut text;
  v_payment_required boolean;
  v_montant double precision;
BEGIN
  -- 1. Valider le plan
  SELECT "branche", "actif", "prixMensuel", "prixAnnuel"
  INTO v_plan_branche, v_plan_actif, v_plan_prix_mensuel, v_plan_prix_annuel
  FROM "Plan" WHERE "id" = p_plan_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF v_plan_branche <> 'B2C' OR NOT v_plan_actif THEN
    RAISE EXCEPTION 'PLAN_NOT_B2C';
  END IF;

  -- 2. Anti-doublon email
  SELECT count(*) INTO v_existing_user_count
  FROM "User" WHERE "email" = lower(trim(p_user_email));
  IF v_existing_user_count > 0 THEN RAISE EXCEPTION 'EMAIL_EXISTS'; END IF;

  -- 3. Générer les IDs
  v_user_id := 'usr_b2c_' || replace(gen_random_uuid()::text, '-', '');
  v_etab_id := 'etab_b2c_' || replace(gen_random_uuid()::text, '-', '');
  v_abo_id := 'abo_b2c_' || replace(gen_random_uuid()::text, '-', '');

  -- 4. Créer l'Etablissement personnel
  v_etab_nom := 'Espace personnel — ' || p_user_name;
  INSERT INTO "Etablissement" (
    "id", "nom", "type", "ville", "pays", "actif",
    "certWatermarkEnabled", "certWatermarkOpacity", "createdAt", "updatedAt"
  ) VALUES (
    v_etab_id, v_etab_nom, 'PERSONNEL', p_ville, 'Côte d''Ivoire', true,
    false, 0.1, NOW(), NOW()
  );

  -- 5. Créer le User ENSEIGNANT
  INSERT INTO "User" (
    "id", "email", "name", "password", "role",
    "etablissementId", "actif", "mustChangePwd", "loginAttempts",
    "createdAt", "updatedAt"
  ) VALUES (
    v_user_id, lower(trim(p_user_email)), p_user_name, p_user_password_hash,
    'ENSEIGNANT'::"Role", v_etab_id, true, false, 0, NOW(), NOW()
  );

  -- 6. Déterminer le statut selon le plan
  -- Prof Solo (gratuit) → ACTIF, pas de paiement requis
  -- Prof Premium (payant) → EN_ATTENTE_PAIEMENT, paiement requis
  IF v_plan_prix_mensuel = 0 THEN
    v_statut := 'ACTIF';
    v_payment_required := false;
    v_date_fin := NULL; -- gratuit, pas d'expiration
    v_montant := 0;
  ELSE
    v_statut := 'EN_ATTENTE_PAIEMENT';
    v_payment_required := true;
    v_date_fin := NOW() + INTERVAL '24 hours'; -- 24h pour payer, sinon annulé
    v_montant := v_plan_prix_mensuel;
  END IF;

  -- 7. Créer l'Abonnement
  INSERT INTO "Abonnement" (
    "id", "etablissementId", "planId", "statut",
    "dateDebut", "dateFin", "periodeEssaiJours", "montantPaye",
    "renouvellementAuto", "periodeAbonnement", "createdAt", "updatedAt"
  ) VALUES (
    v_abo_id, v_etab_id, p_plan_id, v_statut::"StatutAbonnement",
    NOW(), v_date_fin, 0, v_montant,
    p_periode_abonnement = 'auto', p_periode_abonnement, NOW(), NOW()
  );

  -- 8. Retourner le résultat
  RETURN QUERY SELECT
    v_user_id, lower(trim(p_user_email)), p_user_name, 'ENSEIGNANT'::text,
    v_etab_id, v_etab_nom, v_abo_id, v_statut, v_date_fin, v_montant, v_payment_required;
END;
$function$;

-- ═══ 4. Fonction confirm_b2c_payment — confirme le paiement et active l'abo ═══
-- Appelée après paiement réussi (V1 simulation, V2 CinetPay webhook).
-- Passe le statut de EN_ATTENTE_PAIEMENT → ACTIF et pose datePaiement + referenceTransaction.
CREATE OR REPLACE FUNCTION public.confirm_b2c_payment(
  p_abonnement_id text,
  p_methode_paiement text,
  p_reference_transaction text
)
RETURNS TABLE(
  o_success boolean,
  o_abonnement_id text,
  o_statut text,
  o_date_fin timestamp without time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_statut text;
  v_plan_prix_mensuel double precision;
  v_periode_auto boolean;
  v_new_date_fin timestamp without time zone;
BEGIN
  -- 1. Vérifier que l'abonnement existe et est EN_ATTENTE_PAIEMENT
  SELECT a."statut"::text, p."prixMensuel", a."renouvellementAuto"
  INTO v_current_statut, v_plan_prix_mensuel, v_periode_auto
  FROM "Abonnement" a
  JOIN "Plan" p ON p."id" = a."planId"
  WHERE a."id" = p_abonnement_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, p_abonnement_id, 'NOT_FOUND'::text, NULL::timestamp;
    RETURN;
  END IF;

  IF v_current_statut <> 'EN_ATTENTE_PAIEMENT' THEN
    RETURN QUERY SELECT false, p_abonnement_id, v_current_statut, NULL::timestamp;
    RETURN;
  END IF;

  -- 2. Calculer la nouvelle date de fin (+30j mensuel)
  v_new_date_fin := NOW() + INTERVAL '30 days';

  -- 3. Activer l'abonnement + enregistrer le paiement
  UPDATE "Abonnement"
  SET "statut" = 'ACTIF'::"StatutAbonnement",
      "datePaiement" = NOW(),
      "dateFin" = v_new_date_fin,
      "methodePaiement" = p_methode_paiement,
      "referenceTransaction" = p_reference_transaction,
      "updatedAt" = NOW()
  WHERE "id" = p_abonnement_id;

  RETURN QUERY SELECT true, p_abonnement_id, 'ACTIF'::text, v_new_date_fin;
END;
$function$;

-- ═══ 5. Permissions ═══
REVOKE EXECUTE ON FUNCTION public.create_b2c_subscription FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_b2c_subscription TO PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_b2c_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_b2c_payment TO PUBLIC;
