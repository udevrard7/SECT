package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.AuteurDto
import com.sect.mobile.shared.data.dto.CreateDevoirRequest
import com.sect.mobile.shared.data.dto.DevoirDto
import com.sect.mobile.shared.data.dto.PresignedUrlResponse
import com.sect.mobile.shared.data.dto.SoumissionDto
import com.sect.mobile.shared.domain.model.Auteur
import com.sect.mobile.shared.domain.model.CreateDevoirInput
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

// ── SECT-MOBILE-PARITY-T1 : Domain input → Create request DTO ──

/**
 * Convertit un CreateDevoirInput (domain) en CreateDevoirRequest (DTO sérialisable).
 * Les valeurs null sont omises côté JSON (explicitNulls=false).
 * Les défauts backend (typeSeance=TD, noteMax=20, etc.) sont remplis si null côté input.
 */
fun CreateDevoirInput.toRequest() = CreateDevoirRequest(
    titre = titre,
    uniteEnseignementId = uniteEnseignementId,
    dateLimite = dateLimite,
    description = description,
    consignes = consignes,
    enseignantId = enseignantId,
    typeSeance = typeSeance ?: "TD",
    datePublication = datePublication,
    noteMax = noteMax ?: 20.0,
    renduFichiers = renduFichiers,
    soumissionGroupe = soumissionGroupe ?: false,
    nbMaxFichiers = nbMaxFichiers ?: 5,
    tailleMaxFichier = tailleMaxFichier ?: 10_485_760,
    anneeUniversitaire = anneeUniversitaire ?: "2024-2025"
)
