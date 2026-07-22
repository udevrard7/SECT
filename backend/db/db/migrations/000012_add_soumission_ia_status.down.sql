-- Rollback 000012 — supprime statutIA + erreurIA + l'enum
ALTER TABLE "Soumission"
  DROP COLUMN IF EXISTS "erreurIA",
  DROP COLUMN IF EXISTS "statutIA";

DROP TYPE IF EXISTS "StatutIASoumission";
