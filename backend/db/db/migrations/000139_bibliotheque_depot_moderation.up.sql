-- ============================================================
-- Migration 000139 — Bibliothèque : dépôt + modération réparés
-- (retour exploitant SECT-BIBLIO-10 : « dépôt refusé : le périmètre
-- est dérivé de votre rôle (RLS 000137) » au premier ajout de livre)
-- ============================================================
-- DEUX défauts de 000137, découverts au PREMIER dépôt réel (la table
-- était vide au déploiement et les E2E n'avaient exercé que
-- /api/ouvrages/analyze, jamais POST /api/ouvrages) :
--
-- 1. DÉPÔT IMPOSSIBLE (tous rôles — le message reçu par l'exploitant)
--    : le repository faisait INSERT ... RETURNING. Or Ouvrage_select
--    délègue à ouvrage_visible(), qui RE-SCANNÉ la table « Ouvrage » :
--    l'évaluation de la policy SELECT imposée par RETURNING s'exécute
--    avec le snapshot pris au DÉBUT de la commande — la ligne en cours
--    d'insertion n'y figure pas → ouvrage_visible = false → 42501
--    « new row violates row-level security policy ». Piège général
--    PostgreSQL, prouvé par reproduction minimale (worklog) : une
--    policy SELECT qui re-scanne LA MÊME table via une fonction casse
--    le RETURNING de l'INSERT ; une policy inline le laisse passer.
--    CORRECTIF APPLICATION (aucune migration) : le repository insère
--    SANS RETURNING puis relit la ligne dans la même tx (statement
--    suivant = snapshot neuf → ligne visible, READ COMMITTED).
--
-- 2. MODÉRATION IMPOSSIBLE des dépôts CLASSE (découvert en diagnostiqu
--    ant le 1) : ouvrage_visible() exigeait, pour un ouvrage CLASSE,
--    l'intersection avec les classes de l'utilisateur — or un
--    RESPONSABLE n'a PAS de classes (il n'enseigne pas) → il ne VOYAIT
--    aucun brouillon CLASSE de son établissement (List vide, FindByID
--    404, UPDATE 0 ligne — la sélection des lignes d'un UPDATE passe
--    AUSSI par la policy SELECT). Et même visible, Ouvrage_update
--    figeait visibility='ETABLISSEMENT' pour le resp → 42501. Le cycle
--    human-in-the-loop (dépôt ENSEIGNANT → BROUILLON → validation
--    RESPONSABLE) était donc bloqué aux TROIS niveaux.
--    CORRECTIF DB (cette migration) :
--    a. ouvrage_visible() : deux branches BROUILLON dans le groupe de
--       visibilité — DÉPOSANT (createdById) et RESPONSABLE de
--       l'établissement — toujours SOUS les gardes deletedAt IS NULL +
--       droits non expirés, et toujours ET-ées avec le garde de statut
--       existant : l'ÉTUDIANT ne voit JAMAIS un brouillon, fût-il de sa
--       classe (la branche CLASSE∩classes reste filtrée par
--       « statut=VALIDE OU déposant OU resp ») ;
--    b. Ouvrage_update WITH CHECK resp : visibility IN
--       ('ETABLISSEMENT','CLASSE') — le resp gère AUSSI les dépôts
--       CLASSE de son établissement (la promotion/démotion PLATEFORME
--       reste ADMIN seul ; l'ENSEIGNANT reste figé CLASSE+BROUILLON).
--
-- Leçons répercutées : ASSERTs post-migration (000122) ; comparaisons
-- enum enum↔enum uniquement (ENUM-SWEEP-1) ; TO PUBLIC (000117).
-- ============================================================

-- 1. ouvrage_visible — branches BROUILLON (déposant + resp de l'étab).
-- Corps 000137 intégral, seules les deux lignes marquées « 000139 »
-- sont ajoutées dans le groupe de visibilité.
CREATE OR REPLACE FUNCTION public.ouvrage_visible(p_ouvrage_id text)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Ouvrage" o
    WHERE o."id" = p_ouvrage_id
      AND (
        is_system()
        OR is_admin()
        OR (
          o."deletedAt" IS NULL
          AND (o."dateExpirationDroits" IS NULL OR o."dateExpirationDroits" > now())
          AND (
            (o."visibility" = 'PLATEFORME' AND o."statut" = 'VALIDE')
            OR (o."visibility" = 'ETABLISSEMENT' AND o."etablissementId" = current_etablissement_id())
            OR (o."visibility" = 'CLASSE' AND public.ouvrage_visible_par_classes(o."id"))
            OR (o."statut" = 'BROUILLON' AND o."createdById" = current_user_id())          -- 000139 : déposant
            OR (o."statut" = 'BROUILLON' AND is_responsable() AND o."etablissementId" = current_etablissement_id())  -- 000139 : modération
          )
          AND (
            o."statut" = 'VALIDE'
            OR o."createdById" = current_user_id()
            OR (is_responsable() AND o."etablissementId" = current_etablissement_id())
          )
        )
      )
  )
$$;

-- 2. Ouvrage_update — le resp modère aussi les dépôts CLASSE de son
-- établissement (WITH CHECK 000137 inchangé par ailleurs : ADMIN
-- toujours libre ; ENSEIGNANT figé CLASSE+BROUILLON).
DROP POLICY IF EXISTS "Ouvrage_update" ON "Ouvrage";
CREATE POLICY "Ouvrage_update" ON "Ouvrage"
    FOR UPDATE TO PUBLIC
    USING (
        is_system()
        OR is_admin()
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_enseignant() AND "createdById" = current_user_id())
    )
    WITH CHECK (
        is_system()
        OR is_admin()
        OR (
            is_responsable()
            AND "etablissementId" = current_etablissement_id()
            AND "visibility" IN ('ETABLISSEMENT', 'CLASSE')
        )
        OR (
            is_enseignant()
            AND "createdById" = current_user_id()
            AND "visibility" = 'CLASSE'
            AND "statut" = 'BROUILLON'
        )
    );

-- 3. ASSERTs post-migration (pattern 000122) — l'échec d'un ASSERT
-- fait échouer la migration (défense contre un apply partiel).
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'ouvrage_visible'
            AND position('BROUILLON' IN pg_get_functiondef(p.oid)) > 0
            AND position('ouvrage_visible_par_classes' IN pg_get_functiondef(p.oid)) > 0
            AND position('deletedAt' IN pg_get_functiondef(p.oid)) > 0) = 1,
         'ouvrage_visible doit porter les branches BROUILLON sous les gardes';
  ASSERT (SELECT count(*) FROM pg_policy
          WHERE polrelid = '"Ouvrage"'::regclass
            AND polname IN ('Ouvrage_select','Ouvrage_insert','Ouvrage_update')) = 3,
         'Ouvrage doit avoir exactement 3 policies (select/insert/update)';
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polrelid = '"Ouvrage"'::regclass
            AND p.polname = 'Ouvrage_update'
            AND position('CLASSE' IN pg_get_expr(p.polwithcheck, p.polrelid)) > 0
            AND position('ETABLISSEMENT' IN pg_get_expr(p.polwithcheck, p.polrelid)) > 0) = 1,
         'Ouvrage_update WITH CHECK resp doit couvrir ETABLISSEMENT et CLASSE';
  ASSERT (SELECT count(*) FROM pg_policy p
          WHERE p.polrelid = '"Ouvrage"'::regclass
            AND p.polname = 'Ouvrage_insert') = 1,
         'Ouvrage_insert ne doit pas avoir ete touche';
END $$;
