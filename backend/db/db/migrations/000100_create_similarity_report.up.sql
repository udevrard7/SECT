-- Migration 000100 — SimilarityReport : détection similarité entre copies
-- Task ID: 5 (Fix 5: seuilSimilarite — Worker post-exam)
--
-- Objectif : stocker les rapports de similarité entre copies d'étudiants
-- pour une même épreuve, générés par le worker similarity_worker.go.
-- Le seuil seuilSimilarite (SecuritySettings) détermine le flag.

CREATE TABLE "SimilarityReport" (
    "id" TEXT NOT NULL,
    "epreuveId" TEXT NOT NULL,
    "sessionA" TEXT NOT NULL,        -- First student's session
    "sessionB" TEXT NOT NULL,        -- Second student's session
    "etudiantAId" TEXT NOT NULL,
    "etudiantBId" TEXT NOT NULL,
    "globalSimilarity" DOUBLE PRECISION NOT NULL,  -- 0.0-1.0 overall similarity
    "questionSimilarities" TEXT NOT NULL,           -- JSON array: [{questionId, type, similarity, answerA, answerB}]
    "flagged" BOOLEAN NOT NULL DEFAULT false,       -- Above threshold
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimilarityReport_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "SimilarityReport_epreuveId_idx" ON "SimilarityReport" ("epreuveId");
CREATE INDEX "SimilarityReport_flagged_idx" ON "SimilarityReport" ("flagged") WHERE "flagged" = true;
CREATE INDEX "SimilarityReport_etudiantAId_idx" ON "SimilarityReport" ("etudiantAId");

-- Unique constraint: one report per pair per epreuve
CREATE UNIQUE INDEX "SimilarityReport_pair_unique" ON "SimilarityReport" (
    LEAST("sessionA", "sessionB"), GREATEST("sessionA", "sessionB")
);

-- FK
ALTER TABLE "SimilarityReport" ADD CONSTRAINT "SimilarityReport_epreuveId_fkey"
    FOREIGN KEY ("epreuveId") REFERENCES "Epreuve"("id") ON DELETE CASCADE;
ALTER TABLE "SimilarityReport" ADD CONSTRAINT "SimilarityReport_sessionA_fkey"
    FOREIGN KEY ("sessionA") REFERENCES "SessionPassation"("id") ON DELETE CASCADE;
ALTER TABLE "SimilarityReport" ADD CONSTRAINT "SimilarityReport_sessionB_fkey"
    FOREIGN KEY ("sessionB") REFERENCES "SessionPassation"("id") ON DELETE CASCADE;

-- RLS
-- NOTE : Epreuve n'a pas de colonne "etablissementId" directe.
-- On utilise EXISTS + JOIN Filiere (même pattern que EpreuveQuestion_select).
ALTER TABLE "SimilarityReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SimilarityReport_select" ON "SimilarityReport"
    FOR SELECT TO neondb_owner USING (
        (is_enseignant() AND EXISTS (
            SELECT 1 FROM "Epreuve" e WHERE e."id" = "SimilarityReport"."epreuveId"
                AND e."enseignantId" = current_user_id()
        ))
        OR (is_responsable() AND EXISTS (
            SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
            WHERE e."id" = "SimilarityReport"."epreuveId"
                AND f."etablissementId" = current_etablissement_id()
        ))
        OR (is_admin() AND EXISTS (
            SELECT 1 FROM "Epreuve" e JOIN "Filiere" f ON f."id" = e."filiereId"
            WHERE e."id" = "SimilarityReport"."epreuveId"
                AND admin_has_etablissement_access(f."etablissementId")
        ))
        OR "etudiantAId" = current_user_id()
        OR "etudiantBId" = current_user_id()
    );
CREATE POLICY "SimilarityReport_modify_system" ON "SimilarityReport"
    FOR ALL TO neondb_owner
    USING (is_system())
    WITH CHECK (is_system());
