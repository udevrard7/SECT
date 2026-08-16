package com.sect.mobile.shared.domain.model

/**
 * Student result domain model.
 */
data class Resultat(
    val id: String,
    val epreuveId: String,
    val epreuveNom: String,
    val score: Double,
    val statut: String,
    val dateCompletion: String,
    val totalQuestions: Int = 0,
    val bonnesReponses: Int = 0
)
