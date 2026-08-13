package com.sect.mobile.shared.presentation.viewmodel

import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.presentation.effect.AppEffect
import com.sect.mobile.shared.presentation.state.ProfileState
import com.sect.mobile.shared.presentation.state.UiState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

class ProfileViewModel(
    private val repository: SECTRepositoryInterface,
    private val scope: CoroutineScope
) {
    private val _state = MutableStateFlow(ProfileState())
    val state: StateFlow<ProfileState> = _state.asStateFlow()

    private val _effects = MutableSharedFlow<AppEffect>(extraBufferCapacity = 10)
    val effects = _effects.asSharedFlow()

    fun loadProfile() {
        scope.launch {
            _state.value = _state.value.copy(user = UiState.Loading)
            try {
                val user = repository.getCurrentUser()
                _state.value = _state.value.copy(user = UiState.Success(user))
            } catch (e: Exception) {
                _state.value = _state.value.copy(user = UiState.Error(e.message ?: "Erreur"))
            }
        }
    }

    fun changePassword(currentPassword: String, newPassword: String) {
        scope.launch {
            _state.value = _state.value.copy(isChangingPassword = true, error = null)
            try {
                repository.changePassword(currentPassword, newPassword)
                _state.value = _state.value.copy(
                    isChangingPassword = false,
                    passwordChangeSuccess = true
                )
                _effects.tryEmit(AppEffect.ShowToast("Mot de passe modifié avec succès"))
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isChangingPassword = false,
                    error = e.message
                )
            }
        }
    }
}
