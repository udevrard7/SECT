// SECT Mobile — UI State générique (loading/success/error)
package com.sect.mobile.android.ui.viewmodel

/**
 * Représente l'état d'un écran de manière type-safe.
 * Chaque écran passe par 3 phases : Chargement → Succès (données) ou Erreur
 */
sealed interface UiState<out T> {
    /** Écran en cours de chargement */
    data object Loading : UiState<Nothing>

    /** Données chargées avec succès */
    data class Success<T>(val data: T) : UiState<T>

    /** Erreur survenue */
    data class Error(val message: String, val code: Int? = null) : UiState<Nothing>
}

/**
 * État d'authentification de l'application
 */
sealed interface AuthState {
    data object CheckingToken : AuthState
    data object Unauthenticated : AuthState
    data class Authenticated(val userId: String, val role: String, val userName: String) : AuthState
    data class Error(val message: String) : AuthState
}
