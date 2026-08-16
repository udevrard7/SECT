-- 000058 down: inverse la migration paiement B2C (Prof Premium).
--
-- 1. DROP les 2 fonctions (confirm_b2c_payment + create_b2c_subscription version 000058)
-- 2. DROP les 4 colonnes paiement sur Abonnement
--
-- ⚠️ NON RESTAURABLE : la valeur d'enum 'EN_ATTENTE_PAIEMENT' ajoutée à "StatutAbonnement"
-- ne peut PAS être supprimée en PostgreSQL (les valeurs d'enum sont immuables).
-- Cette valeur reste dans l'enum après ce down (sans impact : aucun abonnement ne l'utilise
-- si les colonnes sont supprimées).

-- ═══ 1. DROP des fonctions ═══
DROP FUNCTION IF EXISTS public.confirm_b2c_payment(text, text, text);
-- create_b2c_subscription version 000058 (signature avec p_periode_abonnement)
DROP FUNCTION IF EXISTS public.create_b2c_subscription(text, text, text, text, text, text);

-- ═══ 2. DROP des colonnes paiement ═══
ALTER TABLE "Abonnement" DROP COLUMN IF EXISTS "methodePaiement";
ALTER TABLE "Abonnement" DROP COLUMN IF EXISTS "datePaiement";
ALTER TABLE "Abonnement" DROP COLUMN IF EXISTS "referenceTransaction";
ALTER TABLE "Abonnement" DROP COLUMN IF EXISTS "periodeAbonnement";
