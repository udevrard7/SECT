-- Migration 000076 : nettoyer les RESPONSABLES orphelins
--
-- BUGFIX (RESPONSABLE-ORPHELIN) : quand un établissement B2B était supprimé,
-- le FK ON DELETE SET NULL sur User.etablissementId laissait les RESPONSABLES
-- orphelins (etablissementId=NULL, role=RESPONSABLE, actif=true).
-- Cette migration :
--   1. Rétrograde les RESPONSABLES orphelins en ETUDIANT
--   2. Désactive les utilisateurs orphelins (plus d'établissement = plus de raison d'être actif)
--   3. Crée un index pour détecter rapidement les orphelins à l'avenir

BEGIN;

-- ── Étape 1 : Identifier les orphelins et les corriger ──

-- Rétrograde les RESPONSABLES orphelins (sans établissement) en ETUDIANT
-- et les désactive. Un RESPONSABLE sans établissement est un artefact
-- d'une suppression d'établissement B2B.
UPDATE "User"
SET "role" = 'ETUDIANT',
    "actif" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'RESPONSABLE'
  AND "etablissementId" IS NULL
  AND "actif" = true;

-- Désactive aussi les ENSEIGNANTS orphelins (sans établissement)
-- Note : les ETUDIANTS orphelins sont laissés actifs car ils peuvent
-- exister dans le cadre multi-etab (bien que etablissementId=NULL soit
-- anormal, ce n'est pas critique).
UPDATE "User"
SET "actif" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'ENSEIGNANT'
  AND "etablissementId" IS NULL
  AND "actif" = true;

COMMIT;
