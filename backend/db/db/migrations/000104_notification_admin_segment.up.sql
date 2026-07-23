-- ============================================================
-- Migration 000104 — NotificationAdmin : ciblage par segment d'abonnement
-- Task ID: SECT-NOTIF-SEGMENT-1
-- ============================================================
--
-- Permet à l'ADMIN PaaS de diffuser un message ciblé par segment :
--   - ALL              : tous les utilisateurs (comportement existant)
--   - B2B_RESPONSABLES : tous les RESPONSABLE d'établissements B2B (type ≠ PERSONNEL)
--   - B2C_SOLO         : enseignants B2C avec abonnement GRATUIT (Prof Solo)
--   - B2C_PREMIUM      : enseignants B2C avec abonnement PROFESSIONNEL (Prof Premium)
--   - B2C_ALL          : tous les enseignants B2C (Solo + Premium)
--   - ETABLISSEMENT    : membres d'un établissement précis (via destinataireEtablissementId)
--
-- Champs ajoutés (nullable, rétrocompatible) :
--   destinataireSegment        TEXT  -- 'ALL' | 'B2B_RESPONSABLES' | 'B2C_SOLO' | 'B2C_PREMIUM' | 'B2C_ALL' | 'ETABLISSEMENT'
--   destinataireEtablissementId TEXT -- utilisé quand segment = 'ETABLISSEMENT'
--
-- La VIEW NotificationUnified est régénérée pour exposer ces champs + filtrage RBAC.
-- ============================================================

-- 1. Ajout des colonnes (idempotent)
ALTER TABLE "NotificationAdmin" ADD COLUMN IF NOT EXISTS "destinataireSegment" TEXT;
ALTER TABLE "NotificationAdmin" ADD COLUMN IF NOT EXISTS "destinataireEtablissementId" TEXT;

-- 2. Index pour accélérer le filtrage par segment
CREATE INDEX IF NOT EXISTS "NotificationAdmin_destinataireSegment_idx"
  ON "NotificationAdmin"("destinataireSegment");

CREATE INDEX IF NOT EXISTS "NotificationAdmin_destinataireEtablissementId_idx"
  ON "NotificationAdmin"("destinataireEtablissementId");

-- 3. Contrainte FK vers Etablissement (si l'étab est supprimé, la notif reste mais devient orpheline → NULL)
--    On ne met pas ON DELETE CASCADE pour préserver l'historique des annonces.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'NotificationAdmin_destinataireEtablissementId_fkey'
      AND table_name = 'NotificationAdmin'
  ) THEN
    ALTER TABLE "NotificationAdmin"
      ADD CONSTRAINT "NotificationAdmin_destinataireEtablissementId_fkey"
      FOREIGN KEY ("destinataireEtablissementId") REFERENCES "Etablissement"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Régénérer la VIEW NotificationUnified pour exposer les nouveaux champs.
--    DROP + CREATE (la VIEW n'a pas de dépendances descendantes indexées).
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

-- La VIEW hérite automatiquement des RLS des tables sous-jacentes (RLS sur
-- les tables de base s'applique aux vues qui les interrogent). Le filtrage
-- par segment est fait côté backend (notification_phase3_handlers.go) car
-- neondb_owner a BYPASSRLS=true — defense-in-depth RBAC explicite.
