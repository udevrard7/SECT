-- ════════════════════════════════════════════════════════════════════════════
-- 000086 — ValidationUE.anneeAcademiqueId NOT NULL (SECT-VALIDATIONUE-NOTNULL-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTE :
--   ValidationUE.anneeAcademiqueId est nullable (migration 000002). Or cette
--   colonne est la CLÉ de toutes les agrégations par année (moyenne annuelle,
--   crédits validés, décision de promotion). Avec NULL :
--     - l'index unique (etudiantId, uniteEnseignementId, anneeAcademiqueId)
--       autorise les DOUBLONS (PostgreSQL traite NULL comme distinct) → un
--       étudiant peut avoir 2 lignes pour la même UE avec year=NULL ;
--     - une requête SUM(credits WHERE statut='VALIDEE' AND annee=X) IGNORE les
--       lignes NULL → la moyenne/credits sera FAUSSE pour la décision de
--       promotion (feature SECT-PROMOTION-*).
--
-- CHANGEMENTS :
--   1. Déduplication : si un (etudiantId, uniteEnseignementId) a plusieurs
--      lignes avec anneeAcademiqueId IS NULL, on garde la plus récente
--      (MAX(updatedAt), tiebreak sur id) et on supprime les autres. Sans cela,
--      le backfill créerait des doublons violant l'index unique.
--
--   2. Backfill : pour chaque ligne avec annee=NULL, on récupère l'année
--      courante de l'établissement de l'étudiant (Etablissement.anneeAcademiqueCouranteId).
--      C'est l'année logique à laquelle la validation a été saisie.
--
--   3. Purge des orphelins résiduels : les lignes restées NULL après backfill
--      (étudiant sans établissement, ou établissement sans année courante) sont
--      SUPPRIMÉES. Elles n'ont pas de sens business (une validation sans année
--      ni contexte établissement est orpheline). Cette purge est documentée et
--      non réversible (le rollback ne restaure pas les lignes supprimées).
--
--   4. Changement de FK : ON DELETE SET NULL → ON DELETE CASCADE. Incompatible
--      avec NOT NULL (sinon supprimer une AnneeAcademique tenterait de mettre
--      NULL → erreur). CASCADE est cohérent : supprimer une année supprime ses
--      validations (elles n'ont plus de sens sans leur année). Le HardDelete
--      d'AnneeAcademique est rare (SoftDelete met juste actif=false).
--
--   5. SET NOT NULL sur anneeAcademiqueId.
--
-- IDEMPOTENCE :
--   - Les étapes 1-3 utilisent WHERE anneeAcademiqueId IS NULL → no-op si déjà
--     toutes NOT NULL.
--   - Les DROP/ADD CONSTRAINT sont idempotents via IF EXISTS.
--   - ALTER ... SET NOT NULL échouera s'il reste des NULL (ne devrait pas arriver
--     après étapes 1-3, mais protège contre un état inattendu).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Déduplication des lignes annee=NULL pour le même (etudiant, UE) ───
-- Garde la plus récente (updatedAt MAX, tiebreak id MAX). Supprime les autres.
-- Critère : v.updatedAt < v2.updatedAt OU (égalité + v.id < v2.id).
DELETE FROM "ValidationUE" v
USING "ValidationUE" v2
WHERE v."etudiantId" = v2."etudiantId"
  AND v."uniteEnseignementId" = v2."uniteEnseignementId"
  AND v."anneeAcademiqueId" IS NULL
  AND v2."anneeAcademiqueId" IS NULL
  AND (v."updatedAt" < v2."updatedAt"
       OR (v."updatedAt" = v2."updatedAt" AND v."id" < v2."id"));

-- ─── 2. Backfill : annee = année courante de l'établissement de l'étudiant ───
UPDATE "ValidationUE" vu
SET "anneeAcademiqueId" = (
  SELECT e."anneeAcademiqueCouranteId"
  FROM "User" u
  JOIN "Etablissement" e ON e."id" = u."etablissementId"
  WHERE u."id" = vu."etudiantId"
)
WHERE vu."anneeAcademiqueId" IS NULL;

-- ─── 3. Purge des orphelins résiduels (étudiant sans étab / étab sans année) ───
-- Ces lignes n'ont pas de sens business (validation sans contexte année).
-- Documenté : non réversible par le rollback.
DELETE FROM "ValidationUE" WHERE "anneeAcademiqueId" IS NULL;

-- ─── 4. Changement de FK : SET NULL → CASCADE (requis pour NOT NULL) ───
ALTER TABLE "ValidationUE" DROP CONSTRAINT IF EXISTS "ValidationUE_anneeAcademiqueId_fkey";
ALTER TABLE "ValidationUE" ADD CONSTRAINT "ValidationUE_anneeAcademiqueId_fkey"
  FOREIGN KEY ("anneeAcademiqueId") REFERENCES "AnneeAcademique"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 5. SET NOT NULL ───
ALTER TABLE "ValidationUE" ALTER COLUMN "anneeAcademiqueId" SET NOT NULL;
