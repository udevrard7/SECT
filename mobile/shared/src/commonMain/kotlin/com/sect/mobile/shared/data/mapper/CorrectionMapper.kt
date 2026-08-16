package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.CorrectionEpreuveDto
import com.sect.mobile.shared.data.dto.CorrectionEtudiantDto
import com.sect.mobile.shared.data.dto.CorrectionQuestionDto
import com.sect.mobile.shared.data.dto.CorrectionReponseDto
import com.sect.mobile.shared.data.dto.CorrectionResultatDto
import com.sect.mobile.shared.data.dto.CorrectionSessionDto
import com.sect.mobile.shared.domain.model.CorrectionEpreuve
import com.sect.mobile.shared.domain.model.CorrectionEtudiant
import com.sect.mobile.shared.domain.model.CorrectionQuestion
import com.sect.mobile.shared.domain.model.CorrectionReponse
import com.sect.mobile.shared.domain.model.CorrectionResultat
import com.sect.mobile.shared.domain.model.CorrectionSession

/**
 * Mappers Correction DTO → Domain.
 */
fun CorrectionSessionDto.toDomain(): CorrectionSession = CorrectionSession(
    id = effectiveId,
    etudiantId = etudiantId,
    etudiant = etudiant?.toDomain(),
    etudiantNom = etudiantNom.ifEmpty { etudiant?.name ?: "" },
    etudiantEmail = etudiantEmail.ifEmpty { etudiant?.email ?: "" },
    epreuveId = epreuveId,
    epreuveTitre = epreuveTitre.ifEmpty { epreuve?.titre ?: "" },
    statut = statut,
    dateFin = dateFin,
    score = score,
    reponses = reponses.map { it.toDomain() },
    alertes = alertes,
    needsCorrectionCount = needsCorrectionCount,
    allCorrected = allCorrected,
    autoGradedScore = autoGradedScore,
    autoGradedTotal = autoGradedTotal,
    resultat = resultat?.toDomain(),
    epreuve = epreuve?.toDomain()
)

fun CorrectionEtudiantDto.toDomain(): CorrectionEtudiant = CorrectionEtudiant(
    id = id, name = name, email = email
)

fun CorrectionReponseDto.toDomain(): CorrectionReponse = CorrectionReponse(
    id = id,
    questionId = questionId,
    contenu = contenu,
    score = score,
    commentaire = commentaire,
    noteIA = noteIA,
    justificationIA = justificationIA,
    statusIA = statusIA,
    bareme = bareme,
    ordre = ordre,
    type = type,
    enonce = enonce
)

fun CorrectionResultatDto.toDomain(): CorrectionResultat = CorrectionResultat(
    id = id,
    scoreFinal = scoreFinal,
    totalPossible = totalPossible,
    dateCorrection = dateCorrection
)

fun CorrectionEpreuveDto.toDomain(): CorrectionEpreuve = CorrectionEpreuve(
    id = id,
    titre = titre,
    questions = questions.map { it.toDomain() }
)

fun CorrectionQuestionDto.toDomain(): CorrectionQuestion = CorrectionQuestion(
    id = id,
    questionId = questionId,
    bareme = bareme,
    ordre = ordre,
    type = type,
    enonce = enonce
)
