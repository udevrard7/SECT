-- ============================================================
-- Migration 000112 — Historique par année académique, phase 2
-- SECT-ANNEE-HISTOIRE-2
-- ============================================================
-- NB : numérotée 000112 (et non 000111) car une session parallèle a posé
-- 000111_inscription_filiere_sync le même jour — les deux migrations sont
-- indépendantes (aucune table/fonction commune) et toutes deux appliquées.
-- CONTEXTE (suite de 000110 « une seule année active par étab ») :
-- l'amalgame inter-années persiste sur 4 flux restés transversaux :
--   1. Epreuve.anneeAcademiqueId existe (FK 000004, index 000003) mais
--      n'est pas valorisé à la création (sauf dialog « Planifier ») ni
--      filtré par défaut → « Mes épreuves » mélange toutes les années.
--   2. Affectation.anneeUniversitaire est un TEXTE libre réconcilié par
--      libellé → typage faible, pas de FK (scoping post-000110 par label).
--   3. Conversation CLASSE/PROMO : clé naturelle (type, filiereId, niveau)
--      sans année → les étudiants de la nouvelle année héritent des salons
--      et de l'historique de messages de l'année précédente.
--   4. Stats dashboards toutes années confondues → traité côté code Go
--      (aucun changement de schéma requis).
--
-- CHANGEMENTS :
--   A. Epreuve : backfill des anneeAcademiqueId NULL par période
--      [dateDebut, dateFin + 1 jour) de l'année de l'établissement (via
--      la filière de l'épreuve, puis via l'établissement de l'enseignant).
--      Les épreuves non rattachables restent NULL — visibles uniquement
--      via le filtre explicite « toutes les années ».
--   B. Affectation : + colonne anneeAcademiqueId (FK ON DELETE SET NULL)
--      backfillée par libellé ↔ année du même établissement que l'UE.
--      La colonne texte anneeUniversitaire RESTE (miroir du libellé :
--      compat API/mobile + clé d'unicité historique inchangée) ; le
--      backend l'écrit désormais en miroir et filtre via la FK.
--   C. Conversation : + colonne anneeAcademiqueId (FK SET NULL) ; les
--      salons CLASSE/PROMO existants sont rattachés à l'année courante de
--      leur établissement (grandfathering) ; à l'activation d'une nouvelle
--      année, le backend archive ces salons (deletedAt) et les nouveaux
--      salons sont créés pour la nouvelle année (GetOrCreateAuto versionné
--      par année). conversation_scope_unchanged passe à 6 paramètres (gel
--      de l'année) + Conversation_insert contraint l'année des salons
--      CLASSE/PROMO à l'année courante de l'étab (helper SECURITY DEFINER).
--   D. Checklist d'activation : fonction SECURITY DEFINER
--      get_annee_activation_checklist (compteurs complets hors RLS — le
--      responsable ne voit pas les épreuves sans filière via
--      Epreuve_select : épreuves non clôturées de l'année courante,
--      affectations à recréer, salons qui seront archivés).
--
-- IDEMPOTENCE : ADD COLUMN IF NOT EXISTS + UPDATE ... WHERE IS NULL +
-- DROP ... IF EXISTS avant chaque CREATE (policy/fonction/index/contrainte).
-- COMPATIBILITÉ DÉPLOIEMENT : strictement additive pour l'ancien code
-- (nouvelles colonnes ignorées ; les policies recreées conservent toutes
-- les branches existantes + la contrainte d'année supplémentaire ; l'ancien
-- code n'insère/n'update jamais anneeAcademiqueId → NULL/unchanged → OK).
-- Ordre sans rupture : MIGRATION d'abord (backfill), puis déploiement code.
-- ============================================================

-- ============================================================
-- A. EPREUVE — backfill anneeAcademiqueId par période
-- ============================================================

-- A1. Via la filière de l'épreuve (filiereId → Filiere.etablissementId).
--      dateFin est un DATE (000089) : + 1 jour pour inclure le dernier jour
--      (une épreuve du 31/08/2027 à 10:00 appartient bien à 2026-2027).
UPDATE "Epreuve" e
SET "anneeAcademiqueId" = a."id"
FROM "Filiere" f, "AnneeAcademique" a
WHERE e."anneeAcademiqueId" IS NULL
  AND e."filiereId" IS NOT NULL
  AND f."id" = e."filiereId"
  AND a."etablissementId" = f."etablissementId"
  AND e."dateDebut" >= a."dateDebut"
  AND e."dateDebut" < a."dateFin" + INTERVAL '1 day';

-- A2. Fallback via l'établissement de l'enseignant (épreuves sans filière
--      ou sans période matchante côté filière).
UPDATE "Epreuve" e
SET "anneeAcademiqueId" = a."id"
FROM "User" u, "AnneeAcademique" a
WHERE e."anneeAcademiqueId" IS NULL
  AND u."id" = e."enseignantId"
  AND u."etablissementId" IS NOT NULL
  AND a."etablissementId" = u."etablissementId"
  AND e."dateDebut" >= a."dateDebut"
  AND e."dateDebut" < a."dateFin" + INTERVAL '1 day';

-- A3. Index Epreuve_anneeAcademiqueId_idx déjà existant (000003) : rien à faire.

-- ============================================================
-- B. AFFECTATION — FK anneeAcademiqueId (label texte → miroir)
-- ============================================================

ALTER TABLE "Affectation" ADD COLUMN IF NOT EXISTS "anneeAcademiqueId" TEXT;

-- B1. Backfill par libellé ↔ année du même établissement que l'UE
--      (UE → Filiere primaire → Etablissement). Les affectations dont le
--      libellé ne matche aucune année de l'étab restent NULL (historique
--      non rattachable) — couvertes à la lecture par le fallback libellé.
UPDATE "Affectation" aff
SET "anneeAcademiqueId" = a."id"
FROM "UniteEnseignement" ue, "Filiere" f, "AnneeAcademique" a
WHERE aff."anneeAcademiqueId" IS NULL
  AND ue."id" = aff."uniteEnseignementId"
  AND f."id" = ue."filiereId"
  AND a."etablissementId" = f."etablissementId"
  AND a."libelle" = aff."anneeUniversitaire";

-- B2. FK + index de lecture. L'ancienne clé d'unique
--      (enseignantId, uniteEnseignementId, typeSeance, groupe,
--      anneeUniversitaire) est CONSERVÉE : la colonne texte reste le miroir
--      du libellé de la FK → sémantique d'unicité inchangée.
ALTER TABLE "Affectation" DROP CONSTRAINT IF EXISTS "Affectation_anneeAcademiqueId_fkey";
ALTER TABLE "Affectation"
  ADD CONSTRAINT "Affectation_anneeAcademiqueId_fkey"
  FOREIGN KEY ("anneeAcademiqueId") REFERENCES "AnneeAcademique"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "Affectation_anneeAcademiqueId_idx" ON "Affectation"("anneeAcademiqueId");

-- ============================================================
-- C. CONVERSATION — versionner les salons CLASSE/PROMO par année
-- ============================================================

ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "anneeAcademiqueId" TEXT;

-- C1. Grandfathering : les salons CLASSE/PROMO existants deviennent les
--      salons de l'année COURANTE (ils seront archivés à la prochaine
--      activation ; les étudiants de l'année suivante auront des salons
--      neufs). Les types IA/DIRECT/EQUIPE/STAFF restent NULL (transversaux
--      par design : DM privés, équipes pédagogiques permanentes).
UPDATE "Conversation" c
SET "anneeAcademiqueId" = e."anneeAcademiqueCouranteId"
FROM "Etablissement" e
WHERE c."anneeAcademiqueId" IS NULL
  AND c."type" IN ('CLASSE', 'PROMO')
  AND c."etablissementId" IS NOT NULL
  AND e."id" = c."etablissementId"
  AND e."anneeAcademiqueCouranteId" IS NOT NULL;

-- C2. FK + index de recherche (clé naturelle versionnée par année).
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_anneeAcademiqueId_fkey";
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_anneeAcademiqueId_fkey"
  FOREIGN KEY ("anneeAcademiqueId") REFERENCES "AnneeAcademique"("id") ON DELETE SET NULL;
DROP INDEX IF EXISTS "idx_conv_filiere_niveau_annee";
CREATE INDEX "idx_conv_filiere_niveau_annee" ON "Conversation"("filiereId", "niveau", "anneeAcademiqueId")
  WHERE "deletedAt" IS NULL AND "type" = 'CLASSE';
DROP INDEX IF EXISTS "idx_conv_filiere_annee";
CREATE INDEX "idx_conv_filiere_annee" ON "Conversation"("filiereId", "anneeAcademiqueId")
  WHERE "deletedAt" IS NULL AND "type" = 'PROMO';

-- C3. Helper SECURITY DEFINER : année courante d'un établissement. Utilisé
--      par Conversation_insert pour contraindre l'année des salons
--      CLASSE/PROMO sans récursion RLS (un sous-requête directe sur
--      Etablissement dans la policy serait filtrée par Etablissement_select).
CREATE OR REPLACE FUNCTION public.etab_current_annee_id(p_etablissement_id text)
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT e."anneeAcademiqueCouranteId" FROM "Etablissement" e WHERE e."id" = p_etablissement_id
$$;

-- C4. conversation_scope_unchanged v2 : surcharge à 6 paramètres qui gèle
--      AUSSI l'année académique (CREATE OR REPLACE avec une liste de
--      paramètres différente crée une SURCHARGE : l'original 5-params reste
--      disponible pour la compat, la policy recreée en C5 appelle la 6-params).
--      Conversation_update (C5) est recreée dans la MÊME migration.
CREATE OR REPLACE FUNCTION public.conversation_scope_unchanged(
    p_conversation_id text,
    p_type "ConversationType",
    p_etablissement_id text,
    p_filiere_id text,
    p_niveau text,
    p_annee_academique_id text
)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Conversation" c
    WHERE c."id" = p_conversation_id
      AND c."type" = p_type
      AND c."etablissementId" IS NOT DISTINCT FROM p_etablissement_id
      AND c."filiereId" IS NOT DISTINCT FROM p_filiere_id
      AND c."niveau" IS NOT DISTINCT FROM p_niveau
      AND c."anneeAcademiqueId" IS NOT DISTINCT FROM p_annee_academique_id
  )
