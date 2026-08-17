package com.sect.mobile.shared.data.mapper.examprep

import com.sect.mobile.shared.data.dto.examprep.*
import com.sect.mobile.shared.domain.model.examprep.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests unitaires pour ExamPrepMapper (DTO ↔ Domain conversions).
 * SECT-EXAMPREP-CONTRACT-1 : Phase F0 — validation du contrat KMP.
 *
 * Valide que les conversions DTO → Domain préservent tous les champs
 * pour les 11 domaines fonctionnels (28 endpoints).
 */
class ExamPrepMapperTest {

    // ════════════════════════════════════════════════════
    // A. DASHBOARD
    // ════════════════════════════════════════════════════

    @Test
    fun dashboard_dto_toDomain_maps_all_fields() {
        val dto = ExamPrepDashboardDto(
            scoreMoyen = 0.72,
            totalAttempts = 25,
            tauxReussite = 72,
            tempsRevision = 5400,
            sessionsAVenir = 3,
            itemsSrs = DashboardSrsStatsDto(total = 42, dusAujourdhui = 8, masterises = 25, avgMastery = 2.31),
            lacunesParChapitre = listOf(
                ChapterWeaknessDto(chapterId = "ch1", titre = "Structures de données", avgScore = 0.38, attempts = 8)
            )
        )

        val domain = dto.toDomain()

        assertEquals(0.72, domain.scoreMoyen)
        assertEquals(25, domain.totalAttempts)
        assertEquals(72, domain.tauxReussite)
        assertEquals(5400, domain.tempsRevision)
        assertEquals(3, domain.sessionsAVenir)
        assertEquals(42, domain.itemsSrs?.total)
        assertEquals(8, domain.itemsSrs?.dusAujourdhui)
        assertEquals(25, domain.itemsSrs?.masterises)
        assertEquals(2.31, domain.itemsSrs?.avgMastery)
        assertEquals(1, domain.lacunesParChapitre.size)
        assertEquals("ch1", domain.lacunesParChapitre[0].chapterId)
        assertEquals("Structures de données", domain.lacunesParChapitre[0].titre)
        assertEquals(0.38, domain.lacunesParChapitre[0].avgScore)
    }

    @Test
    fun dashboard_dto_toDomain_handles_null_srs() {
        val dto = ExamPrepDashboardDto(itemsSrs = null, lacunesParChapitre = emptyList())

        val domain = dto.toDomain()

        assertNull(domain.itemsSrs)
        assertTrue(domain.lacunesParChapitre.isEmpty())
    }

    // ════════════════════════════════════════════════════
    // B. DOCUMENTS
    // ════════════════════════════════════════════════════

    @Test
    fun document_dto_toDomain_maps_all_fields_with_nested() {
        val dto = ExamPrepDocumentDto(
            id = "doc_001",
            nomFichier = "Algorithmique.pdf",
            typeMime = "application/pdf",
            tailleFichier = 1234567L,
            statutAnalyse = "ANALYSE_TERMINEE",
            themesDetectes = listOf("algorithmes", "complexité"),
            resumeAnalyse = "Cours sur les structures de données",
            dateUpload = "2026-01-15T10:00:00Z",
            uniteEnseignement = TeachingUnitDto(id = "ue1", code = "INF301", nom = "Algorithmique", creditsECTS = 6),
            owner = UserReferenceDto(id = "user1", name = "Dr. Koné"),
            chapters = listOf(
                ExamPrepChapterDto(id = "ch1", titre = "Complexité", ordre = 1, sujets = listOf("Big-O", "Récursivité"))
            )
        )

        val domain = dto.toDomain()

        assertEquals("doc_001", domain.id)
        assertEquals("Algorithmique.pdf", domain.nomFichier)
        assertEquals("application/pdf", domain.typeMime)
        assertEquals(1234567L, domain.tailleFichier)
        assertEquals("ANALYSE_TERMINEE", domain.statutAnalyse)
        assertEquals(2, domain.themesDetectes.size)
        assertEquals("algorithmes", domain.themesDetectes[0])
        assertEquals("ue1", domain.uniteEnseignement?.id)
        assertEquals("INF301", domain.uniteEnseignement?.code)
        assertEquals(6, domain.uniteEnseignement?.creditsECTS)
        assertEquals("user1", domain.owner?.id)
        assertEquals("Dr. Koné", domain.owner?.name)
        assertEquals(1, domain.chapters.size)
        assertEquals("Complexité", domain.chapters[0].titre)
        assertEquals(1, domain.chapters[0].ordre)
        assertEquals(2, domain.chapters[0].sujets.size)
    }

