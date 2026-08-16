package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.ResultatDto
import com.sect.mobile.shared.domain.model.Resultat

/**
 * Mapper for Resultat DTO → Domain.
 */
fun ResultatDto.toDomain(): Resultat {
    return Resultat(
        id = this.id,
        epreuveId = this.epreuveId,
        epreuveNom = this.epreuveNom,
        score = this.score,
        statut = this.statut,
        dateCompletion = this.dateCompletion,
        totalQuestions = this.totalQuestions,
        bonnesReponses = this.bonnesReponses
    )
}
