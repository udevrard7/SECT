// SECT Mobile — Filiere DTO ↔ Domain mappers
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.FiliereDto
import com.sect.mobile.shared.data.dto.UniteEnseignementDto
import com.sect.mobile.shared.domain.model.Filiere
import com.sect.mobile.shared.domain.model.UniteEnseignement

// ── DTO → Domain ──

fun FiliereDto.toDomain() = Filiere(
    id = id,
    nom = nom,
    code = code,
    etablissementId = etablissementId,
    responsableId = responsableId,
    description = description,
    nbEtudiants = nbEtudiants,
    actif = actif,
    createdAt = createdAt,
    updatedAt = updatedAt,
    etablissement = etablissement?.toDomain(),
    responsable = responsable?.toDomain()
)

fun UniteEnseignementDto.toDomain() = UniteEnseignement(
    id = id,
    code = code,
    nom = nom,
    description = description,
    filiereId = filiereId,
    niveau = niveau,
    semestre = semestre,
    creditsECTS = creditsECTS,
    volumeHeuresCM = volumeHeuresCM,
    volumeHeuresTD = volumeHeuresTD,
    volumeHeuresTP = volumeHeuresTP,
    obligatoire = obligatoire,
    actif = actif,
    createdAt = createdAt,
    updatedAt = updatedAt,
    filiere = filiere?.toDomain()
)

// ── Domain → DTO ──

fun Filiere.toDto() = FiliereDto(
    id = id,
    nom = nom,
    code = code,
    etablissementId = etablissementId,
    responsableId = responsableId,
    description = description,
    nbEtudiants = nbEtudiants,
    actif = actif,
    createdAt = createdAt,
    updatedAt = updatedAt,
    etablissement = etablissement?.toDto(),
    responsable = responsable?.toDto()
)

fun UniteEnseignement.toDto() = UniteEnseignementDto(
    id = id,
    code = code,
    nom = nom,
    description = description,
    filiereId = filiereId,
    niveau = niveau,
    semestre = semestre,
    creditsECTS = creditsECTS,
    volumeHeuresCM = volumeHeuresCM,
    volumeHeuresTD = volumeHeuresTD,
    volumeHeuresTP = volumeHeuresTP,
    obligatoire = obligatoire,
    actif = actif,
    createdAt = createdAt,
    updatedAt = updatedAt,
    filiere = filiere?.toDto()
)
