package com.sect.mobile.shared.presentation.viewmodel

import com.sect.mobile.shared.domain.repository.AuthRepository
import com.sect.mobile.shared.presentation.action.AuthAction
import com.sect.mobile.shared.presentation.effect.AppEffect
import com.sect.mobile.shared.presentation.state.AuthState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

/**
 * Shared Auth ViewModel — pure MVI state machine.
 * Works on both Android (via Koin) and iOS (via KmpRepositoryProvider).
 */
class AuthViewModel(
    private val repository: AuthRepository,
    private val scope: CoroutineScope
) {
    private val _state = MutableStateFlow(AuthState())
    val state: StateFlow<AuthState> = _state.asStateFlow()

    private val _effects = MutableSharedFlow<AppEffect>(extraBufferCapacity = 10)
    val effects: SharedFlow<AppEffect> = _effects.asSharedFlow()

    fun handleAction(action: AuthAction) {
        when (action) {
            is AuthAction.CheckToken -> checkAuth()
            is AuthAction.Login -> login(action.identifier, action.password)
            is AuthAction.Logout -> logout()
            is AuthAction.RequestPasswordReset -> requestPasswordReset(action.email)
            is AuthAction.ChangePassword -> changePassword(action.current, action.new)
        }
    }

    private fun checkAuth() {
        scope.launch {
            _state.value = _state.value.copy(isCheckingToken = true)
            try {
                if (repository.isAuthenticated()) {
                    val user = repository.getCurrentUser()
                    _state.value = _state.value.copy(
                        isAuthenticated = true,
                        isCheckingToken = false,
                        currentUser = user,
                        error = null
                    )
                } else {
                    _state.value = _state.value.copy(
                        isAuthenticated = false,
                        isCheckingToken = false
                    )
                }
            } catch (e: Exception) {
                try {
                    val session = repository.refreshToken()
                    _state.value = _state.value.copy(
                        isAuthenticated = true,
                        isCheckingToken = false,
                        currentUser = session.user,
                        error = null
                    )
                } catch (_: Exception) {
                    _state.value = _state.value.copy(
                        isAuthenticated = false,
                        isCheckingToken = false
                    )
                }
            }
        }
    }

    private fun login(identifier: String, password: String) {
        scope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val session = repository.login(identifier, password)
                _state.value = _state.value.copy(
                    isAuthenticated = true,
                    isLoading = false,
                    currentUser = session.user,
                    error = null
                )
                _effects.tryEmit(AppEffect.NavigateTo("dashboard"))
            } catch (e: Exception) {
                val message = when {
                    e.message?.contains("401") == true -> "Identifiants incorrects"
                    e.message?.contains("423") == true -> "Compte temporairement verrouillé"
                    e.message?.contains("403") == true -> "Compte désactivé"
                    e.message?.contains("402") == true -> "Abonnement expiré"
                    else -> e.message ?: "Erreur de connexion"
                }
                _state.value = _state.value.copy(isLoading = false, error = message)
            }
        }
    }

    private fun logout() {
        scope.launch {
            try { repository.logout() } catch (_: Exception) { }
            _state.value = AuthState()
            _effects.tryEmit(AppEffect.NavigateTo("login"))
        }
    }

    private fun requestPasswordReset(email: String) {
        scope.launch {
            try {
                repository.requestPasswordReset(email)
                _effects.tryEmit(AppEffect.ShowToast("Email envoyé si le compte existe"))
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    private fun changePassword(current: String, new: String) {
        scope.launch {
            try {
                repository.changePassword(current, new)
                _effects.tryEmit(AppEffect.ShowToast("Mot de passe modifié"))
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }
}
