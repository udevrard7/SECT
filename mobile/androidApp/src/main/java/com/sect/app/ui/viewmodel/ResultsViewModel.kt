package com.sect.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.app.ui.screens.results.ResultsUiState
import com.sect.shared.domain.model.Resultat
import com.sect.shared.domain.repository.SECTRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class ResultsViewModel(
    private val repository: SECTRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<ResultsUiState>(ResultsUiState.Loading)
    val uiState: StateFlow<ResultsUiState> = _uiState

    init {
        loadResults()
    }

    fun loadResults() {
        viewModelScope.launch {
            _uiState.value = ResultsUiState.Loading
            try {
                val resultats = repository.getResultatsEtudiant()
                _uiState.value = ResultsUiState.Success(resultats)
            } catch (e: Exception) {
                _uiState.value = ResultsUiState.Error(e.message ?: "Erreur inconnue")
            }
        }
    }
}
