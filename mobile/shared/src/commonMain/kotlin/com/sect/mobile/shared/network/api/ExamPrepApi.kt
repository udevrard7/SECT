// SECT Mobile — ExamPrep API (Ktor client)
// SECT-EXAMPREP-CONTRACT-1 : miroir des 28 endpoints backend /api/exam-prep
//
// Source : backend/internal/transport/http/router.go:788 + examprep_handlers.go
//
// Points clés du contrat (audit) :
// - POST /review accepte reviewItemId (pas chapterId) — SECT-EXAMPREP-CONTRACT-1
// - POST /practice/generate : 200 PRET ou 202 EN_COURS (polling question-bank)
// - PATCH /planning/{id} : update partiel (ajouté SECT-EXAMPREP-CONTRACT-1)
// - GET /question-bank?chapterId= : paramètre ignoré en V1 (ne pas présenter comme filtre actif)
// - audioUrl présignée 15min — ne pas stocker durablement
package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.examprep.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*

/**
 * API ExamPrep — 28 endpoints répartis sur 11 domaines.
 */
class ExamPrepApi(private val client: HttpClient) {

    // ════════════════════════════════════════════════════
    // A. DASHBOARD
    // ════════════════════════════════════════════════════

    /** GET /api/exam-prep/dashboard?documentId=X */
    suspend fun getDashboard(documentId: String? = null): ExamPrepDashboardDto {
        return client.get("/api/exam-prep/dashboard") {
            documentId?.let { parameter("documentId", it) }
        }.body()
    }

    // ════════════════════════════════════════════════════
    // B. DOCUMENTS
    // ════════════════════════════════════════════════════

    /** GET /api/exam-prep/documents → { documents: [...] } */
    suspend fun listDocuments(): List<ExamPrepDocumentDto> {
        val response: Map<String, List<ExamPrepDocumentDto>> = client.get("/api/exam-prep/documents").body()
        return response["documents"] ?: emptyList()
    }

    /** GET /api/exam-prep/documents/{id}/read → { document: {...} } */
    suspend fun readDocument(id: String): ExamPrepReaderDocumentDto {
        val response: Map<String, ExamPrepReaderDocumentDto> = client.get("/api/exam-prep/documents/$id/read").body()
        return response["document"] ?: throw Exception("Document non trouvé")
    }

    // ════════════════════════════════════════════════════
    // C. REVIEW (SRS)
    // ════════════════════════════════════════════════════

    /** GET /api/exam-prep/review?documentId=X&due=true → { reviewItems: [...] } */
    suspend fun listReviewItems(documentId: String? = null, due: Boolean? = null): List<ReviewItemDto> {
        val response: Map<String, List<ReviewItemDto>> = client.get("/api/exam-prep/review") {
            documentId?.let { parameter("documentId", it) }
            due?.let { parameter("due", it) }
        }.body()
        return response["reviewItems"] ?: emptyList()
    }

    /**
     * POST /api/exam-prep/review
     * SECT-EXAMPREP-CONTRACT-1 : reviewItemId (pas chapterId).
     * Le backend gère l'algorithme SM-2 — le mobile n'envoie que quality (0-5).
     */
    suspend fun markReviewed(reviewItemId: String, quality: Int? = null) {
        client.post("/api/exam-prep/review") {
            contentType(ContentType.Application.Json)
            setBody(MarkReviewedInputDto(reviewItemId = reviewItemId, quality = quality))
        }
    }

    // ════════════════════════════════════════════════════
    // D. PLANNING
    // ════════════════════════════════════════════════════

    /** GET /api/exam-prep/planning → { sessions: [...] } */
    suspend fun listStudySessions(): List<StudySessionDto> {
        val response: Map<String, List<StudySessionDto>> = client.get("/api/exam-prep/planning").body()
        return response["sessions"] ?: emptyList()
    }

    /** POST /api/exam-prep/planning → { session: {...} } */
    suspend fun createStudySession(input: CreateStudySessionInputDto): StudySessionDto {
        val response: Map<String, StudySessionDto> = client.post("/api/exam-prep/planning") {
            contentType(ContentType.Application.Json)
            setBody(input)
        }.body()
        return response["session"] ?: throw Exception("Erreur création session")
    }

