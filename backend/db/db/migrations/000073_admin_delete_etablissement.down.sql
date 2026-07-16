-- 000073_admin_delete_etablissement.down.sql
-- Revert : supprimer la policy DELETE + restaurer RESTRICT sur Facture FK

DROP POLICY IF EXISTS "Etablissement_delete" ON "Etablissement";

ALTER TABLE "Facture" DROP CONSTRAINT IF EXISTS "Facture_etablissementId_fkey";
ALTER TABLE "Facture"
    ADD CONSTRAINT "Facture_etablissementId_fkey"
    FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;