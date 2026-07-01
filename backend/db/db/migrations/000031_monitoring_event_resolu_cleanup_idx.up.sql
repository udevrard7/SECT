-- Migration 000031 — Index partiel pour accélérer le lazy cleanup des événements RESOLU > 24h
--
-- CONTEXTE : Approche B (lazy cleanup à la lecture) — le handler GET /api/monitoring
-- fait un DELETE FROM "MonitoringEvent" WHERE statut='RESOLU' AND updatedAt < NOW() - INTERVAL '24 hours'
-- à chaque consultation. Sans index, ce DELETE fait un Seq Scan sur toute la table
-- (qui peut contenir des milliers de lignes en cas d'incident).
--
-- FIX : index partiel sur (statut, updatedAt) couvrant uniquement les lignes RESOLU.
-- Le DELETE utilise cet index → ~10-50ms même sur 10 000+ lignes.
--
-- Note : on n'indexe que statut='RESOLU' (pas ACTIF/IGNORE) car seuls les RESOLU sont
-- concernés par le cleanup. Les ACTIF/IGNORE ne sont jamais supprimés par ce mécanisme.

CREATE INDEX IF NOT EXISTS "MonitoringEvent_resolu_cleanup_idx"
    ON "MonitoringEvent" ("statut", "updatedAt")
    WHERE "statut" = 'RESOLU';
