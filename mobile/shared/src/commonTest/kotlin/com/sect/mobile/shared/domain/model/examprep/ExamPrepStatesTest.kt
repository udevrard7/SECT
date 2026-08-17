package com.sect.mobile.shared.domain.model.examprep

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * Tests unitaires pour les états asynchrones ExamPrep.
 * SECT-EXAMPREP-CONTRACT-1 : Phase F0 — validation des sealed classes.
 */
class ExamPrepStatesTest {

    @Test
    fun practice_generation_idle_is_initial_state() {
        val state: PracticeGenerationState = PracticeGenerationState.Idle
        assertIs<PracticeGenerationState.Idle>(state)
    }

    @Test
    fun practice_generation_generating_represents_202_en_cours() {
        val state: PracticeGenerationState = PracticeGenerationState.Generating
        assertIs<PracticeGenerationState.Generating>(state)
    }

    @Test
    fun practice_generation_ready_carries_questions() {
        val questions = listOf(
            PracticeQuestion(
                id = "q1", documentId = "doc1", auteurId = "u1", type = "QCU",
                enonce = "Question 1", propositions = emptyList(), reponseCorrecte = emptyList(),
                explication = null, difficulte = "FACILE", themes = emptyList(),
                validee = true, netVotes = 0, upvotes = 0, downvotes = 0, userVote = 0
            )
        )
        val state: PracticeGenerationState = PracticeGenerationState.Ready(questions)
        assertIs<PracticeGenerationState.Ready>(state)
        assertEquals(1, state.questions.size)
        assertEquals("q1", state.questions[0].id)
    }

    @Test
    fun practice_generation_failed_carries_message() {
        val state: PracticeGenerationState = PracticeGenerationState.Failed("Erreur IA")
        assertIs<PracticeGenerationState.Failed>(state)
        assertEquals("Erreur IA", state.message)
    }

    @Test
    fun practice_generation_timeout_is_distinct_from_failed() {
        val timeout: PracticeGenerationState = PracticeGenerationState.Timeout
        val failed: PracticeGenerationState = PracticeGenerationState.Failed("timeout")
        assertIs<PracticeGenerationState.Timeout>(timeout)
        assertIs<PracticeGenerationState.Failed>(failed)
    }

    @Test
    fun audio_generation_ready_carries_audio_with_url() {
        val audio = DocumentAudio(
            id = "audio1", documentId = "doc1", userId = "u1",
            script = "Script...", status = "PRET", durationSec = 120,
            audioUrl = "https://presigned.url/audio.mp3",
            createdAt = "2026-08-16", updatedAt = "2026-08-16"
        )
        val state: AudioGenerationState = AudioGenerationState.Ready(audio)
        assertIs<AudioGenerationState.Ready>(state)
        assertEquals("PRET", state.audio.status)
        assertEquals("https://presigned.url/audio.mp3", state.audio.audioUrl)
    }

    @Test
    fun qa_success_carries_response_with_empty_citations_v1() {
        val response = QAResponse(
            response = "La réponse est...",
            model = "gpt-4",
            citations = emptyList(),
            documentId = "doc1"
        )
        val state: QAState = QAState.Success(response)
        assertIs<QAState.Success>(state)
        assertEquals("La réponse est...", state.response.response)
        assertEquals(0, state.response.citations.size)
    }

    @Test
    fun ui_state_success_carries_data() {
        val data = listOf(
            ReviewItem(
                id = "r1", userId = "u1", chapterId = "ch1", questionId = "q1",
                interval = 1, easeFactor = 2.5, nextReviewAt = null,
                lastReviewAt = null, repetitions = 0
            )
        )
        val state: ExamPrepUiState<List<ReviewItem>> = ExamPrepUiState.Success(data)
        assertIs<ExamPrepUiState.Success<List<ReviewItem>>>(state)
        assertEquals(1, state.data.size)
        assertEquals("r1", state.data[0].id)
    }

    @Test
    fun ui_state_error_carries_message() {
        val state: ExamPrepUiState<List<ReviewItem>> = ExamPrepUiState.Error("Network error")
        assertIs<ExamPrepUiState.Error>(state)
        assertEquals("Network error", state.message)
    }
}
