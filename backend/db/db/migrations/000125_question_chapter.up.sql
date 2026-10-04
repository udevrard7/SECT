-- ============================================================
-- Migration 000125 — Bibliothèque numérique P2.5 : traçabilité
-- chapitre des questions (Question.chapterId).
-- ADR-0007 (docs/desktop/ADR/0007-bibliotheque-numerique.md §P2.5),
-- décision SECT-BIBLIO-P2.5. Prérequis du paquet enseignant (P3) :
-- la conformité par épreuve s'y calcule via questions → chapitres →
-- sujets vs thèmes des référentiels officiels alignés.
-- ============================================================
-- OBJET : une question peut désormais citer SON chapitre du support
-- (« support, chap. X ») — valeur autonome (gestion des contestations),
-- indépendante de la bibliothèque.
--
-- PAS DE BACKFILL (historiquement impossible) : NULL = héritage,
-- documentId reste la source primaire du rattachement au support.
--
-- SÉCURITÉ : aucune policy à modifier — l'écriture passe par la policy
-- Question_modify_enseignant existante (is_enseignant() AND auteurId =
-- current_user_id(), vivante TO PUBLIC) et la lecture par
-- Question_select ; la FK garantit l'intégrité chapterId → Chapter(id).
-- La cohérence pédagogique (chapitre du MÊME support que la question)
-- est validée côté usecase — pas en SQL (le support source d'une
-- question IA d'épreuve est NULL par design, cf. epreuve.go Create).
--
-- Leçons répercutées : golang-migrate uniquement (DTTES-AUDIT-2) ;
-- ASSERTs post-migration (000122) ; aucune comparaison text↔enum ici
-- (ENUM-SWEEP) ; la colonne est nullable SANS défaut (héritage = NULL).
-- ============================================================

-- 1. Colonne + FK + index (DDL strict ADR-0007 §P2.5)
ALTER TABLE "Question" ADD COLUMN "chapterId" TEXT REFERENCES "Chapter"("id");

CREATE INDEX "Question_chapter_idx" ON "Question"("chapterId");

-- ============================================================
-- Vérifications post-migration (échouent le migrate si incomplet,
-- pattern 000122/000123/000124)
-- ============================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname = 'Question' AND a.attname = 'chapterId'
            AND NOT a.attnotnull AND format_type(a.atttypid, a.atttypmod) = 'text') = 1,
         'Question.chapterId doit exister, etre TEXT et nullable (NULL = heritage)';
  -- NB : pg_get_constraintdef rend REFERENCES "Chapter"(id) — « id »
  -- n'est pas re-quoté (identifiant minuscule, pas de quoting nécessaire).
  ASSERT (SELECT count(*) FROM pg_constraint
          WHERE conrelid = '"Question"'::regclass
            AND contype = 'f'
            AND pg_get_constraintdef(oid) LIKE '%REFERENCES "Chapter"(id)%') = 1,
         'FK Question.chapterId -> Chapter(id) doit exister';
  ASSERT (SELECT count(*) FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'Question_chapter_idx'
            AND c.relkind = 'i') = 1,
         'Index Question_chapter_idx doit exister';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname = 'Question'),
         'RLS doit rester active sur Question (inchangee par cette migration)';
  -- Anti-régression : la colonne n'a PAS de valeur par défaut — un INSERT
  -- legacy (17 colonnes explicites, pratique worker) doit continuer de
  -- fonctionner sans toucher au chapitre.
  ASSERT (SELECT count(*) FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          WHERE c.relname = 'Question' AND a.attname = 'chapterId'
            AND a.atthasdef) = 0,
         'Question.chapterId ne doit PAS avoir de DEFAULT (heritage = NULL)';
END $$;
