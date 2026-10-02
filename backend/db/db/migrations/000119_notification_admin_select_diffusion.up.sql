-- ============================================================
-- Migration 000119 — NotificationAdmin : SELECT des diffusions
-- sous RLS (sect_app, NOBYPASSRLS)
-- Task ID: SECT-NOTIF-DIFFUSION-1 (suite — diagnostic prod)
-- ============================================================
--
-- CONTEXTE DÉCOUVERT AU SMOKE PROD :
-- le runtime Render connecte via sect_app (NOBYPASSRLS) → RLS ENFORCÉE.
-- Or INSERT ... RETURNING exige que la nouvelle ligne soit VISIBLE par les
-- policies SELECT de l'utilisateur. Conséquences :
--   - diffusion RESPONSABLE audience ETUDIANTS/ENSEIGNANTS
--     (destinataireRole + destinataireEtablissementId) : INSERT ok
--     (insert_responsable) mais RETURNING invisible → ERREUR 42501
--     « new row violates row-level security policy » → 500 opaque.
--   - C'est aussi pourquoi AUCUNE diffusion par rôle n'a jamais été
--     persistée en prod : chaque tentative échouait silencieusement.
--
-- CORRECTIONS :
-- 1. Nouvelle policy SELECT permissive NotificationAdmin_select_diffusion_scope :
--    un RESPONSABLE (ou ADMIN en assistance) peut lire les DIFFUSIONS de SON
--    établissement (retour RETURNING + liste GET /api/notifications/diffusion
--    + UPDATE/DELETE de ses diffusions).
-- 2. NotificationAdmin_select : garde établissement sur la condition par rôle
--    (avant : destinataireRole = rôle DU CLAIM suffisait → une diffusion
--    scoped à un autre établissement était lisible par le même rôle d'un
--    AUTRE établissement au niveau RLS — fuite multi-tenant théorique).
-- 3. NotificationAdmin_select_destinataire : même garde établissement sur
--    les conditions par rôle.
-- ============================================================

-- 1. SELECT des diffusions de son établissement (créateur = responsable).
DROP POLICY IF EXISTS "NotificationAdmin_select_diffusion_scope" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_select_diffusion_scope" ON "NotificationAdmin"
    FOR SELECT TO PUBLIC
    USING (
        "destinataireId" IS NULL
        AND "destinataireEtablissementId" IS NOT NULL
        AND "destinataireEtablissementId" = current_setting('app.claims.etablissement_id', true)
        AND (
            current_setting('app.claims.role', true) = 'RESPONSABLE'
            OR (
                current_setting('app.claims.role', true) = 'ADMIN'
                AND current_setting('app.claims.etablissement_id', true) <> ''
            )
        )
    );

-- 2. NotificationAdmin_select : garde établissement sur la condition rôle.
DROP POLICY IF EXISTS "NotificationAdmin_select" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_select" ON "NotificationAdmin"
    FOR SELECT TO PUBLIC
    USING (
        ("destinataireId" = current_user_id())
        OR ("destinataireId" IS NULL AND "destinataireRole" IS NULL)
        OR (
            ("destinataireRole" IS NOT NULL)
            AND ("destinataireRole" = current_role_claim())
            -- SECT-NOTIF-DIFFUSION-1 : une diffusion par rôle scoped à un
            -- établissement n'est lisible que par ce rôle DANS l'établissement.
            AND (
                "destinataireEtablissementId" IS NULL
                OR "destinataireEtablissementId" = current_setting('app.claims.etablissement_id', true)
            )
        )
    );

-- 3. NotificationAdmin_select_destinataire : même garde sur les conditions rôle.
DROP POLICY IF EXISTS "NotificationAdmin_select_destinataire" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_select_destinataire" ON "NotificationAdmin"
    FOR SELECT TO PUBLIC
    USING (
        ("destinataireId" = current_user_id())
        OR (
            ("destinataireRole" = 'ADMIN')
            AND is_admin()
            AND ("destinataireEtablissementId" IS NULL)
        )
        OR (
            ("destinataireRole" = 'RESPONSABLE')
            AND is_responsable()
            AND (
                "destinataireEtablissementId" IS NULL
                OR "destinataireEtablissementId" = current_setting('app.claims.etablissement_id', true)
            )
        )
        OR (
            ("destinataireRole" = 'ENSEIGNANT')
            AND is_enseignant()
            AND (
                "destinataireEtablissementId" IS NULL
                OR "destinataireEtablissementId" = current_setting('app.claims.etablissement_id', true)
            )
        )
        OR (
            ("destinataireRole" = 'ETUDIANT')
            AND is_etudiant()
            AND (
                "destinataireEtablissementId" IS NULL
                OR "destinataireEtablissementId" = current_setting('app.claims.etablissement_id', true)
            )
        )
        OR ("destinataireId" IS NULL AND "destinataireRole" IS NULL)
    );
