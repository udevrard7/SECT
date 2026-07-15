-- Migration 000063 — Facture auto + email à la confirmation de paiement B2C
-- Task ID: SECT-FACTURE-EMAIL
--
-- Objectif : quand un paiement Wave est confirmé (webhook GeniusPay ou polling),
-- créer automatiquement une facture PAYEE et l'envoyer par email au prof B2C.
--
-- 1. Colonne Abonnement.factureId : lie l'abonnement à sa facture (1:1).
--    Nullable car les abonnements Solo (gratuits) et B2B n'ont pas de facture.
-- 2. Fonction create_b2c_facture(p_abonnement_id) : crée la facture (idempotente)
--    avec numero auto, montant depuis le plan, statut PAYEE, et lie à l'abonnement.

-- ═══ 1. Colonne factureId sur Abonnement ═══
ALTER TABLE "Abonnement" ADD COLUMN IF NOT EXISTS "factureId" TEXT;

-- Index pour lookup rapide (rare mais utile pour les reports)
CREATE INDEX IF NOT EXISTS "Abonnement_factureId_idx"
    ON "Abonnement" ("factureId")
    WHERE "factureId" IS NOT NULL;

-- ═══ 2. Fonction create_b2c_facture ═══
-- Crée une facture PAYEE pour un abonnement B2C dont le paiement vient d'être
-- confirmé. Idempotente : si l'abonnement a déjà une facture, retourne l'existante.
--
-- Numéro de facture : FAC-YYYY-XXXXX (incrémental par année).
-- Montant : prixMensuel du plan (HT = montant / 1.20, TVA 20%, TTC = montant).
--   Note : le prixMensuel est stocké TTC côté SECT (4900 FCFA = prix payé).
--   On calcule HT = TTC / 1.20 pour la facture.
-- Statut : PAYEE (le paiement est déjà confirmé par GeniusPay).
-- Mode : 'wave' (le seul mode B2C pour l'instant).
-- Reference : geniuspayReference de l'abonnement.
--
-- SECURITY DEFINER : bypass RLS (appelé par le backend avec claims system).
CREATE OR REPLACE FUNCTION public.create_b2c_facture(
  p_abonnement_id text
)
RETURNS TABLE(
  o_facture_id text,
  o_numero text,
  o_montant_ht double precision,
  o_montant_ttc double precision,
  o_already_exists boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_facture_id text;
  v_plan_id text;
  v_etab_id text;
  v_plan_prix double precision;
  v_plan_nom text;
  v_periode text;
  v_montant_ttc double precision;
  v_montant_ht double precision;
  v_tva double precision := 20.0;
  v_facture_id text;
  v_numero text;
  v_annee text;
  v_seq int;
  v_geniuspay_ref text;
  v_date_fin timestamp without time zone;
  v_date_debut timestamp without time zone;
  v_lignes jsonb;
  v_existing_numero text;
  v_existing_ht double precision;
  v_existing_ttc double precision;
BEGIN
  -- 0. Vérifier que l'abonnement existe + récupérer les infos
  SELECT a."etablissementId", a."planId", COALESCE(a."periodeAbonnement", 'mensuel'),
         p."prixMensuel", p."nom", COALESCE(a."geniuspayReference", ''),
         a."dateDebut", a."dateFin", COALESCE(a."factureId", '')
  INTO v_etab_id, v_plan_id, v_periode, v_plan_prix, v_plan_nom, v_geniuspay_ref,
       v_date_debut, v_date_fin, v_existing_facture_id
  FROM "Abonnement" a
  JOIN "Plan" p ON p."id" = a."planId"
  WHERE a."id" = p_abonnement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABONNEMENT_NOT_FOUND';
  END IF;

  -- 1. Idempotence : si l'abonnement a déjà une facture, retourner l'existante
  IF v_existing_facture_id IS NOT NULL AND v_existing_facture_id <> '' THEN
    SELECT "id", "numero", "montantHt", "montantTtc"
    INTO v_facture_id, v_existing_numero, v_existing_ht, v_existing_ttc
    FROM "Facture" WHERE "id" = v_existing_facture_id;

    IF v_facture_id IS NOT NULL THEN
      RETURN QUERY SELECT v_facture_id, v_existing_numero, v_existing_ht, v_existing_ttc, true;
      RETURN;
    END IF;
  END IF;

  -- 2. Calculer les montants
  -- prixMensuel = 4900 FCFA TTC. HT = TTC / (1 + TVA/100) = 4900 / 1.20 = 4083.33
  v_montant_ttc := v_plan_prix;
  v_montant_ht := ROUND((v_montant_ttc / (1 + v_tva / 100.0))::numeric, 2);

  -- 3. Générer le numéro de facture : FAC-YYYY-XXXXX
  v_annee := EXTRACT(YEAR FROM NOW())::text;
  -- Séquence simple : count des factures de l'année + 1 (pas parfait mais suffisant)
  SELECT count(*) + 1 INTO v_seq
  FROM "Facture"
  WHERE "numero" LIKE 'FAC-' || v_annee || '-%';

  v_numero := 'FAC-' || v_annee || '-' || lpad(v_seq::text, 5, '0');

  -- 4. Générer l'ID
  v_facture_id := 'fac_b2c_' || replace(gen_random_uuid()::text, '-', '');

  -- 5. Lignes de facture (JSON)
  v_lignes := jsonb_build_array(
    jsonb_build_object(
      'description', 'Abonnement ' || v_plan_nom || ' (' || v_periode || ')',
      'montant', v_montant_ttc
    )
  );

  -- 6. Créer la facture (statut PAYEE)
  INSERT INTO "Facture" (
    "id", "numero", "abonnementId", "etablissementId",
    "montantHt", "tva", "montantTtc",
    "statut", "dateEmission", "dateEcheance", "datePaiement",
    "modePaiement", "referencePaiement", "lignes",
    "createdAt", "updatedAt"
  ) VALUES (
    v_facture_id, v_numero, p_abonnement_id, v_etab_id,
    v_montant_ht, v_tva, v_montant_ttc,
    'PAYEE', NOW(), NOW(), NOW(),
    'wave', v_geniuspay_ref, v_lignes::text,
    NOW(), NOW()
  );

  -- 7. Lier la facture à l'abonnement
  UPDATE "Abonnement"
  SET "factureId" = v_facture_id, "updatedAt" = NOW()
  WHERE "id" = p_abonnement_id;

  -- 8. Retourner
  RETURN QUERY SELECT v_facture_id, v_numero, v_montant_ht, v_montant_ttc, false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_b2c_facture FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_b2c_facture TO neondb_owner;

-- ═══ 3. Fonction renew_b2c_subscription (renouvellement) ═══
-- Prolonge un abonnement ACTIF de 30 jours après paiement de renouvellement.
-- Appelée par le webhook/polling quand metadata.renewal=true.
-- Idempotente : si déjà renouvelé avec la même référence, retourne success=false.
CREATE OR REPLACE FUNCTION public.renew_b2c_subscription(
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
  v_current_ref text;
  v_current_date_fin timestamp without time zone;
  v_new_date_fin timestamp without time zone;
BEGIN
  -- 1. Vérifier que l'abonnement existe + est ACTIF
  SELECT a."statut"::text, COALESCE(a."referenceTransaction", ''), a."dateFin"
  INTO v_current_statut, v_current_ref, v_current_date_fin
  FROM "Abonnement" a
  WHERE a."id" = p_abonnement_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, p_abonnement_id, 'NOT_FOUND'::text, NULL::timestamp;
    RETURN;
  END IF;

  IF v_current_statut <> 'ACTIF' THEN
    RETURN QUERY SELECT false, p_abonnement_id, v_current_statut, NULL::timestamp;
    RETURN;
  END IF;

  -- Idempotence : si la référence est la même que celle déjà enregistrée,
  -- le renouvellement a déjà été traité (webhook dupliqué).
  IF v_current_ref = p_reference_transaction THEN
    RETURN QUERY SELECT false, p_abonnement_id, v_current_statut, v_current_date_fin;
    RETURN;
  END IF;

  -- 2. Calculer la nouvelle date de fin.
  -- Si la dateFin actuelle est dans le futur, on prolonge depuis la dateFin
  -- (l'utilisateur ne perd pas les jours restants). Sinon, depuis NOW().
  IF v_current_date_fin > NOW() THEN
    v_new_date_fin := v_current_date_fin + INTERVAL '30 days';
  ELSE
    v_new_date_fin := NOW() + INTERVAL '30 days';
  END IF;

  -- 3. Mettre à jour l'abonnement
  UPDATE "Abonnement"
  SET "datePaiement" = NOW(),
      "dateFin" = v_new_date_fin,
      "methodePaiement" = p_methode_paiement,
      "referenceTransaction" = p_reference_transaction,
      "relanceEnvoyee" = false,  -- reset pour permettre la relance du prochain cycle
      "updatedAt" = NOW()
  WHERE "id" = p_abonnement_id;

  RETURN QUERY SELECT true, p_abonnement_id, 'ACTIF'::text, v_new_date_fin;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.renew_b2c_subscription FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renew_b2c_subscription TO neondb_owner;
