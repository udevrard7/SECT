-- ════════════════════════════════════════════════════════════════════════════
-- 000078 — Fix User RLS policies for sect_app role (RESPONSABLE-DELETE-BUG)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BUG : impossible de supprimer un RESPONSABLE (ou tout user sans etablissementId)
--       depuis le frontend admin. Le backend retourne 200 "utilisateur supprimé"
--       mais l'utilisateur reste en DB (DELETE affects 0 rows — silent RLS failure).
--
-- CAUSE RACINE (2 bugs introduits par la migration 000062_b2c_self_service) :
--
--   1. Les policies User_insert / User_update / User_delete ont été recréées
--      `TO neondb_owner` au lieu de `TO PUBLIC`. En production, le backend Render
--      se connecte en tant que rôle `sect_app` (NON membre de `neondb_owner`).
--      → Aucune policy DELETE ne s'applique à `sect_app` → RLS deny by default
--        → DELETE FROM "User" WHERE id = $1 affecte 0 rows sans erreur.
--
--   2. La clause `(is_admin() AND (role = 'RESPONSABLE'::"Role"))` (ajoutée par
--      000052 B-complète pour permettre à l'ADMIN PaaS de gérer TOUS les
--      RESPONSABLE) a été SUPPRIMÉE par 000062. Même avec `TO PUBLIC`, un ADMIN
--      ne pourrait pas supprimer un RESPONSABLE sans etablissementId.
--
--   3. La fonction `is_enseignant_in_personal_etab()` (créée par 000062) a
--      `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO neondb_owner` uniquement.
--      En passant les policies à `TO PUBLIC`, `sect_app` évaluerait la fonction
--      → permission denied. Il faut GRANT EXECUTE TO PUBLIC.
--
-- FIX : restaure l'état 000052 (TO PUBLIC + clause RESPONSABLE) en CONSERVANT
--       les ajouts B2C de 000062 (clauses is_enseignant_in_personal_etab).
--
-- Test de régression : la suppression d'un RESPONSABLE "vierge" (pas de data,
--   etablissementId = NULL) doit maintenant fonctionner en production.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. GRANT EXECUTE sur is_enseignant_in_personal_etab() à PUBLIC ───
-- Sans ça, sect_app (rôle production) ne peut pas évaluer la fonction dans les
-- policies TO PUBLIC → erreur "permission denied for function" au lieu de 0 rows.
REVOKE ALL ON FUNCTION public.is_enseignant_in_personal_etab() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_enseignant_in_personal_etab() TO PUBLIC;

-- ─── 2. User_insert : TO PUBLIC + clause RESPONSABLE + clause B2C ───
DROP POLICY IF EXISTS "User_insert" ON "User";
CREATE POLICY "User_insert" ON "User" FOR INSERT TO PUBLIC WITH CHECK (
  (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND (
        (role = 'ADMIN'::"Role")
        OR (("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
      ))
  -- 000052 B-complète restaurée : ADMIN peut créer un RESPONSABLE sans accès étab
  OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
  -- 000062 B2C conservé : ENSEIGNANT dans étab PERSONNEL crée des ÉTUDIANTS
  OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
);

-- ─── 3. User_update : TO PUBLIC + clause RESPONSABLE + clause B2C ───
DROP POLICY IF EXISTS "User_update" ON "User";
CREATE POLICY "User_update" ON "User" FOR UPDATE TO PUBLIC
  USING (
    (id = current_user_id())
    OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
    -- 000052 B-complète restaurée : ADMIN modifie les RESPONSABLE
    OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
    -- 000062 B2C conservé
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
  )
  WITH CHECK (
    (id = current_user_id())
    OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
    -- 000052 B-complète restaurée : la ligne après update doit être un RESPONSABLE
    OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
    -- 000062 B2C conservé
    OR (is_enseignant_in_personal_etab() AND "role" = 'ETUDIANT'::"Role" AND "etablissementId" = current_etablissement_id())
  );

-- ─── 4. User_delete : TO PUBLIC + clause RESPONSABLE + clause B2C ───
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
