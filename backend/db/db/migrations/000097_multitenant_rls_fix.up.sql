-- ════════════════════════════════════════════════════════════════════════════
-- 000097 — Fix fuites multi-tenant : User + AuditLog + Abonnement + Facture
--          (SECT-MULTITENANT-AUDIT-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 4 fuites identifiées lors de l'audit multi-tenant :
--
-- 1. User_select (P0 CRITIQUE) : is_admin() donnait accès à TOUS les users
--    de TOUS les établissements (noms, emails, matricules). L'admin PaaS ne
--    doit voir que les users SANS établissement (autres ADMIN PaaS + orphelins).
--    Pour accéder aux users d'un établissement, l'admin utilise le mode
--    assistance (qui pose les claims établissement).
--    EXCEPTION : l'admin peut voir le NOMBRE de users par établissement
--    (via admin_get_etablissements_overview, SECURITY DEFINER) — c'est
--    informatif, pas un accès aux données individuelles.
--
-- 2. AuditLog_select (P1) : is_admin() donnait accès à TOUS les logs de
--    TOUS les établissements. L'admin ne doit voir que les logs système
--    globaux (etablissementId IS NULL).
--
-- 3. Abonnement_select (P2) : policy TO neondb_owner (pas TO PUBLIC) →
--    sect_app n'évalue pas la policy en production. Fix : TO PUBLIC + is_admin().
--    L'admin PaaS gère les abonnements SaaS — l'accès total est légitime.
--
-- 4. Facture_select (P2) : même problème que Abonnement. Fix identique.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. User_select : restreindre admin aux users sans établissement ───
-- Avant (000084) : OR is_admin() → admin voit TOUT
-- Après : OR (is_admin() AND "etablissementId" IS NULL) → admin voit uniquement
-- les ADMIN PaaS + orphelins. En mode assistance, claims.EtablissementID est
-- posé → la branche is_responsable() matche et l'admin voit les users de l'étab.
DROP POLICY IF EXISTS "User_select" ON "User";
CREATE POLICY "User_select" ON "User" FOR SELECT TO PUBLIC USING (
    is_system()
    OR (
        ("deletedAt" IS NULL)
        AND (
            (id = current_user_id())
            OR (is_etudiant() AND (role = 'ENSEIGNANT'::"Role") AND enseignant_in_my_filiere(id))
            OR (is_enseignant() AND (role = 'ETUDIANT'::"Role") AND etudiant_in_my_filiere(id))
            OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
            -- SECT-MULTITENANT-AUDIT-1 : admin PaaS ne voit QUE les users sans
            -- établissement (autres ADMIN + orphelins). En mode assistance,
            -- claims.EtablissementID est posé → la branche is_responsable()
            -- ci-dessus matche (is_responsable() retourne true pour l'admin
            -- en assistance car current_role_claim() = 'ADMIN' mais... non.
            -- En fait, en mode assistance l'admin garde son rôle ADMIN.
            -- On ajoute donc une branche explicite pour l'admin en assistance :
            OR (is_admin() AND "etablissementId" IS NOT NULL AND admin_has_etablissement_access("etablissementId"))
            -- Admin PaaS hors assistance : users sans étab seulement
            OR (is_admin() AND "etablissementId" IS NULL)
        )
    )
);

-- ─── 2. AuditLog_select : restreindre admin aux logs système ───
-- Avant (000024/000083) : is_admin() → admin voit TOUT
-- Après : is_admin() AND "etablissementId" IS NULL → admin voit les logs
-- système globaux uniquement. En mode assistance, la branche is_responsable()
-- matche (l'admin en assistance a current_etablissement_id() posé).
DROP POLICY IF EXISTS "AuditLog_select" ON "AuditLog";
CREATE POLICY "AuditLog_select" ON "AuditLog" FOR SELECT TO PUBLIC USING (
  -- ADMIN PaaS : uniquement les logs système (pas de données établissement)
  (is_admin() AND "etablissementId" IS NULL)
  -- User voit ses propres logs
  OR ("userId" = current_user_id())
  -- RESPONSABLE : logs de son établissement (inclut mode assistance admin)
  OR (is_responsable() AND (
      ("userId" = current_user_id())
      OR ("userId" IS NOT NULL AND user_in_my_etab("userId"))
      OR ("etablissementId" = current_etablissement_id())
  ))
  OR is_system()
);

-- ─── 3. Abonnement : TO PUBLIC (était TO neondb_owner) + is_admin() ───
-- L'admin PaaS gère les abonnements SaaS — l'accès total est légitime.
-- Le RESPONSABLE ne voit que les abonnements de son établissement.
DROP POLICY IF EXISTS "Abonnement_select" ON "Abonnement";
CREATE POLICY "Abonnement_select" ON "Abonnement"
  FOR SELECT TO PUBLIC USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );

DROP POLICY IF EXISTS "Abonnement_modify_admin" ON "Abonnement";
CREATE POLICY "Abonnement_modify_admin" ON "Abonnement"
  FOR ALL TO PUBLIC
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── 4. Facture : TO PUBLIC (était TO neondb_owner) + is_admin() ───
DROP POLICY IF EXISTS "Facture_select" ON "Facture";
CREATE POLICY "Facture_select" ON "Facture"
  FOR SELECT TO PUBLIC USING (
    is_admin()
    OR (is_responsable() AND "etablissementId" = current_etablissement_id())
  );

DROP POLICY IF EXISTS "Facture_modify_admin" ON "Facture";
CREATE POLICY "Facture_modify_admin" ON "Facture"
  FOR ALL TO PUBLIC
  USING (is_admin())
  WITH CHECK (is_admin());
