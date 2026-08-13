// SECT Mobile — Filiere domain models (pure Kotlin, no serialization coupling)
package com.sect.mobile.shared.domain.model

data class Filiere(
    val id: String,
    val nom: String,
    val code: String? = null,
    val etablissementId: String,
    val responsableId: String? = null,
    val description: String? = null,
    val nbEtudiants: Int? = null,
    val actif: Boolean = true,
    val createdAt: Instant,
    val updatedAt: Instant,
    val etablissement: EtablissementRef? = null,
    val responsable: UserRef? = null
)

data class UniteEnseignement(
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
    val createdAt: Instant,
    val updatedAt: Instant,
    val filiere: FiliereRef? = null
)