$$;

-- C5. Conversation_update : mêmes branches que 000109, appel à 6 paramètres.
DROP POLICY IF EXISTS "Conversation_update" ON "Conversation";
CREATE POLICY "Conversation_update" ON "Conversation" FOR UPDATE
    USING (
        is_system()
        OR "createdBy" = current_user_id()
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    )
    WITH CHECK (
        is_system()
        OR (
            "createdBy" = current_user_id()
            AND conversation_scope_unchanged(
                "Conversation"."id", "Conversation"."type",
                "Conversation"."etablissementId", "Conversation"."filiereId",
                "Conversation"."niveau", "Conversation"."anneeAcademiqueId"
            )
        )
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    );

-- C6. Conversation_insert : mêmes branches que 000048 + l'année d'un salon
--      CLASSE/PROMO ne peut être que l'année courante de l'établissement
--      (ou NULL si l'étab n'a pas d'année active) → un étudiant ne peut pas
--      forger un salon d'une année arbitraire.
DROP POLICY IF EXISTS "Conversation_insert" ON "Conversation";
CREATE POLICY "Conversation_insert" ON "Conversation" FOR INSERT
    WITH CHECK (
        is_system()
        OR ("type" = 'IA' AND "createdBy" = current_user_id())
        OR ("type" = 'DIRECT' AND "createdBy" = current_user_id()
            AND "etablissementId" = current_etablissement_id())
        OR ("type" = 'CLASSE' AND "createdBy" = current_user_id()
            AND "etablissementId" = current_etablissement_id()
            AND "filiereId" IS NOT NULL
            AND "filiereId" = current_user_filiere_id()
            AND "niveau" IS NOT NULL
            AND ("anneeAcademiqueId" IS NULL
                 OR "anneeAcademiqueId" = etab_current_annee_id("etablissementId"))
            AND EXISTS (SELECT 1 FROM "User" u
                        WHERE u."id" = current_user_id()
                          AND u."filiereId" = "Conversation"."filiereId"
                          AND u."niveau"::text = "Conversation"."niveau"::text))
        OR ("type" = 'PROMO' AND "createdBy" = current_user_id()
            AND "etablissementId" = current_etablissement_id()
            AND "filiereId" IS NOT NULL
            AND "filiereId" = current_user_filiere_id()
            AND ("anneeAcademiqueId" IS NULL
                 OR "anneeAcademiqueId" = etab_current_annee_id("etablissementId")))
        OR ("type" IN ('EQUIPE', 'STAFF') AND "createdBy" = current_user_id()
            AND "etablissementId" = current_etablissement_id()
            AND (is_enseignant() OR is_responsable() OR is_admin()))
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    );

-- ============================================================
-- D. CHECKLIST D'ACTIVATION D'UNE ANNÉE (workflow de clôture enrichi)
-- ============================================================

-- SECURITY DEFINER (owner BYPASSRLS) : compteurs COMPLETS — le responsable
-- ne voit pas via Epreuve_select les épreuves sans filière de son étab. Le
-- handler vérifie l'autorisation AVANT l'appel (chargement de l'année sous
-- RLS avec les claims du demandeur). Les affectations sont scopées à
-- l'établissement via UE → Filiere (la table n'a pas de colonne etab).
CREATE OR REPLACE FUNCTION public.get_annee_activation_checklist(
    p_etablissement_id text,
    p_annee_cible_id text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cible RECORD;
    v_courante RECORD;
    v_nb_epreuves_non_cloturees int := 0;
    v_epreuves jsonb := '[]'::jsonb;
    v_nb_affectations int := 0;
    v_aff_statuts jsonb := '{}'::jsonb;
    v_nb_salons int := 0;
BEGIN
    SELECT a."id", a."libelle" INTO v_cible
    FROM "AnneeAcademique" a
    WHERE a."id" = p_annee_cible_id AND a."etablissementId" = p_etablissement_id;
    IF v_cible.id IS NULL THEN
        RETURN jsonb_build_object('error', 'annee introuvable pour cet etablissement');
    END IF;

    SELECT a."id", a."libelle" INTO v_courante
    FROM "AnneeAcademique" a
    WHERE a."etablissementId" = p_etablissement_id AND a."actif" = true
    ORDER BY a."dateDebut" DESC LIMIT 1;

    IF v_courante.id IS NOT NULL AND v_courante.id <> v_cible.id THEN
        -- 1. Épreuves non clôturées de l'année courante : elles resteront
        --    rattachées à l'ancienne année après la bascule (plus visibles
        --    par défaut) — le responsable doit les clôturer ou les replanifier.
        SELECT count(*) INTO v_nb_epreuves_non_cloturees
        FROM "Epreuve" e
        WHERE e."anneeAcademiqueId" = v_courante.id
          AND e."deletedAt" IS NULL
          AND e."statut" <> 'CLOTUREE';
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', x."id", 'titre', x."titre", 'statut', x."statut"::text,
                   'dateFin', x."dateFin", 'enseignant', COALESCE(x."enseignant", '—'))), '[]'::jsonb)
        INTO v_epreuves
        FROM (
            SELECT e."id", e."titre", e."statut", e."dateFin", u."name" AS "enseignant"
            FROM "Epreuve" e LEFT JOIN "User" u ON u."id" = e."enseignantId"
            WHERE e."anneeAcademiqueId" = v_courante.id
              AND e."deletedAt" IS NULL AND e."statut" <> 'CLOTUREE'
            ORDER BY e."dateFin" DESC NULLS LAST LIMIT 20
        ) x;

        -- 2. Affectations de l'année courante (FK + fallback libellé legacy),
        --    scopées à l'établissement via UE → Filiere.
        SELECT count(*) INTO v_nb_affectations
        FROM "Affectation" a
        WHERE (a."anneeAcademiqueId" = v_courante.id
               OR (a."anneeAcademiqueId" IS NULL AND a."anneeUniversitaire" = v_courante.libelle))
          AND EXISTS (SELECT 1 FROM "UniteEnseignement" ue
                      JOIN "Filiere" f ON f."id" = ue."filiereId"
                      WHERE ue."id" = a."uniteEnseignementId"
                        AND f."etablissementId" = p_etablissement_id);
        SELECT jsonb_build_object(
                   'PROVISOIRE', count(*) FILTER (WHERE a."statut" = 'PROVISOIRE'),
                   'VALIDEE',   count(*) FILTER (WHERE a."statut" = 'VALIDEE'),
                   'PUBLIEE',   count(*) FILTER (WHERE a."statut" = 'PUBLIEE'))
        INTO v_aff_statuts
        FROM "Affectation" a
        WHERE (a."anneeAcademiqueId" = v_courante.id
               OR (a."anneeAcademiqueId" IS NULL AND a."anneeUniversitaire" = v_courante.libelle))
          AND EXISTS (SELECT 1 FROM "UniteEnseignement" ue
                      JOIN "Filiere" f ON f."id" = ue."filiereId"
                      WHERE ue."id" = a."uniteEnseignementId"
                        AND f."etablissementId" = p_etablissement_id);

        -- 3. Salons CLASSE/PROMO qui seront archivés par l'activation.
        SELECT count(*) INTO v_nb_salons
        FROM "Conversation" c
        WHERE c."etablissementId" = p_etablissement_id
          AND c."type" IN ('CLASSE', 'PROMO')
          AND c."deletedAt" IS NULL
          AND c."anneeAcademiqueId" IS DISTINCT FROM p_annee_cible_id;
    END IF;

    RETURN jsonb_build_object(
        'anneeCible', jsonb_build_object('id', v_cible.id, 'libelle', v_cible.libelle),
        'anneeCourante', CASE WHEN v_courante.id IS NULL THEN NULL
                              ELSE jsonb_build_object('id', v_courante.id, 'libelle', v_courante.libelle) END,
        'changementAnnee', (v_courante.id IS NOT NULL AND v_courante.id <> v_cible.id),
        'epreuvesNonCloturees', jsonb_build_object('count', v_nb_epreuves_non_cloturees, 'items', v_epreuves),
        'affectations', jsonb_build_object('count', v_nb_affectations, 'parStatut', v_aff_statuts),
        'salonsArchivables', jsonb_build_object('count', v_nb_salons)
    );
