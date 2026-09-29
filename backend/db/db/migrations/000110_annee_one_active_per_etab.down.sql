-- ============================================================
-- Migration 000110 (DOWN) — retour au comportement multi-actifs
-- SECT-ANNEE-CHEVAUCHEMENT-1
-- ============================================================
--
-- Retire l'index unique partiel (l'invariant « une seule année active »
-- n'est plus garanti par la DB).
--
-- NB : la réconciliation de l'étape 1 (up) n'est PAS réversible — on ne
-- peut pas savoir quelles années étaient actives avant l'apply. Les années
-- passées restent actif=false ; le responsable peut les ré-activer via
-- l'UI (PATCH actif) si nécessaire.
-- ============================================================

DROP INDEX IF EXISTS "AnneeAcademique_one_active_per_etab";
