// SECT Mobile — ResultatDetail mapper (Phase R1)
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.*
import com.sect.mobile.shared.domain.model.*

fun ResultatDetailDto.toDomain(): ResultatDetail = ResultatDetail(
    id = id,
    etudiantId = etudiantId,
    epreuveId = epreuveId,
    statut = statut,
    dateDebut = dateDebut,
    dateFin = dateFin,
    score = score,
    alertes = alertes,
    penalite = penalite,
    reponses = reponses.map { it.toDomain() },
    resultat = resultat?.toDomain(),
    epreuve = epreuve?.toDomain()
)

fun ResultatReponseDto.toDomain(): ResultatReponse = ResultatReponse(
    id = id,
    questionId = questionId,
    contenu = contenu,
    score = score,
    commentaire = commentaire,
    noteIA = noteIA,
    justificationIA = justificationIA
)

fun ResultatFinalDto.toDomain(): ResultatFinal = ResultatFinal(
    id = id,
    sessionId = sessionId,
    scoreFinal = scoreFinal,
    totalPossible = totalPossible,
    dateCorrection = dateCorrection,
    dateRetour = dateRetour,
    commentaires = commentaires
)

fun ResultatEpreuveRefDto.toDomain(): ResultatEpreuveRef = ResultatEpreuveRef(
    id = id,
    titre = titre,
    duree = duree,
    noteTotal = noteTotal,
    enseignant = enseignant?.toDomain()
)

fun ResultatEnseignantRefDto.toDomain(): ResultatEnseignantRef = ResultatEnseignantRef(
    id = id,
    name = name
)
