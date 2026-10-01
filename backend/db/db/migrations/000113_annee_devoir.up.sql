-- ============================================================
-- Migration 000113 — Devoir.anneeAcademiqueId : fin de
-- l'anti-pattern texte anneeUniversitaire + recréation des
-- affectations à l'activation d'une nouvelle année
-- SECT-ANNEE-DETTES-3 (dettes notées SECT-ANNEE-HISTOIRE-2)
-- ============================================================
-- CONTEXTE : Affectation (000112 §B) et Conversation (000112 §C)
-- sont rattachées à AnneeAcademique via une vraie FK ; Devoir
-- reste sur le label texte "anneeUniversitaire" avec un défaut
-- hardcodé '2024-2025' (0 ligne en prod à ce jour — backfill
-- trivial, mais la colonne DOIT exister pour le scoping par
-- défaut des listes et le tampon à la création).
--
-- CHANGEMENTS :
--   A. Devoir : + colonne anneeAcademiqueId (FK ON DELETE SET
--      NULL) backfillée par libellé ↔ année du même
--      établissement que l'UE (pattern 000112 §B, adapté
--      UE → Filière → Etablissement). La colonne texte
--      anneeUniversitaire RESTE (miroir du libellé : compat
--      API/mobile Kotlin — CreateDevoirRequest l'envoie —
--      aucune clé d'unicité ne porte cette colonne sur Devoir,
--      contrairement à Affectation).
--   B. Checklist d'activation : get_annee_activation_checklist
--      extended avec un compteur devoirsNonClotures (statut
--      BROUILLON/PUBLIE de l'année courante) — cohérent avec
--      « épreuves non clôturées » : un devoir PUBLIE non fermé
--      de l'année sortante reste « vivant » après la bascule.
--
-- La recréation des affectations (bouton « Recréer » de la
-- checklist) est purement code Go (INSERT...SELECT) — aucun
-- changement de schéma requis.
--
-- IDEMPOTENCE : ADD COLUMN IF NOT EXISTS + UPDATE ... WHERE IS
-- NULL + DROP ... IF EXISTS avant chaque CREATE.
-- COMPATIBILITÉ DÉPLOIEMENT : strictement additive pour l'ancien
-- code (INSERT/SELECT explicites — l'ancien code n'écrit jamais
-- anneeAcademiqueId → NULL → couvert par le fallback libellé du
-- nouveau code de lecture). Ordre sans rupture : MIGRATION
-- d'abord, puis déploiement code backend, puis frontend.
-- ============================================================

-- ============================================================
-- A. DEVOIR — FK anneeAcademiqueId (label texte → miroir)
-- ============================================================

ALTER TABLE "Devoir" ADD COLUMN IF NOT EXISTS "anneeAcademiqueId" TEXT;

-- A1. Backfill par libellé ↔ année du même établissement que
--     l'UE (UE → Filiere primaire → Etablissement). Les devoirs
--     dont le libellé ne matche aucune année de l'étab restent
--     NULL (historique non rattachable) — couverts à la lecture
--     par le fallback libellé (même contrat que Affectation).
UPDATE "Devoir" d
SET "anneeAcademiqueId" = a."id"
FROM "UniteEnseignement" ue, "Filiere" f, "AnneeAcademique" a
WHERE d."anneeAcademiqueId" IS NULL
  AND ue."id" = d."uniteEnseignementId"
  AND f."id" = ue."filiereId"
  AND a."etablissementId" = f."etablissementId"
  AND a."libelle" = d."anneeUniversitaire";

-- A2. FK + index de lecture. La colonne texte anneeUniversitaire
--     est CONSERVÉE comme miroir du libellé (compat API/mobile ;
--     aucune contrainte d'unicité ne la référence sur Devoir).
ALTER TABLE "Devoir" DROP CONSTRAINT IF EXISTS "Devoir_anneeAcademiqueId_fkey";
ALTER TABLE "Devoir"
  ADD CONSTRAINT "Devoir_anneeAcademiqueId_fkey"
  FOREIGN KEY ("anneeAcademiqueId") REFERENCES "AnneeAcademique"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "Devoir_anneeAcademiqueId_idx" ON "Devoir"("anneeAcademiqueId");

-- ============================================================
-- B. CHECKLIST D'ACTIVATION — + devoirsNonClotures
-- ============================================================
-- Recréation de get_annee_activation_checklist (000112 §D) avec
-- un 4e compteur : devoirs non clôturés (statut <> FERME/ARCHIVE,
-- FK + fallback libellé de l'année courante, scopés UE→Filière).
-- SECURITY DEFINER inchangé (owner BYPASSRLS — compteurs complets ;
-- le handler vérifie l'autorisation AVANT l'appel).

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
    v_nb_devoirs_non_clotures int := 0;
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

        -- 4. Devoirs non clôturés de l'année courante (SECT-ANNEE-DETTES-3) :
        --    statut BROUILLON/PUBLIE (ni FERME ni ARCHIVE), FK + fallback
        --    libellé, scopés UE → Filiere. Ils resteront rattachés à
        --    l'année archivée après la bascule — l'enseignant doit les
        --    fermer ou les recréer pour la nouvelle année.
        SELECT count(*) INTO v_nb_devoirs_non_clotures
        FROM "Devoir" d
        WHERE (d."anneeAcademiqueId" = v_courante.id
               OR (d."anneeAcademiqueId" IS NULL AND d."anneeUniversitaire" = v_courante.libelle))
          AND d."deletedAt" IS NULL
          AND d."statut"::text NOT IN ('FERME', 'ARCHIVE')
          AND EXISTS (SELECT 1 FROM "UniteEnseignement" ue
                      JOIN "Filiere" f ON f."id" = ue."filiereId"
                      WHERE ue."id" = d."uniteEnseignementId"
                        AND f."etablissementId" = p_etablissement_id);
    END IF;

    RETURN jsonb_build_object(
        'anneeCible', jsonb_build_object('id', v_cible.id, 'libelle', v_cible.libelle),
        'anneeCourante', CASE WHEN v_courante.id IS NULL THEN NULL
                              ELSE jsonb_build_object('id', v_courante.id, 'libelle', v_courante.libelle) END,
        'changementAnnee', (v_courante.id IS NOT NULL AND v_courante.id <> v_cible.id),
        'epreuvesNonCloturees', jsonb_build_object('count', v_nb_epreuves_non_cloturees, 'items', v_epreuves),
        'affectations', jsonb_build_object('count', v_nb_affectations, 'parStatut', v_aff_statuts),
        'salonsArchivables', jsonb_build_object('count', v_nb_salons),
        'devoirsNonClotures', jsonb_build_object('count', v_nb_devoirs_non_clotures)
    );
END $$;

-- ============================================================
-- C. Vérifications post-migration (échouent le migrate si incomplet)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname='Devoir' AND a.attname='anneeAcademiqueId' AND NOT a.attisdropped) = 1,
         'colonne Devoir.anneeAcademiqueId manquante';
  ASSERT (SELECT count(*) FROM pg_constraint WHERE conname='Devoir_anneeAcademiqueId_fkey') = 1,
         'FK Devoir_anneeAcademiqueId_fkey manquante';
  ASSERT (SELECT count(*) FROM pg_indexes WHERE indexname='Devoir_anneeAcademiqueId_idx') = 1,
         'index Devoir_anneeAcademiqueId_idx manquant';
  ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname='get_annee_activation_checklist' AND n.nspname='public') = 1,
         'fonction get_annee_activation_checklist manquante';
END $$;
