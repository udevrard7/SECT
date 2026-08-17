package com.sect.mobile.shared.data.repository.examprep

import com.sect.mobile.shared.data.dto.examprep.*
import com.sect.mobile.shared.domain.model.examprep.PracticeGenerationState
import com.sect.mobile.shared.network.api.ExamPrepApi
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Tests unitaires pour ExamPrepRepositoryImpl — logique de polling generatePractice.
 * SECT-EXAMPREP-CONTRACT-1 : Phase F0 — validation du protocole 200 PRET / 202 EN_COURS.
 *
 * Valide que :
 * - 200 PRET → Ready immédiat (pas de polling)
 * - 202 EN_COURS + questions disponibles → Ready après polling
 * - Statut inconnu → Failed
 */
class ExamPrepRepositoryPracticeTest {

    private class FakeExamPrepApi(
        val generateResponse: PracticeGenerationResponseDto,
        val questionBankResponse: List<PracticeQuestionDto> = emptyList()
    ) : ExamPrepApi {
        override suspend fun generatePractice(
            documentId: String,
            config: PracticeGenerationConfigDto
        ): PracticeGenerationResponseDto = generateResponse

        override suspend fun listQuestionBank(
            documentId: String?,
            chapterId: String?,
            limit: Int,
            offset: Int
        ): List<PracticeQuestionDto> = questionBankResponse

        // Stubs pour les autres méthodes
        override suspend fun getDashboard(documentId: String?) = throw NotImplementedError()
        override suspend fun listDocuments() = throw NotImplementedError()
        override suspend fun readDocument(id: String) = throw NotImplementedError()
        override suspend fun listReviewItems(documentId: String?, due: Boolean?) = throw NotImplementedError()
        override suspend fun markReviewed(reviewItemId: String, quality: Int?) {}
        override suspend fun listStudySessions() = throw NotImplementedError()
        override suspend fun createStudySession(input: CreateStudySessionInputDto) = throw NotImplementedError()
        override suspend fun updateStudySession(id: String, input: UpdateStudySessionInputDto) = throw NotImplementedError()
        override suspend fun deleteStudySession(id: String) {}
        override suspend fun listPracticeAttempts(documentId: String?) = throw NotImplementedError()
        override suspend fun submitPractice(attemptId: String, input: SubmitPracticeInputDto) = throw NotImplementedError()
        override suspend fun askQuestion(documentId: String, question: String) = throw NotImplementedError()
        override suspend fun listFlashcards(documentId: String?) = throw NotImplementedError()
        override suspend fun createFlashcard(input: CreateFlashcardInputDto) = throw NotImplementedError()
        override suspend fun deleteFlashcard(id: String) {}
        override suspend fun voteQuestion(questionId: String, value: Int) {}
        override suspend fun removeVote(questionId: String) {}
        override suspend fun generateAudio(documentId: String) = throw NotImplementedError()
        override suspend fun listDocumentAudio(documentId: String) = throw NotImplementedError()
        override suspend fun getAudio(audioId: String) = throw NotImplementedError()
        override suspend fun deleteAudio(audioId: String) {}
        override suspend fun listHelpThreads() = throw NotImplementedError()
        override suspend fun createHelpThread(input: CreateHelpThreadInputDto) = throw NotImplementedError()
        override suspend fun closeHelpThread(threadId: String) {}
        override suspend fun deleteHelpThread(threadId: String) {}
        override suspend fun listHelpMessages(threadId: String) = throw NotImplementedError()
        override suspend fun createHelpMessage(threadId: String, contenu: String) = throw NotImplementedError()
    }

    private fun sampleQuestion(id: String = "q1") = PracticeQuestionDto(
        id = id, documentId = "doc1", auteurId = "u1", type = "QCU",
        enonce = "Question", propositions = emptyList(), reponseCorrecte = emptyList(),
        explication = null, difficulte = "FACILE", themes = emptyList(),
        validee = true, netVotes = 0, upvotes = 0, downvotes = 0, userVote = 0
    )

    @Test
    fun generatePractice_200_PRET_returns_ready_immediately() = runBlocking {
        val api = FakeExamPrepApi(
            generateResponse = PracticeGenerationResponseDto(
                status = "PRET",
                documentId = "doc1",
                questions = listOf(sampleQuestion("q1"), sampleQuestion("q2"))
            ),
            questionBankResponse = emptyList()
        )
        val repo = ExamPrepRepositoryImpl(api)

        val state = repo.generatePractice("doc1", 10, "MOYEN", null)

        assertIs<PracticeGenerationState.Ready>(state)
        assertEquals(2, state.questions.size)
        assertEquals("q1", state.questions[0].id)
    }

    @Test
    fun generatePractice_202_EN_COURS_then_questions_appear_returns_ready() = runBlocking {
        val api = FakeExamPrepApi(
            generateResponse = PracticeGenerationResponseDto(
                status = "EN_COURS",
                documentId = "doc1",
                message = "Génération en cours"
            ),
            questionBankResponse = listOf(sampleQuestion("q_gen1"), sampleQuestion("q_gen2"))
        )
        val repo = ExamPrepRepositoryImpl(api)

        val state = repo.generatePractice("doc1", 10, "MOYEN", null)

        assertIs<PracticeGenerationState.Ready>(state)
        assertEquals(2, state.questions.size)
    }

    @Test
    fun generatePractice_unknown_status_returns_failed() = runBlocking {
        val api = FakeExamPrepApi(
            generateResponse = PracticeGenerationResponseDto(
                status = "UNKNOWN",
                documentId = "doc1"
            )
        )
        val repo = ExamPrepRepositoryImpl(api)

        val state = repo.generatePractice("doc1", 10, "MOYEN", null)

        assertIs<PracticeGenerationState.Failed>(state)
        assertTrue(state.message.contains("UNKNOWN"))
    }
}
