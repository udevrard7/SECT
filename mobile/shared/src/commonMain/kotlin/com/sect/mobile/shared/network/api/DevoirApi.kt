package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.CreateDevoirRequest
import com.sect.mobile.shared.data.dto.DevoirDto
import com.sect.mobile.shared.data.dto.PresignedUrlResponse
import com.sect.mobile.shared.data.dto.SoumissionDto
import com.sect.mobile.shared.data.dto.SubmitDevoirRequest
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*

class DevoirApi(private val client: HttpClient) {

    /**
     * Lister les devoirs (avec filtres).
     * GET /api/devoirs
     */
    suspend fun list(
        search: String? = null,
        statut: String? = null,
        page: Int = 1,
        limit: Int = 20
    ): List<DevoirDto> {
        val response: Map<String, List<DevoirDto>> = client.get("/api/devoirs") {
            search?.let { parameter("search", it) }
            statut?.let { parameter("statut", it) }
            parameter("page", page)
            parameter("limit", limit)
        }.body()
        return response["devoirs"] ?: emptyList()
    }

    /**
     * Obtenir un devoir par ID.
     * GET /api/devoirs/{id}
     */
    suspend fun get(id: String): DevoirDto {
        val response: Map<String, DevoirDto> = client.get("/api/devoirs/$id").body()
        return response["devoir"] 
            ?: throw Exception("Devoir non trouvé")
    }

    /**
     * Créer un devoir.
     * POST /api/devoirs
     */
    suspend fun create(input: CreateDevoirRequest): DevoirDto {
        val response: Map<String, DevoirDto> = client.post("/api/devoirs") {
            setBody(input)
        }.body()
        return response["devoir"] 
            ?: throw Exception("Erreur lors de la création du devoir")
    }

    /**
     * Mettre à jour un devoir.
     * PATCH /api/devoirs/{id}
     */
    suspend fun update(id: String, input: CreateDevoirRequest): DevoirDto {
        val response: Map<String, DevoirDto> = client.patch("/api/devoirs/$id") {
            setBody(input)
        }.body()
        return response["devoir"] 
            ?: throw Exception("Erreur lors de la mise à jour du devoir")
    }

    /**
     * Supprimer un devoir.
     * DELETE /api/devoirs/{id}
     */
    suspend fun delete(id: String) {
        client.delete("/api/devoirs/$id")
    }

    /**
     * Obtenir une URL presignée pour upload R2.
     * POST /api/upload/presigned
     */
    suspend fun getPresignedUrl(fileName: String, contentType: String): PresignedUrlResponse {
        return client.post("/api/upload/presigned") {
            setBody(mapOf(
                "file_name" to fileName,
                "content_type" to contentType
            ))
        }.body()
    }

    /**
     * Soumettre un devoir.
     * POST /api/soumissions
     */
    suspend fun submitSoumission(input: SubmitDevoirRequest): SoumissionDto {
        val response: Map<String, SoumissionDto> = client.post("/api/soumissions") {
            setBody(input)
        }.body()
        return response["soumission"] 
            ?: throw Exception("Erreur lors de la soumission")
    }

    /**
     * Obtenir une soumission par ID.
     * GET /api/soumissions/{id}
     */
    suspend fun getSoumission(id: String): SoumissionDto {
        val response: Map<String, SoumissionDto> = client.get("/api/soumissions/$id").body()
        return response["soumission"] 
            ?: throw Exception("Soumission non trouvée")
    }

    /**
     * Lister les soumissions d'un devoir (pour enseignant).
     * GET /api/devoirs/{id}/soumissions
     */
    suspend fun listSoumissions(devoirId: String): List<SoumissionDto> {
        val response: Map<String, List<SoumissionDto>> = client.get("/api/devoirs/$devoirId/soumissions").body()
        return response["soumissions"] ?: emptyList()
    }

    /**
     * Noter une soumission.
     * PATCH /api/soumissions/{id}/note
     */
    suspend fun noterSoumission(id: String, note: Float, commentaire: String?): SoumissionDto {
        val response: Map<String, SoumissionDto> = client.patch("/api/soumissions/$id/note") {
            setBody(mapOf(
                "note" to note,
                "commentaire" to (commentaire ?: "")
            ))
        }.body()
        return response["soumission"] 
            ?: throw Exception("Erreur lors de la notation")
    }

    // ════════════════════════════════════════════════════════
    // SECT-MOBILE-PARITY P1-8 : Correction IA des devoirs
    // ════════════════════════════════════════════════════════

    /**
     * Demander la correction IA d'une soumission.
     * POST /api/soumissions/{id}/ai-grade
     *
     * Retourne 202 Accepted — le worker HomeworkCorrectionWorker traite
     * la correction en arrière-plan. Le statut est visible via getSoumission().
     *
     * États possibles de soumission.statutIA :
     * - EN_ATTENTE → EN_COURS → TERMINE / ERREUR
     *
     * Le mobile doit poller getSoumission() pour suivre le statut.
     */
    suspend fun aiGrade(soumissionId: String) {
        client.post("/api/soumissions/$soumissionId/ai-grade")
    }
}