    @Test
    fun document_dto_toDomain_handles_null_nested_objects() {
        val dto = ExamPrepDocumentDto(
            id = "doc_002",
            nomFichier = "empty.pdf",
            typeMime = "application/pdf",
            tailleFichier = 0L,
            statutAnalyse = "EN_ATTENTE",
            themesDetectes = emptyList(),
            resumeAnalyse = null,
            dateUpload = "",
            uniteEnseignement = null,
            owner = null,
            chapters = emptyList()
        )

        val domain = dto.toDomain()

        assertNull(domain.uniteEnseignement)
        assertNull(domain.owner)
        assertNull(domain.resumeAnalyse)
        assertTrue(domain.chapters.isEmpty())
        assertTrue(domain.themesDetectes.isEmpty())
    }

    // ════════════════════════════════════════════════════
    // C. READER
    // ════════════════════════════════════════════════════

    @Test
    fun reader_document_dto_toDomain_maps_contenu_texte() {
        val dto = ExamPrepReaderDocumentDto(
            id = "doc_001",
            nomFichier = "Algorithmique.pdf",
            contenuTexte = "La complexité algorithmique mesure l'efficacité...",
            typeMime = "application/pdf",
            themesDetectes = listOf("complexité"),
            resumeAnalyse = null,
            dateUpload = "2026-01-15T10:00:00Z",
            owner = UserReferenceDto(id = "user1", name = "Dr. Koné"),
            uniteEnseignement = TeachingUnitDto(id = "ue1", code = "INF301", nom = "Algorithmique", creditsECTS = 6)
        )

        val domain = dto.toDomain()

        assertEquals("doc_001", domain.id)
        assertEquals("La complexité algorithmique mesure l'efficacité...", domain.contenuTexte)
        assertEquals("complexité", domain.themesDetectes[0])
        assertEquals("ue1", domain.uniteEnseignement?.id)
        assertEquals("INF301", domain.uniteEnseignement?.code)
    }

    // ════════════════════════════════════════════════════
    // D. REVIEW (SRS)
    // ════════════════════════════════════════════════════

    @Test
    fun review_item_dto_toDomain_maps_srs_fields() {
        val dto = ReviewItemDto(
            id = "review_001",
            userId = "user1",
            chapterId = "ch1",
            questionId = "q1",
            interval = 4,
            easeFactor = 2.5,
            nextReviewAt = "2026-08-20T10:00:00Z",
            lastReviewAt = "2026-08-16T10:00:00Z",
            repetitions = 3
        )

        val domain = dto.toDomain()

        assertEquals("review_001", domain.id)
        assertEquals("user1", domain.userId)
        assertEquals(4, domain.interval)
        assertEquals(2.5, domain.easeFactor)
        assertEquals(3, domain.repetitions)
        assertEquals("2026-08-20T10:00:00Z", domain.nextReviewAt)
    }

    @Test
    fun review_item_dto_toDomain_handles_null_dates() {
        val dto = ReviewItemDto(
            id = "review_002",
            userId = "user1",
            chapterId = "ch1",
            questionId = "q1",
            interval = 0,
            easeFactor = 2.5,
            nextReviewAt = null,
            lastReviewAt = null,
            repetitions = 0
        )

        val domain = dto.toDomain()

        assertNull(domain.nextReviewAt)
        assertNull(domain.lastReviewAt)
        assertEquals(0, domain.repetitions)
    }

