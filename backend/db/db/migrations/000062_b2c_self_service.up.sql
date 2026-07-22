-- Migration 000062 — B2C self-service : auto-setup structure + permissions ENSEIGNANT
-- Task ID: SECT-B2C-SELF-SERVICE
--
-- Problème : un prof B2C (Solo/Premium) est seul dans son étab PERSONNEL, sans
-- RESPONSABLE. create_b2c_subscription ne créait aucune structure pédagogique
-- (année, filière, UE) → le prof était bloqué : impossible de créer étudiants
-- ou évaluations. De plus, les routes CRUD filières/UE/étudiants exigeaient
-- RESPONSABLE/ADMIN → l'ENSEIGNANT ne pouvait rien créer.
--
-- Solution (Option A + B) :
-- A. Auto-setup : create_b2c_subscription crée automatiquement année académique
--    courante + filière "Mes classes" + UE "Cours par défaut" + affectations.
-- B. Permissions : nouvelle fonction is_enseignant_in_personal_etab() + policies
--    RLS qui autorisent l'ENSEIGNANT à créer/modifier filières, UE, étudiants
--    SI son établissement est de type PERSONNEL.

-- ═══════════════════════════════════════════════════════════════
-- 1. Fonction helper : is_enseignant_in_personal_etab()
-- ═══════════════════════════════════════════════════════════════
-- Retourne true si le current user est ENSEIGNANT ET son établissement est de
-- type PERSONNEL (B2C). Permet au prof B2C d'avoir les droits de création dans
-- SON espace personnel (sans toucher aux droits des enseignants B2B qui restent
-- gérés par leur RESPONSABLE).
CREATE OR REPLACE FUNCTION public.is_enseignant_in_personal_etab()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public SET row_security = off AS $$
DECLARE
  v_etab_id text;
  v_etab_type text;
BEGIN
  -- Récupérer l'étab du current user depuis les claims
  v_etab_id := current_etablissement_id();
  IF v_etab_id IS NULL THEN
    RETURN false;
  END IF;

  -- Vérifier que le current user est ENSEIGNANT
  IF NOT is_enseignant() THEN
    RETURN false;
  END IF;

  -- Récupérer le type de l'établissement
  SELECT "type" INTO v_etab_type FROM "Etablissement" WHERE "id" = v_etab_id;
  IF v_etab_type IS NULL THEN
    RETURN false;
  END IF;

  -- True uniquement si l'étab est PERSONNEL (B2C)
  RETURN v_etab_type = 'PERSONNEL';
END;
$$;

REVOKE ALL ON FUNCTION public.is_enseignant_in_personal_etab() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_enseignant_in_personal_etab() TO neondb_owner;

-- ═══════════════════════════════════════════════════════════════
-- 2. Policies RLS : autoriser ENSEIGNANT dans étab PERSONNEL
-- ═══════════════════════════════════════════════════════════════

-- Filiere : l'ENSEIGNANT B2C peut créer/modifier/supprimer les filières de SON étab
DROP POLICY IF EXISTS "Filiere_modify_responsable" ON "Filiere";
CREATE POLICY "Filiere_modify_responsable" ON "Filiere"
  FOR ALL TO neondb_owner
  USING (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_enseignant_in_personal_etab() AND "etablissementId" = current_etablissement_id())
  )
  WITH CHECK (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_enseignant_in_personal_etab() AND "etablissementId" = current_etablissement_id())
  );

