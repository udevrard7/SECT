-- ============================================================
-- Migration 000104 (DOWN) — Rollback
-- Task ID: SECT-NOTIF-SEGMENT-1
-- ============================================================

-- Restaurer la VIEW d'origine (sans les champs segment)
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
    "actionUrl"                                            AS "actionUrl",
    "actionLabel"                                          AS "actionLabel",
    "categorie"                                            AS "categorie",
    NULL::text                                             AS "filiereId",
    NULL::text                                             AS "epreuveId",
    "createdAt"                                            AS "createdAt"
  FROM "NotificationAdmin";

-- Supprimer les index
DROP INDEX IF EXISTS "NotificationAdmin_destinataireSegment_idx";
DROP INDEX IF EXISTS "NotificationAdmin_destinataireEtablissementId_idx";

-- Supprimer la FK
ALTER TABLE "NotificationAdmin"
  DROP CONSTRAINT IF EXISTS "NotificationAdmin_destinataireEtablissementId_fkey";

-- Supprimer les colonnes
ALTER TABLE "NotificationAdmin" DROP COLUMN IF EXISTS "destinataireSegment";
ALTER TABLE "NotificationAdmin" DROP COLUMN IF EXISTS "destinataireEtablissementId";
