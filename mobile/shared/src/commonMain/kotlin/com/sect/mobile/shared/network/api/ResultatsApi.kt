package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.ResultatDto
import com.sect.mobile.shared.data.dto.SessionPassationDto
import io.ktor.client.*
import io.ktor.client.request.*

/**
 * API for fetching student results and sessions to correct.
 */
class ResultatsApi(private val client: HttpClient) {

    /**
     * Get all results for the current student.
     * GET /api/resultats
     */
    suspend fun getResultatsEtudiant(): List<ResultatDto> {
        return client.get("/api/resultats")
    }

    /**
     * Get sessions pending correction for the current teacher.
     * GET /api/sessions/a-corriger
     */
    suspend fun getSessionsACorriger(): List<SessionPassationDto> {
        return client.get("/api/sessions/a-corriger")
    }
}
