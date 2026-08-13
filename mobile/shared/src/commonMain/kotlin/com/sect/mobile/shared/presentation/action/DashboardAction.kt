package com.sect.mobile.shared.presentation.action

sealed interface DashboardAction {
    data object Load : DashboardAction
    data object Refresh : DashboardAction
}
