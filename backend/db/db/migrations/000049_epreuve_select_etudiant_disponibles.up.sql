-- Migration 000049 : Epreuve_select — les étudiants voient aussi les épreuves
-- PLANIFIEES/EN_COURS de leur filière (+ niveau si spécifié), pas seulement
-- celles où ils ont déjà une SessionPassation.
--
-- BUG E2E-EVAL : avant, un étudiant ne voyait AUCUNE épreuve dans /mes-epreuves
-- onglet "À venir" car la policy exigeait EXISTS(SessionPassation). Or, pour
-- commencer un examen, l'étudiant doit d'abord VOIR l'épreuve → chicken-and-egg.
--
-- 1. Créer la fonction current_user_niveau() (SECURITY DEFINER, bypass RLS)
--    qui retourne le niveau de l'étudiant courant (L1/L2/.../DOCTORAT).
-- 2. Recréer la policy Epreuve_select avec une clause ETUDIANT étendue :
--    - épreuves déjà commencées (sessions existantes) — inchangé
--    - OU épreuves PLANIFIEE/EN_COURS de sa filière (+ niveau si non NULL)

-- 1. Fonction current_user_niveau()
-- Note : niveau est une colonne enum "NiveauEtude". On cast en text AVANT
-- NULLIF pour éviter l'erreur "invalid input value for enum NiveauEtude: ''"
-- (NULLIF compare l'enum avec '' ce qui échoue).
CREATE OR REPLACE FUNCTION public.current_user_niveau()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  v_niveau text;
BEGIN
  SELECT niveau::text INTO v_niveau FROM "User" WHERE "id" = current_user_id();
  RETURN NULLIF(v_niveau, '');
END;
$function$;

-- 2. Recréer la policy Epreuve_select
DROP POLICY IF EXISTS "Epreuve_select" ON "Epreuve";

CREATE POLICY "Epreuve_select" ON "Epreuve"
FOR SELECT
TO public
USING (
  (is_enseignant() AND ("enseignantId" = current_user_id()))
  OR (is_responsable() AND ("filiereId" IS NOT NULL AND filiere_in_my_etab("filiereId")))
  OR (is_admin() AND admin_has_etablissement_access(epreuve_etab_id(id)))
  OR (
    is_etudiant()
    AND (
      -- épreuves déjà commencées (sessions existantes) — inchangé
      EXISTS (
        SELECT 1 FROM "SessionPassation" sp
        WHERE sp."epreuveId" = "Epreuve".id
          AND sp."etudiantId" = current_user_id()
      )
      OR (
        -- épreuves disponibles (PLANIFIEE/EN_COURS) de sa filière + niveau
        "Epreuve"."statut" IN ('PLANIFIEE', 'EN_COURS')
        AND "Epreuve"."filiereId" = current_user_filiere_id()
        AND ("Epreuve"."niveau" IS NULL OR "Epreuve"."niveau"::text = current_user_niveau())
        AND "Epreuve"."deletedAt" IS NULL
      )
    )
  )
);
