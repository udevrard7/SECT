-- ============================================================
-- Migration 000052 — B-complète : ADMIN gère TOUS les RESPONSABLE (PaaS)
-- ============================================================
--
-- Objectif : l'ADMIN (propriétaire PaaS) doit pouvoir voir + créer + modifier
-- + supprimer n'importe quel RESPONSABLE, MÊME s'il n'a pas d'EtablissementAccess
-- sur l'établissement de ce responsable.
--
-- Raison métier : l'admin est le propriétaire de la plateforme. Il gère les
-- responsables (onboarding, support, résiliation) sur TOUS les établissements.
-- Sans ce fix, l'admin ne peut rien faire tant qu'un RESPONSABLE n'a pas approuvé
-- une demande EtablissementAccess — ce qui bloque le run PaaS.
--
-- Périmètre SÉCURITAIRE (strict) :
--   - Uniquement le rôle RESPONSABLE est concerné (clause `role = 'RESPONSABLE'`).
--   - Les ENSEIGNANTS et ÉTUDIANTS restent soumis à la RLS stricte (admin doit
--     avoir un EtablissementAccess APPROUVÉ pour les voir/muter).
--   - Les data sensibles (notes, copies, surveillance) restent protégées par
--     leurs propres policies RLS (Session, Reponse, Resultat, etc.).
--
-- Approche : DROP + CREATE des 4 policies User_{select,insert,update,delete}
-- en ajoutant la clause `OR (is_admin() AND role = 'RESPONSABLE'::"Role")`.
-- Les clauses existantes (issues des migrations 000007/000014/000024/000041)
-- sont intégralement conservées.
--
-- Note : `role` dans ces policies désigne la colonne de la LIGNE cible (le user
-- sélectionné/inséré/modifié/supprimé), PAS le rôle du current user. La fonction
-- is_admin() teste le rôle du current user (posé via SET LOCAL app.claims.role).
-- ============================================================

-- ---------- User_select ----------
-- État précédent : migration 000041 (étudiant voit les étudiants de son étab).
DROP POLICY IF EXISTS "User_select" ON "User";

CREATE POLICY "User_select" ON "User" FOR SELECT TO PUBLIC USING (
  (id = current_user_id())
  OR (is_etudiant() AND (role = 'ENSEIGNANT'::"Role") AND EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      WHERE ef."enseignantId" = "User".id
        AND ef."filiereId" = current_user_filiere_id()
  ))
  OR (is_etudiant() AND (role = 'ETUDIANT'::"Role") AND "etablissementId" = current_etablissement_id())
  OR (is_enseignant() AND (role = 'ETUDIANT'::"Role") AND EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      WHERE ef."enseignantId" = current_user_id()
        AND ef."filiereId" = "User"."filiereId"
  ))
  OR (is_enseignant() AND (role IN ('ENSEIGNANT'::"Role", 'RESPONSABLE'::"Role")) AND "etablissementId" = current_etablissement_id())
  OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
  OR (is_admin() AND ("etablissementId" IS NULL) AND (role = 'ADMIN'::"Role"))
  -- 000052 B-complète : ADMIN voit TOUS les RESPONSABLE (gestion PaaS)
  OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
);

-- ---------- User_insert ----------
-- État précédent : migration 000007/000024 (WITH CHECK).
DROP POLICY IF EXISTS "User_insert" ON "User";

CREATE POLICY "User_insert" ON "User" FOR INSERT TO PUBLIC WITH CHECK (
  (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND (
        (role = 'ADMIN'::"Role")
        OR (("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
      ))
  -- 000052 B-complète : ADMIN peut créer un RESPONSABLE sans accès étab
  OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
);

-- ---------- User_update ----------
-- État précédent : migration 000007/000024 (USING + WITH CHECK).
DROP POLICY IF EXISTS "User_update" ON "User";

CREATE POLICY "User_update" ON "User" FOR UPDATE TO PUBLIC
  USING (
    (id = current_user_id())
    OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
    -- 000052 B-complète : ADMIN modifie les RESPONSABLE (ligne cible = RESPONSABLE)
    OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
  )
  WITH CHECK (
    (id = current_user_id())
    OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
    -- 000052 B-complète : la ligne après update doit aussi être un RESPONSABLE
    -- (la usecase CanCreate empêche la demotion RESPONSABLE→ENSEIGNANT de toute façon)
    OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
  );

-- ---------- User_delete ----------
-- État précédent : migration 000007/000024 (USING).
DROP POLICY IF EXISTS "User_delete" ON "User";

CREATE POLICY "User_delete" ON "User" FOR DELETE TO PUBLIC
  USING (
    (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
    -- 000052 B-complète : ADMIN supprime les RESPONSABLE
    OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
  );
