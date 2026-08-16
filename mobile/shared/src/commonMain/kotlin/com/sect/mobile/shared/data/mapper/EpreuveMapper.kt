// SECT Mobile — Epreuve DTO ↔ Domain mappers
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.EpreuveDto
import com.sect.mobile.shared.data.dto.PropositionDto
import com.sect.mobile.shared.data.dto.QuestionDto
import com.sect.mobile.shared.domain.enum.Difficulte
import com.sect.mobile.shared.domain.enum.ModeGeneration
import com.sect.mobile.shared.domain.enum.SessionExamen
import com.sect.mobile.shared.domain.enum.StatutEpreuve
import com.sect.mobile.shared.domain.enum.TypeQuestion
import com.sect.mobile.shared.domain.model.Epreuve
import com.sect.mobile.shared.domain.model.Proposition
import com.sect.mobile.shared.domain.model.Question

// ── DTO → Domain ──

fun EpreuveDto.toDomain() = Epreuve(
    id = id,
    enseignantId = enseignantId,
    titre = titre,
    description = description,
    duree = duree,
    dateDebut = dateDebut,
    dateFin = dateFin,
    melangeQuestions = melangeQuestions,
    melangePropositions = melangePropositions,
    blocageRetour = blocageRetour,
    statut = StatutEpreuve.valueOf(statut),
    filiereId = filiereId,
    uniteEnseignementId = uniteEnseignementId,
    niveau = niveau,
    sessionExamen = SessionExamen.valueOf(sessionExamen),
    anneeAcademiqueId = anneeAcademiqueId,
    createdAt = createdAt,
    updatedAt = updatedAt,
    deletedAt = deletedAt,
    proctoringActif = proctoringActif,
    verificationIdentite = verificationIdentite,
    generationMode = ModeGeneration.valueOf(generationMode),
    isTemplate = isTemplate,
    noteTotal = noteTotal,
    clotureeAt = clotureeAt,
    clotureeAutomatiquement = clotureeAutomatiquement,
    raisonCloture = raisonCloture,
    delaiGrace = delaiGrace,
    epreuveOrigineId = epreuveOrigineId,
    questionCount = questionCount,
    totalPoints = totalPoints,
    enseignant = enseignant?.toDomain(),
    filiere = filiere?.toDomain(),
    questions = questions?.map { it.toDomain() }
)

fun QuestionDto.toDomain() = Question(
    id = id,
    epreuveId = epreuveId,
    type = TypeQuestion.valueOf(type),
    enonce = enonce,
    difficulte = difficulte?.let { Difficulte.valueOf(it) },
    bareme = bareme,
    ordre = ordre,
    propositions = propositions?.map { it.toDomain() },
    theme = theme,
    codeLangage = codeLangage,
    codeStarter = codeStarter
)

fun PropositionDto.toDomain() = Proposition(
    id = id,
    questionId = questionId,
    texte = texte,
    estCorrecte = estCorrecte,
    ordre = ordre
)

// ── Domain → DTO ──

fun Epreuve.toDto() = EpreuveDto(
    id = id,
    enseignantId = enseignantId,
    titre = titre,
    description = description,
    duree = duree,
    dateDebut = dateDebut,
    dateFin = dateFin,
    melangeQuestions = melangeQuestions,
    melangePropositions = melangePropositions,
    blocageRetour = blocageRetour,
    statut = statut.name,
    filiereId = filiereId,
    uniteEnseignementId = uniteEnseignementId,
    niveau = niveau,
    sessionExamen = sessionExamen.name,
    anneeAcademiqueId = anneeAcademiqueId,
    createdAt = createdAt,
    updatedAt = updatedAt,
    deletedAt = deletedAt,
    proctoringActif = proctoringActif,
    verificationIdentite = verificationIdentite,
    generationMode = generationMode.name,
    isTemplate = isTemplate,
    noteTotal = noteTotal,
    clotureeAt = clotureeAt,
    clotureeAutomatiquement = clotureeAutomatiquement,
    raisonCloture = raisonCloture,
    delaiGrace = delaiGrace,
    epreuveOrigineId = epreuveOrigineId,
    questionCount = questionCount,
    totalPoints = totalPoints,
    enseignant = enseignant?.toDto(),
    filiere = filiere?.toDto(),
    questions = questions?.map { it.toDto() }
)

fun Question.toDto() = QuestionDto(
    id = id,
    epreuveId = epreuveId,
    type = type.name,
    enonce = enonce,
    difficulte = difficulte?.name,
    bareme = bareme,
    ordre = ordre,
    propositions = propositions?.map { it.toDto() },
    theme = theme,
    codeLangage = codeLangage,
    codeStarter = codeStarter
)

fun Proposition.toDto() = PropositionDto(
    id = id,
    questionId = questionId,
    texte = texte,
    estCorrecte = estCorrecte,
    ordre = ordre
)
