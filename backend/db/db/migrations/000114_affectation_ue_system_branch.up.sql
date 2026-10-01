-- ============================================================
-- Migration 000114 — Branches is_system() pour Affectation +
-- UniteEnseignement (recréation d'affectations vers une
-- nouvelle année)
-- SECT-ANNEE-DETTES-3 (complément de 000113)
-- ============================================================
-- CONTEXTE : le runtime Render se connecte en tant que sect_app
-- (NOBYPASSRLS, bascule RLS-ACTUAL-SWITCH-1) → toute policy sans
-- branche is_system() bloque les chemins système (claims
-- system-worker : current_user_id() = 'system-worker').
--
-- Le nouveau endpoint POST /api/annees-academiques/{id}/
-- recreate-affectations (SECT-ANNEE-DETTES-3) copie les
-- affectations d'une année source vers une année cible en claims
-- SYSTÈME (comme ArchiveAnneeConversations — autorisation vérifiée
-- côté handler en 2 temps, RLS FindByID + ceinture RESPONSABLE).
-- Son INSERT..SELECT doit pouvoir :
--   1. LIRE les affectations sources (Affectation_select) ;
--   2. LIRE la table de dédoublonnage NOT EXISTS (Affectation) ;
--   3. PASSER le WITH CHECK d'insertion
--      (Affectation_modify_responsable) ;
--   4. ÉVALUER le scoping EXISTS (UE → Filière → établissement)
--      (UniteEnseignement_select — Filiere_select a déjà
--      is_system() depuis 000108).
--
-- Or, sous sect_app, les claims système satisfont is_admin()
-- (rôle ADMIN) mais PAS admin_has_etablissement_access()
-- (aucune ligne EtablissementAccess pour 'system-worker') →
-- 0 ligne lue et INSERT rejeté. Même classe de bug que 000108
-- (Filiere_select) et 000109 (Conversation/Message/Alerte) :
-- on ajoute la branche is_system() aux 3 policies.
--
-- Les branches existantes sont conservées à l'identique —
-- strictement additif pour les chemins utilisateur.
-- ============================================================

-- 1. Affectation — lecture (source de la copie + NOT EXISTS).
DROP POLICY IF EXISTS "Affectation_select" ON "Affectation";
CREATE POLICY "Affectation_select" ON "Affectation" FOR SELECT TO PUBLIC USING (
  is_system()
  OR (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND affectation_in_my_etab(id))
  OR (is_admin() AND admin_has_etablissement_access(affectation_etab_id(id)))
  OR (is_etudiant() AND affectation_visible_by_student(id))
);

-- 2. Affectation — écriture (INSERT de la copie, WITH CHECK).
--    Recréation à l'identique de 000024 + la branche système.
DROP POLICY IF EXISTS "Affectation_modify_responsable" ON "Affectation";
CREATE POLICY "Affectation_modify_responsable" ON "Affectation" FOR ALL TO PUBLIC
  USING (is_system() OR (is_responsable() AND affectation_in_my_etab(id)))
  WITH CHECK (is_system() OR (is_responsable() AND affectation_in_my_etab(id)));

-- 3. UniteEnseignement — lecture (EXISTS de scoping de la copie).
--    Recréation à l'identique de 000024 + la branche système.
DROP POLICY IF EXISTS "UniteEnseignement_select" ON "UniteEnseignement";
CREATE POLICY "UniteEnseignement_select" ON "UniteEnseignement" FOR SELECT TO PUBLIC USING (
  is_system()
  OR (is_responsable() AND filiere_in_my_etab("filiereId"))
  OR (is_admin() AND admin_has_etablissement_access(ue_etab_id(id)))
  OR (is_enseignant() AND EXISTS (
      SELECT 1 FROM "Affectation" a WHERE a."uniteEnseignementId" = "UniteEnseignement".id AND a."enseignantId" = current_user_id()
  ))
  OR (is_etudiant() AND EXISTS (
      SELECT 1 FROM "User" me WHERE me.id = current_user_id() AND me."filiereId" = "UniteEnseignement"."filiereId"
  ))
);

-- ============================================================
-- Vérifications post-migration (échouent le migrate si incomplet)
-- NB : pg_get_expr parenthèse les expressions OR → on teste la
-- présence de is_system() par position, pas par préfixe.
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polname='Affectation_select'
            AND position('is_system()' in pg_get_expr(polqual, polrelid)) > 0) = 1,
         'Affectation_select doit contenir is_system()';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polname='Affectation_modify_responsable'
            AND position('is_system()' in pg_get_expr(polqual, polrelid)) > 0
            AND position('is_system()' in pg_get_expr(polwithcheck, polrelid)) > 0) = 1,
         'Affectation_modify_responsable doit avoir is_system() en USING et WITH CHECK';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polname='UniteEnseignement_select'
            AND position('is_system()' in pg_get_expr(polqual, polrelid)) > 0) = 1,
         'UniteEnseignement_select doit contenir is_system()';
END $$;
