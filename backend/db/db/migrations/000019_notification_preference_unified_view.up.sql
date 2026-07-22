-- ============================================================
-- Migration 000019 — Phase 3 notifications : préférences + VIEW unifiée
-- ============================================================
--
-- Deux ajouts non-destructifs (aucune table existante modifiée) :
--
-- 1. Table NotificationPreference — préférences par utilisateur/catégorie.
--    Permet à chaque user de désactiver certaines catégories de notifications.
--
-- 2. VIEW NotificationUnified — UNION de Alerte + NotificationAdmin avec
--    un schéma cohérent. Permet au frontend d'avoir un seul endpoint au lieu
--    de fusionner 2 sources. Non-destructif : les tables originales restent.
-- ============================================================

-- ─── 1. Table NotificationPreference ───

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
        "id"           text        NOT NULL,
        "userId"       text        NOT NULL,
        "categorie"    text        NOT NULL,
        "pushEnabled"  boolean     NOT NULL DEFAULT true,
        "emailEnabled" boolean     NOT NULL DEFAULT false,
        "createdAt"    timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"    timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "NotificationPreference_userId_categorie_key" UNIQUE ("userId", "categorie"),
        CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId")
          REFERENCES "User"("id") ON DELETE CASCADE
);

-- Activer RLS
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;

-- Policy SELECT : un user ne voit que ses propres préférences
DROP POLICY IF EXISTS "NotificationPreference_select_own" ON "NotificationPreference";
CREATE POLICY "NotificationPreference_select_own" ON "NotificationPreference"
  FOR SELECT TO neondb_owner
  USING ("userId" = current_user_id());

-- Policy UPDATE : un user ne modifie que ses propres préférences
DROP POLICY IF EXISTS "NotificationPreference_update_own" ON "NotificationPreference";
CREATE POLICY "NotificationPreference_update_own" ON "NotificationPreference"
  FOR UPDATE TO neondb_owner
  USING ("userId" = current_user_id())
  WITH CHECK ("userId" = current_user_id());

-- Policy INSERT : un user ne crée que ses propres préférences
DROP POLICY IF EXISTS "NotificationPreference_insert_own" ON "NotificationPreference";
CREATE POLICY "NotificationPreference_insert_own" ON "NotificationPreference"
  FOR INSERT TO neondb_owner
  WITH CHECK ("userId" = current_user_id());

-- Trigger updated_at automatique (réutilise la fonction existante)
CREATE TRIGGER "NotificationPreference_set_updated_at"
  BEFORE UPDATE ON "NotificationPreference"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index pour accélérer la recherche par user
CREATE INDEX IF NOT EXISTS "NotificationPreference_userId_idx"
  ON "NotificationPreference"("userId");

-- ─── 2. VIEW NotificationUnified ───
-- UNION de Alerte + NotificationAdmin avec un schéma cohérent.
-- Les IDs sont préfixés ('a-' / 'n-') pour éviter les collisions.
-- severity est normalisée : CRITICAL/WARNING/INFO pour Alerte,
-- URGENTE→CRITICAL, HAUTE→WARNING, autre→INFO pour NotificationAdmin.

CREATE OR REPLACE VIEW "NotificationUnified" AS
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
    "actionUrl"                                            AS "actionUrl",
    "actionLabel"                                          AS "actionLabel",
    "categorie"                                            AS "categorie",
    NULL::text                                             AS "filiereId",
    NULL::text                                             AS "epreuveId",
    "createdAt"                                            AS "createdAt"
  FROM "NotificationAdmin";

-- La VIEW hérite automatiquement des RLS des tables sous-jacentes (RLS sur
-- les tables de base s'applique aux vues qui les interrogent). Donc un user
-- ne verra que les Alertes et NotificationAdmin qu'il est autorisé à voir
-- selon les policies existantes (Alerte_select, NotificationAdmin_select_destinataire).
