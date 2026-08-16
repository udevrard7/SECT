// SECT Mobile — Stats API pour les dashboards Enseignant/Étudiant
// Correspond aux endpoints backend: GET /api/stats/enseignant et GET /api/stats/etudiant
package com.sect.mobile.shared.network.api

import com.sect.mobile.shared.data.dto.EnseignantStatsDto
import com.sect.mobile.shared.data.dto.EtudiantStatsDto
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*

/**
 * API pour les statistiques dashboard.
 * Inspiré du frontend web: /frontend/src/hooks/use-dashboard.ts
 */
class StatsApi(private val httpClient: HttpClient) {
    
    /**
     * GET /api/stats/enseignant
     * Statistiques pour le dashboard enseignant:
     * - nbDocuments, nbQuestionsTotal, nbEpreuves, nbEpreuvesActives
     * - pendingCorrections (copies à corriger)
     * - recentEpreuves (avec moyennes)
     * - evolutionMoyennes (par mois)
     * - epreuvesAVenir (planning)
     */
    suspend fun getStatsEnseignant(): EnseignantStatsDto {
        return httpClient.get("/api/stats/enseignant").body()
    }
    
    /**
     * GET /api/stats/etudiant
     * Statistiques pour le dashboard étudiant:
     * - nbEpreuvesAVenir, nbEpreuvesTerminees
     * - moyenne, meilleureNote
     * - epreuvesAVenir (avec détails)
     * - resultatsRecents
     * - evolutionScores
     * - performanceParType (par type de question)
     * - sessionEnCours (si examen en cours)
     */
    suspend fun getStatsEtudiant(): EtudiantStatsDto {
        return httpClient.get("/api/stats/etudiant").body()
    }
}
