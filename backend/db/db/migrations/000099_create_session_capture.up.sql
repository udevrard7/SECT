-- SessionCapture : stockage des captures écran anti-fraude dans R2.
-- Chaque capture est uploadée vers Cloudflare R2 et ses métadonnées
-- sont persistées ici (clé R2, hash d'intégrité, taille, index ordinal).

CREATE TABLE "SessionCapture" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "epreuveId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,        -- S3 key in R2 bucket (e.g., captures/{sessionId}/{timestamp}.jpg)
    "imageHash" TEXT,             -- SHA-256 hash of the image for integrity
    "fileSize" INTEGER,           -- Size in bytes
    "captureIndex" INTEGER NOT NULL DEFAULT 1,  -- Ordinal number of this capture in the session
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionCapture_pkey" PRIMARY KEY ("id")
);

-- Index for quick lookup by session
CREATE INDEX "SessionCapture_sessionId_idx" ON "SessionCapture" ("sessionId");
-- Index for listing captures per epreuve (surveillance dashboard)
CREATE INDEX "SessionCapture_epreuveId_idx" ON "SessionCapture" ("epreuveId");
-- Index for listing captures per student
CREATE INDEX "SessionCapture_etudiantId_idx" ON "SessionCapture" ("etudiantId");

-- Foreign key
ALTER TABLE "SessionCapture" ADD CONSTRAINT "SessionCapture_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "SessionPassation"("id") ON DELETE CASCADE;

-- RLS
ALTER TABLE "SessionCapture" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SessionCapture_select" ON "SessionCapture"
    FOR SELECT TO neondb_owner USING (
        (is_admin() AND admin_has_etablissement_access(epreuve_etab_id("epreuveId")))
        OR epreuve_owned_by_me("epreuveId")
        OR epreuve_in_my_etab("epreuveId")
        OR "etudiantId" = current_user_id()
    );

-- INSERT policy : seul l'étudiant propriétaire peut insérer ses captures
CREATE POLICY "SessionCapture_insert" ON "SessionCapture"
    FOR INSERT TO neondb_owner WITH CHECK (
        "etudiantId" = current_user_id()
    );
