-- Rollback : DATE → TIMESTAMP(3). Les dates seront stockées comme minuit UTC.
ALTER TABLE "AnneeAcademique" ALTER COLUMN "dateDebut" TYPE TIMESTAMP(3) USING "dateDebut"::timestamp;
ALTER TABLE "AnneeAcademique" ALTER COLUMN "dateFin" TYPE TIMESTAMP(3) USING "dateFin"::timestamp;
