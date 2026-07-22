-- ════════════════════════════════════════════════════════════════════════════
-- 000087 — Academic Progression : Inscription + ReglesPassage + PromotionBatch
--          (SECT-INSCRIPTION-SCHEMA-1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- CONTEXTE :
--   SECT ne possède aucune table d'historisation des inscriptions annuelles.
--   User.niveau est un champ plat mutable, écrasé à chaque promotion sans trace.
--   La feature de clôture d'année (SECT-PROMOTION-*) nécessite :
--     - une table pivot Inscription (1 ligne par étudiant par année académique)
--       figeant le niveau, la moyenne, les credits et la décision de fin d'année ;
--     - une table ReglesPassage (seuils configurables par établissement) ;
--     - une table PromotionBatch (suivi des jobs de clôture async) ;
--     - une fonction SECURITY DEFINER cloturer_annee_etudiant() pour le cascade
--       atomique par étudiant (UPDATE User.niveau + INSERT Inscription source
--       + INSERT Inscription cible + INSERT AuditLog), bypass RLS proprement.
--
-- DÉPENDANCES PRÉALABLES (déjà appliquées) :
--   - 000085 : fix RLS AnneeAcademique TO PUBLIC (sinon writes silencieux)
--   - 000086 : ValidationUE.anneeAcademiqueId NOT NULL (sinon calculs faux)
--
-- ORDRE DE CRÉATION : PromotionBatch AVANT Inscription (car Inscription.batchId
-- référence PromotionBatch.id via FK).
--
-- RLS PATTERN : TO PUBLIC (pattern 000024/000078/000084), quadri-branch SELECT
--   (ETUDIANT self → RESPONSABLE same-etab → ADMIN with etab access → is_system
--   pour le worker). MODIFY : RESPONSABLE same-etab + is_system (worker bypass).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Enums ───
CREATE TYPE "StatutInscription" AS ENUM (
    'EN_COURS',    -- inscrit pour l'année, non encore clôturé
    'PROMU',       -- validé, passe au niveau supérieur
    'REDOUBLANT',  -- échec, reste au même niveau
    'DIPLOME',     -- niveau terminal validé, archivé
    'EXCLU',       -- renvoyé (décision manuelle)
    'REORIENTE',   -- changé de filière (décision manuelle)
    'QUITTE'       -- a quitté l'établissement
);

CREATE TYPE "PromotionBatchStatut" AS ENUM (
    'PENDING',     -- job créé, en attente de pickup par le worker
    'RUNNING',     -- worker en cours de traitement
    'COMPLETED',   -- terminé avec succès (peut avoir des erreurs partielles)
    'FAILED'       -- échec global (erreur fatale)
);

-- ─── 2. Table PromotionBatch (créée EN PREMIER car Inscription.batchId la référence) ───
CREATE TABLE "PromotionBatch" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "anneeSourceId" TEXT NOT NULL,
    "anneeCibleId" TEXT,
    "statut" "PromotionBatchStatut" NOT NULL DEFAULT 'PENDING',
    "runById" TEXT,
    "seuilMoyenne" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "totalEtudiants" INTEGER NOT NULL DEFAULT 0,
    "promuCount" INTEGER NOT NULL DEFAULT 0,
    "redoublantCount" INTEGER NOT NULL DEFAULT 0,
    "diplomeCount" INTEGER NOT NULL DEFAULT 0,
    "excluCount" INTEGER NOT NULL DEFAULT 0,
    "erreurCount" INTEGER NOT NULL DEFAULT 0,
    "progression" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termineAt" TIMESTAMP(3),

    CONSTRAINT "PromotionBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromotionBatch_etablissementId_idx" ON "PromotionBatch"("etablissementId");
CREATE INDEX "PromotionBatch_statut_idx" ON "PromotionBatch"("statut");
CREATE INDEX "PromotionBatch_anneeSourceId_idx" ON "PromotionBatch"("anneeSourceId");

ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_etablissementId_fkey"
    FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_anneeSourceId_fkey"
    FOREIGN KEY ("anneeSourceId") REFERENCES "AnneeAcademique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_anneeCibleId_fkey"
    FOREIGN KEY ("anneeCibleId") REFERENCES "AnneeAcademique"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_runById_fkey"
    FOREIGN KEY ("runById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 3. Table ReglesPassage (config par établissement) ───
CREATE TABLE "ReglesPassage" (
    "id" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "seuilMoyennePassage" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "seuilMoyenneRattrapage" DOUBLE PRECISION NOT NULL DEFAULT 8.0,
    "creditsMinPourcent" INTEGER NOT NULL DEFAULT 60,
    "regime" TEXT NOT NULL DEFAULT 'STRICT',
    "limiteRedoublements" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReglesPassage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReglesPassage_etablissementId_key" UNIQUE ("etablissementId")
);

ALTER TABLE "ReglesPassage" ADD CONSTRAINT "ReglesPassage_etablissementId_fkey"
    FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 4. Table Inscription (pivot historisée étudiant↔année) ───
CREATE TABLE "Inscription" (
    "id" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "anneeAcademiqueId" TEXT NOT NULL,
    "filiereId" TEXT,
    "niveau" "NiveauEtude" NOT NULL,
    "statut" "StatutInscription" NOT NULL DEFAULT 'EN_COURS',
    "moyenneAnnuelle" DOUBLE PRECISION,
    "creditsValides" INTEGER NOT NULL DEFAULT 0,
    "creditsTotaux" INTEGER NOT NULL DEFAULT 0,
    "decisionManuelle" BOOLEAN NOT NULL DEFAULT false,
    "raisonDecision" TEXT,
    "decideParId" TEXT,
    "dateCloture" TIMESTAMP(3),
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Inscription_etudiantId_anneeAcademiqueId_key" UNIQUE ("etudiantId", "anneeAcademiqueId")
);

CREATE INDEX "Inscription_etudiantId_idx" ON "Inscription"("etudiantId");
CREATE INDEX "Inscription_anneeAcademiqueId_idx" ON "Inscription"("anneeAcademiqueId");
CREATE INDEX "Inscription_filiereId_idx" ON "Inscription"("filiereId");
CREATE INDEX "Inscription_statut_idx" ON "Inscription"("statut");
CREATE INDEX "Inscription_batchId_idx" ON "Inscription"("batchId");

ALTER TABLE "Inscription" ADD CONSTRAINT "Inscription_etudiantId_fkey"
    FOREIGN KEY ("etudiantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Inscription" ADD CONSTRAINT "Inscription_anneeAcademiqueId_fkey"
    FOREIGN KEY ("anneeAcademiqueId") REFERENCES "AnneeAcademique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Inscription" ADD CONSTRAINT "Inscription_filiereId_fkey"
    FOREIGN KEY ("filiereId") REFERENCES "Filiere"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inscription" ADD CONSTRAINT "Inscription_decideParId_fkey"
    FOREIGN KEY ("decideParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inscription" ADD CONSTRAINT "Inscription_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "PromotionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 5. RLS PromotionBatch ───
ALTER TABLE "PromotionBatch" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PromotionBatch_select" ON "PromotionBatch";
CREATE POLICY "PromotionBatch_select" ON "PromotionBatch" FOR SELECT TO PUBLIC USING (
    is_system()
    OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
);

DROP POLICY IF EXISTS "PromotionBatch_modify" ON "PromotionBatch";
CREATE POLICY "PromotionBatch_modify" ON "PromotionBatch" FOR ALL TO PUBLIC
    USING (
        is_system()
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    )
    WITH CHECK (
        is_system()
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    );

-- ─── 6. RLS ReglesPassage ───
ALTER TABLE "ReglesPassage" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ReglesPassage_select" ON "ReglesPassage";
CREATE POLICY "ReglesPassage_select" ON "ReglesPassage" FOR SELECT TO PUBLIC USING (
    is_system()
    OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    OR (is_admin() AND admin_has_etablissement_access("etablissementId"))
);

DROP POLICY IF EXISTS "ReglesPassage_modify" ON "ReglesPassage";
CREATE POLICY "ReglesPassage_modify" ON "ReglesPassage" FOR ALL TO PUBLIC
    USING (
        is_system()
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    )
    WITH CHECK (
        is_system()
        OR (is_responsable() AND ("etablissementId" = current_etablissement_id()))
    );

-- ─── 7. RLS Inscription ───
ALTER TABLE "Inscription" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inscription_select" ON "Inscription";
CREATE POLICY "Inscription_select" ON "Inscription" FOR SELECT TO PUBLIC USING (
    is_system()
    OR (is_etudiant() AND ("etudiantId" = current_user_id()))
    OR (is_responsable() AND user_in_my_etab("etudiantId"))
    OR (is_admin() AND admin_has_etablissement_access(user_etab_id("etudiantId")))
);

DROP POLICY IF EXISTS "Inscription_modify" ON "Inscription";
CREATE POLICY "Inscription_modify" ON "Inscription" FOR ALL TO PUBLIC
    USING (
        is_system()
        OR (is_responsable() AND user_in_my_etab("etudiantId"))
    )
    WITH CHECK (
        is_system()
        OR (is_responsable() AND user_in_my_etab("etudiantId"))
    );

-- ─── 8. Fonction next_niveau(niveau) — miroir SQL du helper Go ───
-- Retourne (next_niveau, is_terminal). Pour DOCTORAT → (DOCTORAT, true).
-- Pour un niveau invalide → (NULL, false).
CREATE OR REPLACE FUNCTION public.next_niveau(p_niveau "NiveauEtude")
RETURNS TABLE(next_niveau "NiveauEtude", is_terminal boolean)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    CASE p_niveau
        WHEN 'L1' THEN RETURN QUERY SELECT 'L2'::"NiveauEtude", false;
        WHEN 'L2' THEN RETURN QUERY SELECT 'L3'::"NiveauEtude", false;
        WHEN 'L3' THEN RETURN QUERY SELECT 'M1'::"NiveauEtude", false;
        WHEN 'M1' THEN RETURN QUERY SELECT 'M2'::"NiveauEtude", false;
        WHEN 'M2' THEN RETURN QUERY SELECT 'DOCTORAT'::"NiveauEtude", false;
        WHEN 'DOCTORAT' THEN RETURN QUERY SELECT 'DOCTORAT'::"NiveauEtude", true;
        ELSE RETURN QUERY SELECT NULL::"NiveauEtude", false;
    END CASE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_niveau("NiveauEtude") TO PUBLIC;

-- ─── 9. Fonction SECURITY DEFINER cloturer_annee_etudiant(...) ───
-- Cascade atomique par étudiant (appelée par le worker promotion_worker.go) :
--   1. Calcule moyenneAnnuelle + creditsValides + creditsTotaux
--   2. Détermine la décision (auto selon règles, ou override si p_decision fourni)
--   3. Si PROMU : UPDATE User.niveau = next + INSERT Inscription(anneeCible, EN_COURS)
--      Si REDOUBLANT : INSERT Inscription(anneeCible, EN_COURS, même niveau)
--      Si DIPLOME/EXCLU/REORIENTE/QUITTE : pas de nouvelle inscription
--   4. UPDATE Inscription(anneeSource) : statut, moyenne, credits, dateCloture, etc.
--   5. INSERT AuditLog (action PROMOTION_DECISION_*, entite=User, details JSON)
--   6. Retourne un record avec la décision et les calculs
--
-- SECURITY DEFINER : bypass RLS (sinon le worker system ne pourrait pas écrire
-- sur User.niveau via les policies existantes qui exigent is_responsable).
-- search_path = public pour éviter les attaques par schéma.
CREATE OR REPLACE FUNCTION public.cloturer_annee_etudiant(
    p_etudiant_id text,
    p_annee_source_id text,
    p_annee_cible_id text,
    p_filiere_id text,
    p_niveau "NiveauEtude",
    p_decision_override "StatutInscription",
    p_motif text,
    p_decide_par_id text,
    p_batch_id text,
    p_seuil_moyenne_passage double precision DEFAULT 10.0,
    p_seuil_moyenne_rattrapage double precision DEFAULT 8.0,
    p_credits_min_pourcent integer DEFAULT 60
)
RETURNS TABLE(
    decision "StatutInscription",
    moyenne_annuelle double precision,
    credits_valides integer,
    credits_totaux integer,
    nouveau_niveau "NiveauEtude",
    error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_moyenne double precision;
    v_credits_valides integer;
    v_credits_totaux integer;
    v_decision "StatutInscription";
    v_next "NiveauEtude";
    v_is_terminal boolean;
    v_nouveau_niveau "NiveauEtude";
    v_inscription_source_id text;
    v_inscription_cible_id text;
    v_action_audit text;
    v_details jsonb;
BEGIN
    -- ── 1. Calculs agrégés depuis ValidationUE ──
    SELECT COALESCE(AVG(vu."moyenneUE"), 0), COALESCE(SUM(ue."creditsECTS"), 0)
    INTO v_moyenne, v_credits_valides
    FROM "ValidationUE" vu
    JOIN "UniteEnseignement" ue ON ue."id" = vu."uniteEnseignementId"
    WHERE vu."etudiantId" = p_etudiant_id
      AND vu."anneeAcademiqueId" = p_annee_source_id
      AND vu."statut" = 'VALIDEE';

    -- Credits totaux attendus pour le niveau + filière de l'étudiant
    SELECT COALESCE(SUM(ue."creditsECTS"), 0)
    INTO v_credits_totaux
    FROM "UniteEnseignement" ue
    WHERE ue."filiereId" = p_filiere_id
      AND ue."niveau" = p_niveau
      AND ue."actif" = true;

    -- ── 2. Décision ──
    IF p_decision_override IS NOT NULL THEN
        v_decision := p_decision_override;
    ELSE
        -- next_niveau pour vérifier si terminal
        SELECT fn.next_niveau, fn.is_terminal INTO v_next, v_is_terminal
        FROM public.next_niveau(p_niveau) fn;

        IF v_is_terminal THEN
            -- Niveau terminal (DOCTORAT) : si validé → DIPLOME, sinon REDOUBLANT
            IF v_moyenne >= p_seuil_moyenne_passage THEN
                v_decision := 'DIPLOME';
            ELSE
                v_decision := 'REDOUBLANT';
            END IF;
        ELSIF v_moyenne >= p_seuil_moyenne_passage
              AND v_credits_totaux > 0
              AND v_credits_valides >= (v_credits_totaux * p_credits_min_pourcent / 100.0) THEN
            v_decision := 'PROMU';
        ELSE
            v_decision := 'REDOUBLANT';
        END IF;
    END IF;

    -- ── 3. Application de la décision ──
    v_nouveau_niveau := p_niveau;

    IF v_decision = 'PROMU' THEN
        SELECT fn.next_niveau INTO v_nouveau_niveau
        FROM public.next_niveau(p_niveau) fn;
        -- UPDATE User.niveau (champ plat mutable, la source de vérité historique
        -- est maintenant Inscription)
        UPDATE "User" SET "niveau" = v_nouveau_niveau, "updatedAt" = NOW()
        WHERE "id" = p_etudiant_id;
    ELSIF v_decision = 'DIPLOME' THEN
        v_nouveau_niveau := p_niveau; -- inchangé
    END IF;

    -- ── 4. INSERT/UPDATE Inscription source (clôture) ──
    -- On suppose que l'Inscription source existe déjà (créée à l'inscription de
    -- l'étudiant via le hook signup, ou par backfill). Si elle n'existe pas, on
    -- la crée avec statut=EN_COURS puis on la clôture.
    SELECT "id" INTO v_inscription_source_id
    FROM "Inscription"
    WHERE "etudiantId" = p_etudiant_id AND "anneeAcademiqueId" = p_annee_source_id;

    IF v_inscription_source_id IS NULL THEN
        -- Backfill défensif : crée l'inscription source rétroactivement
        v_inscription_source_id := 'ins_src_' || replace(gen_random_uuid()::text, '-', '');
        INSERT INTO "Inscription" (
            "id", "etudiantId", "anneeAcademiqueId", "filiereId", "niveau",
            "statut", "createdAt", "updatedAt"
        ) VALUES (
            v_inscription_source_id, p_etudiant_id, p_annee_source_id, p_filiere_id, p_niveau,
            'EN_COURS', NOW(), NOW()
        );
    END IF;

    UPDATE "Inscription" SET
        "statut" = v_decision,
        "moyenneAnnuelle" = v_moyenne,
        "creditsValides" = v_credits_valides,
        "creditsTotaux" = v_credits_totaux,
        "decisionManuelle" = (p_decision_override IS NOT NULL),
        "raisonDecision" = p_motif,
        "decideParId" = p_decide_par_id,
        "dateCloture" = NOW(),
        "batchId" = p_batch_id,
        "updatedAt" = NOW()
    WHERE "id" = v_inscription_source_id;

    -- ── 5. INSERT Inscription cible (si PROMU ou REDOUBLANT) ──
    IF v_decision IN ('PROMU', 'REDOUBLANT') AND p_annee_cible_id IS NOT NULL THEN
        v_inscription_cible_id := 'ins_cib_' || replace(gen_random_uuid()::text, '-', '');
        INSERT INTO "Inscription" (
            "id", "etudiantId", "anneeAcademiqueId", "filiereId", "niveau",
            "statut", "createdAt", "updatedAt"
        ) VALUES (
            v_inscription_cible_id, p_etudiant_id, p_annee_cible_id, p_filiere_id, v_nouveau_niveau,
            'EN_COURS', NOW(), NOW()
        );
    END IF;

    -- ── 6. AuditLog ──
    v_action_audit := CASE v_decision
        WHEN 'PROMU' THEN 'PROMOTION_DECISION_PROMU'
        WHEN 'REDOUBLANT' THEN 'PROMOTION_DECISION_REDOUBLANT'
        WHEN 'DIPLOME' THEN 'PROMOTION_DECISION_DIPLOME'
        WHEN 'EXCLU' THEN 'PROMOTION_DECISION_EXCLU'
        WHEN 'REORIENTE' THEN 'PROMOTION_DECISION_REORIENTE'
        WHEN 'QUITTE' THEN 'PROMOTION_DECISION_QUITTE'
        ELSE 'PROMOTION_DECISION_UNKNOWN'
    END;

    v_details := jsonb_build_object(
        'anneeSourceId', p_annee_source_id,
        'anneeCibleId', p_annee_cible_id,
        'niveauSource', p_niveau,
        'niveauCible', v_nouveau_niveau,
        'moyenneAnnuelle', v_moyenne,
        'creditsValides', v_credits_valides,
        'creditsTotaux', v_credits_totaux,
        'decision', v_decision,
        'decisionManuelle', (p_decision_override IS NOT NULL),
        'batchId', p_batch_id
    );

    INSERT INTO "AuditLog" ("id", "userId", "userEmail", "action", "entite", "entiteId", "details", "adresseIp", "createdAt")
    VALUES (
        'audit_' || replace(gen_random_uuid()::text, '-', ''),
        p_decide_par_id,
        NULL,
        v_action_audit,
        'User',
        p_etudiant_id,
        v_details::text,
        NULL,
        NOW()
    );

    -- ── 7. Retour ──
    RETURN QUERY SELECT v_decision, v_moyenne, v_credits_valides, v_credits_totaux, v_nouveau_niveau, NULL::text;
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT 'EN_COURS'::"StatutInscription", 0.0, 0, 0, p_niveau, SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cloturer_annee_etudiant TO PUBLIC;

-- ─── 10. Backfill ReglesPassage pour les établissements existants ───
-- Chaque établissement existant reçoit les règles par défaut (10/20, 8/20, 60%).
INSERT INTO "ReglesPassage" ("id", "etablissementId", "createdAt", "updatedAt")
SELECT
    'regles_' || replace(gen_random_uuid()::text, '-', ''),
    e."id",
    NOW(),
    NOW()
FROM "Etablissement" e
WHERE NOT EXISTS (
    SELECT 1 FROM "ReglesPassage" rp WHERE rp."etablissementId" = e."id"
);

-- ─── 11. Grants ───
-- Les ALTER DEFAULT PRIVILEGES de 000020 couvrent automatiquement les nouvelles
-- tables pour sect_app. Les policies sont TO PUBLIC. Les fonctions ont GRANT
-- EXECUTE TO PUBLIC. Aucun grant supplémentaire nécessaire.
