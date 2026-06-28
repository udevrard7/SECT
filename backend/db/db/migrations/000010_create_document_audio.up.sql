-- ============================================================
-- Migration 000010 — DocumentAudio (AUDIO-LEARNING-1)
-- ============================================================
-- Mode Audio-Learning : chaque enregistrement = un script de podcast
-- généré par l'IA (dialogue Présentateur ↔ Expert) + optionnellement
-- un fichier audio MP3 synthétisé via TTS et stocké sur Cloudflare R2.
--
-- Statuts :
--   EN_COURS : le worker génère le script + (option) l'audio.
--   PRET     : script disponible (audio mp3 optionnel si TTS supporté).
--   ERREUR   : échec de la génération du script (errorMessage rempli).
--
-- ⚠️  Cette migration DOIT être appliquée manuellement sur Neon PostgreSQL
--     avant que le code Go (AUDIO-LEARNING-1) ne fonctionne. Sans cela,
--     les endpoints /api/exam-prep/documents/{id}/audio et /audio/{id}
--     échoueront avec « relation "DocumentAudio" does not exist ».
-- ============================================================

CREATE TABLE "DocumentAudio" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "r2Key" TEXT,
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'EN_COURS',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentAudio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentAudio_documentId_idx" ON "DocumentAudio"("documentId");
CREATE INDEX "DocumentAudio_userId_idx" ON "DocumentAudio"("userId");

ALTER TABLE "DocumentAudio" ADD CONSTRAINT "DocumentAudio_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentAudio" ADD CONSTRAINT "DocumentAudio_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigger updated_at (cohérent avec la migration 000005 : toutes les tables
-- ayant une colonne "updatedAt" ont un trigger BEFORE UPDATE). On l'ajoute
-- manuellement ici car la migration 000005 ne couvre que les tables existantes
-- à son exécution.
CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON "DocumentAudio"
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
