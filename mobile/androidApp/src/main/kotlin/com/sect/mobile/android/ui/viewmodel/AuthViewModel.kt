// SECT Mobile — AuthViewModel (login, logout, token refresh, biometric)
// SECT-MOBILE-FOCUS : l'app mobile est réservée aux ENSEIGNANT et ETUDIANT.
// Les ADMIN et RESPONSABLE sont redirigés vers l'interface web.
package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.AuthSession
import com.sect.mobile.shared.domain.model.User
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.notification.PushSubscriptionManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class AuthViewModel(
    private val repository: SECTRepositoryInterface,
    private val pushSubscriptionManager: PushSubscriptionManager
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.CheckingToken)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    private val _loginError = MutableStateFlow<String?>(null)
    val loginError: StateFlow<String?> = _loginError.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        checkAuth()
    }

    /**
     * Vérifie si l'utilisateur est déjà authentifié.
     * Si ADMIN/RESPONSABLE → RedirectToWeb (l'app est réservée enseignant/étudiant)
     */
    fun checkAuth() {
        viewModelScope.launch {
            _authState.value = AuthState.CheckingToken
            try {
                if (repository.isAuthenticated()) {
                    val user = repository.getCurrentUser()
                    _currentUser.value = user
                    handleAuthSuccess(user)
                } else {
                    _authState.value = AuthState.Unauthenticated
                }
            } catch (e: Exception) {
                try {
                    val session = repository.refreshToken()
                    _currentUser.value = session.user
                    handleAuthSuccess(session.user)
                } catch (_: Exception) {
                    _authState.value = AuthState.Unauthenticated
                }
            }
        }
    }

    /**
     * Login avec email/matricule + mot de passe.
     */
    fun login(identifier: String, password: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _loginError.value = null
            try {
                val session = repository.login(identifier, password)
                _currentUser.value = session.user
                handleAuthSuccess(session.user)
            } catch (e: Exception) {
                val message = when {
                    e.message?.contains("401") == true -> "Identifiants incorrects"
                    e.message?.contains("423") == true -> "Compte temporairement verrouillé"
                    e.message?.contains("403") == true -> "Compte désactivé"
                    e.message?.contains("402") == true -> "Abonnement expiré — veuillez renouveler"
                    else -> e.message ?: "Erreur de connexion"
                }
                _loginError.value = message
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Détermine l'état après authentification réussie.
     * - ENSEIGNANT / ETUDIANT → Authenticated (accès app mobile)
     * - ADMIN / RESPONSABLE → RedirectToWeb (redirigé vers sect-app.vercel.app)
     */
    private fun handleAuthSuccess(user: User) {
        val role = user.role
        if (role.name == "ADMIN" || role.name == "RESPONSABLE") {
            _authState.value = AuthState.RedirectToWeb(
                userName = user.name,
                role = role.name
            )
        } else {
            _authState.value = AuthState.Authenticated(
                userId = user.id,
                role = role.name,
                userName = user.name
            )
            // Push subscriptions seulement pour enseignant/étudiant
            pushSubscriptionManager.onUserLoggedIn(user)
        }
    }

    fun requestPasswordReset(email: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            try {
                repository.requestPasswordReset(email)
                onSuccess()
            } catch (e: Exception) {
                _loginError.value = e.message ?: "Erreur lors de la demande"
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            try {
                repository.logout()
            } catch (_: Exception) {
            } finally {
                pushSubscriptionManager.onUserLoggedOut()
                _currentUser.value = null
                _authState.value = AuthState.Unauthenticated
            }
        }
    }

    fun changePassword(currentPassword: String, newPassword: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            try {
                repository.changePassword(currentPassword, newPassword)
                onSuccess()
            } catch (e: Exception) {
                _loginError.value = e.message ?: "Erreur lors du changement"
            }
        }
    }
}
