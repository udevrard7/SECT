-- ════════════════════════════════════════════════════════════════════════════
-- 000095 — RLS policies Alerte + colonnes resolvedAt/resolvedById (SECT-ALERTES-FIX-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BUG P0 : RLS activée sur Alerte (migration 000007/000024) mais AUCUNE policy
-- créée → deny-by-default → GET/PATCH/INSERT/UPDATE tous bloqués silencieusement.
-- Les 2 lignes existantes ont été créées avant l'activation RLS ou via neondb_owner.
--
-- Fix : 3 policies (select/insert/update) + is_system() pour le dispatcher.
--
-- BUG P2 : mark-all-read filtre uniquement par userId = self → le RESPONSABLE
-- ne peut pas marquer comme lues les alertes scopées par filière/épreuve
-- (userId IS NULL). Le fix côté handler réutilisera les mêmes conditions RBAC
-- que le SELECT. La migration ajoute juste les policies nécessaires.
--
-- P4 : Ajout colonnes resolvedAt + resolvedById pour traçabilité.
-- ════════════════════════════════════════════════════════════════════════════

-- P4 : Colonnes resolvedAt + resolvedById
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "Alerte" ADD COLUMN IF NOT EXISTS "resolvedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL;

-- P0 : RLS policies
ALTER TABLE "Alerte" ENABLE ROW LEVEL SECURITY;

-- 1. SELECT : user voit SES alertes (userId = self) + alertes scopées à son
-- périmètre (RESPONSABLE : filière/épreuve de son étab ; ENSEIGNANT : épreuves
-- qu'il possède ; ADMIN : tout ; system : tout pour le dispatcher).
DROP POLICY IF EXISTS "Alerte_select" ON "Alerte";
CREATE POLICY "Alerte_select" ON "Alerte" FOR SELECT TO PUBLIC USING (
  "userId" = current_user_id()
  OR ("filiereId" IS NOT NULL AND filiere_in_my_etab("filiereId"))
  OR ("epreuveId" IS NOT NULL AND epreuve_in_my_etab("epreuveId"))
  OR is_admin()
  OR is_system()
);

-- 2. INSERT : enseignant/responsable/admin/system peuvent créer des alertes.
-- Le WITH CHECK est permissif (l'application-level valide le scoping côté handler).
DROP POLICY IF EXISTS "Alerte_insert" ON "Alerte";
CREATE POLICY "Alerte_insert" ON "Alerte" FOR INSERT TO PUBLIC
  WITH CHECK (
    is_enseignant() OR is_responsable() OR is_admin() OR is_system()
  );

-- 3. UPDATE : user peut marquer SES alertes + responsable/enseignant sur leur
-- périmètre + admin + system (dispatcher).
DROP POLICY IF EXISTS "Alerte_update" ON "Alerte";
CREATE POLICY "Alerte_update" ON "Alerte" FOR UPDATE TO PUBLIC USING (
  "userId" = current_user_id()
  OR ("filiereId" IS NOT NULL AND filiere_in_my_etab("filiereId"))
  OR ("epreuveId" IS NOT NULL AND epreuve_in_my_etab("epreuveId"))
  OR is_admin()
  OR is_system()
);
