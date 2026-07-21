-- ════════════════════════════════════════════════════════════════════════════
-- 000096 — Fix RLS Alerte_select : admin PaaS ne voit QUE les alertes système
--          (SECT-NOTIF-E2E-VERIFY-1 fix multi-tenant)
-- ════════════════════════════════════════════════════════════════════════════
--
-- BUG : la migration 000095 donnait is_admin() un accès TOTAL aux alertes.
-- Mais l'admin est propriétaire du SaaS multi-tenant — il ne doit PAS voir
-- les alertes sensibles des établissements (fraude, élèves, etc.).
--
-- Fix : remplacer is_admin() par une condition restrictive pour l'admin :
--   (userId IS NULL AND filiereId IS NULL AND epreuveId IS NULL)
-- = uniquement les alertes système globales (maintenance, clôture auto).
--
-- Le is_system() reste pour le dispatcher (il écrit les alertes via le worker).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Alerte_select" ON "Alerte";
CREATE POLICY "Alerte_select" ON "Alerte" FOR SELECT TO PUBLIC USING (
  "userId" = current_user_id()
  OR ("filiereId" IS NOT NULL AND filiere_in_my_etab("filiereId"))
  OR ("epreuveId" IS NOT NULL AND epreuve_in_my_etab("epreuveId"))
  -- ADMIN PaaS : uniquement les alertes système (pas de données établissement)
  OR (is_admin() AND "userId" IS NULL AND "filiereId" IS NULL AND "epreuveId" IS NULL)
  OR is_system()
);
