// SECT Mobile — ExamPrep DTOs (Savane EdTech)
// SECT-EXAMPREP-CONTRACT-1 : miroir exact du backend Go /api/exam-prep (28 endpoints).
//
// Source : backend/internal/domain/examprep.go + transport/http/examprep_handlers.go
//
// 11 domaines fonctionnels :
// - Dashboard, Documents, Reader, Review (SRS), Planning, Practice,
//   Q&A, Flashcards, QuestionBank, Audio, Help
package com.sect.mobile.shared.data.dto.examprep

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ════════════════════════════════════════════════════════
// A. DASHBOARD
// ════════════════════════════════════════════════════════

@Serializable
data class ExamPrepDashboardDto(
    @SerialName("scoreMoyen") val scoreMoyen: Double = 0.0,
    @SerialName("totalAttempts") val totalAttempts: Int = 0,
    @SerialName("tauxReussite") val tauxReussite: Int = 0,
    @SerialName("tempsRevision") val tempsRevision: Int = 0,
    @SerialName("sessionsAVenir") val sessionsAVenir: Int = 0,
    @SerialName("itemsSrs") val itemsSrs: DashboardSrsStatsDto? = null,
    @SerialName("lacunesParChapitre") val lacunesParChapitre: List<ChapterWeaknessDto> = emptyList()
)

@Serializable
data class DashboardSrsStatsDto(
    @SerialName("total") val total: Int = 0,
    @SerialName("dusAujourdhui") val dusAujourdhui: Int = 0,
    @SerialName("masterises") val masterises: Int = 0,
    @SerialName("avgMastery") val avgMastery: Double = 0.0
)

@Serializable
data class ChapterWeaknessDto(
    @SerialName("chapterId") val chapterId: String = "",
    @SerialName("titre") val titre: String = "",
    @SerialName("avgScore") val avgScore: Double = 0.0,
    @SerialName("attempts") val attempts: Int = 0
)

// ════════════════════════════════════════════════════════
// B. DOCUMENTS
// ════════════════════════════════════════════════════════

@Serializable
data class ExamPrepDocumentDto(
    @SerialName("id") val id: String = "",
    @SerialName("nomFichier") val nomFichier: String = "",
    @SerialName("typeMime") val typeMime: String = "",
    @SerialName("tailleFichier") val tailleFichier: Long = 0,
    @SerialName("statutAnalyse") val statutAnalyse: String = "",
    @SerialName("themesDetectes") val themesDetectes: List<String> = emptyList(),
    @SerialName("resumeAnalyse") val resumeAnalyse: String? = null,
    @SerialName("dateUpload") val dateUpload: String = "",
    @SerialName("uniteEnseignement") val uniteEnseignement: TeachingUnitDto? = null,
    @SerialName("owner") val owner: UserReferenceDto? = null,
    @SerialName("chapters") val chapters: List<ExamPrepChapterDto> = emptyList()
)

@Serializable
data class ExamPrepChapterDto(
    @SerialName("id") val id: String = "",
    @SerialName("titre") val titre: String = "",
    @SerialName("ordre") val ordre: Int = 0,
    @SerialName("sujets") val sujets: List<String> = emptyList()
)

@Serializable
data class TeachingUnitDto(
    @SerialName("id") val id: String = "",
    @SerialName("code") val code: String = "",
    @SerialName("nom") val nom: String = "",
    @SerialName("creditsECTS") val creditsECTS: Int = 0
)

@Serializable
data class UserReferenceDto(
    @SerialName("id") val id: String = "",
    @SerialName("name") val name: String = ""
)

// ════════════════════════════════════════════════════════
// C. READER (contenu texte complet)
// ════════════════════════════════════════════════════════

@Serializable
data class ExamPrepReaderDocumentDto(
    @SerialName("id") val id: String = "",
    @SerialName("nomFichier") val nomFichier: String = "",
    @SerialName("contenuTexte") val contenuTexte: String = "",
    @SerialName("typeMime") val typeMime: String = "",
    @SerialName("themesDetectes") val themesDetectes: List<String> = emptyList(),
    @SerialName("resumeAnalyse") val resumeAnalyse: String? = null,
    @SerialName("dateUpload") val dateUpload: String = "",
    @SerialName("owner") val owner: UserReferenceDto? = null,
    @SerialName("uniteEnseignement") val uniteEnseignement: TeachingUnitDto? = null
)

