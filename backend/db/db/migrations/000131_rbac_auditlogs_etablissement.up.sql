-- ============================================================
-- Migration 000131 — RBAC du journal d'audit par établissement
-- (ADR-0010, prolongement d'ADR-0009) : l'ADMIN global (sans
-- établissement) ne lit plus silencieusement le journal d'audit
-- d'un établissement via GET /api/etablissements/{id}/audit-logs.
-- La voie consentie et tracée est le mode assistance
-- (EtablissementAccess APPROUVE par le RESPONSABLE, max 24 h, audit
-- trail — hardening B-2) : le JWT d'assistance porte un
-- etablissementId et passe donc le nouveau check.
-- ============================================================
-- CHANGEMENT : nouvelle fonction SECURITY DEFINER
-- etablissement_audit_logs qui RÉ-IMPOSE les claims (pattern
-- 000124/000126/000130) — la policy partagée AuditLog_select
-- (000083) garde sa branche is_admin() pour la console plateforme
-- /api/logs (vue légitime du propriétaire SaaS, ADMIN-only), mais
-- le endpoint par établissement exige désormais :
--   - rôle ∈ (RESPONSABLE, ADMIN) ;
--   - app.claims.etablissement_id = p_etablissement_id pour TOUS
--     (ADMIN global : 0 ligne — était : tout voir sans trace).
--
-- PIÈGE plpgsql évité (leçon 000130 D7) : en WHERE, `=` est sûr
-- avec un GUC absent — NULL = 'x' → NULL → ligne exclue. Le pooler
-- Neon normalise les GUC custom en '' (écarté aussi).
--
-- ZÉRO-RUPTURE : CREATE FUNCTION (l'ancien code Go ne l'appelle
-- pas) — déployée AVANT le code ; le 403 Go arrive au déploiement
-- du code (2e couche, defense in depth pattern 000124).
--
-- ENUM-SWEEP : comparaisons current_setting (text) contre littéraux
-- text uniquement ; aucun paramètre plpgsql non typé (LANGUAGE sql).
-- ============================================================

-- etablissement_audit_logs — journal d'audit d'UN établissement,
-- cloisonné sur les claims (ADR-0010). Filtres optionnels :
-- p_action/p_entite (égalité exacte), p_date_from/p_date_to
-- (bornes inclusives, TIMESTAMPTZ — pgx envoie les time.Time Go en
-- timestamptz ; la comparaison timestamp(3) ↔ timestamptz reprend
-- exactement la sémantique de l'ancien SQL inline), p_search (ILIKE
-- sur action/entite/userEmail/adresseIp/details). NULL ou '' = pas de
-- filtre. La pagination (LIMIT/OFFSET) reste côté appelant ; ORDER BY
-- createdAt DESC.
CREATE FUNCTION public.etablissement_audit_logs(
    p_etablissement_id text,
    p_action text DEFAULT NULL,
    p_entite text DEFAULT NULL,
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL,
    p_search text DEFAULT NULL
)
RETURNS TABLE(
    "id" text,
    "userId" text,
    "userEmail" text,
    "action" text,
    "entite" text,
    "entiteId" text,
    "details" text,
    "adresseIp" text,
    "etablissementId" text,
    "reason" text,
    "createdAt" timestamp
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
      SELECT a."id", a."userId", a."userEmail", a."action", a."entite",
             a."entiteId", a."details", a."adresseIp", a."etablissementId",
             a."reason", a."createdAt"
      FROM "AuditLog" a
      WHERE a."etablissementId" = p_etablissement_id
        -- Filtres optionnels (NULL/'' = pas de filtre).
        AND (p_action IS NULL OR p_action = '' OR a."action" = p_action)
        AND (p_entite IS NULL OR p_entite = '' OR a."entite" = p_entite)
        AND (p_date_from IS NULL OR a."createdAt" >= p_date_from)
        AND (p_date_to IS NULL OR a."createdAt" <= p_date_to)
        AND (p_search IS NULL OR p_search = ''
             OR a."action" ILIKE '%' || p_search || '%'
             OR a."entite" ILIKE '%' || p_search || '%'
             OR a."userEmail" ILIKE '%' || p_search || '%'
             OR a."adresseIp" ILIKE '%' || p_search || '%'
             OR a."details" ILIKE '%' || p_search || '%')
        -- Cloisonnement (ADR-0010, pattern 000130) : SECURITY DEFINER
        -- exécute en tant que propriétaire (BYPASSRLS) — la fonction
        -- RÉ-IMPOSE l'accès sur les claims de la transaction appelante :
        -- RESPONSABLE/ADMIN uniquement, et l'établissement lu doit être
        -- CELUI des claims pour tous — l'ADMIN global passe par le mode
        -- assistance (JWT avec etablissementId, accès APPROUVE par le
        -- RESPONSABLE, B-2 : pas d'auto-approbation).
        AND current_setting('app.claims.role', true) IN ('RESPONSABLE', 'ADMIN')
        AND current_setting('app.claims.etablissement_id', true) = p_etablissement_id
      ORDER BY a."createdAt" DESC
    $function$;

-- ============================================================
-- Vérifications post-migration (échouent le migrate si incomplet,
-- pattern 000122/000123/000124/000126/000130)
-- ============================================================
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'etablissement_audit_logs';

  ASSERT v_def IS NOT NULL,
         'la fonction etablissement_audit_logs doit exister';

  -- SECURITY DEFINER (BYPASSRLS interne → d''où le re-check claims)
  ASSERT (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'etablissement_audit_logs'
            AND p.prosecdef) = 1,
         'etablissement_audit_logs doit être SECURITY DEFINER';

  -- L'égalité etab claims ↔ paramètre est exigée pour TOUS
  ASSERT position('app.claims.etablissement_id'', true) = p_etablissement_id' in v_def) > 0,
         'app.claims.etablissement_id = p_etablissement_id requis';

  -- Le rôle est restreint à RESPONSABLE/ADMIN (pas d''ETUDIANT/ENSEIGNANT
  -- ni de bypass)
  ASSERT position('IN (''RESPONSABLE'', ''ADMIN'')' in v_def) > 0,
         'rôles restreints à RESPONSABLE/ADMIN';

  -- Aucune branche god-mode : la fonction ne se base JAMAIS sur le seul
  -- rôle ADMIN pour lâcher les lignes.
  ASSERT position('role'' = ''ADMIN''' in v_def) = 0
         AND position('''ADMIN'' OR' in v_def) = 0,
         'pas de bypass ADMIN (rôle seul insuffisant)';
END $$;
