-- Rollback : restaurer la policy Signalement_delete originale (admin/system only).

DROP POLICY IF EXISTS "Signalement_delete" ON "MessageSignalement";

CREATE POLICY "Signalement_delete" ON "MessageSignalement" FOR DELETE
    USING (is_system() OR is_admin());