// ════════════════════════════════════════════════════════
// D. REVIEW (SRS - Spaced Repetition)
// ════════════════════════════════════════════════════════

@Serializable
data class ReviewItemDto(
    @SerialName("id") val id: String = "",
    @SerialName("userId") val userId: String = "",
    @SerialName("chapterId") val chapterId: String = "",
    @SerialName("questionId") val questionId: String = "",
    @SerialName("interval") val interval: Int = 0,
    @SerialName("easeFactor") val easeFactor: Double = 0.0,
    @SerialName("nextReviewAt") val nextReviewAt: String? = null,
    @SerialName("lastReviewAt") val lastReviewAt: String? = null,
    @SerialName("repetitions") val repetitions: Int = 0
)

// Body pour POST /review — SECT-EXAMPREP-CONTRACT-1 : reviewItemId (pas chapterId)
@Serializable
data class MarkReviewedInputDto(
    @SerialName("reviewItemId") val reviewItemId: String,
    @SerialName("quality") val quality: Int? = null
)

// ════════════════════════════════════════════════════════
// E. PLANNING (study sessions)
// ════════════════════════════════════════════════════════

@Serializable
data class StudySessionDto(
    @SerialName("id") val id: String = "",
    @SerialName("userId") val userId: String = "",
    @SerialName("documentId") val documentId: String? = null,
    @SerialName("chapitreId") val chapitreId: String? = null,
    @SerialName("type") val type: String = "",
    @SerialName("dateDebut") val dateDebut: String = "",
    @SerialName("dateFin") val dateFin: String? = null,
    @SerialName("statut") val statut: String = "",
    @SerialName("notes") val notes: String? = null,
    @SerialName("createdAt") val createdAt: String = "",
    @SerialName("updatedAt") val updatedAt: String = ""
)

@Serializable
data class CreateStudySessionInputDto(
    @SerialName("documentId") val documentId: String? = null,
    @SerialName("chapitreId") val chapitreId: String? = null,
    @SerialName("type") val type: String,
    @SerialName("dateDebut") val dateDebut: String,
    @SerialName("dateFin") val dateFin: String? = null,
    @SerialName("notes") val notes: String? = null
)

// SECT-EXAMPREP-CONTRACT-1 : PATCH /planning/{id} — update partiel
@Serializable
data class UpdateStudySessionInputDto(
    @SerialName("type") val type: String? = null,
    @SerialName("dateDebut") val dateDebut: String? = null,
    @SerialName("dateFin") val dateFin: String? = null,
    @SerialName("statut") val statut: String? = null,
    @SerialName("notes") val notes: String? = null
)

// ════════════════════════════════════════════════════════
// F. PRACTICE
// ════════════════════════════════════════════════════════

@Serializable
data class PracticeAttemptDto(
    @SerialName("id") val id: String = "",
    @SerialName("questionId") val questionId: String = "",
    @SerialName("documentId") val documentId: String = "",
    @SerialName("chapterId") val chapterId: String = "",
    @SerialName("score") val score: Double = 0.0,
    @SerialName("correct") val correct: Boolean = false,
    @SerialName("dureeSec") val dureeSec: Int = 0,
    @SerialName("createdAt") val createdAt: String = ""
)

@Serializable
data class PracticeGenerationConfigDto(
    @SerialName("nombreQuestions") val nombreQuestions: Int = 10,
    @SerialName("typesQuestions") val typesQuestions: PracticeTypesDto = PracticeTypesDto(),
    @SerialName("difficulte") val difficulte: String = "MOYEN",
    @SerialName("chapterId") val chapterId: String? = null
)

@Serializable
data class PracticeTypesDto(
    @SerialName("qcu") val qcu: Int = 0,
    @SerialName("qcm") val qcm: Int = 0,
    @SerialName("qrc") val qrc: Int = 0,
    @SerialName("code") val code: Int = 0,
    @SerialName("reflexion") val reflexion: Int = 0
)

// Réponse de POST /practice/generate — 200 PRET ou 202 EN_COURS
@Serializable
data class PracticeGenerationResponseDto(
    @SerialName("status") val status: String, // "PRET" | "EN_COURS"
    @SerialName("documentId") val documentId: String = "",
    @SerialName("message") val message: String? = null,
    @SerialName("questions") val questions: List<PracticeQuestionDto> = emptyList()
)

