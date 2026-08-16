package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.AuteurDto
import com.sect.mobile.shared.data.dto.DevoirDto
import com.sect.mobile.shared.data.dto.PresignedUrlResponse
import com.sect.mobile.shared.data.dto.SoumissionDto
import com.sect.mobile.shared.domain.model.Auteur
import com.sect.mobile.shared.domain.model.Devoir
import com.sect.mobile.shared.domain.model.PresignedUrl
import com.sect.mobile.shared.domain.model.Soumission

fun DevoirDto.toDomain(): Devoir {
    return Devoir(
        id = id,
        titre = titre,
        description = description,
        dateCreation = dateCreation,
        dateLimite = dateLimite,
        pointsMax = pointsMax,
        statut = statut,
        fichierUrl = fichierUrl,
        auteur = auteur?.toDomain(),
        soumissionUtilisateur = soumissionUtilisateur?.toDomain()
    )
}

fun SoumissionDto.toDomain(): Soumission {
    return Soumission(
        id = id,
        devoirId = devoirId,
        etudiantId = etudiantId,
        dateSoumission = dateSoumission,
        fichierUrl = fichierUrl,
        commentaire = commentaire,
        note = note,
        statut = statut,
        etudiant = etudiant?.toDomain()
    )
}

fun AuteurDto.toDomain(): Auteur {
    return Auteur(
        id = id,
        nom = nom,
        prenom = prenom,
        email = email
    )
}

fun PresignedUrlResponse.toDomain(): PresignedUrl {
    return PresignedUrl(
        uploadUrl = uploadUrl,
        fileUrl = fileUrl,
        key = key
    )
}
