-- ============================================================
-- Migration 000110 — Une seule année académique ACTIVE par établissement
-- SECT-ANNEE-CHEVAUCHEMENT-1
-- ============================================================
--
-- CONTEXTE (diagnostic prod, 2026-2027 déjà activée par le responsable) :
--   La table AnneeAcademique portait un booléen "actif" SANS unicité —
--   l'établissement The University of Abidjan avait 3 années actives
--   simultanément (2024-2025, 2025-2026, 2026-2027), toutes visibles dans
--   les vues « actif=true ». Combiné au filtrage OPTIONNEL de
--   /api/affectations (param anneeUniversitaire absent → toutes années
--   confondues), l'étudiant voyait sur « Mes enseignants » les affectations
--   PUBLIEE de 2025-2026 ET 2026-2027 mélangées — l'amalgame signalé.
--
-- INVARIANT (désormais garanti par la DB) :
--   actif = true  ⟺  l'année est l'année COURANTE de son établissement
--                    (Etablissement.anneeAcademiqueCouranteId, migration 000017)
--   Une seule ligne actif=true par établissement — les autres années sont
--   l'HISTORIQUE (actif=false) : consultables, mais hors du périmètre
--   « courant » de tous les écrans.
--
-- ÉTAPE 1 — Réconciliation des données existantes :
--   1a. Ré-activer l'année courante si elle avait été soft-deleted
--       (actif=false) : l'invariant exige courante ⇒ actif=true.
--   1b. Désactiver toutes les autres années actives. L'année qui reste
--       active = l'année courante si définie, sinon la plus récente
--       (dateDebut DESC) de l'établissement.
--
-- ÉTAPE 2 — Index unique partiel : la contrainte est garantie par la DB
--   pour toujours (même un accès SQL direct, un futur bug applicatif ou le
--   rôle neondb_owner ne peut plus créer 2 années actives).
--
-- NB RLS : les UPDATE de réconciliation s'exécutent as owner (BYPASSRLS,
--   apply transactionnel) — c'est le cas de toute migration. L'index ne
--   nécessite aucun GRANT supplémentaire.
-- ============================================================

-- ─── 1a. Année courante soft-deleted → ré-activée ───
UPDATE "AnneeAcademique" a
SET "actif" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE a."actif" = false
  AND a."id" IN (
    SELECT e."anneeAcademiqueCouranteId" FROM "Etablissement" e
    WHERE e."anneeAcademiqueCouranteId" IS NOT NULL
  );

-- ─── 1b. Toute année active NON courante (ou non la plus récente sans
--   courante définie) → désactivée ───
UPDATE "AnneeAcademique" a
SET "actif" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE a."actif" = true
  AND a."id" IS DISTINCT FROM (
    SELECT COALESCE(e."anneeAcademiqueCouranteId", recent."id")
    FROM "Etablissement" e
    LEFT JOIN LATERAL (
      SELECT a2."id" FROM "AnneeAcademique" a2
      WHERE a2."etablissementId" = e."id"
      ORDER BY a2."dateDebut" DESC
      LIMIT 1
    ) recent ON true
    WHERE e."id" = a."etablissementId"
  );

-- ─── 2. Index unique partiel : 1 seule année active par établissement ───
CREATE UNIQUE INDEX IF NOT EXISTS "AnneeAcademique_one_active_per_etab"
  ON "AnneeAcademique"("etablissementId")
  WHERE "actif" = true;
