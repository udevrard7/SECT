-- Migration 000057 — Soft delete Abonnement (deletedAt)
-- Task ID: SECT-ABONNEMENT-SOFT-DELETE
--
-- Objectif : Permettre la suppression (soft delete) des abonnements RÉSILIÉS.
-- Actuellement, DELETE /api/abonnements/{id} ne fait que résilier (statut → RESILIE).
-- L'abonnement reste visible. On ajoute une colonne deletedAt pour le soft delete.
--
-- Règle métier :
--   - statut = RESILIE + deletedAt IS NULL → abonnement résilié mais visible
--   - statut = RESILIE + deletedAt IS NOT NULL → abonnement supprimé (masqué des listes)
--   - On ne peut soft delete QUE si statut = RESILIE (sécurité : ne pas supprimer un ACTIF)

-- ═══ 1. Ajout colonne deletedAt ═══
ALTER TABLE "Abonnement" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP WITHOUT TIME ZONE;

-- ═══ 2. Index pour performance (filtre WHERE deletedAt IS NULL) ═══
CREATE INDEX IF NOT EXISTS "Abonnement_deletedAt_idx" ON "Abonnement" ("deletedAt") WHERE "deletedAt" IS NULL;

-- ═══ 3. La RLS existante (Abonnement_modify_admin) couvre déjà le UPDATE ═══
-- Pas besoin de nouvelle policy : le soft delete est un UPDATE deletedAt = NOW().
