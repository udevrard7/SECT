-- ============================================================
-- Migration 000131 (down) — RBAC du journal d'audit par
-- établissement (ADR-0010) : suppression de la fonction
-- etablissement_audit_logs.
-- ============================================================
-- NB ROLLBACK : contrairement à 000130 (CREATE OR REPLACE, down =
-- définitions d'origine restaurables verbatim), l'ancien
-- comportement vivait dans le SQL INLINE du repo Go
-- (AuthRepository.ListByEtablissement, WHERE construit dynamiquement
-- + RLS AuditLog_select 000083). Il n'y a donc RIEN à restaurer en
-- base : le down supprime la fonction ET le code doit être reverté
-- dans la même foulée (git revert du commit ADR-0010) — sinon le
-- repo lèverait « function etablissement_audit_logs does not
-- exist ». Ordre de rollback : revert code d'abord (l'ancien SQL
-- inline ne dépend d'aucun objet 000131), puis migrate down.
-- ============================================================

DROP FUNCTION IF EXISTS public.etablissement_audit_logs(
    text, text, text, timestamptz, timestamptz, text);
