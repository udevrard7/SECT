-- 000073_admin_delete_etablissement.up.sql
-- ============================================================================
-- Permettre à l'ADMIN PaaS de supprimer des établissements (notamment
-- de type PERSONNEL créés via self-service B2C).
--
-- CONTEXTE :
--   1. Il n'y avait AUCUNE policy DELETE sur "Etablissement" → PostgreSQL
--      refuse le DELETE même pour l'ADMIN (RLS par défaut = deny).
--   2. Le usecase Delete appelle ValidateAccessForEtablissement qui vérifie
--      EtablissementAccess — les établissements PERSONNEL n'ont pas d'entrée
--      dans cette table → 403.
--
-- FIX :
--   1. RLS : policy Etablissement_delete permettant à ADMIN ou system-worker
--      de supprimer un établissement.
--   2. FK Facture : passage de ON DELETE RESTRICT à ON DELETE SET NULL pour
--      ne pas bloquer la suppression d'un établissement B2C qui a des factures.
--      (Les factures conservent leur existence pour la traçabilité comptable,
--      mais le lien etablissementId est effacé.)
-- ============================================================================

-- 1. Policy DELETE sur Etablissement (ADMIN + system-worker)
CREATE POLICY "Etablissement_delete" ON "Etablissement"
    FOR DELETE TO public
    USING (
        is_admin()
        OR is_system()
    );

-- 2. FK Facture : RESTRICT → SET NULL pour ne pas bloquer la suppression
ALTER TABLE "Facture" DROP CONSTRAINT IF EXISTS "Facture_etablissementId_fkey";
ALTER TABLE "Facture"
    ADD CONSTRAINT "Facture_etablissementId_fkey"
    FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;