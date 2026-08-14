-- 000055 down: inverse la restructuration du module Abonnements B2B/B2C.
--
-- 1. Supprime les 3 nouveaux plans créés (B2C Prof Solo, B2C Prof Premium, B2B Institutionnel)
-- 2. Supprime les 6 colonnes ajoutées à "Plan"
--
-- ⚠️ NON RESTAURÉ : la désactivation des 4 anciens plans (UPDATE actif=false) est une
-- data change qui n'est pas inversée ici (impossible de savoir l'état antérieur exact
-- sans backup). Les 4 anciens plans restent inactifs après ce down.

-- ═══ 1. Suppression des 3 nouveaux plans ═══
DELETE FROM "Plan" WHERE "id" IN ('plan_b2c_prof_solo', 'plan_b2c_prof_premium', 'plan_b2b_institutionnel');

-- ═══ 2. Suppression des colonnes ajoutées ═══
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "branche";
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "prixParEtudiant";
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "quotaIAGeneration";
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "quotaIACorrection";
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "classeesMax";
ALTER TABLE "Plan" DROP COLUMN IF EXISTS "popular";
