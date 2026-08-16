package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.CorrectionSessionDto
import com.sect.mobile.shared.data.dto.SaveGradeInputDto
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*

/**
 * API de correction enseignant — miroir du backend /api/correction.
 *
 * Endpoints (backend/internal/transport/http/router.go:775) :
 *   GET   /api/correction                            → liste des sessions à corriger
 *   PATCH /api/correction/{sessionId}/ai-grade       → sauver une note OU finaliser
 *   POST  /api/correction/{sessionId}/retourner      → retourner la copie à l'étudiant
 *
 * Sécurité backend :
 *   - RequireAuth sur tout le groupe
 *   - RequireRole("ENSEIGNANT","ADMIN","RESPONSABLE") sur les mutations
 *   - Ownership check : e.enseignantId = claims.UserID (l'enseignant ne voit/corrige
 *     que les sessions de ses propres épreuves)
 *
 * NOTE : pour un ENSEIGNANT, le usecase auto-remplit enseignantId = claims.UserID,
 * donc getSessions() peut être appelé SANS paramètre — l'API filtre automatiquement
 * sur les épreuves de l'enseignant connecté.
 */
class CorrectionApi(private val client: HttpClient) {

    /**
     * Lister les sessions à corriger.
     * GET /api/correction → { sessions: [...] }
     *
     * @param enseignantId optionnel (auto-rempli côté backend pour ENSEIGNANT)
     * @param epreuveId    optionnel (filtre par épreuve)
     */
    suspend fun getSessions(
        enseignantId: String? = null,
        epreuveId: String? = null
    ): List<CorrectionSessionDto> {
        val response: Map<String, List<CorrectionSessionDto>> = client.get("/api/correction") {
            enseignantId?.let { parameter("enseignantId", it) }
            epreuveId?.let { parameter("epreuveId", it) }
        }.body()
        return response["sessions"] ?: emptyList()
    }

    /**
     * Sauver la note d'une question (correction manuelle).
     * PATCH /api/correction/{sessionId}/ai-grade { questionId, score, commentaire }
     */
    suspend fun saveGrade(
        sessionId: String,
        questionId: String,
        score: Double?,
        commentaire: String?
    ) {
        client.patch("/api/correction/$sessionId/ai-grade") {
            contentType(ContentType.Application.Json)
            setBody(
                SaveGradeInputDto(
                    questionId = questionId,
                    score = score,
                    commentaire = commentaire
                )
            )
        }
    }

    /**
     * Finaliser la correction d'une session (calcule le score final, marque CORRIGEE).
     * PATCH /api/correction/{sessionId}/ai-grade { finalizeAll: true }
     */
    suspend fun finalizeSession(sessionId: String) {
        client.patch("/api/correction/$sessionId/ai-grade") {
            contentType(ContentType.Application.Json)
            setBody(SaveGradeInputDto(finalizeAll = true))
        }
    }

    /**
     * Retourner la copie corrigée à l'étudiant (statut RETOURNEE + notification).
     * POST /api/correction/{sessionId}/retourner
     */
    suspend fun retournerSession(sessionId: String) {
        client.post("/api/correction/$sessionId/retourner")
    }
}
