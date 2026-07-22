-- Migration 000061 — GeniusPay Wave (B2C Prof Premium)
-- Task ID: SECT-GENIUSPAY-WAVE
--
-- Objectif : Stocker la référence de paiement GeniusPay + l'URL de checkout
-- sur l'abonnement, pour permettre :
--   1. La reprise de paiement (renvoi vers paymentUrl si l'utilisateur a fermé l'onglet)
--   2. La vérification de statut (GET /payments/{reference} via API GeniusPay)
--   3. L'idempotence webhook (ne pas activer 2x un abonnement déjà ACTIF)
--
-- 2 colonnes ajoutées à Abonnement :
--   - geniuspayReference : référence MTX-XXX retournée par GeniusPay à la création
--   - geniuspayPaymentUrl : URL de checkout Wave (https://gateway.genius.ci/pay/MTX-XXX)

-- ═══ 1. Colonnes GeniusPay sur Abonnement ═══
ALTER TABLE "Abonnement" ADD COLUMN IF NOT EXISTS "geniuspayReference" TEXT;
ALTER TABLE "Abonnement" ADD COLUMN IF NOT EXISTS "geniuspayPaymentUrl" TEXT;

-- ═══ 2. Index pour la recherche webhook par référence (idempotence) ═══
-- Un webhook GeniusPay arrive avec la référence MTX-XXX ; on doit retrouver
-- l'abonnement associé rapidement. Index partiel (WHERE NOT NULL) car la
-- majorité des abonnements (Prof Solo, B2B) n'auront pas de référence.
CREATE INDEX IF NOT EXISTS "Abonnement_geniuspayReference_idx"
    ON "Abonnement" ("geniuspayReference")
    WHERE "geniuspayReference" IS NOT NULL;

-- ═══ 3. Pas de policy RLS supplémentaire ═══
-- Les colonnes geniuspayReference/PaymentUrl sont écrites par les endpoints
-- publics (initiate-payment) qui utilisent db.WithTx avec claims system, et
-- lues par le webhook (claims system). Les handlers authentifiés (admin)
-- utilisent les policies Abonnement existantes.
