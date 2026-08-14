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
     * POST /api/sessions (session_handlers.go:69 startSession)
     *
     * Le backend n'expose PAS GET /api/epreuves/{id}/session. La route correcte est
     * POST /api/sessions avec body { etudiantId, epreuveId }.
     *
     * Le backend ignore `etudiantId` du body et utilise claims.UserID du JWT (anti-spoofing).
     * On envoie donc "" pour etudiantId (le backend l'écrasera).
     *
     * Réponse : { session, resumed: BOOL, epreuve: { questions: [...] } }
     * On extrait .session et on le retourne.
     */
    suspend fun getOrCreate(epreuveId: String): SessionPassationDto {
        val response: StartSessionResponseDto = client.post("/api/sessions") {
            setBody(StartSessionInputDto(etudiantId = "", epreuveId = epreuveId))
        }.body()
        return response.session
    }

    /**
     * Soumettre les réponses d'une session.
     * POST /api/sessions/{sessionId}/submit (session_handlers.go:215 submitSession)
     *
     * DOUBLE MISMATCH corrigé :
     * (a) Body : le backend attend SubmitSessionInput{autoSubmit: BOOL, reponses: Map<String,String>}
     *     (questionId → contenu), PAS un List<Map<String,Any?>>. On reformate l'input
     *     mobile (List<Map<String,Any?>>) en Map<String,String> (clé = questionId, valeur = contenu).
     * (b) Réponse : le backend retourne SubmitResult{session, score, rawScore, penalite,
     *     totalPossible, percentage, autoGraded, pendingCorrection, scenario, scenarioMessage, message}.
     *     On retourne le SubmitResultDto complet (le repository le convertira en SubmitResult domain).
     */
    suspend fun submit(
        sessionId: String,
        reponses: List<Map<String, Any?>>
    ): SubmitResultDto {
        // Convertir List<Map<String,Any?>> → Map<String,String> (questionId → contenu)
        val reponsesMap: Map<String, String> = reponses.mapNotNull { entry ->
            val questionId = entry["questionId"] as? String
            val contenu = entry["contenu"] as? String
            if (questionId != null && contenu != null) {
                questionId to contenu
            } else {
                null
            }
        }.toMap()

        val input = SubmitSessionInputDto(autoSubmit = false, reponses = reponsesMap)
        return client.post("/api/sessions/$sessionId/submit") {
            setBody(input)
        }.body()
    }

    /**
     * Sauvegarder une réponse (auto-save).
     * PUT /api/sessions (session_handlers.go:147 saveReponse)
     *
     * Le backend n'expose PAS PATCH /api/sessions/{id}/reponses/{questionId}.
     * La route correcte est PUT /api/sessions avec body :
     * { sessionId, questionId, contenu, alerte? }
     */
    suspend fun saveReponse(
        sessionId: String,
        questionId: String,
        contenu: String
    ) {
        client.put("/api/sessions") {
            setBody(
                mapOf(
                    "sessionId" to sessionId,
                    "questionId" to questionId,
                    "contenu" to contenu
                )
            )
        }
    }

    // Note : `resultats(sessionId)` supprimé.
    //
    // Le backend n'expose PAS GET /api/sessions/{id}/resultats. Il expose
    // GET /api/resultats?etudiantId=&epreuveId= (session_handlers.go:285 listResultats).
    // Cette méthode doit être re-conçue côté repository/viewmodel (soit en passant
    // l'etudiantId via le claims côté backend, soit en récupérant les resultats
    // côté usecase). En attendant, elle a été retirée pour ne pas exposer une API
    // cassée (404 systématique).
    //
    // Aucun usage dans SECTRepositoryImpl, SECTRepositoryInterface, ou les viewmodels.
}
