// SECT Mobile — ProfileViewModel (profil utilisateur, changement mot de passe)
package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.User
import com.sect.mobile.shared.repository.SECTRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ProfileViewModel(private val repository: SECTRepository) : ViewModel() {

    private val _user = MutableStateFlow<UiState<User>>(UiState.Loading)
    val user: StateFlow<UiState<User>> = _user.asStateFlow()

    private val _isChangingPassword = MutableStateFlow(false)
    val isChangingPassword: StateFlow<Boolean> = _isChangingPassword.asStateFlow()

    private val _passwordError = MutableStateFlow<String?>(null)
    val passwordError: StateFlow<String?> = _passwordError.asStateFlow()

    private val _passwordSuccess = MutableStateFlow(false)
    val passwordSuccess: StateFlow<Boolean> = _passwordSuccess.asStateFlow()

    init {
        loadProfile()
    }

    fun loadProfile() {
        viewModelScope.launch {
            _user.value = UiState.Loading
            try {
                val user = repository.getCurrentUser()
                _user.value = UiState.Success(user)
            } catch (e: Exception) {
                _user.value = UiState.Error(e.message ?: "Erreur")
            }
        }
    }

    fun changePassword(currentPassword: String, newPassword: String) {
        viewModelScope.launch {
            _isChangingPassword.value = true
            _passwordError.value = null
            _passwordSuccess.value = false
            try {
                repository.changePassword(currentPassword, newPassword)
                _passwordSuccess.value = true
            } catch (e: Exception) {
                _passwordError.value = e.message ?: "Erreur"
            } finally {
                _isChangingPassword.value = false
            }
        }
    }

    fun refresh() = loadProfile()
}
