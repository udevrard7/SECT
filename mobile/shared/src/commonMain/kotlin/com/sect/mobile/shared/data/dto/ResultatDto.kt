package com.sect.mobile.shared.data.dto

import kotlinx.serialization.Serializable

/**
 * DTO for student result.
 */
@Serializable
data class ResultatDto(
    val id: String,
    val epreuveId: String,
    val epreuveNom: String,
    val score: Double,
    val statut: String,
    val dateCompletion: String,
    val totalQuestions: Int = 0,
    val bonnesReponses: Int = 0
)
