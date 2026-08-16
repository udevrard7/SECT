// SECT Mobile — Etablissement DTO ↔ Domain mappers
package com.sect.mobile.shared.data.mapper

import com.sect.mobile.shared.data.dto.AnneeAcademiqueDto
import com.sect.mobile.shared.data.dto.AnneeAcademiqueRefDto
import com.sect.mobile.shared.data.dto.EtablissementCountDto
import com.sect.mobile.shared.data.dto.EtablissementDto
import com.sect.mobile.shared.domain.model.AnneeAcademique
import com.sect.mobile.shared.domain.model.AnneeAcademiqueRef
import com.sect.mobile.shared.domain.model.Etablissement
import com.sect.mobile.shared.domain.model.EtablissementCount

// ── DTO → Domain ──

fun EtablissementDto.toDomain() = Etablissement(
    id = id,
    nom = nom,
    type = type,
    ville = ville,
    pays = pays,
    adresse = adresse,
    telephone = telephone,
    email = email,
    siteWeb = siteWeb,
    logo = logo,
    actif = actif,
    exempleMatricule = exempleMatricule,
    formatMatricule = formatMatricule,
    regexMatricule = regexMatricule,
    certWatermarkText = certWatermarkText,
    certWatermarkEnabled = certWatermarkEnabled,
    certWatermarkOpacity = certWatermarkOpacity,
    createdAt = createdAt,
    updatedAt = updatedAt,
    anneeAcademiqueCouranteId = anneeAcademiqueCouranteId,
    anneeCourante = anneeCourante?.toDomain(),
    count = count?.toDomain(),
    filieres = filieres?.map { it.toDomain() }
)

fun EtablissementCountDto.toDomain() = EtablissementCount(
    filieres = filieres,
    users = users
)

fun AnneeAcademiqueDto.toDomain() = AnneeAcademique(
    id = id,
    libelle = libelle,
    dateDebut = dateDebut,
    dateFin = dateFin,
    etablissementId = etablissementId,
    actif = actif,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun AnneeAcademiqueRefDto.toDomain() = AnneeAcademiqueRef(
    id = id,
    libelle = libelle,
    dateDebut = dateDebut,
    dateFin = dateFin,
    actif = actif
)

// ── Domain → DTO ──

fun Etablissement.toDto() = EtablissementDto(
    id = id,
    nom = nom,
    type = type,
    ville = ville,
    pays = pays,
    adresse = adresse,
    telephone = telephone,
    email = email,
    siteWeb = siteWeb,
    logo = logo,
    actif = actif,
    exempleMatricule = exempleMatricule,
    formatMatricule = formatMatricule,
    regexMatricule = regexMatricule,
    certWatermarkText = certWatermarkText,
    certWatermarkEnabled = certWatermarkEnabled,
    certWatermarkOpacity = certWatermarkOpacity,
    createdAt = createdAt,
    updatedAt = updatedAt,
    anneeAcademiqueCouranteId = anneeAcademiqueCouranteId,
    anneeCourante = anneeCourante?.toDto(),
    count = count?.toDto(),
    filieres = filieres?.map { it.toDto() }
)

fun EtablissementCount.toDto() = EtablissementCountDto(
    filieres = filieres,
    users = users
)

fun AnneeAcademique.toDto() = AnneeAcademiqueDto(
    id = id,
    libelle = libelle,
    dateDebut = dateDebut,
    dateFin = dateFin,
    etablissementId = etablissementId,
    actif = actif,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun AnneeAcademiqueRef.toDto() = AnneeAcademiqueRefDto(
    id = id,
    libelle = libelle,
    dateDebut = dateDebut,
    dateFin = dateFin,
    actif = actif
)
