package com.sect.mobile.shared.presentation.effect

/**
 * One-shot side effects that should be consumed only once.
 * Examples: navigation, showing a toast, triggering haptic feedback.
 */
sealed interface AppEffect {
    data class ShowToast(val message: String) : AppEffect
    data class NavigateTo(val route: String) : AppEffect
    data object NavigateBack : AppEffect
    data class ShowError(val message: String) : AppEffect
    data class ShowSnackbar(val message: String, val action: String? = null) : AppEffect
}
