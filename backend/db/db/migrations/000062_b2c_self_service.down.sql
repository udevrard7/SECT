-- Rollback: supprimer les policies modifiées et restaurer les anciennes

-- Restaurer les policies originales (sans is_enseignant_in_personal_etab)
DROP POLICY IF EXISTS "Filiere_modify_responsable" ON "Filiere";
CREATE POLICY "Filiere_modify_responsable" ON "Filiere"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND "etablissementId" = current_etablissement_id())
  WITH CHECK (is_responsable() AND "etablissementId" = current_etablissement_id());

DROP POLICY IF EXISTS "UniteEnseignement_modify_responsable" ON "UniteEnseignement";
CREATE POLICY "UniteEnseignement_modify_responsable" ON "UniteEnseignement"
  FOR ALL TO neondb_owner
  USING (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "UniteEnseignement"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ))
  WITH CHECK (is_responsable() AND EXISTS (
    SELECT 1 FROM "Filiere" f
    WHERE f."id" = "UniteEnseignement"."filiereId"
      AND f."etablissementId" = current_etablissement_id()
  ));

-- Note : on ne restaure pas create_b2c_subscription (trop complexe) — l'auto-setup
-- reste en place. Si besoin de rollback complet, restaurer la version de la migration 000058.

-- Supprimer la fonction helper
DROP FUNCTION IF EXISTS public.is_enseignant_in_personal_etab();
