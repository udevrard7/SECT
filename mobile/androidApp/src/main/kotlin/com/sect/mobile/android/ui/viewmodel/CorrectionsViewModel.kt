package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.repository.SECTRepository
import com.sect.mobile.shared.domain.model.Session
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class CorrectionsViewModel(
    private val repository: SECTRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<CorrectionsUiState>(CorrectionsUiState.Loading)
    val uiState: StateFlow<CorrectionsUiState> = _uiState.asStateFlow()

    init {
        loadSessions()
    }

    fun loadSessions() {
        viewModelScope.launch {
            try {
                _uiState.value = CorrectionsUiState.Loading
                // Récupérer les sessions à corriger (statut SOUMIS ou EN_CORRECTION)
                val sessions = repository.getSessionsACorriger()
                _uiState.value = CorrectionsUiState.Success(sessions)
            } catch (e: Exception) {
                _uiState.value = CorrectionsUiState.Error(
                    "Erreur lors du chargement des copies: ${e.message}"
                )
            }
        }
    }
}

sealed class CorrectionsUiState {
    object Loading : CorrectionsUiState()
    data class Success(val sessions: List<Session>) : CorrectionsUiState()
    data class Error(val message: String) : CorrectionsUiState()
}
