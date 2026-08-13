// SECT Mobile — DashboardViewModel (stats, raccourcis, épreuves à venir)
package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.Epreuve
import com.sect.mobile.shared.domain.model.SessionPassation
import com.sect.mobile.shared.domain.model.User
import com.sect.mobile.shared.domain.enum.StatutEpreuve
import com.sect.mobile.shared.repository.SECTRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DashboardViewModel(private val repository: SECTRepository) : ViewModel() {

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()

    private val _upcomingEpreuves = MutableStateFlow<UiState<List<Epreuve>>>(UiState.Loading)
    val upcomingEpreuves: StateFlow<UiState<List<Epreuve>>> = _upcomingEpreuves.asStateFlow()

    private val _recentSessions = MutableStateFlow<UiState<List<SessionPassation>>>(UiState.Loading)
    val recentSessions: StateFlow<UiState<List<SessionPassation>>> = _recentSessions.asStateFlow()

    private val _stats = MutableStateFlow(DashboardStats())
    val stats: StateFlow<DashboardStats> = _stats.asStateFlow()

    init {
        loadDashboard()
    }

    fun loadDashboard() {
        viewModelScope.launch {
            // Charger l'utilisateur courant
            try {
                _user.value = repository.getCurrentUser()
            } catch (_: Exception) { }

            // Charger les épreuves à venir (PLANIFIEE ou EN_COURS)
            launch {
                try {
                    val epreuves = repository.listEpreuves(statut = "PLANIFIEE", limit = 5)
                    val enCours = repository.listEpreuves(statut = "EN_COURS", limit = 5)
                    _upcomingEpreuves.value = UiState.Success(epreuves + enCours)
                } catch (e: Exception) {
                    _upcomingEpreuves.value = UiState.Error(e.message ?: "Erreur")
                }
            }

            // Charger les sessions récentes (TODO: endpoint dédié)
            launch {
                try {
                    // Placeholder — l'API devra supporter un endpoint /api/me/sessions
                    _recentSessions.value = UiState.Success(emptyList())
                } catch (e: Exception) {
                    _recentSessions.value = UiState.Error(e.message ?: "Erreur")
                }
            }

            // Calculer les stats rapides
            launch {
                try {
                    val allEpreuves = repository.listEpreuves(limit = 100)
                    _stats.value = DashboardStats(
                        totalEpreuves = allEpreuves.size,
                        enCours = allEpreuves.count { it.statut == StatutEpreuve.EN_COURS },
                        planifiees = allEpreuves.count { it.statut == StatutEpreuve.PLANIFIEE },
                        terminees = allEpreuves.count { it.statut == StatutEpreuve.TERMINEE }
                    )
                } catch (_: Exception) { }
            }
        }
    }

    fun refresh() = loadDashboard()
}

data class DashboardStats(
    val totalEpreuves: Int = 0,
    val enCours: Int = 0,
    val planifiees: Int = 0,
    val terminees: Int = 0
)
