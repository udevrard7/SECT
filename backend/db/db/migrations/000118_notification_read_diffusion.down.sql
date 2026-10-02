-- ============================================================
-- Migration 000118 (DOWN) — rollback de 000118_notification_read_diffusion
-- Task ID: SECT-NOTIF-DIFFUSION-1
-- ============================================================

-- Restaurer la VIEW d'origine (000104) : sans expireLe ni lue per-user.
DROP VIEW IF EXISTS "NotificationUnified";

CREATE VIEW "NotificationUnified" AS
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
    "createdAt"                                            AS "createdAt"
  FROM "Alerte"

  UNION ALL

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
    "lu"                                                   AS "lue",
    "destinataireId"                                       AS "destinataireId",
    "destinataireRole"                                     AS "destinataireRole",
    "destinataireSegment"                                  AS "destinataireSegment",
    "destinataireEtablissementId"                          AS "destinataireEtablissementId",
    "actionUrl"                                            AS "actionUrl",
    "actionLabel"                                          AS "actionLabel",
    "categorie"                                            AS "categorie",
    NULL::text                                             AS "filiereId",
    NULL::text                                             AS "epreuveId",
    "createdAt"                                            AS "createdAt"
  FROM "NotificationAdmin";

-- Policies ajoutées par 000118 : retirées.
DROP POLICY IF EXISTS "NotificationAdmin_insert_system" ON "NotificationAdmin";
DROP POLICY IF EXISTS "NotificationAdmin_insert_admin" ON "NotificationAdmin";
DROP POLICY IF EXISTS "NotificationAdmin_insert_responsable" ON "NotificationAdmin";
DROP POLICY IF EXISTS "NotificationAdmin_manage_admin" ON "NotificationAdmin";
DROP POLICY IF EXISTS "NotificationAdmin_delete_admin" ON "NotificationAdmin";
DROP POLICY IF EXISTS "NotificationAdmin_manage_responsable" ON "NotificationAdmin";
DROP POLICY IF EXISTS "NotificationAdmin_delete_responsable" ON "NotificationAdmin";

DROP POLICY IF EXISTS "NotificationRead_select_own" ON "NotificationRead";
DROP POLICY IF EXISTS "NotificationRead_insert_own" ON "NotificationRead";
DROP POLICY IF EXISTS "NotificationRead_delete_own" ON "NotificationRead";
DROP POLICY IF EXISTS "NotificationRead_select_system" ON "NotificationRead";
DROP POLICY IF EXISTS "NotificationRead_all_system" ON "NotificationRead";

DROP TABLE IF EXISTS "NotificationRead";
