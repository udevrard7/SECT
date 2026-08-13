package com.sect.mobile.shared.presentation.state

import com.sect.mobile.shared.domain.model.Epreuve
import com.sect.mobile.shared.domain.model.SessionPassation
import com.sect.mobile.shared.domain.model.User

data class DashboardState(
    val user: User? = null,
    val upcomingEpreuves: UiState<List<Epreuve>> = UiState.Loading,
    val recentSessions: UiState<List<SessionPassation>> = UiState.Loading,
    val totalEpreuves: Int = 0,
    val enCours: Int = 0,
    val planifiees: Int = 0,
    val terminees: Int = 0,
    val isRefreshing: Boolean = false
)
