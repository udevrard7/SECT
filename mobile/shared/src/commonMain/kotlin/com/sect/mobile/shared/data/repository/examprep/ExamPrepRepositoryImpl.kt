// SECT Mobile — ExamPrep repository implementation (data layer)
// SECT-EXAMPREP-CONTRACT-1 : implémente ExamPrepRepository via ExamPrepApi.
//
// Point clé : generatePractice gère le protocole 200 PRET / 202 EN_COURS + polling.
// Le polling interroge listQuestionBank toutes les 2s (max 60s = 30 tentatives),
// comme le frontend web.
package com.sect.mobile.shared.data.repository.examprep

import com.sect.mobile.shared.data.dto.examprep.*
import com.sect.mobile.shared.data.mapper.examprep.*
import com.sect.mobile.shared.domain.model.examprep.*
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.network.api.ExamPrepApi
import kotlinx.coroutines.delay

class ExamPrepRepositoryImpl(
    private val api: ExamPrepApi
) : ExamPrepRepository {

    // ── Dashboard ──
    override suspend fun getDashboard(documentId: String?): ExamPrepDashboard =
        api.getDashboard(documentId).toDomain()

    // ── Documents ──
    override suspend fun listDocuments(): List<ExamPrepDocument> =
        api.listDocuments().map { it.toDomain() }

    override suspend fun readDocument(id: String): ExamPrepReaderDocument =
        api.readDocument(id).toDomain()

    // ── Review ──
    override suspend fun listReviewItems(documentId: String?, due: Boolean?): List<ReviewItem> =
        api.listReviewItems(documentId, due).map { it.toDomain() }

    override suspend fun markReviewed(reviewItemId: String, quality: Int?) {
        api.markReviewed(reviewItemId, quality)
    }

    // ── Planning ──
    override suspend fun listStudySessions(): List<StudySession> =
        api.listStudySessions().map { it.toDomain() }

    override suspend fun createStudySession(
        documentId: String?, chapitreId: String?, type: String,
        dateDebut: String, dateFin: String?, notes: String?
    ): StudySession = api.createStudySession(
        CreateStudySessionInputDto(documentId, chapitreId, type, dateDebut, dateFin, notes)
    ).toDomain()

    override suspend fun updateStudySession(
        id: String, type: String?, dateDebut: String?, dateFin: String?,
        statut: String?, notes: String?
    ): StudySession = api.updateStudySession(
        id, UpdateStudySessionInputDto(type, dateDebut, dateFin, statut, notes)
    ).toDomain()

    override suspend fun deleteStudySession(id: String) {
        api.deleteStudySession(id)
    }

    // ── Practice ──
    override suspend fun listPracticeAttempts(documentId: String?): List<PracticeAttempt> =
        api.listPracticeAttempts(documentId).map { it.toDomain() }

    /**
     * Génération de questions — gère le protocole 200 PRET / 202 EN_COURS.
     *
     * Si 202 EN_COURS : polling question-bank toutes les 2s pendant max 60s.
     * Si des questions apparaissent → Ready. Sinon → Timeout.
     */
    override suspend fun generatePractice(
        documentId: String, nombreQuestions: Int, difficulte: String, chapterId: String?
    ): PracticeGenerationState {
        return try {
            val config = PracticeGenerationConfigDto(
                nombreQuestions = nombreQuestions,
                difficulte = difficulte,
                chapterId = chapterId
            )
            val response = api.generatePractice(documentId, config)

            when (response.status) {
                "PRET" -> {
                    val questions = response.questions.map { it.toDomain() }
                    PracticeGenerationState.Ready(questions)
                }
                "EN_COURS" -> pollForQuestions(documentId)
                else -> PracticeGenerationState.Failed("Statut inconnu: ${response.status}")
            }
        } catch (e: Exception) {
            PracticeGenerationState.Failed(e.message ?: "Erreur génération")
        }
    }

    /**
     * Polling question-bank : interroge toutes les 2s pendant max 60s.
     */
    private suspend fun pollForQuestions(documentId: String): PracticeGenerationState {
        val maxAttempts = 30 // 30 × 2s = 60s
        repeat(maxAttempts) {
            delay(2000)
            try {
                val questions = api.listQuestionBank(documentId = documentId, limit = 50, offset = 0)
                if (questions.isNotEmpty()) {
                    return PracticeGenerationState.Ready(questions.map { it.toDomain() })
                }
            } catch (_: Exception) {
                // Continue polling on transient errors
            }
        }
        return PracticeGenerationState.Timeout
    }

    override suspend fun submitPractice(
        attemptId: String, questionId: String, documentId: String, chapterId: String,
        score: Double, correct: Boolean, dureeSec: Int
    ): PracticeAttempt = api.submitPractice(
        attemptId,
        SubmitPracticeInputDto(questionId, documentId, chapterId, score, correct, dureeSec)
    ).toDomain()

    // ── Q&A ──
    override suspend fun askQuestion(documentId: String, question: String): QAResponse =
        api.askQuestion(documentId, question).toDomain()

    // ── Flashcards ──
    override suspend fun listFlashcards(documentId: String?): List<Flashcard> =
        api.listFlashcards(documentId).map { it.toDomain() }

    override suspend fun createFlashcard(documentId: String, selectedText: String, chapterId: String?): Flashcard =
        api.createFlashcard(CreateFlashcardInputDto(documentId, selectedText, chapterId)).toDomain()

    override suspend fun deleteFlashcard(id: String) {
        api.deleteFlashcard(id)
    }

    // ── Question Bank ──
    override suspend fun listQuestionBank(
        documentId: String?, chapterId: String?, limit: Int, offset: Int
    ): List<PracticeQuestion> =
        api.listQuestionBank(documentId, chapterId, limit, offset).map { it.toDomain() }

    override suspend fun voteQuestion(questionId: String, value: Int) {
        api.voteQuestion(questionId, value)
    }

    override suspend fun removeVote(questionId: String) {
        api.removeVote(questionId)
    }

    // ── Audio ──
    override suspend fun generateAudio(documentId: String): DocumentAudio =
        api.generateAudio(documentId).toDomain()

    override suspend fun listDocumentAudio(documentId: String): List<DocumentAudio> =
        api.listDocumentAudio(documentId).map { it.toDomain() }

    override suspend fun getAudio(audioId: String): DocumentAudio =
        api.getAudio(audioId).toDomain()

    override suspend fun deleteAudio(audioId: String) {
        api.deleteAudio(audioId)
    }

    // ── Help ──
    override suspend fun listHelpThreads(): List<HelpThread> =
        api.listHelpThreads().map { it.toDomain() }

    override suspend fun createHelpThread(documentId: String, sujet: String, messageInitial: String): HelpThread =
        api.createHelpThread(CreateHelpThreadInputDto(documentId, sujet, messageInitial)).toDomain()

    override suspend fun closeHelpThread(threadId: String) {
        api.closeHelpThread(threadId)
    }

    override suspend fun deleteHelpThread(threadId: String) {
        api.deleteHelpThread(threadId)
    }

    override suspend fun listHelpMessages(threadId: String): List<HelpMessage> =
        api.listHelpMessages(threadId).map { it.toDomain() }

    override suspend fun createHelpMessage(threadId: String, contenu: String): HelpMessage =
        api.createHelpMessage(threadId, contenu).toDomain()
}
