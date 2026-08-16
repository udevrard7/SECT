package com.sect.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.app.ui.screens.corrections.CorrectionsUiState
import com.sect.shared.domain.model.Session
import com.sect.shared.domain.repository.SECTRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class CorrectionsViewModel(
    private val repository: SECTRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<CorrectionsUiState>(CorrectionsUiState.Loading)
    val uiState: StateFlow<CorrectionsUiState> = _uiState

    init {
        loadCorrections()
    }

    fun loadCorrections() {
        viewModelScope.launch {
            _uiState.value = CorrectionsUiState.Loading
            try {
                val sessions = repository.getSessionsACorriger()
                _uiState.value = CorrectionsUiState.Success(sessions)
            } catch (e: Exception) {
                _uiState.value = CorrectionsUiState.Error(e.message ?: "Erreur inconnue")
            }
        }
    }
}
