-- ============================================================
-- Migration 000015 — Policy RLS SecuritySettings_modify_admin (P8 MEDIUM)
-- ============================================================
--
-- Bug P8 (MEDIUM) : la policy SecuritySettings_modify_responsable existante
-- ne couvre que is_responsable(). Un ADMIN (qui a accès à l'établissement via
-- EtablissementAccess) ne pouvait PAS modifier les SecuritySettings — l'UPDATE
-- / INSERT était silencieusement bloqué par la RLS (0 ligne affectée).
--
-- La page /parametres est accessible à l'ADMIN (avec sélecteur d'établissement),
-- donc l'ADMIN doit pouvoir modifier les paramètres de sécurité des établissements
-- qu'il administre. Cohérent avec IpWhitelist_modify qui inclut déjà is_admin().
--
-- Fix : ajouter une policy SecuritySettings_modify_admin (FOR ALL) qui autorise
-- is_admin() AND admin_has_etablissement_access(etablissementId). La policy
-- _modify_responsable existante est conservée (les deux policies sont cumulatives
-- en OR au niveau PostgreSQL).
--
-- Note : admin_has_etablissement_access() vérifie statut=APPROUVE + dates
-- (fix E2 du module /etablissements, migration 000013).
-- ============================================================

CREATE POLICY "SecuritySettings_modify_admin" ON "SecuritySettings"
  FOR ALL TO neondb_owner
  USING (is_admin() AND admin_has_etablissement_access("etablissementId"))
  WITH CHECK (is_admin() AND admin_has_etablissement_access("etablissementId"));