@Serializable
data class PracticeQuestionDto(
    @SerialName("id") val id: String = "",
    @SerialName("documentId") val documentId: String = "",
    @SerialName("auteurId") val auteurId: String = "",
    @SerialName("type") val type: String = "",
    @SerialName("enonce") val enonce: String = "",
    @SerialName("propositions") val propositions: List<String> = emptyList(),
    @SerialName("reponseCorrecte") val reponseCorrecte: List<String> = emptyList(),
    @SerialName("explication") val explication: String? = null,
    @SerialName("difficulte") val difficulte: String = "",
    @SerialName("themes") val themes: List<String> = emptyList(),
    @SerialName("validee") val validee: Boolean = false,
    @SerialName("netVotes") val netVotes: Int = 0,
    @SerialName("upvotes") val upvotes: Int = 0,
    @SerialName("downvotes") val downvotes: Int = 0,
    @SerialName("userVote") val userVote: Int = 0
)

@Serializable
data class SubmitPracticeInputDto(
    @SerialName("questionId") val questionId: String,
    @SerialName("documentId") val documentId: String,
    @SerialName("chapterId") val chapterId: String,
    @SerialName("score") val score: Double,
    @SerialName("correct") val correct: Boolean,
    @SerialName("dureeSec") val dureeSec: Int
)

// ════════════════════════════════════════════════════════
// G. Q&A IA
// ════════════════════════════════════════════════════════

@Serializable
data class QAInputDto(
    @SerialName("documentId") val documentId: String,
    @SerialName("question") val question: String
)

@Serializable
data class QAResponseDto(
    @SerialName("response") val response: String = "",
    @SerialName("model") val model: String = "",
    @SerialName("citations") val citations: List<String> = emptyList(),
    @SerialName("documentId") val documentId: String = ""
)

// ════════════════════════════════════════════════════════
// H. FLASHCARDS
// ════════════════════════════════════════════════════════

@Serializable
data class FlashcardDto(
    @SerialName("id") val id: String = "",
    @SerialName("chapterId") val chapterId: String = "",
    @SerialName("documentId") val documentId: String = "",
    @SerialName("recto") val recto: String = "",
    @SerialName("verso") val verso: String = "",
    @SerialName("createdAt") val createdAt: String = ""
)

@Serializable
data class CreateFlashcardInputDto(
    @SerialName("documentId") val documentId: String,
    @SerialName("selectedText") val selectedText: String,
    @SerialName("chapterId") val chapterId: String? = null
)

// ════════════════════════════════════════════════════════
// I. AUDIO LEARNING
// ════════════════════════════════════════════════════════

@Serializable
data class DocumentAudioDto(
    @SerialName("id") val id: String = "",
    @SerialName("documentId") val documentId: String = "",
    @SerialName("userId") val userId: String = "",
    @SerialName("script") val script: String = "",
    @SerialName("status") val status: String = "", // EN_COURS | PRET | ERREUR
    @SerialName("durationSec") val durationSec: Int = 0,
    @SerialName("audioUrl") val audioUrl: String? = null, // présignée 15min
    @SerialName("createdAt") val createdAt: String = "",
    @SerialName("updatedAt") val updatedAt: String = ""
)

// ════════════════════════════════════════════════════════
// J. HELP THREADS
// ════════════════════════════════════════════════════════

@Serializable
data class HelpThreadDto(
    @SerialName("id") val id: String = "",
    @SerialName("documentId") val documentId: String = "",
    @SerialName("etudiantId") val etudiantId: String = "",
    @SerialName("sujet") val sujet: String = "",
    @SerialName("statut") val statut: String = "", // OUVERT | CLOS
    @SerialName("createdAt") val createdAt: String = "",
    @SerialName("updatedAt") val updatedAt: String = ""
)

@Serializable
data class CreateHelpThreadInputDto(
    @SerialName("documentId") val documentId: String,
    @SerialName("sujet") val sujet: String,
    @SerialName("messageInitial") val messageInitial: String
)

@Serializable
data class HelpMessageDto(
    @SerialName("id") val id: String = "",
    @SerialName("threadId") val threadId: String = "",
    @SerialName("auteurId") val auteurId: String = "",
    @SerialName("auteurRole") val auteurRole: String = "",
    @SerialName("contenu") val contenu: String = "",
    @SerialName("createdAt") val createdAt: String = ""
)
