// SECT Mobile — DashboardViewModel (stats, raccourcis, épreuves à venir)
// SECT-MOBILE-FOCUS : adaptatif enseignant / étudiant
package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.Epreuve
import com.sect.mobile.shared.domain.model.User
import com.sect.mobile.shared.domain.enum.StatutEpreuve
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

    private val _upcomingEpreuves = MutableStateFlow<UiState<List<Epreuve>>>(UiState.Loading)
    val upcomingEpreuves: StateFlow<UiState<List<Epreuve>>> = _upcomingEpreuves.asStateFlow()

    private val _stats = MutableStateFlow(DashboardStats())
    val stats: StateFlow<DashboardStats> = _stats.asStateFlow()

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
     * - Épreuves EN_COURS (à surveiller)
     * - Épreuves PLANIFIEES (à venir)
     * - Stats (total, en cours, planifiées)
     */
    private suspend fun loadEnseignantDashboard() {
        coroutineScope {
            launch {
            try {
                val enCours = repository.listEpreuves(search = nil(), statut = "EN_COURS", filiereId = nil(), page = 1, limit = 10)
                val planifiees = repository.listEpreuves(search = nil(), statut = "PLANIFIEE", filiereId = nil(), page = 1, limit = 5)
                _upcomingEpreuves.value = UiState.Success(enCours + planifiees)
                _stats.value = DashboardStats(
                    totalEpreuves = enCours.size + planifiees.size,
                    enCours = enCours.size,
                    planifiees = planifiees.size,
                    terminees = 0
                )
            } catch (e: Exception) {
                _upcomingEpreuves.value = UiState.Error(e.message ?: "Erreur")
            }
            }
        }
    }

    /**
     * Dashboard étudiant :
     * - Épreuves à venir (PLANIFIEE / EN_COURS)
     * - Stats (à venir, terminées)
     */
    private suspend fun loadEtudiantDashboard() {
        coroutineScope {
            launch {
            try {
                val enCours = repository.listEpreuves(search = nil(), statut = "EN_COURS", filiereId = nil(), page = 1, limit = 10)
                val planifiees = repository.listEpreuves(search = nil(), statut = "PLANIFIEE", filiereId = nil(), page = 1, limit = 5)
                _upcomingEpreuves.value = UiState.Success(enCours + planifiees)
                _stats.value = DashboardStats(
                    totalEpreuves = enCours.size + planifiees.size,
                    enCours = enCours.size,
                    planifiees = planifiees.size,
                    terminees = 0
                )
            } catch (e: Exception) {
                _upcomingEpreuves.value = UiState.Error(e.message ?: "Erreur")
            }
            }
        }
    }

    fun refresh() = loadDashboard()

    /** Helper pour passer nil aux paramètres optionnels String? */
    private fun nil(): String? = null
}

data class DashboardStats(
    val totalEpreuves: Int = 0,
    val enCours: Int = 0,
    val planifiees: Int = 0,
    val terminees: Int = 0
)
