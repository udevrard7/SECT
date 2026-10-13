-- ============================================================
-- Migration 000140 — Bibliothèque : couvertures d'ouvrages
-- (SECT-BIBLIO-12 — cartes du catalogue avec la PAGE 1 réelle du PDF)
-- ============================================================
-- Deux colonnes sur "Ouvrage" :
--   cheminCouverture  TEXT NULL        — clé R2 du PNG (page 1 rastérisée
--                                        par pdftoppm au dépôt, ~480 px de
--                                        large, quelques dizaines de Ko) ;
--   couvertureEchecAt TIMESTAMPTZ NULL — horodatage du dernier échec de
--                                        génération (PDF corrompu, poppler
--                                        absent) : l'échec est PERSISTÉ pour
--                                        ne pas re-rastériser en boucle à
--                                        chaque affichage du catalogue ; une
--                                        régénération explicite (gestionnaire)
---- reset ce marqueur.
--
-- Sécurité : la couverture est un DÉRIVÉ VISUEL de la page 1, servi par la
-- MÊME chaîne de contrôle que le fichier — FindByID sous RLS (Ouvrage_select)
-- puis presign courte durée. Aucun AuditLog OUVRAGE_LECTURE pour la couverture
-- (ce serait N lignes de bruit par affichage de catalogue — la lecture
-- mesurée P2 reste le journal de consultation).
--
-- Leçons répercutées : ASSERTs post-migration (000122) ; down intégral.
-- ============================================================

-- 1. Colonnes (idempotent).
ALTER TABLE "Ouvrage"
        ADD COLUMN IF NOT EXISTS "cheminCouverture" TEXT,
        ADD COLUMN IF NOT EXISTS "couvertureEchecAt" TIMESTAMPTZ;

-- 2. ASSERTs post-migration — l'échec d'un ASSERT fait échouer la migration
-- (défense contre un apply partiel).
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Ouvrage'
            AND column_name = 'cheminCouverture'
            AND data_type = 'text') = 1,
         'Ouvrage.cheminCouverture doit exister en TEXT';
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Ouvrage'
            AND column_name = 'couvertureEchecAt'
            AND data_type = 'timestamp with time zone') = 1,
         'Ouvrage.couvertureEchecAt doit exister en TIMESTAMPTZ';
  -- Les colonnes sont NULLables ET sans valeur par défaut : aucun impact
  -- sur les INSERT existants (repository et seed) tant qu'ils ne les
  -- renseignent pas.
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'Ouvrage'
            AND column_name IN ('cheminCouverture', 'couvertureEchecAt')
            AND is_nullable = 'NO') = 0,
         'Les colonnes couverture doivent rester NULLables (rétrocompat)';
  -- Aucune policy ne référence les nouvelles colonnes : Ouvrage_insert /
  -- Ouvrage_update restent valides telles quelles (WITH CHECK sur
  -- visibility/statut/périmètre uniquement).
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"Ouvrage"'::regclass
            AND (pg_get_expr(polwithcheck, polrelid) LIKE '%couverture%'
                 OR pg_get_expr(polqual, polrelid) LIKE '%couverture%')) = 0,
         'Aucune policy Ouvrage ne doit référencer les colonnes couverture';
END $$;
