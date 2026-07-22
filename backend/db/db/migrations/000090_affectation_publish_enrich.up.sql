-- ═══════════════════════════════════════════════════════════════
-- Migration 000090 — Affectation publish enrichments
-- Task ID: SECT-AFFECTATION-PUBLISH-ENRICH-1
-- ═══════════════════════════════════════════════════════════════
--
-- 5 enrichissements de l'action « publier » d'une affectation :
--   1. Horodatage : colonnes "publishedAt" + "publishedById" (NULL tant
--      que statut != 'PUBLIEE'). Set côté handler quand statut devient
--      PUBLIEE. Permet d'afficher « Publiée le DD/MM/YYYY par {name} ».
--   2. AuditLog : journalisation AFFECTATION_PUBLISHED (côté handler,
--      via authRepo.CreateAuditLog — pas de SQL dans cette migration).
--   3. Lock backend : handler retourne 409 si PATCH sur PUBLIEE sans
--      changer le statut (côté handler, pas de SQL ici).
--   4. Notification email enseignant : handler + mailer (pas de SQL).
--   5. Visibilité étendue aux ETUDIANT : RLS — un étudiant peut SELECT
--      les affectations PUBLIEE des UE de sa filière.
--
-- Avant cette migration, "Affectation_select" autorisait :
--   - enseignant → ses propres affectations
--   - responsable → affectations de son établissement
--   - admin → affectations des établissements auxquels il a accès
-- Les étudiants n'avaient AUCUN accès → ils ne voyaient jamais qui
-- enseigne quelle UE, même après publication.
--
-- Après cette migration, on ajoute une 4e branche OR :
--   - étudiant → affectations PUBLIEE dont l'UE.filiereId = User.filiereId
--     (current_user_filiere_id() — SECURITY DEFINER, migration 000020)
--     Pour les UE multi-filières (N:N via UniteEnseignementFiliere), on
--     couvre aussi le cas ue."filiereId" IS NULL → on reste strict sur
--     filiereId exact pour éviter une fuite (un étudiant ne doit voir
--     que les affectations des UE de SA filière).
-- ═══════════════════════════════════════════════════════════════

-- 1. ADD COLUMN publishedAt + publishedById (nullable, set when statut=PUBLIEE)
ALTER TABLE "Affectation" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "Affectation" ADD COLUMN IF NOT EXISTS "publishedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL;

-- 2. RLS : étendre Affectation_select pour permettre aux ETUDIANT de voir
-- les affectations PUBLIEE des UE de leur filière.
-- Avant : enseignant self / responsable same-etab / admin seulement.
-- Maintenant : + étudiant voit PUBLIEE affectations WHERE UE.filiereId = User.filiereId.
DROP POLICY IF EXISTS "Affectation_select" ON "Affectation";
CREATE POLICY "Affectation_select" ON "Affectation" FOR SELECT TO PUBLIC USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND affectation_in_my_etab(id))
  OR (is_admin() AND admin_has_etablissement_access(affectation_etab_id(id)))
  OR (is_etudiant() AND "statut" = 'PUBLIEE' AND (
    EXISTS (SELECT 1 FROM "UniteEnseignement" ue WHERE ue."id" = "Affectation"."uniteEnseignementId"
     AND ue."filiereId" IS NOT DISTINCT FROM current_user_filiere_id())
  ))
);
