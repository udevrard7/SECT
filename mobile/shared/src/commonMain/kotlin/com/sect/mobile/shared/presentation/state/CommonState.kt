package com.sect.mobile.shared.presentation.state

/**
 * Generic UI state following MVI pattern.
 * Every screen goes through: Loading → Success(data) or Error(message)
 */
sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data class Error(val message: String, val code: Int? = null) : UiState<Nothing>
}
