// SECT Mobile — AuthViewModel (login, logout, token refresh, biometric)
package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.AuthSession
import com.sect.mobile.shared.domain.model.User
import com.sect.mobile.shared.repository.SECTRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * ViewModel pour l'authentification.
 * Gère : login, logout, refresh token, vérification initiale.
 *
 * Flux :
 * 1. App launch → checkAuth() → vérifie le token en cache
 * 2. Si token valide → AuthState.Authenticated
 * 3. Si token expiré → refresh automatique → si échec → Unauthenticated
 * 4. Login → credentials → API → cache tokens → Authenticated
 * 5. Logout → révoque refresh token → clear cache → Unauthenticated
 */
class AuthViewModel(private val repository: SECTRepository) : ViewModel() {

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
     * Vérifie si l'utilisateur est déjà authentifié (token en cache).
     * Appelé au lancement de l'app pour décider entre Login et Dashboard.
     */
    fun checkAuth() {
        viewModelScope.launch {
            _authState.value = AuthState.CheckingToken
            try {
                if (repository.isAuthenticated()) {
                    val user = repository.getCurrentUser()
                    _currentUser.value = user
                    _authState.value = AuthState.Authenticated(
                        userId = user.id,
                        role = user.role.name,
                        userName = user.name
                    )
                } else {
                    _authState.value = AuthState.Unauthenticated
                }
            } catch (e: Exception) {
                // Token expiré, tenter un refresh
                try {
                    val session = repository.refreshToken()
                    _currentUser.value = session.user
                    _authState.value = AuthState.Authenticated(
                        userId = session.user.id,
                        role = session.user.role.name,
                        userName = session.user.name
                    )
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
                _authState.value = AuthState.Authenticated(
                    userId = session.user.id,
                    role = session.user.role.name,
                    userName = session.user.name
                )
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
     * Demander un reset de mot de passe.
     */
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

    /**
     * Logout complet.
     */
    fun logout() {
        viewModelScope.launch {
            try {
                repository.logout()
            } catch (_: Exception) {
                // Même si le logout API échoue, on clear le cache local
            } finally {
                _currentUser.value = null
                _authState.value = AuthState.Unauthenticated
            }
        }
    }

    /**
     * Changer le mot de passe (utilisateur connecté).
     */
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
