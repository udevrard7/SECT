-- 000020: Rôle applicatif sect_app (sans BYPASSRLS) + fix récursion RLS + VOLATILE functions
--
-- CONTEXTE SÉCURITÉ (audit 2025) :
-- Le backend se connectait à Neon en tant que neondb_owner (BYPASSRLS=true).
-- Toutes les policies RLS étaient donc BYPASSÉES au niveau DB — la sécurité
-- reposait uniquement sur la couche applicative Go. Un attaquant avec accès
-- direct à la DB voyait toutes les lignes de toutes les tables.
--
-- FIX (3 changements) :
-- 1. Créer un rôle sect_app SANS BYPASSRLS (manuel sur Neon — le mot de passe
--    est un secret, ne peut pas être dans cette migration).
-- 2. Rendre les fonctions helper RLS VOLATILE + SECURITY DEFINER + SET search_path.
--    - VOLATILE : empêche le planner PostgreSQL d'inliner les fonctions à plan-time
--      (où les GUCs app.claims.* ne sont pas encore posés → policy = false).
--    - SECURITY DEFINER : les fonctions s'exécutent en tant que neondb_owner,
--      bypassant RLS pour les sous-requêtes internes (admin_has_etablissement_access
--      interroge EtablissementAccess sans déclencher RLS récursif).
--    - SET search_path = public : évite les attaques par search_path hijacking.
-- 3. Corriger la policy User_select qui avait une sous-requête auto-référentielle
--    (JOIN "User" me) causant une récursion RLS infinie sans BYPASSRLS.
-- 4. FORCE RLS sur NotificationPreference.
-- 5. GRANT privileges à sect_app.

-- ═══════════════════════════════════════════════════════════════
-- 1. Fonctions helper RLS → VOLATILE + SECURITY DEFINER + SET search_path
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(current_setting('app.claims.user_id', true), '')::text;
$$;

CREATE OR REPLACE FUNCTION public.current_role_claim()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(current_setting('app.claims.role', true), '')::text;
$$;

CREATE OR REPLACE FUNCTION public.current_etablissement_id()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(current_setting('app.claims.etablissement_id', true), '')::text;
$$;

CREATE OR REPLACE FUNCTION public.current_filiere_id()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(current_setting('app.claims.filiere_id', true), '')::text;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_role_claim() = 'ADMIN';
$$;

CREATE OR REPLACE FUNCTION public.is_responsable()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_role_claim() = 'RESPONSABLE';
$$;

CREATE OR REPLACE FUNCTION public.is_enseignant()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_role_claim() = 'ENSEIGNANT';
$$;

CREATE OR REPLACE FUNCTION public.is_etudiant()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_role_claim() = 'ETUDIANT';
$$;

CREATE OR REPLACE FUNCTION public.admin_has_etablissement_access(p_etablissement_id text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "EtablissementAccess"
    WHERE "adminId" = current_user_id()
      AND "etablissementId" = p_etablissement_id
      AND "statut" = 'APPROUVE'
      AND ("dateDebut" IS NULL OR "dateDebut" <= CURRENT_TIMESTAMP)
      AND ("dateFin" IS NULL OR "dateFin" >= CURRENT_TIMESTAMP)
  );
$$;

CREATE OR REPLACE FUNCTION public.belongs_to_etablissement(p_etablissement_id text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_etablissement_id() = p_etablissement_id;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════
-- 2. Nouvelle fonction current_user_filiere_id() — SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════
-- Remplace le "JOIN User me ON me.id = current_user_id()" dans User_select.
-- Cette fonction interroge "User" en tant que neondb_owner (bypass RLS),
-- évitant la récursion RLS infinie qui se produisait avec sect_app.

CREATE OR REPLACE FUNCTION public.current_user_filiere_id()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF("filiereId", '')::text FROM "User" WHERE "id" = current_user_id();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_filiere_id() TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════
-- 3. Correction policy User_select (suppression récursion auto-référentielle)
-- ═══════════════════════════════════════════════════════════════
-- AVANT (problématique) : la branche is_etudiant() AND role='ENSEIGNANT' faisait
--   JOIN "User" me ON me.id = current_user_id()
-- → récursion RLS infinie (User_select évalué sur le "me" alias de User).
--
-- APRÈS : on utilise current_user_filiere_id() (SECURITY DEFINER) qui retourne
-- le filiereId de l'utilisateur courant SANS déclencher RLS sur User.

DROP POLICY IF EXISTS "user_select" ON "User";  -- doublon lowercase (cleanup)
DROP POLICY IF EXISTS "User_select" ON "User";

CREATE POLICY "User_select" ON "User" FOR SELECT TO PUBLIC USING (
  (id = current_user_id())
  OR (is_etudiant() AND (role = 'ENSEIGNANT'::"Role") AND EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      WHERE ef."enseignantId" = "User".id
        AND ef."filiereId" = current_user_filiere_id()
  ))
  OR (is_enseignant() AND (role = 'ETUDIANT'::"Role") AND EXISTS (
      SELECT 1 FROM "EnseignantFiliere" ef
      WHERE ef."enseignantId" = current_user_id()
        AND ef."filiereId" = "User"."filiereId"
  ))
  OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND ("etablissementId" IS NOT NULL) AND admin_has_etablissement_access("etablissementId"))
  OR (is_admin() AND ("etablissementId" IS NULL) AND (role = 'ADMIN'::"Role"))
);

-- ═══════════════════════════════════════════════════════════════
-- 4. FORCE RLS sur NotificationPreference (dernière table sans FORCE)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE "NotificationPreference" FORCE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- 5. GRANT privileges à sect_app (idempotent — échoue silencieusement si le rôle n'existe pas)
-- ═══════════════════════════════════════════════════════════════
-- ATTENTION : Le rôle sect_app doit être créé manuellement sur Neon avant
-- d'appliquer cette migration. Voir la documentation ops.
-- Le mot de passe ne peut pas être dans cette migration (c'est un secret).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sect_app') THEN
    GRANT USAGE ON SCHEMA public TO sect_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sect_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sect_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sect_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sect_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sect_app;
    RAISE NOTICE 'Grants accordés à sect_app';
  ELSE
    RAISE NOTICE 'Rôle sect_app non trouvé — grants ignorés (créer le rôle manuellement)';
  END IF;
END
$$;
