// SECT Mobile — DashboardViewModel (stats, raccourcis, épreuves à venir)
// SECT-MOBILE-FOCUS : adaptatif enseignant / étudiant avec statistiques complètes
package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.*
import com.sect.mobile.shared.domain.enum.Role
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DashboardViewModel(private val repository: SECTRepositoryInterface) : ViewModel() {

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()

    // Stats enrichies selon le rôle
    private val _enseignantStats = MutableStateFlow<UiState<EnseignantStats>>(UiState.Loading)
    val enseignantStats: StateFlow<UiState<EnseignantStats>> = _enseignantStats.asStateFlow()

    private val _etudiantStats = MutableStateFlow<UiState<EtudiantStats>>(UiState.Loading)
    val etudiantStats: StateFlow<UiState<EtudiantStats>> = _etudiantStats.asStateFlow()

    private val _upcomingEpreuves = MutableStateFlow<UiState<List<Epreuve>>>(UiState.Loading)
    val upcomingEpreuves: StateFlow<UiState<List<Epreuve>>> = _upcomingEpreuves.asStateFlow()

    val isEnseignant: Boolean
        get() = _user.value?.role == Role.ENSEIGNANT

    val isEtudiant: Boolean
        get() = _user.value?.role == Role.ETUDIANT

    init {
        loadDashboard()
    }

    fun loadDashboard() {
        viewModelScope.launch {
            try {
                _user.value = repository.getCurrentUser()
            } catch (_: Exception) { }

            val role = _user.value?.role

            when (role) {
                Role.ENSEIGNANT -> loadEnseignantDashboard()
                Role.ETUDIANT -> loadEtudiantDashboard()
                else -> { /* ADMIN/RESPONSABLE ne devrait pas être ici */ }
            }
        }
    }

    /**
     * Dashboard enseignant :
     * - Stats complètes (documents, questions, épreuves, corrections en attente)
     * - Épreuves récentes avec performances
     * - Corrections en attente
     * - Épreuves à venir
     */
    private suspend fun loadEnseignantDashboard() {
        coroutineScope {
            launch {
                try {
                    val stats = repository.getStatsEnseignant()
                    _enseignantStats.value = UiState.Success(stats)
                    
                    // Charger aussi les épreuves à venir pour compatibilité
                    val epreuvesAVenir = stats.epreuvesAVenir.map { epreuve ->
                        Epreuve(
                            id = epreuve.id,
                            titre = epreuve.titre,
                            description = "",
                            statut = com.sect.mobile.shared.domain.enum.StatutEpreuve.valueOf(epreuve.statut),
                            dateDebut = epreuve.date,
                            dateFin = epreuve.dateFin,
                            duree = epreuve.duree,
                            questionCount = 0,
                            totalPoints = 0.0,
                            filiereId = "",
                            enseignantId = "",
                            createdAt = "",
                            updatedAt = "",
                            melangeQuestions = false,
                            melangePropositions = false,
                            blocageRetour = false,
                            sessionExamen = com.sect.mobile.shared.domain.enum.SessionExamen.NORMALE,
                            generationMode = com.sect.mobile.shared.domain.enum.ModeGeneration.MANUELLE
                        )
                    }
                    _upcomingEpreuves.value = UiState.Success(epreuvesAVenir)
                } catch (e: Exception) {
                    _enseignantStats.value = UiState.Error(e.message ?: "Erreur")
                    _upcomingEpreuves.value = UiState.Error(e.message ?: "Erreur")
                }
            }
        }
    }

    /**
     * Dashboard étudiant :
     * - Stats complètes (moyenne, meilleure note, évolution scores)
     * - Épreuves à venir avec détails
     * - Résultats récents
     * - Session en cours (si applicable)
     */
    private suspend fun loadEtudiantDashboard() {
        coroutineScope {
            launch {
                try {
                    val stats = repository.getStatsEtudiant()
                    _etudiantStats.value = UiState.Success(stats)
                    
                    // Charger aussi les épreuves à venir pour compatibilité
                    // Note : EpreuveAVenirEtudiant n'expose pas `statut` → défaut PLANIFIEE (épreuve à venir)
                    val epreuvesAVenir = stats.epreuvesAVenir.map { epreuve ->
                        Epreuve(
                            id = epreuve.id,
                            titre = epreuve.titre,
                            description = "",
                            statut = com.sect.mobile.shared.domain.enum.StatutEpreuve.PLANIFIEE,
                            dateDebut = epreuve.date,
                            dateFin = epreuve.dateFin,
                            duree = epreuve.duree,
                            questionCount = epreuve.nbQuestions,
                            totalPoints = epreuve.totalPoints,
                            filiereId = "",
                            enseignantId = "",
                            createdAt = "",
                            updatedAt = "",
                            melangeQuestions = false,
                            melangePropositions = false,
                            blocageRetour = false,
                            sessionExamen = com.sect.mobile.shared.domain.enum.SessionExamen.NORMALE,
                            generationMode = com.sect.mobile.shared.domain.enum.ModeGeneration.MANUELLE
                        )
                    }
                    _upcomingEpreuves.value = UiState.Success(epreuvesAVenir)
                } catch (e: Exception) {
                    _etudiantStats.value = UiState.Error(e.message ?: "Erreur")
                    _upcomingEpreuves.value = UiState.Error(e.message ?: "Erreur")
                }
            }
        }
    }

    fun refresh() = loadDashboard()
}
