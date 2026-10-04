-- ============================================================
-- Migration 000128 — Bibliothèque P4 : dimension sociale (2/2)
-- Badges « lecteur assidu » + purge R2.
-- ADR-0008 §3 et §5.
-- ============================================================
-- CONTENU :
--   1. Seed BadgeDefinition 'lecteur_assidu' (pattern 000033).
--   2. NORMALISATION des 4 policies badges : le repo les porte
--      TO neondb_owner (inopérantes sous sect_app NOBYPASSRLS — le
--      piège documenté mot pour mot en 000117 l.19-23) alors que la
--      prod les a TO PUBLIC. Un replay depuis le repo donnait des
--      badges invisibles via l'app. Alignement repo↔prod + is_system()
--      sur BadgeProgression (aucun writer Go ne pouvait écrire la
--      progression d'un lecteur — le décerneur P4 en a besoin).
--   3. Policy Ouvrage_delete TO PUBLIC USING (is_system()) : la
--      SEULE porte de hard delete — le job de purge P4 (corbeille >
--      30 jours). L'application ne peut JAMAIS hard-deleter (000123
--      documentait « aucune policy DELETE » ; P4 change ce choix de
--      façon contrôlée : is_system uniquement).
--
-- Leçons répercutées : TO PUBLIC systématique (000117) ; is_system
-- pour les workers (pattern _all_system 000117) ; ASSERTs (000122).
-- ============================================================

-- 1. Seed de la définition « lecteur assidu »
-- Métrique : secondes de lecture cumulées (OuvrageLecture.tempsTotalSec,
-- P2). Paliers ADR-0008 §3 : BRONZE 1800 / ARGENT 7200 / OR 21600 /
-- DIAMANT 72000. roleCible NULL = tous rôles (la bibliothèque est
-- universelle). Catégorie ENGAGEMENT. ON CONFLICT (id) : idempotent.
INSERT INTO "BadgeDefinition" (
  "id", "cle", "titre", "description", "icone", "categorie",
  "roleCible", "niveaux", "actif", "ordre", "createdAt", "updatedAt"
)
VALUES (
  'badge-lecteur-assidu', 'lecteur_assidu', 'Lecteur assidu',
  'Cumuler du temps de lecture dans la bibliothèque numérique (paliers : 30 min, 2 h, 6 h, 20 h).',
  'BookOpen', 'ENGAGEMENT', NULL,
  ARRAY['BRONZE','ARGENT','OR','DIAMANT']::"NiveauBadge"[],
  true, 50, now(), now()
)
ON CONFLICT ("id") DO NOTHING;

-- 2. Normalisation des policies badges (TO PUBLIC + is_system sur la
-- progression — le décerneur Go écrit sous les claims du lecteur
-- (userId = self) OU en worker (is_system)).
DROP POLICY IF EXISTS "BadgeDefinition_select_all" ON "BadgeDefinition";
CREATE POLICY "BadgeDefinition_select_all" ON "BadgeDefinition"
    FOR SELECT TO PUBLIC
    USING (true);

DROP POLICY IF EXISTS "BadgeDefinition_modify_admin" ON "BadgeDefinition";
CREATE POLICY "BadgeDefinition_modify_admin" ON "BadgeDefinition"
    FOR ALL TO PUBLIC
    USING (is_admin() OR is_responsable())
    WITH CHECK (is_admin() OR is_responsable());

DROP POLICY IF EXISTS "BadgeProgression_select_self" ON "BadgeProgression";
CREATE POLICY "BadgeProgression_select_self" ON "BadgeProgression"
    FOR SELECT TO PUBLIC
    USING (is_system() OR "userId" = current_user_id());

DROP POLICY IF EXISTS "BadgeProgression_modify_system" ON "BadgeProgression";
CREATE POLICY "BadgeProgression_modify_system" ON "BadgeProgression"
    FOR ALL TO PUBLIC
    USING (is_system() OR "userId" = current_user_id())
    WITH CHECK (is_system() OR "userId" = current_user_id());

-- 3. La porte de hard delete pour le job de purge P4 (is_system seul)
DROP POLICY IF EXISTS "Ouvrage_delete" ON "Ouvrage";
CREATE POLICY "Ouvrage_delete" ON "Ouvrage"
    FOR DELETE TO PUBLIC
    USING (is_system());

-- ============================================================
-- Vérifications post-migration (pattern 000122)
-- ============================================================
DO $$
BEGIN
  -- Seed en place
  ASSERT (SELECT count(*) FROM "BadgeDefinition"
          WHERE "cle" = 'lecteur_assidu' AND "actif" = true
            AND "roleCible" IS NULL) = 1,
         'BadgeDefinition lecteur_assidu doit etre seedee (active, tous roles)';
  ASSERT (SELECT count(*) FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          JOIN pg_attribute a ON a.atttypid = t.oid
          JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname = 'BadgeDefinition' AND a.attname = 'categorie'
            AND e.enumlabel = 'ENGAGEMENT') = 1,
         'CategorieBadge doit inclure ENGAGEMENT (valeur existante requise)';

  -- 4 policies badges, toutes TO PUBLIC
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid IN ('"BadgeDefinition"'::regclass,
                             '"BadgeProgression"'::regclass)
            AND polroles <> '{0}') = 0,
         'Les 4 policies badges doivent etre TO PUBLIC (lecon 000117)';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"BadgeDefinition"'::regclass) = 2,
         'BadgeDefinition : 2 policies';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"BadgeProgression"'::regclass) = 2,
         'BadgeProgression : 2 policies';

  -- Le writer system est autorisé (is_system dans modify)
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polname = 'BadgeProgression_modify_system'
            AND position('is_system' in pg_get_expr(p.polqual, p.polrelid)) > 0) = 1,
         'BadgeProgression_modify doit accepter is_system (decerneur P4)';

  -- Ouvrage : 4 policies (3 de 000123 + delete is_system)
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"Ouvrage"'::regclass) = 4,
         'Ouvrage doit avoir 4 policies apres P4 (select/insert/update/delete)';
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polname = 'Ouvrage_delete'
            AND polroles = '{0}'
            AND position('is_system' in pg_get_expr(p.polqual, p.polrelid)) > 0
            AND position('is_admin' in pg_get_expr(p.polqual, p.polrelid)) = 0) = 1,
         'Ouvrage_delete : TO PUBLIC, is_system SEUL (jamais l app)';
END $$;
