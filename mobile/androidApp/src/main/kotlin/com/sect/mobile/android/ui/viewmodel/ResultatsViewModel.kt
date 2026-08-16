package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.domain.model.Resultat
import com.sect.mobile.shared.domain.model.EtudiantStats
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ResultatsViewModel(
    private val repository: SECTRepositoryInterface
) : ViewModel() {

    private val _uiState = MutableStateFlow<ResultatsUiState>(ResultatsUiState.Loading)
    val uiState: StateFlow<ResultatsUiState> = _uiState.asStateFlow()

    init {
        loadResultats()
    }

    fun loadResultats() {
        viewModelScope.launch {
            try {
                _uiState.value = ResultatsUiState.Loading
                
                // Charger les résultats et les stats en parallèle
                val resultats = repository.getResultatsEtudiant()
                val stats = try {
                    repository.getStatsEtudiant()
                } catch (e: Exception) {
                    null // Stats optionnelles
                }
                
                _uiState.value = ResultatsUiState.Success(resultats, stats)
            } catch (e: Exception) {
                _uiState.value = ResultatsUiState.Error(
                    "Erreur lors du chargement des résultats: ${e.message}"
                )
            }
        }
    }
}

sealed class ResultatsUiState {
    object Loading : ResultatsUiState()
    data class Success(
        val resultats: List<Resultat>,
        val stats: EtudiantStats? = null
    ) : ResultatsUiState()
    data class Error(val message: String) : ResultatsUiState()
}
