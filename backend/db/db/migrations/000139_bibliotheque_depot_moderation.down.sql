-- ============================================================
-- Migration 000139 (down) — retour intégral à l'état 000137
-- ============================================================
-- Annule les deux correctifs de 000139 :
--   1. ouvrage_visible : suppression des deux branches BROUILLON
--      (déposant + responsable d'établissement) — retour au corps
--      exact de 000137 ;
--   2. Ouvrage_update : WITH CHECK resp figé à visibility =
--      'ETABLISSEMENT' (le resp ne peut plus modérer les dépôts
--      CLASSE de son établissement).
-- NB : le correctif APPLICATION (INSERT sans RETURNING dans le
-- repository, SECT-BIBLIO-10) reste valable dans les deux sens —
-- il ne dépend pas de cette migration.
-- ============================================================

-- 1. ouvrage_visible — corps 000137 d'origine
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

-- 2. Ouvrage_update — policy 000137 d'origine
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
            AND "visibility" = 'ETABLISSEMENT'
        )
        OR (
            is_enseignant()
            AND "createdById" = current_user_id()
            AND "visibility" = 'CLASSE'
            AND "statut" = 'BROUILLON'
        )
    );
