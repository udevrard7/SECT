package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.domain.model.Resultat
import com.sect.mobile.shared.domain.model.ResultatDetail
import com.sect.mobile.shared.domain.model.SessionResultat
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

    // SECT-MOBILE-PARITY-R1 : état du détail
    private val _detailState = MutableStateFlow<ResultatDetailUiState>(ResultatDetailUiState.Idle)
    val detailState: StateFlow<ResultatDetailUiState> = _detailState.asStateFlow()

    // SECT-MOBILE-PARITY-R2 : état du détail complet avec réponses
    private val _sessionState = MutableStateFlow<SessionDetailUiState>(SessionDetailUiState.Idle)
    val sessionState: StateFlow<SessionDetailUiState> = _sessionState.asStateFlow()

    init {
        loadResultats()
    }

    fun loadResultats() {
        viewModelScope.launch {
            try {
                _uiState.value = ResultatsUiState.Loading

                val resultats = repository.getResultatsEtudiant()
                val stats = try { repository.getStatsEtudiant() } catch (_: Exception) { null }
                _uiState.value = ResultatsUiState.Success(resultats, stats)
            } catch (e: Exception) {
                _uiState.value = ResultatsUiState.Error("Erreur: ${e.message}")
            }
        }
    }

    // SECT-MOBILE-PARITY-R1 : charger le détail d'un résultat par epreuveId
    fun loadResultatDetail(epreuveId: String) {
        _detailState.value = ResultatDetailUiState.Loading
        viewModelScope.launch {
            try {
                val detail = repository.getResultatDetail(epreuveId)
                if (detail != null) {
                    _detailState.value = ResultatDetailUiState.Success(detail)
                } else {
                    _detailState.value = ResultatDetailUiState.Error("Résultat introuvable")
                }
            } catch (e: Exception) {
                _detailState.value = ResultatDetailUiState.Error(e.message ?: "Erreur")
            }
        }
    }

    fun resetDetail() {
        _detailState.value = ResultatDetailUiState.Idle
    }

    // SECT-MOBILE-PARITY-R2 : charger le détail complet avec réponses par question
    fun loadSessionDetail(epreuveId: String) {
        _sessionState.value = SessionDetailUiState.Loading
        viewModelScope.launch {
            try {
                val session = repository.getSessionDetail(epreuveId)
                if (session != null) {
                    _sessionState.value = SessionDetailUiState.Success(session)
                } else {
                    _sessionState.value = SessionDetailUiState.Error("Session introuvable")
                }
            } catch (e: Exception) {
                _sessionState.value = SessionDetailUiState.Error(e.message ?: "Erreur")
            }
        }
    }

    fun resetSessionDetail() {
        _sessionState.value = SessionDetailUiState.Idle
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

// SECT-MOBILE-PARITY-R1 : état du détail d'un résultat
sealed class ResultatDetailUiState {
    object Idle : ResultatDetailUiState()
    object Loading : ResultatDetailUiState()
    data class Success(val detail: ResultatDetail) : ResultatDetailUiState()
    data class Error(val message: String) : ResultatDetailUiState()
}

// SECT-MOBILE-PARITY-R2 : état du détail complet avec réponses par question
sealed class SessionDetailUiState {
    object Idle : SessionDetailUiState()
    object Loading : SessionDetailUiState()
    data class Success(val session: SessionResultat) : SessionDetailUiState()
    data class Error(val message: String) : SessionDetailUiState()
}
