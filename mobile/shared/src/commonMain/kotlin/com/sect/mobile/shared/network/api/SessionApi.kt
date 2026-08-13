// SECT Mobile — Service API Session (passation d'épreuves)
package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*

class SessionApi(private val client: HttpClient) {

    /**
     * Obtenir ou créer une session de passation pour un étudiant.
     * GET /api/epreuves/{epreuveId}/session
     */
    suspend fun getOrCreate(epreuveId: String): SessionPassationDto {
        return client.get("/api/epreuves/$epreuveId/session").body()
    }

    /**
     * Soumettre les réponses d'une session.
     * POST /api/sessions/{sessionId}/submit
     */
    suspend fun submit(
        sessionId: String,
        reponses: List<Map<String, Any?>>
    ): SessionPassationDto {
        return client.post("/api/sessions/$sessionId/submit") {
            setBody(mapOf("reponses" to reponses))
        }.body()
    }

    /**
     * Sauvegarder une réponse (auto-save).
     * PATCH /api/sessions/{sessionId}/reponses/{questionId}
     */
    suspend fun saveReponse(
        sessionId: String,
        questionId: String,
        contenu: String
    ) {
        client.patch("/api/sessions/$sessionId/reponses/$questionId") {
            setBody(mapOf("contenu" to contenu))
        }
    }

    /**
     * Obtenir les résultats d'une session.
     * GET /api/sessions/{sessionId}/resultats
     */
    suspend fun resultats(sessionId: String): Map<String, Any> {
        return client.get("/api/sessions/$sessionId/resultats").body()
    }
}
