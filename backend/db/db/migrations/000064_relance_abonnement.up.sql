-- Migration 000064 — Relance J-7 avant expiration abonnement B2C
-- Task ID: SECT-FACTURE-EMAIL
--
-- Objectif : un worker périodique (toutes les 6h) vérifie les abonnements ACTIF
-- dont la dateFin est dans les 7 prochains jours, et envoie un email de relance.
-- Le flag relanceEnvoyee évite le spam (1 seule relance par abonnement).
--
-- Reset du flag : quand l'abonnement est renouvelé (paiement renouvellement),
-- le handler /renew reset relanceEnvoyee=false pour permettre une nouvelle
-- relance au cycle suivant.

-- ═══ 1. Colonne relanceEnvoyee sur Abonnement ═══
ALTER TABLE "Abonnement" ADD COLUMN IF NOT EXISTS "relanceEnvoyee" BOOLEAN NOT NULL DEFAULT false;

-- ═══ 2. Index pour le worker (abonnements ACTIF avec dateFin proche) ═══
CREATE INDEX IF NOT EXISTS "Abonnement_relance_check_idx"
    ON "Abonnement" ("statut", "dateFin", "relanceEnvoyee")
    WHERE "statut" = 'ACTIF' AND "relanceEnvoyee" = false AND "deletedAt" IS NULL;
