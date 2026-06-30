-- ============================================================
-- Migration 000017 — Ajout anneeAcademiqueCouranteId sur Etablissement
-- ============================================================
--
-- Niveau 2 de la gestion dynamique des années académiques :
-- avant cette migration, il n'existait aucune notion d'« année courante »
-- pour un établissement. Les 3 années (2023-2024, 2024-2025, 2025-2026)
-- avaient toutes actif=true, et /affectations calculait l'année par défaut
-- via une heuristique date système (septembre = rentrée) — fausse si le
-- calendrier est custom ou l'année suivante pas encore créée.
--
-- Fix : ajouter une FK nullable anneeAcademiqueCouranteId sur Etablissement.
-- Pourquoi sur Etablissement (et pas un bool estCourante sur AnneeAcademique) ?
--   - L'année courante est un réglage établissement, pas une propriété de
--     l'année elle-même.
--   - Un bool estCourante sur AnneeAcademique imposerait une contrainte
--     d'unicité (une seule courante par étab) complexe à gérer en SQL.
--   - La FK sur Etablissement est simple, naturelle, et ON DELETE SET NULL
--     pour ne pas bloquer la suppression d'une année devenue inutile.
--
-- Pas de policy RLS supplémentaire nécessaire : le repo Etablissement fait
-- déjà SET LOCAL row_security = off pour les writes (comme UpdateLogo,
-- UpdateWatermark, ClearLogo), et le usecase valide les permissions
-- applicativement (ADMIN via ValidateAccessForEtablissement, RESPONSABLE
-- propriétaire via claims.EtablissementID).
-- ============================================================

ALTER TABLE "Etablissement"
  ADD COLUMN IF NOT EXISTS "anneeAcademiqueCouranteId" text
  REFERENCES "AnneeAcademique"("id") ON DELETE SET NULL;

-- Index pour accélérer les jointures (Etablissement → AnneeAcademique courante)
CREATE INDEX IF NOT EXISTS "Etablissement_anneeAcademiqueCouranteId_idx"
  ON "Etablissement"("anneeAcademiqueCouranteId");
