-- ============================================================
-- Migration 000009 — QuestionVote (QUESTION-BANK-1)
-- ============================================================
-- Banque de questions collaborative : permet aux étudiants d'upvote/
-- downvote les questions générées par l'IA pour faire émerger les
-- questions les plus pertinentes (cache de questions pré-générées).
--
-- ⚠️  Cette migration DOIT être appliquée manuellement sur Neon PostgreSQL
--     avant que le code Go (QUESTION-BANK-1) ne fonctionne. Sans cela,
--     les endpoints /api/exam-prep/question-bank et /questions/{id}/vote
--     échoueront avec « relation "QuestionVote" does not exist ».
-- ============================================================

CREATE TABLE "QuestionVote" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,  -- +1 = upvote, -1 = downvote
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionVote_pkey" PRIMARY KEY ("id")
);

-- Un utilisateur ne peut voter qu'une fois par question (contrainte d'unicité).
-- Le code Go (repository.VoteQuestion) utilise cette contrainte pour faire
-- l'upsert : tente INSERT, si SQLSTATE 23505 (unique_violation) → UPDATE.
CREATE UNIQUE INDEX "QuestionVote_questionId_userId_unique"
    ON "QuestionVote"("questionId", "userId");

CREATE INDEX "QuestionVote_questionId_idx" ON "QuestionVote"("questionId");
CREATE INDEX "QuestionVote_userId_idx" ON "QuestionVote"("userId");

ALTER TABLE "QuestionVote" ADD CONSTRAINT "QuestionVote_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionVote" ADD CONSTRAINT "QuestionVote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigger updated_at (cohérent avec la migration 000005 : toutes les tables
-- ayant une colonne "updatedAt" ont un trigger BEFORE UPDATE). On l'ajoute
-- manuellement ici car la migration 000005 ne couvre que les tables existantes
-- à son exécution.
CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON "QuestionVote"
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
