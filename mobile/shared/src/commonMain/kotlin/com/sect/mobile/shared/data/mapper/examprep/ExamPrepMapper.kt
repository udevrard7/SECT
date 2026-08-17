// SECT Mobile — ExamPrep mappers (DTO → Domain)
// SECT-EXAMPREP-CONTRACT-1
package com.sect.mobile.shared.data.mapper.examprep

import com.sect.mobile.shared.data.dto.examprep.*
import com.sect.mobile.shared.domain.model.examprep.*

// ── Dashboard ──

fun ExamPrepDashboardDto.toDomain(): ExamPrepDashboard = ExamPrepDashboard(
    scoreMoyen = scoreMoyen,
    totalAttempts = totalAttempts,
    tauxReussite = tauxReussite,
    tempsRevision = tempsRevision,
    sessionsAVenir = sessionsAVenir,
    itemsSrs = itemsSrs?.toDomain(),
    lacunesParChapitre = lacunesParChapitre.map { it.toDomain() }
)

fun DashboardSrsStatsDto.toDomain(): DashboardSrsStats = DashboardSrsStats(
    total = total,
    dusAujourdhui = dusAujourdhui,
    masterises = masterises,
    avgMastery = avgMastery
)

fun ChapterWeaknessDto.toDomain(): ChapterWeakness = ChapterWeakness(
    chapterId = chapterId,
    titre = titre,
    avgScore = avgScore,
    attempts = attempts
)

// ── Documents ──

fun ExamPrepDocumentDto.toDomain(): ExamPrepDocument = ExamPrepDocument(
    id = id,
    nomFichier = nomFichier,
    typeMime = typeMime,
    tailleFichier = tailleFichier,
    statutAnalyse = statutAnalyse,
    themesDetectes = themesDetectes,
    resumeAnalyse = resumeAnalyse,
    dateUpload = dateUpload,
    uniteEnseignement = uniteEnseignement?.toDomain(),
    owner = owner?.toDomain(),
    chapters = chapters.map { it.toDomain() }
)

fun ExamPrepChapterDto.toDomain(): ExamPrepChapter = ExamPrepChapter(
    id = id, titre = titre, ordre = ordre, sujets = sujets
)

fun TeachingUnitDto.toDomain(): TeachingUnit = TeachingUnit(
    id = id, code = code, nom = nom, creditsECTS = creditsECTS
)

fun UserReferenceDto.toDomain(): UserReference = UserReference(id = id, name = name)

// ── Reader ──

fun ExamPrepReaderDocumentDto.toDomain(): ExamPrepReaderDocument = ExamPrepReaderDocument(
    id = id,
    nomFichier = nomFichier,
    contenuTexte = contenuTexte,
    typeMime = typeMime,
    themesDetectes = themesDetectes,
    resumeAnalyse = resumeAnalyse,
    dateUpload = dateUpload,
    owner = owner?.toDomain(),
    uniteEnseignement = uniteEnseignement?.toDomain()
)

// ── Review ──

fun ReviewItemDto.toDomain(): ReviewItem = ReviewItem(
    id = id,
    userId = userId,
    chapterId = chapterId,
    questionId = questionId,
    interval = interval,
    easeFactor = easeFactor,
    nextReviewAt = nextReviewAt,
    lastReviewAt = lastReviewAt,
    repetitions = repetitions
)

// ── Planning ──

fun StudySessionDto.toDomain(): StudySession = StudySession(
    id = id,
    userId = userId,
    documentId = documentId,
    chapitreId = chapitreId,
    type = type,
    dateDebut = dateDebut,
    dateFin = dateFin,
    statut = statut,
    notes = notes,
    createdAt = createdAt,
    updatedAt = updatedAt
)

// ── Practice ──

fun PracticeAttemptDto.toDomain(): PracticeAttempt = PracticeAttempt(
    id = id,
    questionId = questionId,
    documentId = documentId,
    chapterId = chapterId,
    score = score,
    correct = correct,
    dureeSec = dureeSec,
    createdAt = createdAt
)

fun PracticeQuestionDto.toDomain(): PracticeQuestion = PracticeQuestion(
    id = id,
    documentId = documentId,
    auteurId = auteurId,
    type = type,
    enonce = enonce,
    propositions = propositions,
    reponseCorrecte = reponseCorrecte,
    explication = explication,
    difficulte = difficulte,
    themes = themes,
    validee = validee,
    netVotes = netVotes,
    upvotes = upvotes,
    downvotes = downvotes,
    userVote = userVote
)

// ── Q&A ──

fun QAResponseDto.toDomain(): QAResponse = QAResponse(
    response = response,
    model = model,
    citations = citations,
    documentId = documentId
)

// ── Flashcards ──

fun FlashcardDto.toDomain(): Flashcard = Flashcard(
    id = id,
    chapterId = chapterId,
    documentId = documentId,
    recto = recto,
    verso = verso,
    createdAt = createdAt
)

// ── Audio ──

fun DocumentAudioDto.toDomain(): DocumentAudio = DocumentAudio(
    id = id,
    documentId = documentId,
    userId = userId,
    script = script,
    status = status,
    durationSec = durationSec,
    audioUrl = audioUrl,
    createdAt = createdAt,
    updatedAt = updatedAt
)

// ── Help ──

fun HelpThreadDto.toDomain(): HelpThread = HelpThread(
    id = id,
    documentId = documentId,
    etudiantId = etudiantId,
    sujet = sujet,
    statut = statut,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun HelpMessageDto.toDomain(): HelpMessage = HelpMessage(
    id = id,
    threadId = threadId,
    auteurId = auteurId,
    auteurRole = auteurRole,
    contenu = contenu,
    createdAt = createdAt
)