    /** PATCH /api/exam-prep/planning/{id} → { session: {...} } (SECT-EXAMPREP-CONTRACT-1) */
    suspend fun updateStudySession(id: String, input: UpdateStudySessionInputDto): StudySessionDto {
        val response: Map<String, StudySessionDto> = client.patch("/api/exam-prep/planning/$id") {
            contentType(ContentType.Application.Json)
            setBody(input)
        }.body()
        return response["session"] ?: throw Exception("Erreur update session")
    }

    /** DELETE /api/exam-prep/planning/{id} */
    suspend fun deleteStudySession(id: String) {
        client.delete("/api/exam-prep/planning/$id")
    }

    // ════════════════════════════════════════════════════
    // E. PRACTICE
    // ════════════════════════════════════════════════════

    /** GET /api/exam-prep/practice?documentId=X → { attempts: [...] } */
    suspend fun listPracticeAttempts(documentId: String? = null): List<PracticeAttemptDto> {
        val response: Map<String, List<PracticeAttemptDto>> = client.get("/api/exam-prep/practice") {
            documentId?.let { parameter("documentId", it) }
        }.body()
        return response["attempts"] ?: emptyList()
    }

    /**
     * POST /api/exam-prep/practice/generate
     * Retourne soit 200 PRET (questions), soit 202 EN_COURS (polling needed).
     * Le mobile doit inspecter [PracticeGenerationResponseDto.status].
     */
    suspend fun generatePractice(documentId: String, config: PracticeGenerationConfigDto): PracticeGenerationResponseDto {
        // Le backend attend { documentId, config: {...} }
        val body = mapOf(
            "documentId" to documentId,
            "config" to config
        )
        val httpResponse: HttpResponse = client.post("/api/exam-prep/practice/generate") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        // 200 ou 202 — les deux retournent le même DTO
        return httpResponse.body()
    }

    /** POST /api/exam-prep/practice/{id}/submit → { attempt: {...} } */
    suspend fun submitPractice(attemptId: String, input: SubmitPracticeInputDto): PracticeAttemptDto {
        val response: Map<String, PracticeAttemptDto> = client.post("/api/exam-prep/practice/$attemptId/submit") {
            contentType(ContentType.Application.Json)
            setBody(input)
        }.body()
        return response["attempt"] ?: throw Exception("Erreur soumission")
    }

    // ════════════════════════════════════════════════════
    // F. Q&A IA
    // ════════════════════════════════════════════════════

    /** POST /api/exam-prep/qa → { response, model, citations, documentId } */
    suspend fun askQuestion(documentId: String, question: String): QAResponseDto {
        return client.post("/api/exam-prep/qa") {
            contentType(ContentType.Application.Json)
            setBody(QAInputDto(documentId = documentId, question = question))
        }.body()
    }

    // ════════════════════════════════════════════════════
    // G. FLASHCARDS
    // ════════════════════════════════════════════════════

    /** GET /api/exam-prep/flashcards?documentId=X → { flashcards: [...] } */
    suspend fun listFlashcards(documentId: String? = null): List<FlashcardDto> {
        val response: Map<String, List<FlashcardDto>> = client.get("/api/exam-prep/flashcards") {
            documentId?.let { parameter("documentId", it) }
        }.body()
        return response["flashcards"] ?: emptyList()
    }

    /**
     * POST /api/exam-prep/flashcards → { flashcard: {...} }
     * selectedText limité à 4000 caractères.
     * Best-effort : la création du ReviewItem SRS peut échouer sans casser la flashcard.
     */
    suspend fun createFlashcard(input: CreateFlashcardInputDto): FlashcardDto {
        val response: Map<String, FlashcardDto> = client.post("/api/exam-prep/flashcards") {
            contentType(ContentType.Application.Json)
            setBody(input)
        }.body()
        return response["flashcard"] ?: throw Exception("Erreur création flashcard")
    }

    /** DELETE /api/exam-prep/flashcards/{id} */
    suspend fun deleteFlashcard(id: String) {
        client.delete("/api/exam-prep/flashcards/$id")
    }

    // ════════════════════════════════════════════════════
    // H. QUESTION BANK (collaborative)
    // ════════════════════════════════════════════════════