-- UniteEnseignement : l'ENSEIGNANT B2C peut créer/modifier/supprimer les UE
-- des filières de SON étab
DROP POLICY IF EXISTS "UniteEnseignement_modify_responsable" ON "UniteEnseignement";
CREATE POLICY "UniteEnseignement_modify_responsable" ON "UniteEnseignement"
  FOR ALL TO neondb_owner
  USING (
    (is_responsable() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignement"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_enseignant_in_personal_etab() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignement"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_responsable() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignement"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_enseignant_in_personal_etab() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignement"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );

-- UniteEnseignementFiliere (table de jointure UE ↔ Filière)
DROP POLICY IF EXISTS "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere";
CREATE POLICY "UniteEnseignementFiliere_modify_responsable" ON "UniteEnseignementFiliere"
  FOR ALL TO neondb_owner
  USING (
    (is_responsable() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignementFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_enseignant_in_personal_etab() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignementFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_responsable() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignementFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_enseignant_in_personal_etab() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "UniteEnseignementFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );

-- EnseignantFiliere (affectation enseignant ↔ filière) : l'ENSEIGNANT B2C peut
-- s'affecter lui-même à ses filières (auto-affectation)
DROP POLICY IF EXISTS "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere";
CREATE POLICY "EnseignantFiliere_modify_responsable" ON "EnseignantFiliere"
  FOR ALL TO neondb_owner
  USING (
    (is_responsable() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "EnseignantFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_enseignant_in_personal_etab() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "EnseignantFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  )
  WITH CHECK (
    (is_responsable() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "EnseignantFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
    OR (is_enseignant_in_personal_etab() AND EXISTS (
      SELECT 1 FROM "Filiere" f
      WHERE f."id" = "EnseignantFiliere"."filiereId"
        AND f."etablissementId" = current_etablissement_id()
    ))
  );

-- User insert : l'ENSEIGNANT B2C peut créer des ÉTUDIANTS dans son étab
-- (uniquement des ETUDIANTS — pas d'autres enseignants ni responsables)
DROP POLICY IF EXISTS "User_insert" ON "User";
CREATE POLICY "User_insert" ON "User"
  FOR INSERT TO neondb_owner
  WITH CHECK (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("role" = 'ADMIN' OR ("etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))))
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT' AND "etablissementId" = current_etablissement_id())
  );

-- User update : l'ENSEIGNANT B2C peut modifier les ÉTUDIANTS de son étab
DROP POLICY IF EXISTS "User_update" ON "User";
CREATE POLICY "User_update" ON "User"
  FOR UPDATE TO neondb_owner
  USING (
    "id" = current_user_id()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId")))
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT' AND "etablissementId" = current_etablissement_id())
  )
  WITH CHECK (
    "id" = current_user_id()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId")))
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT' AND "etablissementId" = current_etablissement_id())
  );

-- User delete : l'ENSEIGNANT B2C peut supprimer les ÉTUDIANTS de son étab
DROP POLICY IF EXISTS "User_delete" ON "User";
CREATE POLICY "User_delete" ON "User"
  FOR DELETE TO neondb_owner
  USING (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT' AND "etablissementId" = current_etablissement_id())
  );

-- AnneeAcademique : l'ENSEIGNANT B2C peut créer/modifier les années de son étab
DROP POLICY IF EXISTS "AnneeAcademique_modify_responsable" ON "AnneeAcademique";
CREATE POLICY "AnneeAcademique_modify_responsable" ON "AnneeAcademique"
  FOR ALL TO neondb_owner
  USING (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_enseignant_in_personal_etab() AND "etablissementId" = current_etablissement_id())
  )
  WITH CHECK (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_enseignant_in_personal_etab() AND "etablissementId" = current_etablissement_id())
  );

-- ═══════════════════════════════════════════════════════════════
-- 3. Auto-setup : modifier create_b2c_subscription pour créer la structure
-- ═══════════════════════════════════════════════════════════════
-- Crée automatiquement après l'abonnement :
--   - 1 AnneeAcademique "2025-2026" (définie comme courante sur l'étab)
--   - 1 Filiere "Mes classes" (rattachée à l'étab)
--   - 1 UniteEnseignement "Cours par défaut" (niveau L1, rattachée à la filière)
--   - 1 UniteEnseignementFiliere (lien UE ↔ filière)
--   - 1 EnseignantFiliere (affecte le prof à sa filière)
--
-- Le prof B2C a ainsi une structure minimale pour démarrer immédiatement.
-- Il peut ensuite créer plus de filières/UE/étudiants lui-même (permissions §2).

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
  v_annee_id text;
  v_filiere_id text;
  v_ue_id text;
  v_ue_filiere_id text;
  v_ens_filiere_id text;
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
  IF v_plan_prix_mensuel = 0 THEN
    v_statut := 'ACTIF';
    v_payment_required := false;
    v_date_fin := NULL;
    v_montant := 0;
  ELSE
    v_statut := 'EN_ATTENTE_PAIEMENT';
    v_payment_required := true;
    v_date_fin := NOW() + INTERVAL '24 hours';
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

  -- 8. AUTO-SETUP (SECT-B2C-SELF-SERVICE) : créer la structure pédagogique
  -- minimale pour que le prof B2C puisse démarrer immédiatement.
  -- AnneeAcademique + Filiere + UE + affectations.

  -- 8a. Année académique courante (2025-2026)
  v_annee_id := 'an_b2c_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "AnneeAcademique" (
    "id", "libelle", "dateDebut", "dateFin", "etablissementId", "actif", "createdAt", "updatedAt"
  ) VALUES (
    v_annee_id, '2025-2026',
    '2025-10-01 00:00:00', '2026-09-30 00:00:00',
    v_etab_id, true, NOW(), NOW()
  );

  -- 8b. Définir cette année comme "année courante" sur l'établissement
  UPDATE "Etablissement"
  SET "anneeAcademiqueCouranteId" = v_annee_id, "updatedAt" = NOW()
  WHERE "id" = v_etab_id;

  -- 8c. Filière par défaut "Mes classes"
  v_filiere_id := 'fil_b2c_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "Filiere" (
    "id", "nom", "code", "etablissementId", "responsableId",
    "description", "nbEtudiants", "actif", "createdAt", "updatedAt"
  ) VALUES (
    v_filiere_id, 'Mes classes', 'CLS', v_etab_id, v_user_id,
    'Filière par défaut pour vos cours', 0, true, NOW(), NOW()
  );

  -- 8d. UE par défaut "Cours par défaut" (niveau L1, semestre 1)
  v_ue_id := 'ue_b2c_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "UniteEnseignement" (
    "id", "code", "nom", "description", "filiereId", "niveau",
    "semestre", "creditsECTS", "volumeHeuresCM", "volumeHeuresTD", "volumeHeuresTP",
    "obligatoire", "actif", "createdAt", "updatedAt"
  ) VALUES (
    v_ue_id, 'DEFAUT', 'Cours par défaut', 'Unité d''enseignement par défaut',
    v_filiere_id, 'L1'::"NiveauEtude", 1, 0, 0, 0, 0, true, true, NOW(), NOW()
  );

  -- 8e. Lien UE ↔ filière (table de jointure)
  v_ue_filiere_id := 'uef_b2c_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "UniteEnseignementFiliere" ("id", "uniteEnseignementId", "filiereId", "createdAt")
  VALUES (v_ue_filiere_id, v_ue_id, v_filiere_id, NOW());

  -- 8f. Affecter l'enseignant à sa filière (auto-affectation)
  v_ens_filiere_id := 'ef_b2c_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "EnseignantFiliere" ("id", "enseignantId", "filiereId", "createdAt", "updatedAt", "niveau")
  VALUES (v_ens_filiere_id, v_user_id, v_filiere_id, NOW(), NOW(), 'L1'::"NiveauEtude");

  -- 9. Retourner le résultat
  RETURN QUERY SELECT
    v_user_id, lower(trim(p_user_email)), p_user_name, 'ENSEIGNANT'::text,
    v_etab_id, v_etab_nom, v_abo_id, v_statut, v_date_fin, v_montant, v_payment_required;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- 4. Permissions sur la fonction modifiée
-- ═══════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.create_b2c_subscription FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_b2c_subscription TO PUBLIC;
