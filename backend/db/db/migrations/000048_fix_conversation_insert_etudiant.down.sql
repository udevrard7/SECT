-- Rollback : revenir à la policy originale (sans CLASSE/PROMO pour étudiants).

DROP POLICY IF EXISTS "Conversation_insert" ON "Conversation";

CREATE POLICY "Conversation_insert" ON "Conversation" FOR INSERT
    WITH CHECK (
        is_system()
        OR ("type" = 'IA' AND "createdBy" = current_user_id())
        OR ("type" = 'DIRECT' AND "createdBy" = current_user_id()
            AND "etablissementId" = current_etablissement_id())
        OR (is_responsable() AND "etablissementId" = current_etablissement_id())
        OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
    );
