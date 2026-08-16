-- Migration 000059 — Table IAUsage pour tracking mensuel des quotas IA
-- Task ID: SECT-QUOTA-GUARDS
--
-- Objectif : Tracker l'usage IA (génération + correction) par établissement
-- et par mois pour appliquer les quotas quotaIAGeneration / quotaIACorrection.
--
-- Structure : un compteur par (etablissementId, type, month).
-- type = 'generation' | 'correction'

CREATE TABLE IF NOT EXISTS "IAUsage" (
    "id" text NOT NULL,
    "etablissementId" text NOT NULL,
    "type" text NOT NULL, -- 'generation' | 'correction'
    "month" timestamp without time zone NOT NULL, -- date_trunc('month', now())
    "count" integer NOT NULL DEFAULT 0,
    "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IAUsage_pkey" PRIMARY KEY ("id")
);

-- Contrainte unique pour le ON CONFLICT (upsert)
CREATE UNIQUE INDEX IF NOT EXISTS "IAUsage_etab_type_month_key"
    ON "IAUsage" ("etablissementId", "type", "month");

-- Index pour performance (requêtes de count)
CREATE INDEX IF NOT EXISTS "IAUsage_etab_month_idx"
    ON "IAUsage" ("etablissementId", "month");

-- FK vers Etablissement
ALTER TABLE "IAUsage" ADD CONSTRAINT "IAUsage_etablissementId_fkey"
    FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE;