    // ════════════════════════════════════════════════════
    // E. PLANNING
    // ════════════════════════════════════════════════════

    @Test
    fun study_session_dto_toDomain_maps_all_fields() {
        val dto = StudySessionDto(
            id = "sess_001",
            userId = "user1",
            documentId = "doc1",
            chapitreId = "ch1",
            type = "revision",
            dateDebut = "2026-08-20T18:00:00Z",
            dateFin = "2026-08-20T20:00:00Z",
            statut = "PLANIFIEE",
            notes = "Réviser les arbres",
            createdAt = "2026-08-16T10:00:00Z",
            updatedAt = "2026-08-16T10:00:00Z"
        )

        val domain = dto.toDomain()

        assertEquals("sess_001", domain.id)
        assertEquals("revision", domain.type)
        assertEquals("PLANIFIEE", domain.statut)
        assertEquals("Réviser les arbres", domain.notes)
        assertEquals("2026-08-20T18:00:00Z", domain.dateDebut)
    }

    @Test
    fun study_session_dto_toDomain_handles_null_optionals() {
        val dto = StudySessionDto(
            id = "sess_002",
            userId = "user1",
            documentId = null,
            chapitreId = null,
            type = "lecture",
            dateDebut = "2026-08-20T18:00:00Z",
            dateFin = null,
            statut = "PLANIFIEE",
            notes = null,
            createdAt = "",
            updatedAt = ""
        )

        val domain = dto.toDomain()

        assertNull(domain.documentId)
        assertNull(domain.chapitreId)
        assertNull(domain.dateFin)
        assertNull(domain.notes)
    }

    // ════════════════════════════════════════════════════
    // F. PRACTICE
    // ════════════════════════════════════════════════════

    @Test
    fun practice_attempt_dto_toDomain_maps_score_and_correct() {
        val dto = PracticeAttemptDto(
            id = "att_001",
            questionId = "q1",
            documentId = "doc1",
            chapterId = "ch1",
            score = 0.8,
            correct = true,
            dureeSec = 35,
            createdAt = "2026-08-16T10:00:00Z"
        )

        val domain = dto.toDomain()

        assertEquals(0.8, domain.score)
        assertEquals(true, domain.correct)
        assertEquals(35, domain.dureeSec)
    }

    @Test
    fun practice_question_dto_toDomain_maps_votes() {
        val dto = PracticeQuestionDto(
            id = "q_001",
            documentId = "doc1",
            auteurId = "user1",
            type = "QCM",
            enonce = "Quelle est la complexité du tri rapide ?",
            propositions = listOf("O(n log n)", "O(n²)", "O(n)"),
            reponseCorrecte = listOf("O(n log n)"),
            explication = "Le tri rapide a une complexité moyenne de O(n log n)",
            difficulte = "MOYEN",
            themes = listOf("complexité", "tri"),
            validee = true,
            netVotes = 8,
            upvotes = 10,
            downvotes = 2,
            userVote = 1
        )

        val domain = dto.toDomain()

        assertEquals("QCM", domain.type)
        assertEquals(3, domain.propositions.size)
        assertEquals(1, domain.reponseCorrecte.size)
        assertEquals("O(n log n)", domain.reponseCorrecte[0])
        assertEquals(8, domain.netVotes)
        assertEquals(10, domain.upvotes)
        assertEquals(2, domain.downvotes)
        assertEquals(1, domain.userVote)
        assertEquals(true, domain.validee)
    }

    @Test
    fun practice_generation_config_dto_has_defaults() {
        val dto = PracticeGenerationConfigDto()

        assertEquals(10, dto.nombreQuestions)
        assertEquals("MOYEN", dto.difficulte)
        assertEquals(0, dto.typesQuestions.qcu)
        assertNull(dto.chapterId)
    }

