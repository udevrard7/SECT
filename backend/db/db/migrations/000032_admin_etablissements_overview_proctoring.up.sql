-- Migration 000032 — Fix admin_get_etablissements_overview : ajouter proctoring_actif
--
-- BUG : la fonction admin_get_etablissements_overview retournait 14 colonnes mais le
-- struct Go etablissementOverview attend 15 champs (ProctoringActif manquait). Le Scan
-- pgx échouait silencieusement (erreur avalée par `if err == nil`) → etablissementsOverview
-- toujours vide côté frontend → le KPI "Établissements" du dashboard admin n'affichait
-- aucune card détaillée.
--
-- FIX : ajouter proctoring_actif (booléen depuis SecuritySettings) dans le SELECT de la
-- fonction. L'ordre des colonnes doit matcher exactement le Scan Go :
--   1. id, 2. nom, 3. ville, 4. type, 5. actif,
--   6. abonnement_statut, 7. plan_nom,
--   8. nb_users, 9. nb_filieres, 10. admin_has_access,
--   11. proctoring_actif,  ← NOUVEAU (entre admin_has_access et resp_id)
--   12. resp_id, 13. resp_name, 14. resp_email, 15. resp_actif
--
-- Note : DROP FUNCTION nécessaire car CREATE OR REPLACE ne permet pas de changer
-- le type de retour (RETURNS TABLE avec colonnes différentes).

DROP FUNCTION IF EXISTS public.admin_get_etablissements_overview(text);

CREATE FUNCTION public.admin_get_etablissements_overview(p_admin_id text)
RETURNS TABLE(
    id text,
    nom text,
    ville text,
    type text,
    actif boolean,
    abonnement_statut text,
    plan_nom text,
    nb_users bigint,
    nb_filieres bigint,
    admin_has_access boolean,
    proctoring_actif boolean,
    resp_id text,
    resp_name text,
    resp_email text,
    resp_actif boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
      SELECT
        e.id, e.nom, e.ville, e.type, e.actif,
        (SELECT a.statut::text FROM "Abonnement" a
         WHERE a."etablissementId" = e.id
         ORDER BY a."dateDebut" DESC LIMIT 1),
        (SELECT p.nom FROM "Abonnement" a
         JOIN "Plan" p ON p.id = a."planId"
         WHERE a."etablissementId" = e.id
         ORDER BY a."dateDebut" DESC LIMIT 1),
        (SELECT count(*) FROM "User" u WHERE u."etablissementId" = e.id),
        (SELECT count(*) FROM "Filiere" f WHERE f."etablissementId" = e.id),
        (SELECT count(*) > 0 FROM "EtablissementAccess" ea
         WHERE ea."etablissementId" = e.id
           AND ea."adminId" = p_admin_id
           AND ea.statut = 'APPROUVE'),
        COALESCE((SELECT ss."proctoringActif" FROM "SecuritySettings" ss
                  WHERE ss."etablissementId" = e.id LIMIT 1), false),
        (SELECT u.id FROM "User" u WHERE u."etablissementId" = e.id AND u.role = 'RESPONSABLE' LIMIT 1),
        (SELECT u.name FROM "User" u WHERE u."etablissementId" = e.id AND u.role = 'RESPONSABLE' LIMIT 1),
        (SELECT u.email FROM "User" u WHERE u."etablissementId" = e.id AND u.role = 'RESPONSABLE' LIMIT 1),
        (SELECT u.actif FROM "User" u WHERE u."etablissementId" = e.id AND u.role = 'RESPONSABLE' LIMIT 1)
      FROM "Etablissement" e
      ORDER BY e.nom ASC
    $function$;
