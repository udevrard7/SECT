package com.sect.mobile.shared.presentation.viewmodel

import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.presentation.action.DashboardAction
import com.sect.mobile.shared.presentation.effect.AppEffect
import com.sect.mobile.shared.presentation.state.DashboardState
import com.sect.mobile.shared.presentation.state.UiState
import com.sect.mobile.shared.domain.enum.StatutEpreuve
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

class DashboardViewModel(
    private val repository: SECTRepositoryInterface,
    private val scope: CoroutineScope
) {
    private val _state = MutableStateFlow(DashboardState())
    val state: StateFlow<DashboardState> = _state.asStateFlow()

    private val _effects = MutableSharedFlow<AppEffect>(extraBufferCapacity = 10)
    val effects = _effects.asSharedFlow()

    fun handleAction(action: DashboardAction) {
        when (action) {
            DashboardAction.Load -> loadDashboard()
            DashboardAction.Refresh -> refresh()
        }
    }

    private fun loadDashboard() {
        scope.launch {
            try {
                _state.value = _state.value.copy(user = repository.getCurrentUser())
            } catch (_: Exception) { }

            launch {
                try {
                    val planifiees = repository.listEpreuves(statut = "PLANIFIEE", limit = 5)
                    val enCours = repository.listEpreuves(statut = "EN_COURS", limit = 5)
                    _state.value = _state.value.copy(
                        upcomingEpreuves = UiState.Success(planifiees + enCours)
                    )
                } catch (e: Exception) {
                    _state.value = _state.value.copy(
                        upcomingEpreuves = UiState.Error(e.message ?: "Erreur")
                    )
                }
            }

            launch {
                try {
                    val all = repository.listEpreuves(limit = 100)
                    _state.value = _state.value.copy(
                        totalEpreuves = all.size,
                        enCours = all.count { it.statut == StatutEpreuve.EN_COURS },
                        planifiees = all.count { it.statut == StatutEpreuve.PLANIFIEE },
                        terminees = all.count { it.statut == StatutEpreuve.TERMINEE }
                    )
                } catch (_: Exception) { }
            }
        }
    }

    private fun refresh() {
        _state.value = _state.value.copy(isRefreshing = true)
        loadDashboard()
        _state.value = _state.value.copy(isRefreshing = false)
    }
}
