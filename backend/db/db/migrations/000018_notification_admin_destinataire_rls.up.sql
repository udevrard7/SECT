-- ============================================================
-- Migration 000018 — Policy RLS NotificationAdmin_select_destinataire
-- ============================================================
--
-- Bug N2 (CRITICAL) : la table NotificationAdmin n'avait qu'une seule policy
-- (NotificationAdmin_all_admin, is_admin()). Un ADMIN pouvait créer des
-- notifications destinées à des non-admin (destinataireRole=ETUDIANT par ex.),
-- mais le destinataire ne pouvait JAMAIS les voir car :
--   1. La route /api/notifications/admin est RequireRole("ADMIN") → 403
--   2. La policy RLS bloquait les non-admin
--   3. Le frontend n'avait pas d'endpoint pour récupérer ses notifs admin
--
-- Fix : ajouter une policy SELECT pour les destinataires. Les policies
-- PostgreSQL sont cumulatives en OR, donc is_admin() garde l'accès full,
-- ET les destinataires voient leurs propres notifs.
--
-- Un destinataire voit une NotificationAdmin si :
--   - destinataireId = current_user_id() (notif ciblée sur un user précis)
--   - OU destinataireRole = son rôle (notif diffusée à tous les users d'un rôle)
--   - OU destinataireId IS NULL AND destinataireRole IS NULL (broadcast global)
-- ============================================================

CREATE POLICY "NotificationAdmin_select_destinataire" ON "NotificationAdmin"
  FOR SELECT TO neondb_owner
  USING (
    "destinataireId" = current_user_id()
    OR ("destinataireRole" = 'ADMIN' AND is_admin())
    OR ("destinataireRole" = 'RESPONSABLE' AND is_responsable())
    OR ("destinataireRole" = 'ENSEIGNANT' AND is_enseignant())
    OR ("destinataireRole" = 'ETUDIANT' AND is_etudiant())
    OR ("destinataireId" IS NULL AND "destinataireRole" IS NULL)
  );

-- Policy UPDATE pour que les destinataires puissent marquer leurs notifs comme lues.
CREATE POLICY "NotificationAdmin_update_destinataire" ON "NotificationAdmin"
  FOR UPDATE TO neondb_owner
  USING (
    "destinataireId" = current_user_id()
    OR ("destinataireRole" = 'ADMIN' AND is_admin())
    OR ("destinataireRole" = 'RESPONSABLE' AND is_responsable())
    OR ("destinataireRole" = 'ENSEIGNANT' AND is_enseignant())
    OR ("destinataireRole" = 'ETUDIANT' AND is_etudiant())
    OR ("destinataireId" IS NULL AND "destinataireRole" IS NULL)
  )
  WITH CHECK (
    "destinataireId" = current_user_id()
    OR ("destinataireRole" = 'ADMIN' AND is_admin())
    OR ("destinataireRole" = 'RESPONSABLE' AND is_responsable())
    OR ("destinataireRole" = 'ENSEIGNANT' AND is_enseignant())
    OR ("destinataireRole" = 'ETUDIANT' AND is_etudiant())
    OR ("destinataireId" IS NULL AND "destinataireRole" IS NULL)
  );
