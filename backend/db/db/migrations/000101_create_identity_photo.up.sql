-- IdentityPhoto : photos d'identité prises via webcam pour la vérification
-- d'identité avant et pendant un examen (verificationIdentite).
-- Stockée dans R2 à identity-photos/{etudiantId}/{timestamp}.jpg

CREATE TABLE "IdentityPhoto" (
    "id" TEXT NOT NULL,
    "etudiantId" TEXT NOT NULL,
    "epreuveId" TEXT NOT NULL,
    "sessionId" TEXT,
    "r2Key" TEXT,                    -- S3 key in R2 bucket (identity-photos/{etudiantId}/{timestamp}.jpg)
    "photoType" TEXT NOT NULL DEFAULT 'pre-exam',  -- pre-exam, mid-exam, post-exam
    "imageHash" TEXT,                -- SHA-256 for integrity
    "verifiedAt" TIMESTAMP(3),       -- When an enseignant/admin verified the photo
    "verifiedBy" TEXT,               -- User ID who verified
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdentityPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IdentityPhoto_etudiantId_idx" ON "IdentityPhoto" ("etudiantId");
CREATE INDEX "IdentityPhoto_epreuveId_idx" ON "IdentityPhoto" ("epreuveId");
CREATE INDEX "IdentityPhoto_sessionId_idx" ON "IdentityPhoto" ("sessionId");

ALTER TABLE "IdentityPhoto" ADD CONSTRAINT "IdentityPhoto_etudiantId_fkey"
    FOREIGN KEY ("etudiantId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "IdentityPhoto" ADD CONSTRAINT "IdentityPhoto_epreuveId_fkey"
    FOREIGN KEY ("epreuveId") REFERENCES "Epreuve"("id") ON DELETE CASCADE;

-- RLS: students can see their own photos, teachers/admins/responsables can see their epreuve's photos
ALTER TABLE "IdentityPhoto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "IdentityPhoto_select" ON "IdentityPhoto"
    FOR SELECT TO neondb_owner USING (
        "etudiantId" = current_user_id()
        OR (is_admin() AND admin_has_etablissement_access(epreuve_etab_id("epreuveId")))
        OR epreuve_owned_by_me("epreuveId")
        OR epreuve_in_my_etab("epreuveId")
    );
CREATE POLICY "IdentityPhoto_modify_system" ON "IdentityPhoto"
    FOR ALL TO neondb_owner
    USING (is_system())
    WITH CHECK (is_system());
