// SECT Mobile — Filiere DTOs (1:1 with backend JSON)
package com.sect.mobile.shared.data.dto

import kotlinx.serialization.Serializable

@Serializable
data class FiliereDto(
    val id: String,
    val nom: String,
    val code: String? = null,
    val etablissementId: String,
    val responsableId: String? = null,
    val description: String? = null,
    val nbEtudiants: Int? = null,
    val actif: Boolean = true,
    val createdAt: InstantDto,
    val updatedAt: InstantDto,
    val etablissement: EtablissementRefDto? = null,
    val responsable: UserRefDto? = null
)

@Serializable
data class UniteEnseignementDto(
    val id: String,
    val code: String,
    val nom: String,
    val description: String? = null,
    val filiereId: String,
    val niveau: String,
    val semestre: Int? = null,
    val creditsECTS: Int? = null,
    val volumeHeuresCM: Int,
    val volumeHeuresTD: Int,
    val volumeHeuresTP: Int,
    val obligatoire: Boolean,
    val actif: Boolean,
    val createdAt: InstantDto,
    val updatedAt: InstantDto,
    val filiere: FiliereRefDto? = null
)
