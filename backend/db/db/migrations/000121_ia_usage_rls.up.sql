-- ============================================================
-- Migration 000121 — RLS sur IAUsage (dernière table public sans RLS)
-- SECT-DETTES-AUDIT-2 (dette « IAUsage sans RLS » notée post-bascule
-- sect_app, SECT-DEBTS-FIX-1)
-- ============================================================
-- CONTEXTE : IAUsage (000059 — compteurs mensuels generation/correction
-- par établissement, upsert ON CONFLICT) était la SEULE table public sans
-- RLS (75/76 en avaient, audit 2026-10-18 : 75 actives, IAUsage exclue).
-- Le filtrage était fait uniquement côté requêtes Go (WHERE
-- etablissementId = $1 dans quota.go) — aucune défense en profondeur si
-- un futur handler oublie le WHERE : les compteurs d'un établissement
-- (volume IA, proxy de facturation) seraient lisibles cross-tenant.
--
-- ORDRE DE DÉPLOIEMENT (RUPTURE SI INVERSÉ — documenté worklog) :
--   1. Déployer D'ABORD le code backend (quota.go : count/increment passent
--      par db.WithSystemTx — fonctionne avec OU sans RLS) ;
--   2. PUIS appliquer cette migration (le code déjà LIVE passe via la
--      branche is_system() des policies).
-- L'ancien code (pool-direct, sans claims) + cette migration = deny par
-- défaut → les endpoints IA échoueraient sur leur contrôle de quota.
--
-- CHANGEMENTS :
--   A. ENABLE ROW LEVEL SECURITY sur IAUsage ;
--   B. Policies (pattern 000117, TO PUBLIC — sect_app NOBYPASSRLS) :
--      - IAUsage_select : is_system() OR etablissementId = current_etablissement_id()
--      - IAUsage_insert : idem (WITH CHECK)
--      - IAUsage_update : idem (USING + WITH CHECK — requis par l'upsert
--        ON CONFLICT DO UPDATE de incrementIAUsage)
--      - DELETE : VOLONTAIREMENT AUCUNE policy (deny par défaut) — les
--        compteurs ne se suppriment pas par l'app. La FK ON DELETE CASCADE
--        (suppression d'un établissement) passe outre la RLS (les contrôles
--        d'intégrité référentielle bypassent la RLS — sémantique PG
--        documentée dans le worklog 000109).
--
-- Le moteur de quota (quota.go) tourne en claims système (WithSystemTx —
-- usage « quotas » explicitement documenté dans db.go) ; les futures
-- lectures user-context (ex. affichage de consommation own-etab) passent
-- la branche etablissement.
--
-- IDEMPOTENCE : DROP POLICY IF EXISTS avant chaque CREATE.
-- ============================================================

-- A. Activer RLS
ALTER TABLE "IAUsage" ENABLE ROW LEVEL SECURITY;

-- B. Policies
DROP POLICY IF EXISTS "IAUsage_select" ON "IAUsage";
CREATE POLICY "IAUsage_select" ON "IAUsage"
    FOR SELECT TO PUBLIC
    USING (
        is_system()
        OR "etablissementId" = current_etablissement_id()
    );

DROP POLICY IF EXISTS "IAUsage_insert" ON "IAUsage";
CREATE POLICY "IAUsage_insert" ON "IAUsage"
    FOR INSERT TO PUBLIC
    WITH CHECK (
        is_system()
        OR "etablissementId" = current_etablissement_id()
    );

DROP POLICY IF EXISTS "IAUsage_update" ON "IAUsage";
CREATE POLICY "IAUsage_update" ON "IAUsage"
    FOR UPDATE TO PUBLIC
    USING (
        is_system()
        OR "etablissementId" = current_etablissement_id()
    )
    WITH CHECK (
        is_system()
        OR "etablissementId" = current_etablissement_id()
    );
