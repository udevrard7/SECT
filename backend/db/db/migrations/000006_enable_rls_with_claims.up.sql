-- ============================================================
-- Migration 000006 — Row Level Security (Option A : claims de session)
-- ============================================================
--
-- Stratégie : "claims-based RLS"
--
-- Le backend Go pose, au début de chaque transaction, des claims via :
--   SELECT set_config('app.claims.user_id', $1, true);
--   SELECT set_config('app.claims.role', $2, true);
--   SELECT set_config('app.claims.etablissement_id', $3, true);  -- NULL pour ADMIN
--
-- Le paramètre `true` (is_local) scope les claims à la transaction
-- courante — ils sont automatiquement nettoyés en fin de transaction.
--
-- Hiérarchie des rôles :
--   ADMIN       — Propriétaire PaaS. NON lié à un établissement.
--                 Accès aux tables plateforme uniquement (Plan, PlatformSettings,
--                 IpWhitelist, Facture, MonitoringEvent, AIProviderConfig, ...).
--                 Accès aux données d'un établissement UNIQUEMENT si une entrée
--                 existe dans "EtablissementAccess" (autorisation explicite).
--   RESPONSABLE — Gère SON établissement (via etablissementId).
--   ENSEIGNANT  — Ses propres données + données de ses étudiants/filières.
--   ETUDIANT    — Ses propres données uniquement.
--
-- Note technique : neondb_owner est le propriétaire des tables. En PostgreSQL,
-- le propriétaire bypass RLS sauf si FORCE ROW LEVEL SECURITY est activé.
-- On active donc FORCE sur toutes les tables pour que les policies s'appliquent
-- même via neondb_owner (qui n'est PAS superuser sur Neon).
-- ============================================================


-- ============================================================
-- SECTION 1 — Fonctions helper (lecture des claims de session)
-- ============================================================

-- Retourne l'ID utilisateur courant (depuis le claim), ou NULL si non défini.
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.claims.user_id', true), '')::text;
$$;

-- Retourne le rôle courant (ADMIN / RESPONSABLE / ENSEIGNANT / ETUDIANT), ou NULL.
CREATE OR REPLACE FUNCTION public.current_role_claim()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.claims.role', true), '')::text;
$$;

-- Retourne l'ID établissement courant, ou NULL (notamment pour ADMIN).
CREATE OR REPLACE FUNCTION public.current_etablissement_id()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.claims.etablissement_id', true), '')::text;
$$;

-- Vrai si l'utilisateur courant a le rôle ADMIN.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT current_role_claim() = 'ADMIN';
$$;

-- Vrai si l'utilisateur courant a le rôle RESPONSABLE.
CREATE OR REPLACE FUNCTION public.is_responsable()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT current_role_claim() = 'RESPONSABLE';
$$;

-- Vrai si l'utilisateur courant a le rôle ENSEIGNANT.
CREATE OR REPLACE FUNCTION public.is_enseignant()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT current_role_claim() = 'ENSEIGNANT';
$$;

-- Vrai si l'utilisateur courant a le rôle ETUDIANT.
CREATE OR REPLACE FUNCTION public.is_etudiant()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT current_role_claim() = 'ETUDIANT';
$$;

-- Vrai si l'ADMIN courant a une autorisation d'accès explicite à l'établissement donné.
-- Les autres rôles n'utilisent pas cette fonction (ils sont scoppés par leur propre etablissementId).
CREATE OR REPLACE FUNCTION public.admin_has_etablissement_access(p_etablissement_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "EtablissementAccess"
    WHERE "adminId" = current_user_id()
      AND "etablissementId" = p_etablissement_id
  );
$$;

-- Vrai si l'utilisateur courant appartient à l'établissement donné.
-- Pour ADMIN, vérifie l'autorisation explicite via EtablissementAccess.
-- Pour les autres rôles, compare avec le claim etablissement_id.
CREATE OR REPLACE FUNCTION public.belongs_to_etablissement(p_etablissement_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT
    CASE
      WHEN is_admin() THEN admin_has_etablissement_access(p_etablissement_id)
      ELSE current_etablissement_id() = p_etablissement_id
    END;
$$;


-- ============================================================
-- SECTION 2 — Activation + FORCE RLS sur toutes les tables
-- ============================================================
-- FORCE est nécessaire car neondb_owner est propriétaire des tables
-- et bypasserait RLS sinon. Avec FORCE, même le propriétaire est soumis
-- aux policies (mais les superusers bypassent toujours — Neon n'en a pas
-- pour notre rôle d'app).

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END
$$;
