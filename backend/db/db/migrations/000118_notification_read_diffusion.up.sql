-- ============================================================
-- Migration 000118 — Notifications & Diffusions : état de lecture
-- par utilisateur + isolation diffusion RESPONSABLE vs ADMIN SaaS
-- Task ID: SECT-NOTIF-DIFFUSION-1
-- ============================================================
--
-- 3 problèmes corrigés :
--
-- 1. ÉTAT « lu » PARTAGÉ SUR LES DIFFUSIONS (bug #10) :
--    Une ligne NotificationAdmin de diffusion (destinataireId NULL —
--    segment/rôle/établissement) n'a QU'UNE colonne "lu". Dès qu'UN
--    destinataire la marque lue (PATCH /me/{id} de la cloche), elle
--    devenait lue pour TOUS. Solution : table "NotificationRead"
--    (userId × notificationAdminId) — l'état lu d'une diffusion devient
--    PER-USER ; la VIEW NotificationUnified le calcule.
--
-- 2. VIEW NotificationUnified : expose "expireLe" (jamais filtré à la
--    lecture — bug #9) et calcule "lue" per-user pour les diffusions.
--
-- 3. RLS NotificationAdmin : INSERT inexistant pour ADMIN (la création
--    SaaS 500rait après bascule sect_app) et rien pour RESPONSABLE.
--    On prépare les policies pour :
--      - ADMIN SaaS : diffusions globales (destinataireId NULL)
--      - RESPONSABLE (ou ADMIN assistance) : diffusions de SON
--        établissement uniquement (destinataireEtablissementId = étab
--        des claims) — fondation du système de diffusion responsable,
--        strictement séparé du centre SaaS.
-- ============================================================

-- 1. Table NotificationRead : état de lecture per-user des diffusions.
CREATE TABLE IF NOT EXISTS "NotificationRead" (
    "userId"              TEXT NOT NULL,
    "notificationAdminId" TEXT NOT NULL,
    "readAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("userId", "notificationAdminId")
);

-- FK vers User (CASCADE : si le user disparaît, ses accusés de lecture aussi).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'NotificationRead_userId_fkey' AND table_name = 'NotificationRead'
    ) THEN
        ALTER TABLE "NotificationRead"
            ADD CONSTRAINT "NotificationRead_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'NotificationRead_notificationAdminId_fkey' AND table_name = 'NotificationRead'
    ) THEN
        ALTER TABLE "NotificationRead"
            ADD CONSTRAINT "NotificationRead_notificationAdminId_fkey"
            FOREIGN KEY ("notificationAdminId") REFERENCES "NotificationAdmin"("id") ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "NotificationRead_notificationAdminId_idx"
    ON "NotificationRead"("notificationAdminId");

-- RLS NotificationRead (active pour les rôles non-BYPASSRLS — ex sect_app).
ALTER TABLE "NotificationRead" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "NotificationRead_select_own" ON "NotificationRead";
CREATE POLICY "NotificationRead_select_own" ON "NotificationRead"
    FOR SELECT TO PUBLIC
    USING ("userId" = current_setting('app.claims.user_id', true));

DROP POLICY IF EXISTS "NotificationRead_insert_own" ON "NotificationRead";
CREATE POLICY "NotificationRead_insert_own" ON "NotificationRead"
    FOR INSERT TO PUBLIC
    WITH CHECK ("userId" = current_setting('app.claims.user_id', true));

DROP POLICY IF EXISTS "NotificationRead_delete_own" ON "NotificationRead";
CREATE POLICY "NotificationRead_delete_own" ON "NotificationRead"
    FOR DELETE TO PUBLIC
    USING ("userId" = current_setting('app.claims.user_id', true));

DROP POLICY IF EXISTS "NotificationRead_select_system" ON "NotificationRead";
CREATE POLICY "NotificationRead_select_system" ON "NotificationRead"
    FOR SELECT TO PUBLIC
    USING (current_setting('app.claims.role', true) = 'system');

DROP POLICY IF EXISTS "NotificationRead_all_system" ON "NotificationRead";
CREATE POLICY "NotificationRead_all_system" ON "NotificationRead"
    FOR ALL TO PUBLIC
    USING (current_setting('app.claims.role', true) = 'system')
    WITH CHECK (current_setting('app.claims.role', true) = 'system');

-- 2. RLS NotificationAdmin : INSERT/UPDATE/DELETE pour ADMIN SaaS et
--    RESPONSABLE (diffusions de leur établissement). Le runtime actuel
--    (neondb_owner, BYPASSRLS) n'est pas affecté — policies pour la
--    future bascule sect_app (cf. 000108).
DROP POLICY IF EXISTS "NotificationAdmin_insert_system" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_insert_system" ON "NotificationAdmin"
    FOR INSERT TO PUBLIC
    WITH CHECK (current_setting('app.claims.role', true) = 'system');

DROP POLICY IF EXISTS "NotificationAdmin_insert_admin" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_insert_admin" ON "NotificationAdmin"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        current_setting('app.claims.role', true) = 'ADMIN'
        AND "destinataireId" IS NULL
    );

DROP POLICY IF EXISTS "NotificationAdmin_insert_responsable" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_insert_responsable" ON "NotificationAdmin"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        (
            current_setting('app.claims.role', true) = 'RESPONSABLE'
            OR (current_setting('app.claims.role', true) = 'ADMIN'
                AND current_setting('app.claims.etablissement_id', true) <> '')
        )
        AND "destinataireId" IS NULL
        AND "destinataireEtablissementId" = current_setting('app.claims.etablissement_id', true)
    );

