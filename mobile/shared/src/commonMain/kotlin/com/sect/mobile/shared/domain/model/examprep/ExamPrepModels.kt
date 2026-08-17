// SECT Mobile — ExamPrep domain models (pure Kotlin, no serialization coupling)
// SECT-EXAMPREP-CONTRACT-1 : miroir des DTOs en domain models purs.
package com.sect.mobile.shared.domain.model.examprep

// ════════════════════════════════════════════════════════
// A. DASHBOARD
// ════════════════════════════════════════════════════════

data class ExamPrepDashboard(
    val scoreMoyen: Double,
    val totalAttempts: Int,
    val tauxReussite: Int,
    val tempsRevision: Int,
    val sessionsAVenir: Int,
    val itemsSrs: DashboardSrsStats?,
    val lacunesParChapitre: List<ChapterWeakness>
)

data class DashboardSrsStats(
    val total: Int,
    val dusAujourdhui: Int,
    val masterises: Int,
    val avgMastery: Double
)

data class ChapterWeakness(
    val chapterId: String,
    val titre: String,
    val avgScore: Double,
    val attempts: Int
)

// ════════════════════════════════════════════════════════
// B. DOCUMENTS
// ════════════════════════════════════════════════════════

data class ExamPrepDocument(
    val id: String,
    val nomFichier: String,
    val typeMime: String,
    val tailleFichier: Long,
    val statutAnalyse: String,
    val themesDetectes: List<String>,
    val resumeAnalyse: String?,
    val dateUpload: String,
    val uniteEnseignement: TeachingUnit?,
    val owner: UserReference?,
    val chapters: List<ExamPrepChapter>
)

data class ExamPrepChapter(
    val id: String,
    val titre: String,
    val ordre: Int,
    val sujets: List<String>
)

data class TeachingUnit(
    val id: String,
    val code: String,
    val nom: String,
    val creditsECTS: Int
)

data class UserReference(
    val id: String,
    val name: String
)

// ════════════════════════════════════════════════════════
// C. READER
// ════════════════════════════════════════════════════════

data class ExamPrepReaderDocument(
    val id: String,
    val nomFichier: String,
    val contenuTexte: String,
    val typeMime: String,
    val themesDetectes: List<String>,
    val resumeAnalyse: String?,
    val dateUpload: String,
    val owner: UserReference?,
    val uniteEnseignement: TeachingUnit?
)

// ════════════════════════════════════════════════════════
// D. REVIEW (SRS)
// ════════════════════════════════════════════════════════

data class ReviewItem(
    val id: String,
    val userId: String,
    val chapterId: String,
    val questionId: String,
    val interval: Int,
    val easeFactor: Double,
    val nextReviewAt: String?,
    val lastReviewAt: String?,
    val repetitions: Int
)

// ════════════════════════════════════════════════════════
// E. PLANNING
// ════════════════════════════════════════════════════════

data class StudySession(
    val id: String,
    val userId: String,
    val documentId: String?,
    val chapitreId: String?,
    val type: String,
    val dateDebut: String,
    val dateFin: String?,
    val statut: String,
    val notes: String?,
    val createdAt: String,
    val updatedAt: String
)

// ════════════════════════════════════════════════════════
// F. PRACTICE
// ════════════════════════════════════════════════════════

data class PracticeAttempt(
    val id: String,
    val questionId: String,
    val documentId: String,
    val chapterId: String,
    val score: Double,
    val correct: Boolean,
    val dureeSec: Int,
    val createdAt: String
)

data class PracticeQuestion(
    val id: String,
    val documentId: String,
    val auteurId: String,
    val type: String,
    val enonce: String,
    val propositions: List<String>,
    val reponseCorrecte: List<String>,
    val explication: String?,
    val difficulte: String,
    val themes: List<String>,
    val validee: Boolean,
    val netVotes: Int,
    val upvotes: Int,
    val downvotes: Int,
    val userVote: Int
)

// ════════════════════════════════════════════════════════
// G. Q&A
// ════════════════════════════════════════════════════════

data class QAResponse(
    val response: String,
    val model: String,
    val citations: List<String>,
    val documentId: String
)

// ════════════════════════════════════════════════════════
// H. FLASHCARDS
// ════════════════════════════════════════════════════════

data class Flashcard(
    val id: String,
    val chapterId: String,
    val documentId: String,
    val recto: String,
    val verso: String,
    val createdAt: String
)

// ════════════════════════════════════════════════════════
// I. AUDIO
// ════════════════════════════════════════════════════════

data class DocumentAudio(
    val id: String,
    val documentId: String,
    val userId: String,
    val script: String,
    val status: String, // EN_COURS | PRET | ERREUR
    val durationSec: Int,
    val audioUrl: String?, // présignée 15min — ne pas stocker durablement
    val createdAt: String,
    val updatedAt: String
)

// ════════════════════════════════════════════════════════
// J. HELP
// ════════════════════════════════════════════════════════

data class HelpThread(
    val id: String,
    val documentId: String,
    val etudiantId: String,
    val sujet: String,
    val statut: String, // OUVERT | CLOS
    val createdAt: String,
    val updatedAt: String
)

data class HelpMessage(
    val id: String,
    val threadId: String,
    val auteurId: String,
    val auteurRole: String,
    val contenu: String,
    val createdAt: String
)
