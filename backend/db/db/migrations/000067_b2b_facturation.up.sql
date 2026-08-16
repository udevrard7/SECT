-- Migration 000067 — Facturation capitation B2B automatique
-- Task ID: SECT-B2B-FACTURATION
--
-- Objectif : automatiser la facturation du modèle capitation B2B.
-- montant = max(nbEtudiantsActuels, 50) × prixAnnuel (900 FCFA/étudiant/an)
--
-- 1. Colonne nbrEtudiantsPayes sur Abonnement : nombre d'étudiants sur lequel
--    la facture a été calculée. Permet la régularisation si le nombre augmente.
-- 2. Fonction calculate_b2b_capitation : calcule le montant capitation
-- 3. Fonction create_b2b_facture : crée une facture PAYEE pour un abonnement B2B
--    (similaire à create_b2c_facture mais avec le calcul capitation)

-- ═══ 1. Colonne nbrEtudiantsPayes ═══
ALTER TABLE "Abonnement" ADD COLUMN IF NOT EXISTS "nbrEtudiantsPayes" INTEGER;

-- ═══ 2. Fonction calculate_b2b_capitation ═══
-- Calcule le montant capitation pour un établissement.
-- montant = max(nbEtudiantsActifs, plancher) × prixAnnuel
-- Le plancher est 50 (minimum de étudiants facturables en B2B).
CREATE OR REPLACE FUNCTION public.calculate_b2b_capitation(
  p_etablissement_id text
)
RETURNS TABLE(
  o_montant_ht double precision,
  o_montant_ttc double precision,
  o_nb_etudiants integer,
  o_prix_par_etudiant double precision,
  o_plan_nom text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id text;
  v_prix_annuel double precision;
  v_plan_nom text;
  v_nb_etudiants int;
  v_nb_facturable int;
  v_montant_ttc double precision;
  v_montant_ht double precision;
  v_tva double precision := 20.0;
BEGIN
  -- 1. Récupérer le plan B2B actif de l'établissement
  SELECT a."planId", p."prixAnnuel", p."nom"
  INTO v_plan_id, v_prix_annuel, v_plan_nom
  FROM "Abonnement" a
  JOIN "Plan" p ON p."id" = a."planId"
  WHERE a."etablissementId" = p_etablissement_id
    AND a."statut" IN ('ACTIF', 'ESSAI')
    AND a."deletedAt" IS NULL
  ORDER BY a."createdAt" DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0.0, 0.0, 0, 0.0, ''::text;
    RETURN;
  END IF;

  -- 2. Compter les étudiants actifs de l'établissement
  SELECT count(*) INTO v_nb_etudiants
  FROM "User"
  WHERE "etablissementId" = p_etablissement_id
    AND "role" = 'ETUDIANT'
    AND "actif" = true;

  -- 3. Plancher de 50 étudiants (minimum facturable)
  v_nb_facturable := GREATEST(v_nb_etudiants, 50);

  -- 4. Calculer le montant
  v_montant_ttc := v_nb_facturable * v_prix_annuel;
  v_montant_ht := ROUND((v_montant_ttc / (1 + v_tva / 100.0))::numeric, 2);

  RETURN QUERY SELECT v_montant_ht, v_montant_ttc, v_nb_facturable, v_prix_annuel, v_plan_nom;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.calculate_b2b_capitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_b2b_capitation(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.calculate_b2b_capitation(text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.calculate_b2b_capitation(text) TO PUBLIC;

-- ═══ 3. Fonction create_b2b_facture ═══
-- Crée une facture PAYEE pour un abonnement B2B avec le calcul capitation.
-- Idempotente : si l'abonnement a déjà une facture, retourne l'existante.
CREATE OR REPLACE FUNCTION public.create_b2b_facture(
  p_abonnement_id text
)
RETURNS TABLE(
  o_facture_id text,
  o_numero text,
  o_montant_ht double precision,
  o_montant_ttc double precision,
  o_nb_etudiants integer,
  o_already_exists boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_facture_id text;
  v_etab_id text;
  v_plan_nom text;
  v_montant_ht double precision;
  v_montant_ttc double precision;
  v_nb_etudiants int;
  v_prix_par double precision;
  v_facture_id text;
  v_numero text;
  v_annee text;
  v_seq int;
  v_lignes jsonb;
  v_existing_numero text;
  v_existing_ht double precision;
  v_existing_ttc double precision;
  v_existing_nb int;
BEGIN
  -- 0. Vérifier l'abonnement + récupérer l'étab
  SELECT a."etablissementId", COALESCE(a."factureId", '')
  INTO v_etab_id, v_existing_facture_id
  FROM "Abonnement" a
  WHERE a."id" = p_abonnement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABONNEMENT_NOT_FOUND';
  END IF;

  -- 1. Idempotence
  IF v_existing_facture_id IS NOT NULL AND v_existing_facture_id <> '' THEN
    SELECT "id", "numero", "montantHt", "montantTtc"
    INTO v_facture_id, v_existing_numero, v_existing_ht, v_existing_ttc
    FROM "Facture" WHERE "id" = v_existing_facture_id;

    IF v_facture_id IS NOT NULL THEN
      RETURN QUERY SELECT v_facture_id, v_existing_numero, v_existing_ht, v_existing_ttc,
        COALESCE((SELECT "nbrEtudiantsPayes" FROM "Abonnement" WHERE "id" = p_abonnement_id), 0), true;
      RETURN;
    END IF;
  END IF;

  -- 2. Calculer la capitation
  SELECT o_montant_ht, o_montant_ttc, o_nb_etudiants, o_prix_par_etudiant, o_plan_nom
  INTO v_montant_ht, v_montant_ttc, v_nb_etudiants, v_prix_par, v_plan_nom
  FROM calculate_b2b_capitation(v_etab_id);

  -- 3. Générer le numéro de facture
  v_annee := EXTRACT(YEAR FROM NOW())::text;
  SELECT count(*) + 1 INTO v_seq FROM "Facture" WHERE "numero" LIKE 'FAC-' || v_annee || '-%';
  v_numero := 'FAC-' || v_annee || '-' || lpad(v_seq::text, 5, '0');

  -- 4. ID + lignes
  v_facture_id := 'fac_b2b_' || replace(gen_random_uuid()::text, '-', '');
  v_lignes := jsonb_build_array(
    jsonb_build_object(
      'description', 'Abonnement ' || v_plan_nom || ' — Capitation ' || v_nb_etudiants || ' étudiants × ' || v_prix_par || ' FCFA/an',
      'montant', v_montant_ttc
    )
  );

  -- 5. Créer la facture (statut PAYEE — le paiement est confirmé par l'admin)
  INSERT INTO "Facture" (
    "id", "numero", "abonnementId", "etablissementId",
    "montantHt", "tva", "montantTtc",
    "statut", "dateEmission", "dateEcheance", "datePaiement",
    "modePaiement", "referencePaiement", "lignes",
    "createdAt", "updatedAt"
  ) VALUES (
    v_facture_id, v_numero, p_abonnement_id, v_etab_id,
    v_montant_ht, 20.0, v_montant_ttc,
    'PAYEE', NOW(), NOW(), NOW(),
    'admin', 'B2B-CAP-' || v_annee, v_lignes::text,
    NOW(), NOW()
  );

  -- 6. Lier + stocker le nombre d'étudiants payés
  UPDATE "Abonnement"
  SET "factureId" = v_facture_id,
      "nbrEtudiantsPayes" = v_nb_etudiants,
      "montantPaye" = v_montant_ttc,
      "updatedAt" = NOW()
  WHERE "id" = p_abonnement_id;

  RETURN QUERY SELECT v_facture_id, v_numero, v_montant_ht, v_montant_ttc, v_nb_etudiants, false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_b2b_facture(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_b2b_facture(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.create_b2b_facture(text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.create_b2b_facture(text) TO PUBLIC;
