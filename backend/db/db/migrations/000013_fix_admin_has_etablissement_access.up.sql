-- ============================================================
-- Migration 000013 — Fix fonction RLS admin_has_etablissement_access
-- ============================================================
--
-- Bug E2 (CRITICAL) : la fonction admin_has_etablissement_access() ne filtrait
-- pas par statut='APPROUVE' ni par les dates de validité. Un ADMIN avec une
-- demande REFUSE / EXPIRE / EN_ATTENTE pouvait quand même SELECT l'établissement
-- cible (et toutes les tables qui utilisent cette fonction dans leurs policies
-- RLS : User, Filiere, Epreuve, Session, Document, Certificat, etc. — ~50 policies).
--
-- Incohérence avec le repository Go CheckAccess (repository/etablissement_access.go:255-261)
-- qui filtre correctement par statut='APPROUVE' AND (dateDebut IS NULL OR
-- dateDebut <= now) AND (dateFin IS NULL OR dateFin >= now).
--
-- Cette migration corrige la fonction pour aligner le comportement RLS sur le
-- comportement application. La correction se propage automatiquement à toutes
-- les policies qui utilisent admin_has_etablissement_access() (via la fonction
-- belongs_to_etablissement() ou directement).
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_has_etablissement_access(p_etablissement_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "EtablissementAccess"
    WHERE "adminId" = current_user_id()
      AND "etablissementId" = p_etablissement_id
      AND "statut" = 'APPROUVE'
      AND ("dateDebut" IS NULL OR "dateDebut" <= CURRENT_TIMESTAMP)
      AND ("dateFin" IS NULL OR "dateFin" >= CURRENT_TIMESTAMP)
  );
$$;

COMMENT ON FUNCTION public.admin_has_etablissement_access(TEXT) IS
  'Vrai si l''ADMIN courant a une autorisation d''accès EXPLICITE ET ACTIVE (statut=APPROUVE + dans la plage de dates) à l''établissement donné. Alignée sur le repository Go CheckAccess.';
