-- Rollback 000087 : supprime toute la couche academic progression.
-- ATTENTION : les Inscription créées (historique figé) sont PERDUES. Les
-- PromotionBatch et AuditLog liés sont aussi supprimés. User.niveau reste
-- inchangé (il a pu être muté par cloturer_annee_etudiant — non réversible).

-- ─── Fonctions ───
DROP FUNCTION IF EXISTS public.cloturer_annee_etudiant(
    text, text, text, text, "NiveauEtude", "StatutInscription", text, text, text,
    double precision, double precision, integer);
DROP FUNCTION IF EXISTS public.next_niveau("NiveauEtude");

-- ─── Tables (CASCADE supprime aussi les FK inverses) ───
DROP TABLE IF EXISTS "Inscription" CASCADE;
DROP TABLE IF EXISTS "ReglesPassage" CASCADE;
DROP TABLE IF EXISTS "PromotionBatch" CASCADE;

-- ─── Enums ───
DROP TYPE IF EXISTS "StatutInscription";
DROP TYPE IF EXISTS "PromotionBatchStatut";
