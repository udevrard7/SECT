// SECT Mobile — Service API Epreuves (examens)
package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.domain.model.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*

class EpreuveApi(private val client: HttpClient) {

    /**
     * Lister les épreuves (avec filtres).
     * GET /api/epreuves
     */
    suspend fun list(
        search: String? = null,
        statut: String? = null,
        filiereId: String? = null,
        page: Int = 1,
        limit: Int = 20
    ): List<Epreuve> {
        return client.get("/api/epreuves") {
            search?.let { parameter("search", it) }
            statut?.let { parameter("statut", it) }
            filiereId?.let { parameter("filiereId", it) }
            parameter("page", page)
            parameter("limit", limit)
        }.body()
    }

    /**
     * Obtenir une épreuve par ID.
     * GET /api/epreuves/{id}
     */
    suspend fun get(id: String): Epreuve {
        return client.get("/api/epreuves/$id").body()
    }

    /**
     * Créer une épreuve.
     * POST /api/epreuves
     */
    suspend fun create(input: Map<String, Any?>): Epreuve {
        return client.post("/api/epreuves") {
            setBody(input)
        }.body()
    }

    /**
     * Mettre à jour une épreuve.
     * PATCH /api/epreuves/{id}
     */
    suspend fun update(id: String, input: Map<String, Any?>): Epreuve {
        return client.patch("/api/epreuves/$id") {
            setBody(input)
        }.body()
    }

    /**
     * Supprimer une épreuve.
     * DELETE /api/epreuves/{id}
     */
    suspend fun delete(id: String) {
        client.delete("/api/epreuves/$id")
    }

    /**
     * Lister les sessions d'une épreuve.
     * GET /api/epreuves/{id}/sessions
     */
    suspend fun sessions(epreuveId: String): List<SessionPassation> {
        return client.get("/api/epreuves/$epreuveId/sessions").body()
    }

    /**
     * Obtenir les résultats d'une épreuve.
     * GET /api/epreuves/{id}/resultats
     */
    suspend fun resultats(epreuveId: String): Map<String, Any> {
        return client.get("/api/epreuves/$epreuveId/resultats").body()
    }
}
