// SECT Mobile — Stats Mapper (DTO → Domain)
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.EnseignantStatsDto
import com.sect.mobile.shared.data.dto.EtudiantStatsDto
import com.sect.mobile.shared.data.dto.PendingCorrectionDto
import com.sect.mobile.shared.data.dto.RecentEpreuveDto
import com.sect.mobile.shared.data.dto.PerformanceDataDto
import com.sect.mobile.shared.data.dto.EvolutionMoyenneDto
import com.sect.mobile.shared.data.dto.EpreuveAVenirDto
import com.sect.mobile.shared.data.dto.EpreuveAVenirEtudiantDto
import com.sect.mobile.shared.data.dto.ResultatRecentDto
import com.sect.mobile.shared.data.dto.EvolutionScoreDto
import com.sect.mobile.shared.data.dto.PerformanceTypeDto
import com.sect.mobile.shared.data.dto.SessionEnCoursDto
import com.sect.mobile.shared.data.dto.ResultatDetailDto
import com.sect.mobile.shared.domain.model.*

/**
 * Mapper pour les statistiques Enseignant
 */
fun EnseignantStatsDto.toDomain(): EnseignantStats {
    return EnseignantStats(
        nbDocuments = this.nbDocuments,
        nbQuestionsTotal = this.nbQuestionsTotal,
        nbEpreuves = this.nbEpreuves,
        nbEpreuvesActives = this.nbEpreuvesActives,
        nbCorrectionsEnAttente = this.nbCorrectionsEnAttente,
        pendingCorrections = this.pendingCorrections.map { it.toDomain() },
        recentEpreuves = this.recentEpreuves.map { it.toDomain() },
        performanceParEpreuve = this.performanceParEpreuve.map { it.toDomain() },
        evolutionMoyennes = this.evolutionMoyennes.map { it.toDomain() },
        epreuvesAVenir = this.epreuvesAVenir.map { it.toDomain() }
    )
}

fun PendingCorrectionDto.toDomain(): PendingCorrection {
    return PendingCorrection(
        sessionId = this.sessionId,
        etudiantNom = this.etudiantNom,
        etudiantEmail = this.etudiantEmail,
        epreuveTitre = this.epreuveTitre,
        questionType = this.questionType,
        questionPreview = this.questionPreview,
        submittedAt = this.submittedAt
    )
}

fun RecentEpreuveDto.toDomain(): RecentEpreuve {
    return RecentEpreuve(
        id = this.id,
        titre = this.titre,
        statut = this.statut,
        nbParticipants = this.nbParticipants,
        moyenne = this.moyenne,
        date = this.date
    )
}

fun PerformanceDataDto.toDomain(): PerformanceData {
    return PerformanceData(
        titre = this.titre,
        moyenne = this.moyenne,
        tauxReussite = this.tauxReussite
    )
}

fun EvolutionMoyenneDto.toDomain(): EvolutionMoyenne {
    return EvolutionMoyenne(
        mois = this.mois,
        moyenne = this.moyenne,
        nbEvaluations = this.nbEvaluations
    )
}

fun EpreuveAVenirDto.toDomain(): EpreuveAVenir {
    return EpreuveAVenir(
        id = this.id,
        titre = this.titre,
        date = this.date,
        dateFin = this.dateFin,
        duree = this.duree,
        statut = this.statut,
        nbParticipants = this.nbParticipants
    )
}

/**
 * Mapper pour les statistiques Étudiant
 */
fun EtudiantStatsDto.toDomain(): EtudiantStats {
    return EtudiantStats(
        nbEpreuvesAVenir = this.nbEpreuvesAVenir,
        nbEpreuvesTerminees = this.nbEpreuvesTerminees,
        moyenne = this.moyenne,
        meilleureNote = this.meilleureNote,
        epreuvesAVenir = this.epreuvesAVenir.map { it.toDomain() },
        resultatsRecents = this.resultatsRecents.map { it.toDomain() },
        evolutionScores = this.evolutionScores.map { it.toDomain() },
        performanceParType = this.performanceParType.map { it.toDomain() },
        sessionEnCours = this.sessionEnCours?.toDomain()
    )
}

fun EpreuveAVenirEtudiantDto.toDomain(): EpreuveAVenirEtudiant {
    return EpreuveAVenirEtudiant(
        id = this.id,
        titre = this.titre,
        date = this.date,
        dateFin = this.dateFin,
        duree = this.duree,
        enseignant = this.enseignant,
        nbQuestions = this.nbQuestions,
        totalPoints = this.totalPoints
    )
}

fun ResultatRecentDto.toDomain(): ResultatRecent {
    return ResultatRecent(
        id = this.id,
        epreuveId = this.epreuveId,
        titre = this.titre,
        enseignant = this.enseignant,
        date = this.date,
        score = this.score,
        statut = this.statut,
        resultat = this.resultat?.toDomain()
    )
}

fun ResultatDetailDto.toDomain(): ResultatDetail {
    return ResultatDetail(
        scoreFinal = this.scoreFinal,
        totalPossible = this.totalPossible,
        id = this.id,
        sessionId = this.sessionId,
        dateCorrection = this.dateCorrection,
        dateRetour = this.dateRetour,
        commentaires = this.commentaires
    )
}

fun EvolutionScoreDto.toDomain(): EvolutionScore {
    return EvolutionScore(
        titre = this.titre,
        score = this.score,
        date = this.date
    )
}

fun PerformanceTypeDto.toDomain(): PerformanceType {
    return PerformanceType(
        type = this.type,
        moyenne = this.moyenne,
        nbReponses = this.nbReponses
    )
}

fun SessionEnCoursDto.toDomain(): SessionEnCours {
    return SessionEnCours(
        id = this.id,
        epreuveId = this.epreuveId,
        epreuveTitre = this.epreuveTitre,
        dateDebut = this.dateDebut
    )
}
