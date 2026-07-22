-- Rollback 000078 : restaure l'état cassé de 000062 (TO neondb_owner, sans clause RESPONSABLE).
-- ATTENTION : ce rollback réintroduit le bug RESPONSABLE-DELETE-BUG.

-- User_delete : revient à l'état 000062 (TO neondb_owner, sans clause RESPONSABLE)
DROP POLICY IF EXISTS "User_delete" ON "User";
CREATE POLICY "User_delete" ON "User"
  FOR DELETE TO neondb_owner
  USING (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
  );

-- User_update : revient à l'état 000062
DROP POLICY IF EXISTS "User_update" ON "User";
CREATE POLICY "User_update" ON "User"
  FOR UPDATE TO neondb_owner
  USING (
    "id" = current_user_id()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId")))
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
  )
  WITH CHECK (
    "id" = current_user_id()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId")))
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
  );

-- User_insert : revient à l'état 000062
DROP POLICY IF EXISTS "User_insert" ON "User";
CREATE POLICY "User_insert" ON "User"
  FOR INSERT TO neondb_owner
  WITH CHECK (
    (is_responsable() AND "etablissementId" = current_etablissement_id())
    OR (is_admin() AND ("role" = 'ADMIN' OR ("etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))))
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT' AND "etablissementId" = current_etablissement_id())
  );

-- is_enseignant_in_personal_etab : revient à GRANT neondb_owner uniquement
REVOKE ALL ON FUNCTION public.is_enseignant_in_personal_etab() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_enseignant_in_personal_etab() TO neondb_owner;
