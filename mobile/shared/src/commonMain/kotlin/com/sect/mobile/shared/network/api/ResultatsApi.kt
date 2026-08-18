package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.ResultatDetailDto
import com.sect.mobile.shared.data.dto.ResultatDto
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*

/**
 * API for fetching student results.
 *
 * NOTE : les sessions à corriger (côté enseignant) ont été déplacées vers
 * CorrectionApi (GET /api/correction) — voir SECT-MOBILE-CORRECTION-1.
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
     * SECT-MOBILE-PARITY-R1 : Détail d'un résultat par epreuveId.
     *
     * GET /api/resultats?epreuveId=X → { sessions: [...], stats: {...} } (Branch B)
     *
     * Le backend retourne les sessions avec reponses + resultat + epreuve enrichis.
     * Pour un étudiant, le backend filtre automatiquement (RLS + claims).
     * On prend la première session (l'étudiant a une session par épreuve).
     *
     * Si aucune session n'est trouvée, retourne null.
     */
    suspend fun getResultatDetail(epreuveId: String): ResultatDetailDto? {
        val response: Map<String, List<ResultatDetailDto>> = client.get("/api/resultats") {
            parameter("epreuveId", epreuveId)
        }.body()
        // Branch B retourne { sessions: [...] }, Branch A retourne { resultats: [...] }
        // Pour un étudiant avec epreuveId, le backend utilise Branch B
        val sessions = response["sessions"] ?: response["resultats"] ?: emptyList()
        return sessions.firstOrNull()
    }
}