END $$;

-- ============================================================
-- E. Vérifications post-migration (échouent le migrate si incomplet)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname='Affectation' AND a.attname='anneeAcademiqueId' AND NOT a.attisdropped) = 1,
         'colonne Affectation.anneeAcademiqueId manquante';
  ASSERT (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname='Conversation' AND a.attname='anneeAcademiqueId' AND NOT a.attisdropped) = 1,
         'colonne Conversation.anneeAcademiqueId manquante';
  ASSERT (SELECT count(*) FROM pg_constraint WHERE conname='Affectation_anneeAcademiqueId_fkey') = 1,
         'FK Affectation_anneeAcademiqueId_fkey manquante';
  ASSERT (SELECT count(*) FROM pg_constraint WHERE conname='Conversation_anneeAcademiqueId_fkey') = 1,
         'FK Conversation_anneeAcademiqueId_fkey manquante';
  ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname='conversation_scope_unchanged' AND n.nspname='public'
            AND pg_get_function_arguments(p.oid) LIKE '%p_annee_academique_id text%') = 1,
         'conversation_scope_unchanged doit avoir 6 parametres';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename='Conversation' AND policyname='Conversation_update') = 1,
         'Conversation_update manquante';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename='Conversation' AND policyname='Conversation_insert') = 1,
         'Conversation_insert manquante';
  ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname='get_annee_activation_checklist' AND n.nspname='public') = 1,
         'fonction get_annee_activation_checklist manquante';
  ASSERT (SELECT count(*) FROM pg_indexes WHERE indexname='idx_conv_filiere_niveau_annee') = 1,
         'index idx_conv_filiere_niveau_annee manquant';
END $$;
