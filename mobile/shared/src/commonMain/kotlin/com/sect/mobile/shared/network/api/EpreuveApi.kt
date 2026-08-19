// SECT Mobile — Service API Epreuves (examens)
package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*
class EpreuveApi(private val client: HttpClient) {

    /**
     * Lister les épreuves (avec filtres).
     * GET /api/epreuves
     *
     * Le backend retourne { epreuves: [...], filieres: [...], total?, page?, limit?, totalPages? }.
     * On désérialise via EpreuveListResponseDto puis on renvoie uniquement la liste des épreuves.
     */
    suspend fun list(
        search: String? = null,
        statut: String? = null,
        filiereId: String? = null,
        page: Int = 1,
        limit: Int = 20
    ): List<EpreuveDto> {
        val response: EpreuveListResponseDto = client.get("/api/epreuves") {
            search?.let { parameter("search", it) }
            statut?.let { parameter("statut", it) }
            filiereId?.let { parameter("filiereId", it) }
            parameter("page", page)
            parameter("limit", limit)
        }.body()
        return response.epreuves
    }

    /**
     * Obtenir une épreuve par ID.
     * GET /api/epreuves/{id} — réponse wrappée : { epreuve: {...} }
     */
    suspend fun get(id: String): EpreuveDto {
        val response: EpreuveResponseDto = client.get("/api/epreuves/$id").body()
        return response.epreuve
    }

    /**
     * Créer une épreuve.
     * POST /api/epreuves — réponse wrappée : { epreuve: {...}, message }
     *
     * SECT-MOBILE-PARITY-T1 : signature typée (CreateEpreuveRequest) au lieu de Map<String,Any?>.
     */
    suspend fun create(input: CreateEpreuveRequest): EpreuveDto {
        val response: EpreuveMutationResponseDto = client.post("/api/epreuves") {
            setBody(input)
        }.body()
        return response.epreuve
    }

    /**
     * Mettre à jour une épreuve.
     * PATCH /api/epreuves/{id} — réponse wrappée : { epreuve: {...}, message }
     */
    suspend fun update(id: String, input: Map<String, Any?>): EpreuveDto {
        val response: EpreuveMutationResponseDto = client.patch("/api/epreuves/$id") {
            setBody(input)
        }.body()
        return response.epreuve
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
    suspend fun sessions(epreuveId: String): List<SessionPassationDto> {
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
