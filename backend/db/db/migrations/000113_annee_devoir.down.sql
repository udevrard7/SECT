-- ============================================================
-- Migration 000113 (DOWN) — Devoir.anneeAcademiqueId + checklist
-- SECT-ANNEE-DETTES-3
-- ============================================================
-- Le down retire la colonne FK/index Devoir et restaure
-- get_annee_activation_checklist à son état 000112 (sans le
-- compteur devoirsNonClotures). Le BACKFILL n'est PAS réversible
-- (les NULL d'origine de Devoir.anneeAcademiqueId sont perdus) —
-- documenté : restaurer une sauvegarde Neon si nécessaire.
-- Les affectations recréées par le bouton « Recréer » (INSERT
-- applicatif) ne sont PAS touchées par ce down.
-- ============================================================

-- 1. Checklist d'activation : retour à l'état 000112 (sans devoirs).
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

-- 2. Devoir : colonne + FK + index.
DROP INDEX IF EXISTS "Devoir_anneeAcademiqueId_idx";
ALTER TABLE "Devoir" DROP CONSTRAINT IF EXISTS "Devoir_anneeAcademiqueId_fkey";
ALTER TABLE "Devoir" DROP COLUMN IF EXISTS "anneeAcademiqueId";