DROP POLICY IF EXISTS "NotificationAdmin_manage_admin" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_manage_admin" ON "NotificationAdmin"
    FOR UPDATE TO PUBLIC
    USING (
        current_setting('app.claims.role', true) = 'ADMIN'
        AND "destinataireId" IS NULL
    )
    WITH CHECK (
        current_setting('app.claims.role', true) = 'ADMIN'
        AND "destinataireId" IS NULL
    );

DROP POLICY IF EXISTS "NotificationAdmin_delete_admin" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_delete_admin" ON "NotificationAdmin"
    FOR DELETE TO PUBLIC
    USING (
        current_setting('app.claims.role', true) = 'ADMIN'
        AND "destinataireId" IS NULL
    );

DROP POLICY IF EXISTS "NotificationAdmin_manage_responsable" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_manage_responsable" ON "NotificationAdmin"
    FOR UPDATE TO PUBLIC
    USING (
        (
            current_setting('app.claims.role', true) = 'RESPONSABLE'
            OR (current_setting('app.claims.role', true) = 'ADMIN'
                AND current_setting('app.claims.etablissement_id', true) <> '')
        )
        AND "destinataireId" IS NULL
        AND "destinataireEtablissementId" = current_setting('app.claims.etablissement_id', true)
    )
    WITH CHECK (
        (
            current_setting('app.claims.role', true) = 'RESPONSABLE'
            OR (current_setting('app.claims.role', true) = 'ADMIN'
                AND current_setting('app.claims.etablissement_id', true) <> '')
        )
        AND "destinataireId" IS NULL
        AND "destinataireEtablissementId" = current_setting('app.claims.etablissement_id', true)
    );

DROP POLICY IF EXISTS "NotificationAdmin_delete_responsable" ON "NotificationAdmin";
CREATE POLICY "NotificationAdmin_delete_responsable" ON "NotificationAdmin"
    FOR DELETE TO PUBLIC
    USING (
        (
            current_setting('app.claims.role', true) = 'RESPONSABLE'
            OR (current_setting('app.claims.role', true) = 'ADMIN'
                AND current_setting('app.claims.etablissement_id', true) <> '')
        )
        AND "destinataireId" IS NULL
        AND "destinataireEtablissementId" = current_setting('app.claims.etablissement_id', true)
    );

-- 3. Régénérer la VIEW NotificationUnified :
--    - "lue" per-user pour les diffusions (NotificationRead)
--    - "expireLe" exposé (filtrage à la lecture côté handlers)
--    - structure identique par ailleurs (IDs préfixés a-/n-).
DROP VIEW IF EXISTS "NotificationUnified";

CREATE VIEW "NotificationUnified" AS
  -- Source : Alerte
  SELECT
    'a-' || "id"                                          AS "id",
    'alerte'                                               AS "source",
    "titre"                                                AS "titre",
    "description"                                          AS "description",
    "severity"::text                                       AS "severity",
    "type"::text                                           AS "type",
    "lue"                                                  AS "lue",
    "userId"                                               AS "destinataireId",
    NULL::text                                             AS "destinataireRole",
    NULL::text                                             AS "destinataireSegment",
    NULL::text                                             AS "destinataireEtablissementId",
    NULL::text                                             AS "actionUrl",
    NULL::text                                             AS "actionLabel",
    NULL::text                                             AS "categorie",
    "filiereId"                                            AS "filiereId",
    "epreuveId"                                            AS "epreuveId",
    NULL::timestamp                                        AS "expireLe",
    "createdAt"                                            AS "createdAt"
  FROM "Alerte"

  UNION ALL

  -- Source : NotificationAdmin
  SELECT
    'n-' || "id"                                           AS "id",
    'notification-admin'                                   AS "source",
    "titre"                                                AS "titre",
    "message"                                              AS "description",
    CASE
      WHEN "priorite" = 'URGENTE' THEN 'CRITICAL'
      WHEN "priorite" = 'HAUTE'   THEN 'WARNING'
      ELSE 'INFO'
    END                                                    AS "severity",
    COALESCE("categorie", "type")                          AS "type",
    CASE
      -- Notification personnelle : la colonne lu lui appartient en propre.
      WHEN "destinataireId" IS NOT NULL THEN "lu"
      -- Diffusion (segment/rôle/établissement/global) : état de lecture
      -- PER-USER via NotificationRead (bug #10 — avant : lu partagé).
      ELSE EXISTS (
        SELECT 1 FROM "NotificationRead" nr
        WHERE nr."notificationAdminId" = "NotificationAdmin"."id"
          AND nr."userId" = current_setting('app.claims.user_id', true)
      )
    END                                                    AS "lue",
    "destinataireId"                                       AS "destinataireId",
    "destinataireRole"                                     AS "destinataireRole",
    "destinataireSegment"                                  AS "destinataireSegment",
    "destinataireEtablissementId"                          AS "destinataireEtablissementId",
    "actionUrl"                                            AS "actionUrl",
    "actionLabel"                                          AS "actionLabel",
    "categorie"                                            AS "categorie",
    NULL::text                                             AS "filiereId",
    NULL::text                                             AS "epreuveId",
    "expireLe"                                             AS "expireLe",
    "createdAt"                                            AS "createdAt"
  FROM "NotificationAdmin";
