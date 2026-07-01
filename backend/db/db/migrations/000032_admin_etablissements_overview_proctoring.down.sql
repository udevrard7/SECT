-- Rollback migration 000032
-- Restaure l'ancienne fonction sans proctoring_actif (14 colonnes).
CREATE OR REPLACE FUNCTION public.admin_get_etablissements_overview(p_admin_id text)
RETURNS TABLE(id text, nom text, ville text, type text, actif boolean, abonnement_statut text, plan_nom text, nb_users bigint, nb_filieres bigint, admin_has_access bigint, resp_id text, resp_name text, resp_email text, resp_actif boolean)
LANGUAGE sql
SECURITY DEFINER
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
        (SELECT count(*) FROM "EtablissementAccess" ea
         WHERE ea."etablissementId" = e.id
           AND ea."adminId" = p_admin_id
           AND ea.statut = 'ACTIF'),
        (SELECT u.id FROM "User" u WHERE u."etablissementId" = e.id AND u.role = 'RESPONSABLE' LIMIT 1),
        (SELECT u.name FROM "User" u WHERE u."etablissementId" = e.id AND u.role = 'RESPONSABLE' LIMIT 1),
        (SELECT u.email FROM "User" u WHERE u."etablissementId" = e.id AND u.role = 'RESPONSABLE' LIMIT 1),
        (SELECT u.actif FROM "User" u WHERE u."etablissementId" = e.id AND u.role = 'RESPONSABLE' LIMIT 1)
      FROM "Etablissement" e
      ORDER BY e.nom ASC
    $function$;
