-- Migration 000072 — Email unique par établissement (B2C) + login multi-établissements
-- Task ID: SECT-B2C-MULTI-ETAB
--
-- Objectif : permettre à un étudiant d'exister dans plusieurs établissements B2C
-- (Jean chez Prof A + Prof B), tout en évitant les doublons dans le même établissement.
--
-- 1. Contrainte UNIQUE(email, etablissementId) sur User
--    → un email peut exister dans 2 étab différents, mais pas 2x dans le même
-- 2. find_user_for_auth modifiée pour retourner TOUS les comptes (multi-étab)
-- 3. L'application frontend gère le choix d'établissement au login

-- ═══ 1. Contrainte UNIQUE(email, etablissementId) ═══
-- D'abord, nettoyer les doublons existants (si aucun) en gardant le plus récent
DELETE FROM "User" u1
WHERE u1.ctid NOT IN (
  SELECT min(u2.ctid)
  FROM "User" u2
  WHERE u2."email" = u1."email"
    AND u2."etablissementId" IS NOT NULL
    AND u2."etablissementId" = u1."etablissementId"
  GROUP BY u2."email", u2."etablissementId"
)
AND u1."etablissementId" IS NOT NULL;

-- Créer la contrainte (partial index : seulement si etablissementId non null)
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_etablissementId_key"
    ON "User" ("email", "etablissementId")
    WHERE "etablissementId" IS NOT NULL;

-- ═══ 2. find_user_for_auth : retourner TOUS les comptes (pas LIMIT 1) ═══
-- La fonction retourne déjà toutes les lignes (pas de LIMIT), c'est correct.
-- Le repo Go doit passer de QueryRow → Query pour lire tous les résultats.
-- (modification côté Go, pas SQL)

-- ═══ 3. find_users_for_auth : nouvelle fonction multi-comptes ═══
-- Retourne tous les comptes correspondant à un email (pour le login multi-étab)
CREATE OR REPLACE FUNCTION public.find_users_for_auth(p_identifier text)
RETURNS TABLE(
    u_id text,
    u_email text,
    u_name text,
    u_role text,
    u_etablissement_id text,
    u_etablissement_nom text,
    u_actif boolean,
    u_must_change_pwd boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF position('@' in p_identifier) > 0 THEN
        RETURN QUERY
            SELECT u."id", u."email", u."name", u."role"::text,
                   u."etablissementId", COALESCE(e."nom", ''), u."actif", u."mustChangePwd"
            FROM "User" u
            LEFT JOIN "Etablissement" e ON e."id" = u."etablissementId"
            WHERE u."email" = lower(p_identifier)
              AND u."actif" = true
            ORDER BY u."createdAt" DESC;
    ELSE
        RETURN QUERY
            SELECT u."id", u."email", u."name", u."role"::text,
                   u."etablissementId", COALESCE(e."nom", ''), u."actif", u."mustChangePwd"
            FROM "User" u
            LEFT JOIN "Etablissement" e ON e."id" = u."etablissementId"
            WHERE u."matricule" = p_identifier
              AND u."actif" = true
            ORDER BY u."createdAt" DESC;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.find_users_for_auth(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_users_for_auth(text) TO neondb_owner;
GRANT EXECUTE ON FUNCTION public.find_users_for_auth(text) TO sect_app;
GRANT EXECUTE ON FUNCTION public.find_users_for_auth(text) TO PUBLIC;
