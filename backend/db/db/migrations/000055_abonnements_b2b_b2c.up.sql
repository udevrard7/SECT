-- Migration 000055 — Restructuration module Abonnements (B2B/B2C + capitation)
-- Task ID: SECT-ABONNEMENTS-B2B-B2C
--
-- Objectif : Séparer l'offre en 2 branches (B2C enseignants freelance +
-- B2B institutions) avec modèle capitation pour le B2B.
--
-- 1. Ajout colonnes à la table Plan :
--    - branche : 'B2C' | 'B2B'
--    - prixParEtudiant : boolean (modèle capitation, B2B uniquement)
--    - quotaIAGeneration : int (null = illimité)
--    - quotaIACorrection : int (null = illimité)
--    - classeesMax : int (B2C : nb classes, null = illimité)
--    - popular : boolean (badge "Populaire")
--
-- 2. Désactivation des 4 anciens plans (actif=false) — conservés pour
--    l'historique des abonnements.
--
-- 3. Création des 3 nouveaux plans :
--    B2C : Prof Solo (0 FCFA), Prof Premium (4 900/mois)
--    B2B : Institutionnel (900 FCFA/étudiant/an, plancher 50 étudiants)

-- ═══ 1. Nouvelles colonnes ═══
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "branche" TEXT;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "prixParEtudiant" BOOLEAN DEFAULT false;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "quotaIAGeneration" INTEGER;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "quotaIACorrection" INTEGER;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "classeesMax" INTEGER;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "popular" BOOLEAN DEFAULT false;

-- ═══ 2. Désactivation des 4 anciens plans ═══
UPDATE "Plan" SET "actif" = false, "updatedAt" = NOW()
WHERE "type" IN ('GRATUIT', 'ESSENTIEL', 'PROFESSIONNEL', 'ENTREPRISE')
  AND "branche" IS NULL;

-- ═══ 3. Création des 3 nouveaux plans ═══

-- 3a. Plan "Prof Solo" (B2C — Freemium gratuit)
INSERT INTO "Plan" (
  "id", "nom", "type", "prixMensuel", "prixAnnuel",
  "nbEtablissementsMax", "nbFilieresMax", "nbEnseignantsMax", "nbEtudiantsMax",
  "nbQuestionsMax", "nbEvaluationsMois",
  "iaGeneration", "iaCorrection", "proctoring", "exportPDF",
  "support", "description", "actif",
  "branche", "prixParEtudiant", "quotaIAGeneration", "quotaIACorrection",
  "classeesMax", "popular",
  "createdAt", "updatedAt"
) VALUES (
  'plan_b2c_prof_solo', 'Prof Solo', 'GRATUIT', 0, 0,
  1, 5, 1, 40,
  100, 3,
  true, true, false, true,
  'email', 'Pour l''enseignant freelance : découvrez SECT gratuitement', true,
  'B2C', false, 3, 3,
  2, false,
  NOW(), NOW()
)
ON CONFLICT ("id") DO UPDATE SET
  "nom" = EXCLUDED."nom",
  "prixMensuel" = EXCLUDED."prixMensuel",
  "prixAnnuel" = EXCLUDED."prixAnnuel",
  "nbEtablissementsMax" = EXCLUDED."nbEtablissementsMax",
  "nbFilieresMax" = EXCLUDED."nbFilieresMax",
  "nbEnseignantsMax" = EXCLUDED."nbEnseignantsMax",
  "nbEtudiantsMax" = EXCLUDED."nbEtudiantsMax",
  "nbQuestionsMax" = EXCLUDED."nbQuestionsMax",
  "nbEvaluationsMois" = EXCLUDED."nbEvaluationsMois",
  "iaGeneration" = EXCLUDED."iaGeneration",
  "iaCorrection" = EXCLUDED."iaCorrection",
  "proctoring" = EXCLUDED."proctoring",
  "exportPDF" = EXCLUDED."exportPDF",
  "support" = EXCLUDED."support",
  "description" = EXCLUDED."description",
  "actif" = EXCLUDED."actif",
  "branche" = EXCLUDED."branche",
  "prixParEtudiant" = EXCLUDED."prixParEtudiant",
  "quotaIAGeneration" = EXCLUDED."quotaIAGeneration",
  "quotaIACorrection" = EXCLUDED."quotaIACorrection",
  "classeesMax" = EXCLUDED."classeesMax",
  "popular" = EXCLUDED."popular",
  "updatedAt" = NOW();