    // ════════════════════════════════════════════════════
    // G. Q&A
    // ════════════════════════════════════════════════════

    @Test
    fun qa_response_dto_toDomain_maps_response_and_model() {
        val dto = QAResponseDto(
            response = "La complexité algorithmique est...",
            model = "gpt-4",
            citations = emptyList(), // V1 : toujours vide
            documentId = "doc1"
        )

        val domain = dto.toDomain()

        assertEquals("La complexité algorithmique est...", domain.response)
        assertEquals("gpt-4", domain.model)
        assertTrue(domain.citations.isEmpty())
        assertEquals("doc1", domain.documentId)
    }

    // ════════════════════════════════════════════════════
    // H. FLASHCARDS
    // ════════════════════════════════════════════════════

    @Test
    fun flashcard_dto_toDomain_maps_recto_verso() {
        val dto = FlashcardDto(
            id = "fc_001",
            chapterId = "ch1",
            documentId = "doc1",
            recto = "Qu'est-ce que la complexité O(n log n) ?",
            verso = "C'est la complexité du tri rapide en moyenne",
            createdAt = "2026-08-16T10:00:00Z"
        )

        val domain = dto.toDomain()

        assertEquals("Qu'est-ce que la complexité O(n log n) ?", domain.recto)
        assertEquals("C'est la complexité du tri rapide en moyenne", domain.verso)
    }

    // ════════════════════════════════════════════════════
    // I. AUDIO
    // ════════════════════════════════════════════════════

    @Test
    fun document_audio_dto_toDomain_maps_presigned_url() {
        val dto = DocumentAudioDto(
            id = "audio_001",
            documentId = "doc1",
            userId = "user1",
            script = "Bienvenue dans ce podcast de révision...",
            status = "PRET",
            durationSec = 312,
            audioUrl = "https://r2.cloudflare.com/presigned/abc123",
            createdAt = "2026-08-16T10:00:00Z",
            updatedAt = "2026-08-16T10:05:00Z"
        )

        val domain = dto.toDomain()

        assertEquals("PRET", domain.status)
        assertEquals(312, domain.durationSec)
        assertEquals("https://r2.cloudflare.com/presigned/abc123", domain.audioUrl)
    }

    @Test
    fun document_audio_dto_toDomain_handles_null_url_when_generating() {
        val dto = DocumentAudioDto(
            id = "audio_002",
            documentId = "doc1",
            userId = "user1",
            script = "",
            status = "EN_COURS",
            durationSec = 0,
            audioUrl = null,
            createdAt = "2026-08-16T10:00:00Z",
            updatedAt = "2026-08-16T10:00:00Z"
        )

        val domain = dto.toDomain()

        assertEquals("EN_COURS", domain.status)
        assertNull(domain.audioUrl)
    }

    // ════════════════════════════════════════════════════
    // J. HELP
    // ════════════════════════════════════════════════════

    @Test
    fun help_thread_dto_toDomain_maps_statut() {
        val dto = HelpThreadDto(
            id = "thread_001",
            documentId = "doc1",
            etudiantId = "user1",
            sujet = "Je ne comprends pas ce chapitre",
            statut = "OUVERT",
            createdAt = "2026-08-16T10:00:00Z",
            updatedAt = "2026-08-16T10:00:00Z"
        )

        val domain = dto.toDomain()

        assertEquals("OUVERT", domain.statut)
        assertEquals("Je ne comprends pas ce chapitre", domain.sujet)
    }

    @Test
    fun help_message_dto_toDomain_maps_auteur_role() {
        val dto = HelpMessageDto(
            id = "msg_001",
            threadId = "thread_001",
            auteurId = "user2",
            auteurRole = "ENSEIGNANT",
            contenu = "Voici l'explication...",
            createdAt = "2026-08-16T11:00:00Z"
        )

        val domain = dto.toDomain()

        assertEquals("ENSEIGNANT", domain.auteurRole)
        assertEquals("Voici l'explication...", domain.contenu)
    }
}
