-- ============================================================
-- Migration 000053 — B-complète étendue aux invitations RESPONSABLE
-- ============================================================
--
-- Objectif : étendre le périmètre B-complète (migration 000052 sur User) à la
-- table Invitation. L'ADMIN (propriétaire PaaS) doit pouvoir créer + voir +
-- annuler/renvoyer une invitation pour un RESPONSABLE, même sans
-- EtablissementAccess sur l'établissement cible.
--
-- Bug corrigé (audit E2E SECT-UTILISATEURS-E2E-AUDIT, BUG #3) :
-- POST /api/invitations retournait 500 "erreur interne" quand l'admin tentait
-- d'inviter un RESPONSABLE dans un étab sans accès. Cause : la policy
-- Invitation_modify WITH CHECK n'autorisait l'admin que si etablissementId IS
-- NULL (impossible pour une invitation responsable qui doit pointer vers un
-- étab) OU admin_has_etablissement_access() = false ici. Le repo
-- invitationRepo.Create utilise db.WithTx (claims standards, RLS active) →
-- l'INSERT était rejeté par la RLS → 500.
--
-- Périmètre SÉCURITAIRE (strict, cohérent avec 000052) :
--   - Uniquement les invitations ciblant le rôle RESPONSABLE sont concernées
--     (clause `role = 'RESPONSABLE'::"Role"`).
--   - Les invitations ENSEIGNANT/ETUDIANT restent soumises à la RLS stricte
--     (admin doit avoir un EtablissementAccess APPROUVÉ).
--   - La table Invitation ne contient que des métadonnées (email, token, role,
--     étab) — pas de data sensible. Les data sensibles (User, Session, etc.)
--     restent protégées par leurs propres policies.
--
-- Approche : DROP + CREATE des 2 policies Invitation_{select,modify} en
-- ajoutant la clause `OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))`.
-- Les clauses existantes sont intégralement conservées.
--
-- Note : `role` dans ces policies désigne la colonne de la LIGNE cible
-- (l'invitation insérée/sélectionnée/modifiée), PAS le rôle du current user.
-- ============================================================

-- ---------- Invitation_select ----------
DROP POLICY IF EXISTS "Invitation_select" ON "Invitation";

CREATE POLICY "Invitation_select" ON "Invitation" FOR SELECT TO PUBLIC USING (
  ("createdById" = current_user_id())
  OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
  OR (is_admin() AND (("etablissementId" IS NULL) OR admin_has_etablissement_access("etablissementId")))
  -- 000053 B-complète : ADMIN voit toutes les invitations RESPONSABLE (gestion PaaS)
  OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
);

-- ---------- Invitation_modify (FOR ALL : INSERT/UPDATE/DELETE) ----------
DROP POLICY IF EXISTS "Invitation_modify" ON "Invitation";

CREATE POLICY "Invitation_modify" ON "Invitation" FOR ALL TO PUBLIC
  USING (
    (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND (("etablissementId" IS NULL) OR admin_has_etablissement_access("etablissementId")))
    -- 000053 B-complète : ADMIN modifie/supprime les invitations RESPONSABLE
    OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
  )
  WITH CHECK (
    (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND (("etablissementId" IS NULL) OR admin_has_etablissement_access("etablissementId")))
    -- 000053 B-complète : ADMIN crée une invitation RESPONSABLE sans accès étab
    OR (is_admin() AND (role = 'RESPONSABLE'::"Role"))
  );
