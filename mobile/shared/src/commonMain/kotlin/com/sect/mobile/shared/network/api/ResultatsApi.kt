package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.ResultatDto
import com.sect.mobile.shared.data.dto.SessionPassationDto
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*

/**
 * API for fetching student results and sessions to correct.
 */
class ResultatsApi(private val client: HttpClient) {

    /**
     * Get all results for the current student.
     * GET /api/resultats → { resultats: SessionPassation[] }
     *
     * Backend (internal/transport/http/session_handlers.go:listResultats) force
     * etudiantId = claims.UserID pour le rôle ETUDIANT, donc aucun query param
     * n'est nécessaire : la réponse est toujours Branch A `{resultats: [...]}`.
     */
    suspend fun getResultatsEtudiant(): List<ResultatDto> {
        val response: Map<String, List<ResultatDto>> = client.get("/api/resultats").body()
        return response["resultats"] ?: emptyList()
    }

    /**
     * Get sessions pending correction for the current teacher.
     *
     * TODO(SECT-MOBILE-CORRECTIONS): la route backend /api/sessions/a-corriger
     * n'existe pas encore. Le frontend Next.js utilise /api/resultats?epreuveId=X
     * (par épreuve) mais aucun endpoint global "sessions à corriger" n'est
     * implémenté côté backend (vérifié dans internal/transport/http/router.go).
     * En attendant l'ajout de cette route, on retourne une liste vide pour ne
     * pas crasher l'écran Corrections de l'enseignant (CorrectionsViewModel).
     */
    suspend fun getSessionsACorriger(): List<SessionPassationDto> {
        return emptyList()
    }
}
