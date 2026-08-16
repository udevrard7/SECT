package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.android.ui.components.BadgeManager
import com.sect.mobile.shared.domain.model.CorrectionSession
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * ViewModel pour l'écran liste des copies à corriger (enseignant).
 * SECT-MOBILE-CORRECTION-1 : utilise désormais le vrai endpoint GET /api/correction
 * (au lieu du stub emptyList() précédent).
 */
class CorrectionsViewModel(
    private val repository: SECTRepositoryInterface,
    private val holder: CorrectionSessionHolder
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
                val sessions = repository.getSessionsACorriger()
                _uiState.value = CorrectionsUiState.Success(sessions)
                // SECT-MOBILE-NAV-PHASE-E : alimenter le badge dynamique
                val pending = sessions.count { !it.allCorrected }
                BadgeManager.setPendingCorrections(pending)
            } catch (e: Exception) {
                _uiState.value = CorrectionsUiState.Error(
                    "Erreur lors du chargement des copies: ${e.message}"
                )
            }
        }
    }

    /** Stocke la session sélectionnée pour le passage au détail. */
    fun selectSession(session: CorrectionSession) {
        holder.select(session)
    }
}

sealed class CorrectionsUiState {
    object Loading : CorrectionsUiState()
    data class Success(val sessions: List<CorrectionSession>) : CorrectionsUiState()
    data class Error(val message: String) : CorrectionsUiState()
}
