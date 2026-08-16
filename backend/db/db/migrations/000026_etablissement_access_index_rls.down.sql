-- Rollback de la migration 000026 — B-5 + B-6

-- B-6 : retirer la policy RESPONSABLE
DROP POLICY IF EXISTS "EtablissementAccess_modify_responsable" ON "EtablissementAccess";

-- B-5 : restaurer l'index unique global (remplace l'index partiel)
DROP INDEX IF EXISTS "EtablissementAccess_adminId_etablissementId_active_key";
CREATE UNIQUE INDEX "EtablissementAccess_adminId_etablissementId_key"
    ON "EtablissementAccess" ("adminId", "etablissementId");
