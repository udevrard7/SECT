-- ============================================================
-- Migration 000009 — Correction RLS Devoir_select (étudiant)
-- ============================================================
-- BUG (ANALYSE-DEVOIRS-1) : la policy Devoir_select ne montrait aux
-- étudiants QUE les devoirs où une Soumission existait déjà pour eux.
-- Conséquence : un étudiant ne pouvait JAMAIS voir les devoirs PUBLIE
-- de ses UEs tant qu'il n'avait pas soumis → workflow cassé à la racine.
--
-- FIX : la branche is_etudiant() valide désormais l'accès via la filière
-- + le niveau de l'étudiant (pattern éprouvé par ListStudentDocuments
-- dans repository/examprep.go). Un étudiant voit les devoirs PUBLIE/FERME
-- des UEs dont la filière = sa filière ET (niveau = son niveau OU son
-- niveau apparaît dans le champ JSON-ish "niveaux" de l'UE).
--
-- Aucune table/colonne modifiée — seule la policy est recréée.
-- ============================================================

DROP POLICY IF EXISTS "Devoir_select" ON "Devoir";

CREATE POLICY "Devoir_select" ON "Devoir"
  FOR SELECT TO neondb_owner
  USING (
    -- 1. Enseignant propriétaire du devoir
    (is_enseignant() AND "enseignantId" = current_user_id())

    -- 2. Responsable : voit les devoirs des enseignants de son établissement
    OR (is_responsable() AND EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Devoir"."enseignantId"
        AND u."etablissementId" = current_etablissement_id()
    ))

    -- 3. Étudiant : voit les devoirs PUBLIE/FERME des UEs de sa filière + niveau
    --    (pattern filiere+niveau — éprouvé par ListStudentDocuments)
    OR (
      is_etudiant()
      AND "statut" IN ('PUBLIE', 'FERME')
      AND (
        "datePublication" IS NULL
        OR "datePublication" <= CURRENT_TIMESTAMP
      )
      AND EXISTS (
        SELECT 1
        FROM "UniteEnseignement" ue
        JOIN "User" u ON u."id" = current_user_id()
        WHERE ue."id" = "Devoir"."uniteEnseignementId"
          AND ue."filiereId" = u."filiereId"
          AND (
            ue."niveau" = u."niveau"
            OR ue."niveaux" LIKE '%"' || u."niveau" || '"%'
          )
      )
    )

    -- 4. Admin : voit les devoirs des établissements auxquels il a accès
    OR (is_admin() AND EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = "Devoir"."enseignantId"
        AND admin_has_etablissement_access(u."etablissementId")
    ))
  );
