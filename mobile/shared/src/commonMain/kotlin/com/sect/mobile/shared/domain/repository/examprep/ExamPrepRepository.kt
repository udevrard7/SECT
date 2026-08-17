// SECT Mobile — ExamPrep repository interface (domain layer)
// SECT-EXAMPREP-CONTRACT-1 : contrat KMP pour le module ExamPrep
package com.sect.mobile.shared.domain.repository.examprep

import com.sect.mobile.shared.domain.model.examprep.*

interface ExamPrepRepository {
    // ── Dashboard ──
    suspend fun getDashboard(documentId: String? = null): ExamPrepDashboard
    // ── Documents ──
    suspend fun listDocuments(): List<ExamPrepDocument>
    suspend fun readDocument(id: String): ExamPrepReaderDocument
    // ── Review (SRS) ──
    suspend fun listReviewItems(documentId: String? = null, due: Boolean? = null): List<ReviewItem>
    suspend fun markReviewed(reviewItemId: String, quality: Int? = null)
    // ── Planning ──
    suspend fun listStudySessions(): List<StudySession>
    suspend fun createStudySession(documentId: String?, chapitreId: String?, type: String, dateDebut: String, dateFin: String?, notes: String?): StudySession
    suspend fun updateStudySession(id: String, type: String?, dateDebut: String?, dateFin: String?, statut: String?, notes: String?): StudySession
    suspend fun deleteStudySession(id: String)
    // ── Practice ──
    suspend fun listPracticeAttempts(documentId: String? = null): List<PracticeAttempt>
    suspend fun generatePractice(documentId: String, nombreQuestions: Int, difficulte: String, chapterId: String?): PracticeGenerationState
    suspend fun submitPractice(attemptId: String, questionId: String, documentId: String, chapterId: String, score: Double, correct: Boolean, dureeSec: Int): PracticeAttempt
    // ── Q&A ──
    suspend fun askQuestion(documentId: String, question: String): QAResponse
    // ── Flashcards ──
    suspend fun listFlashcards(documentId: String? = null): List<Flashcard>
    suspend fun createFlashcard(documentId: String, selectedText: String, chapterId: String?): Flashcard
    suspend fun deleteFlashcard(id: String)
    // ── Question Bank ──
    suspend fun listQuestionBank(documentId: String? = null, chapterId: String? = null, limit: Int = 50, offset: Int = 0): List<PracticeQuestion>
    suspend fun voteQuestion(questionId: String, value: Int)
    suspend fun removeVote(questionId: String)
    // ── Audio ──
    suspend fun generateAudio(documentId: String): DocumentAudio
    suspend fun listDocumentAudio(documentId: String): List<DocumentAudio>
    suspend fun getAudio(audioId: String): DocumentAudio
    suspend fun deleteAudio(audioId: String)
    // ── Help ──
    suspend fun listHelpThreads(): List<HelpThread>
    suspend fun createHelpThread(documentId: String, sujet: String, messageInitial: String): HelpThread
    suspend fun closeHelpThread(threadId: String)
    suspend fun deleteHelpThread(threadId: String)
    suspend fun listHelpMessages(threadId: String): List<HelpMessage>
    suspend fun createHelpMessage(threadId: String, contenu: String): HelpMessage
}
