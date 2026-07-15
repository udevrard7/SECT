-- Migration 000070 — B2B multi-méthodes de paiement
-- Task ID: SECT-B2B-PAYMENT-METHODS
--
-- En B2B, les établissements paient par virement bancaire, chèque, espèces ou Wave.
-- La facture fait office de preuve de paiement. L'admin confirme manuellement
-- (sauf Wave qui est automatique via webhook).
--
-- Recrée create_b2b_facture avec 2 nouveaux paramètres :
--   p_mode_paiement : 'virement' | 'cheque' | 'especes' | 'wave' | 'mobile_money'
--   p_reference_paiement : référence du paiement (n° chèque, n° virement, etc.)

DROP FUNCTION IF EXISTS public.create_b2b_facture(text);

CREATE OR REPLACE FUNCTION public.create_b2b_facture(
  p_abonnement_id text,
  p_mode_paiement text DEFAULT 'virement',
  p_reference_paiement text DEFAULT ''
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
  v_mode text;
  v_ref text;
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
  SELECT * INTO v_montant_ht, v_montant_ttc, v_nb_etudiants, v_prix_par, v_plan_nom
  FROM calculate_b2b_capitation(v_etab_id);

  -- 3. Normaliser le mode de paiement
  v_mode := COALESCE(NULLIF(TRIM(p_mode_paiement), ''), 'virement');
  v_ref := COALESCE(NULLIF(TRIM(p_reference_paiement), ''), v_mode || '-' || EXTRACT(YEAR FROM NOW())::text);

  -- 4. Générer le numéro de facture
  v_annee := EXTRACT(YEAR FROM NOW())::text;
  SELECT count(*) + 1 INTO v_seq FROM "Facture" WHERE "numero" LIKE 'FAC-' || v_annee || '-%';
  v_numero := 'FAC-' || v_annee || '-' || lpad(v_seq::text, 5, '0');

  -- 5. ID + lignes
  v_facture_id := 'fac_b2b_' || replace(gen_random_uuid()::text, '-', '');
  v_lignes := jsonb_build_array(
    jsonb_build_object(
      'description', 'Abonnement ' || v_plan_nom || ' — Capitation ' || v_nb_etudiants || ' étudiants × ' || v_prix_par || ' FCFA/an',
      'montant', v_montant_ttc
    )
  );

  -- 6. Créer la facture avec le mode de paiement spécifié
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
    v_mode, v_ref, v_lignes::text,
    NOW(), NOW()
  );

  -- 7. Lier + stocker le nombre d'étudiants payés + mode de paiement
  UPDATE "Abonnement"
  SET "factureId" = v_facture_id,
      "nbrEtudiantsPayes" = v_nb_etudiants,
      "montantPaye" = v_montant_ttc,
      "modePaiement" = v_mode,
      "referenceTransaction" = v_ref,
      "updatedAt" = NOW()
  WHERE "id" = p_abonnement_id;

  RETURN QUERY SELECT v_facture_id, v_numero, v_montant_ht, v_montant_ttc, v_nb_etudiants, false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_b2b_facture(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_b2b_facture(text, text, text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.create_b2b_facture(text, text, text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.create_b2b_facture(text, text, text) TO PUBLIC;
