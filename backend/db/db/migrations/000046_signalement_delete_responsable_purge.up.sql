-- Migration 000046 : Signalement_delete autorise responsable à purger les signalements résolus
--
-- MESSAGERIE-MODERATION-PURGE : le responsable doit pouvoir hard-delete les
-- signalements RESOLU/REJETE de plus de 7 jours (purge automatique à la volée
-- dans ListSignalements). Avant, seul is_system()/is_admin() pouvait DELETE.

DROP POLICY IF EXISTS "Signalement_delete" ON "MessageSignalement";

CREATE POLICY "Signalement_delete" ON "MessageSignalement" FOR DELETE
    USING (
        is_system()
        OR is_admin()
        OR (is_responsable() AND "statut" IN ('RESOLU', 'REJETE')
            AND COALESCE("resolvedAt", "createdAt") < CURRENT_TIMESTAMP - INTERVAL '7 days')
    );