    /**
     * GET /api/exam-prep/question-bank?documentId=X&chapterId=X&limit=50&offset=0
     * NOTE : chapterId est accepté mais ignoré en V1 (audit point #3).
     * → Ne pas présenter comme filtre actif côté mobile.
     */
    suspend fun listQuestionBank(
        documentId: String? = null,
        chapterId: String? = null,
        limit: Int = 50,
        offset: Int = 0
    ): List<PracticeQuestionDto> {
        val response: Map<String, List<PracticeQuestionDto>> = client.get("/api/exam-prep/question-bank") {
            documentId?.let { parameter("documentId", it) }
            chapterId?.let { parameter("chapterId", it) }
            parameter("limit", limit)
            parameter("offset", offset)
        }.body()
        return response["questions"] ?: emptyList()
    }

    /** POST /api/exam-prep/questions/{id}/vote → { vote: {...} } (value = +1 ou -1, upsert) */
    suspend fun voteQuestion(questionId: String, value: Int) {
        client.post("/api/exam-prep/questions/$questionId/vote") {
            contentType(ContentType.Application.Json)
            setBody(mapOf("value" to value))
        }
    }

    /** DELETE /api/exam-prep/questions/{id}/vote (retire le vote) */
    suspend fun removeVote(questionId: String) {
        client.delete("/api/exam-prep/questions/$questionId/vote")
    }

    // ════════════════════════════════════════════════════
    // I. AUDIO LEARNING
    // ════════════════════════════════════════════════════

    /** POST /api/exam-prep/documents/{id}/audio → 202 + { audio: {...}, message } */
    suspend fun generateAudio(documentId: String): DocumentAudioDto {
        val response: Map<String, DocumentAudioDto> = client.post("/api/exam-prep/documents/$documentId/audio").body()
        return response["audio"] ?: throw Exception("Erreur génération audio")
    }

    /** GET /api/exam-prep/documents/{id}/audio → { audios: [...] } */
    suspend fun listDocumentAudio(documentId: String): List<DocumentAudioDto> {
        val response: Map<String, List<DocumentAudioDto>> = client.get("/api/exam-prep/documents/$documentId/audio").body()
        return response["audios"] ?: emptyList()
    }

    /** GET /api/exam-prep/audio/{id} → { audio: {...} } (suivi job : EN_COURS/PRET/ERREUR) */
    suspend fun getAudio(audioId: String): DocumentAudioDto {
        val response: Map<String, DocumentAudioDto> = client.get("/api/exam-prep/audio/$audioId").body()
        return response["audio"] ?: throw Exception("Audio non trouvé")
    }

    /** DELETE /api/exam-prep/audio/{id} (supprime ligne DB + objet R2) */
    suspend fun deleteAudio(audioId: String) {
        client.delete("/api/exam-prep/audio/$audioId")
    }

    // ════════════════════════════════════════════════════
    // J. HELP THREADS
    // ════════════════════════════════════════════════════

    /** GET /api/exam-prep/help → { threads: [...] } */
    suspend fun listHelpThreads(): List<HelpThreadDto> {
        val response: Map<String, List<HelpThreadDto>> = client.get("/api/exam-prep/help").body()
        return response["threads"] ?: emptyList()
    }

    /** POST /api/exam-prep/help → { thread: {...} } */
    suspend fun createHelpThread(input: CreateHelpThreadInputDto): HelpThreadDto {
        val response: Map<String, HelpThreadDto> = client.post("/api/exam-prep/help") {
            contentType(ContentType.Application.Json)
            setBody(input)
        }.body()
        return response["thread"] ?: throw Exception("Erreur création thread")
    }

    /** POST /api/exam-prep/help/{id}/close */
    suspend fun closeHelpThread(threadId: String) {
        client.post("/api/exam-prep/help/$threadId/close")
    }

    /** DELETE /api/exam-prep/help/{id} */
    suspend fun deleteHelpThread(threadId: String) {
        client.delete("/api/exam-prep/help/$threadId")
    }

    /** GET /api/exam-prep/help/{id}/messages → { messages: [...] } */
    suspend fun listHelpMessages(threadId: String): List<HelpMessageDto> {
        val response: Map<String, List<HelpMessageDto>> = client.get("/api/exam-prep/help/$threadId/messages").body()
        return response["messages"] ?: emptyList()
    }

    /** POST /api/exam-prep/help/{id}/messages → { message: {...} } */
    suspend fun createHelpMessage(threadId: String, contenu: String): HelpMessageDto {
        val response: Map<String, HelpMessageDto> = client.post("/api/exam-prep/help/$threadId/messages") {
            contentType(ContentType.Application.Json)
            setBody(mapOf("contenu" to contenu))
        }.body()
        return response["message"] ?: throw Exception("Erreur envoi message")
    }
}
