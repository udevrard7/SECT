-- ============================================================
-- Migration 000119 (DOWN) — rollback
-- Task ID: SECT-NOTIF-DIFFUSION-1 (suite)
-- ============================================================

DROP POLICY IF EXISTS "NotificationAdmin_select_diffusion_scope" ON "NotificationAdmin";

-- Restaurer NotificationAdmin_select d'origine (sans garde établissement).
DROP POLICY IF EXISTS "NotificationAdmin_select" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_select" ON "NotificationAdmin"
    FOR SELECT TO PUBLIC
    USING (
        ("destinataireId" = current_user_id())
        OR ("destinataireId" IS NULL AND "destinataireRole" IS NULL)
        OR ("destinataireRole" IS NOT NULL AND "destinataireRole" = current_role_claim())
    );

-- Restaurer NotificationAdmin_select_destinataire d'origine.
DROP POLICY IF EXISTS "NotificationAdmin_select_destinataire" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_select_destinataire" ON "NotificationAdmin"
    FOR SELECT TO PUBLIC
    USING (
        ("destinataireId" = current_user_id())
        OR (("destinataireRole" = 'ADMIN') AND is_admin())
        OR (("destinataireRole" = 'RESPONSABLE') AND is_responsable())
        OR (("destinataireRole" = 'ENSEIGNANT') AND is_enseignant())
        OR (("destinataireRole" = 'ETUDIANT') AND is_etudiant())
        OR ("destinataireId" IS NULL AND "destinataireRole" IS NULL)
    );
