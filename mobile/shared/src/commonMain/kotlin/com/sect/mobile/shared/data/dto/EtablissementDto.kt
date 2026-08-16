// SECT Mobile — Etablissement DTOs (1:1 with backend JSON)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class EtablissementDto(
    val id: String,
    val nom: String,
    val type: String? = null,
    val ville: String? = null,
    val pays: String,
    val adresse: String? = null,
    val telephone: String? = null,
    val email: String? = null,
    val siteWeb: String? = null,
    val logo: String? = null,
    val actif: Boolean = true,
    val exempleMatricule: String? = null,
    val formatMatricule: String? = null,
    val regexMatricule: String? = null,
    val certWatermarkText: String? = null,
    val certWatermarkEnabled: Boolean = false,
    val certWatermarkOpacity: Double = 0.0,
    val createdAt: InstantDto,
    val updatedAt: InstantDto,
    val anneeAcademiqueCouranteId: String? = null,
    val anneeCourante: AnneeAcademiqueRefDto? = null,
    val count: EtablissementCountDto? = null,
    val filieres: List<FiliereRefDto>? = null
)

@Serializable
data class EtablissementCountDto(
    val filieres: Int,
    val users: Int
)

@Serializable
data class AnneeAcademiqueDto(
    val id: String,
    val libelle: String,
    val dateDebut: InstantDto,
    val dateFin: InstantDto,
    val etablissementId: String,
    val actif: Boolean,
    val createdAt: InstantDto,
    val updatedAt: InstantDto
)

@Serializable
data class AnneeAcademiqueRefDto(
    val id: String,
    val libelle: String,
    val dateDebut: InstantDto,
    val dateFin: InstantDto,
    val actif: Boolean
)
