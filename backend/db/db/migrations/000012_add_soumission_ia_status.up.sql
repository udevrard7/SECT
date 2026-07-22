-- ============================================================
-- Migration 000012 — Ajout colonnes statutIA + erreurIA à Soumission
-- ============================================================
-- P4-DEVOIRS-4 : HomeworkCorrectionWorker asynchrone.
-- Pour permettre un polling propre du frontend (état de chargement
-- "Évaluation IA en cours…"), on ajoute 2 colonnes à Soumission :
--   - statutIA : enum (EN_ATTENTE | EN_COURS | TERMINE | ERREUR)
--   - erreurIA : text (message d'erreur si statutIA = ERREUR)
--
-- noteIA et justificationIA existent déjà (migration 000002).
-- Convention cohérente avec Reponse.noteIA/justificationIA (correction
-- d'examens), mais avec un statut explicite pour le polling.
-- ============================================================

CREATE TYPE "StatutIASoumission" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'TERMINE', 'ERREUR');

ALTER TABLE "Soumission"
  ADD COLUMN IF NOT EXISTS "statutIA" "StatutIASoumission" DEFAULT 'EN_ATTENTE',
  ADD COLUMN IF NOT EXISTS "erreurIA" TEXT;
