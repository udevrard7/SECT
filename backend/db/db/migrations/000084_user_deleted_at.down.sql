-- ════════════════════════════════════════════════════════════════════════════
-- 000084 — DOWN : revert User.deletedAt + RLS User_select/User_update/User_delete
-- (SECT-USER-CLEANUP-INFRA-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Drop l'index idx_user_deleted_at
-- 2. Restaurer la policy User_select (version 000024 — sans garde-fou deletedAt,
--    sans is_system(), avec la branche ADMIN `etablissementId IS NOT NULL AND
--    admin_has_...` OU `etablissementId IS NULL AND role = 'ADMIN'`).
--    Réintroduit le bug d'invisibilité des orphelins (cohérent avec un rollback).
-- 3. Restaurer la policy User_update (version 000078 — sans garde-fou deletedAt).
-- 4. Restaurer la policy User_delete (version 000078 — sans is_system()).
-- 5. Drop la colonne "deletedAt" (cascade implicite sur l'index déjà droppé).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Drop l'index partiel
DROP INDEX IF EXISTS "idx_user_deleted_at";

-- 2. Restaurer la policy User_select (version 000024 — sans deletedAt, sans
--    is_system(), sans la simplification is_admin()). Réintroduit le bug
--    orphelins-invisibles.
DROP POLICY IF EXISTS "User_select" ON "User";
CREATE POLICY "User_select" ON "User" FOR SELECT TO PUBLIC USING (
  (id = current_user_id())
  OR (is_etudiant() AND (role = 'ENSEIGNANT'::"Role") AND enseignant_in_my_filiere(id))
  OR (is_enseignant() AND (role = 'ETUDIANT'::"Role") AND etudiant_in_my_filiere(id))
  OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
  OR (is_admin() AND ("etablissementId" IS NULL) AND (role = 'ADMIN'::"Role"))
);

-- 3. Restaurer la policy User_update (version 000078 — TO PUBLIC + clauses
--    RESPONSABLE/ADMIN-étab/ADMIN-RESPONSABLE/B2C, sans garde-fou deletedAt).
DROP POLICY IF EXISTS "User_update" ON "User";
CREATE POLICY "User_update" ON "User" FOR UPDATE TO PUBLIC
  USING (
    (id = current_user_id())
    OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
    -- 000052 B-complète : ADMIN modifie les RESPONSABLE
    OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
    -- 000062 B2C conservé
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
  )
  WITH CHECK (
    (id = current_user_id())
    OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
    OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
  );

-- 4. Restaurer la policy User_delete (version 000078 — sans is_system()).
DROP POLICY IF EXISTS "User_delete" ON "User";
CREATE POLICY "User_delete" ON "User" FOR DELETE TO PUBLIC
  USING (
    (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
    -- 000052 B-complète restaurée : ADMIN supprime les RESPONSABLE (PaaS)
    OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
    -- 000062 B2C conservé : ENSEIGNANT dans étab PERSONNEL supprime les ÉTUDIANTS
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
  );

-- 5. Drop la colonne "deletedAt" (cascade implicite sur l'index déjà droppé)
ALTER TABLE "User" DROP COLUMN IF EXISTS "deletedAt";

-- Note : aucun GRANT à reverting — les grants de table héritent des defaults
-- (sect_app + neondb_owner) et ne dépendent pas des colonnes.