-- 3b. Plan "Prof Premium" (B2C — 4 900 FCFA/mois) — badge Populaire
INSERT INTO "Plan" (
  "id", "nom", "type", "prixMensuel", "prixAnnuel",
  "nbEtablissementsMax", "nbFilieresMax", "nbEnseignantsMax", "nbEtudiantsMax",
  "nbQuestionsMax", "nbEvaluationsMois",
  "iaGeneration", "iaCorrection", "proctoring", "exportPDF",
  "support", "description", "actif",
  "branche", "prixParEtudiant", "quotaIAGeneration", "quotaIACorrection",
  "classeesMax", "popular",
  "createdAt", "updatedAt"
) VALUES (
  'plan_b2c_prof_premium', 'Prof Premium', 'ESSENTIEL', 4900, 49000,
  1, 20, 1, 200,
  1000, 100,
  true, true, false, true,
  'email', 'Abonnement personnel enseignant : IA illimitée pour gagner du temps', true,
  'B2C', false, NULL, NULL,
  NULL, true,
  NOW(), NOW()
)
ON CONFLICT ("id") DO UPDATE SET
  "nom" = EXCLUDED."nom",
  "prixMensuel" = EXCLUDED."prixMensuel",
  "prixAnnuel" = EXCLUDED."prixAnnuel",
  "nbEtablissementsMax" = EXCLUDED."nbEtablissementsMax",
  "nbFilieresMax" = EXCLUDED."nbFilieresMax",
  "nbEnseignantsMax" = EXCLUDED."nbEnseignantsMax",
  "nbEtudiantsMax" = EXCLUDED."nbEtudiantsMax",
  "nbQuestionsMax" = EXCLUDED."nbQuestionsMax",
  "nbEvaluationsMois" = EXCLUDED."nbEvaluationsMois",
  "iaGeneration" = EXCLUDED."iaGeneration",
  "iaCorrection" = EXCLUDED."iaCorrection",
  "proctoring" = EXCLUDED."proctoring",
  "exportPDF" = EXCLUDED."exportPDF",
  "support" = EXCLUDED."support",
  "description" = EXCLUDED."description",
  "actif" = EXCLUDED."actif",
  "branche" = EXCLUDED."branche",
  "prixParEtudiant" = EXCLUDED."prixParEtudiant",
  "quotaIAGeneration" = EXCLUDED."quotaIAGeneration",
  "quotaIACorrection" = EXCLUDED."quotaIACorrection",
  "classeesMax" = EXCLUDED."classeesMax",
  "popular" = EXCLUDED."popular",
  "updatedAt" = NOW();

-- 3c. Plan "Institutionnel" (B2B — 900 FCFA/étudiant/an, plancher 50)
INSERT INTO "Plan" (
  "id", "nom", "type", "prixMensuel", "prixAnnuel",
  "nbEtablissementsMax", "nbFilieresMax", "nbEnseignantsMax", "nbEtudiantsMax",
  "nbQuestionsMax", "nbEvaluationsMois",
  "iaGeneration", "iaCorrection", "proctoring", "exportPDF",
  "support", "description", "actif",
  "branche", "prixParEtudiant", "quotaIAGeneration", "quotaIACorrection",
  "classeesMax", "popular",
  "createdAt", "updatedAt"
) VALUES (
  'plan_b2b_institutionnel', 'Institutionnel', 'ENTREPRISE', 0, 900,
  999, 999, 999, 99999,
  99999, 99999,
  true, true, true, true,
  'telephone', 'Modèle capitation : 900 FCFA/étudiant/an (plancher 50 étudiants). Profs, filières et étudiants illimités.', true,
  'B2B', true, NULL, NULL,
  NULL, true,
  NOW(), NOW()
)
ON CONFLICT ("id") DO UPDATE SET
  "nom" = EXCLUDED."nom",
  "prixMensuel" = EXCLUDED."prixMensuel",
  "prixAnnuel" = EXCLUDED."prixAnnuel",
  "nbEtablissementsMax" = EXCLUDED."nbEtablissementsMax",
  "nbFilieresMax" = EXCLUDED."nbFilieresMax",
  "nbEnseignantsMax" = EXCLUDED."nbEnseignantsMax",
  "nbEtudiantsMax" = EXCLUDED."nbEtudiantsMax",
  "nbQuestionsMax" = EXCLUDED."nbQuestionsMax",
  "nbEvaluationsMois" = EXCLUDED."nbEvaluationsMois",
  "iaGeneration" = EXCLUDED."iaGeneration",
  "iaCorrection" = EXCLUDED."iaCorrection",
  "proctoring" = EXCLUDED."proctoring",
  "exportPDF" = EXCLUDED."exportPDF",
  "support" = EXCLUDED."support",
  "description" = EXCLUDED."description",
  "actif" = EXCLUDED."actif",
  "branche" = EXCLUDED."branche",
  "prixParEtudiant" = EXCLUDED."prixParEtudiant",
  "quotaIAGeneration" = EXCLUDED."quotaIAGeneration",
  "quotaIACorrection" = EXCLUDED."quotaIACorrection",
  "classeesMax" = EXCLUDED."classeesMax",
  "popular" = EXCLUDED."popular",
  "updatedAt" = NOW();
