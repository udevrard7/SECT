package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.CorrectionReponse
import com.sect.mobile.shared.domain.model.CorrectionSession
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Holder partagé pour passer la session sélectionnée de la liste vers le détail.
 *
 * Le backend n'expose pas de GET /api/correction/{sessionId} (uniquement la liste),
 * donc on ne peut pas re-fetcher la session par ID dans l'écran détail. Ce holder
 * permet de transmettre l'objet CorrectionSession via une StateFlow Koin-scoped.
 */
class CorrectionSessionHolder {
    private val _selected = MutableStateFlow<CorrectionSession?>(null)
    val selected: StateFlow<CorrectionSession?> = _selected.asStateFlow()

    fun select(session: CorrectionSession) {
        _selected.value = session
    }

    fun updateSession(updated: CorrectionSession) {
        _selected.value = updated
    }

    fun clear() {
        _selected.value = null
    }
}

/**
 * ViewModel pour l'écran détail de correction (notation question par question).
 *
 * Actions :
 * - saveGrade(questionId, score, commentaire) → PATCH /api/correction/{sessionId}/ai-grade
 * - finalize() → PATCH .../ai-grade { finalizeAll: true }
 * - retourner() → POST /api/correction/{sessionId}/retourner
 */
class CorrectionDetailViewModel(
    private val repository: SECTRepositoryInterface,
    private val holder: CorrectionSessionHolder
) : ViewModel() {

    val session: StateFlow<CorrectionSession?> = holder.selected

    private val _saveState = MutableStateFlow<SaveState>(SaveState.Idle)
    val saveState: StateFlow<SaveState> = _saveState.asStateFlow()

    private val _finalizeState = MutableStateFlow<FinalizeState>(FinalizeState.Idle)
    val finalizeState: StateFlow<FinalizeState> = _finalizeState.asStateFlow()

    /**
     * Sauver la note d'une question.
     * Met à jour localement la session dans le holder pour un feedback immédiat.
     */
    fun saveGrade(questionId: String, score: Double?, commentaire: String?) {
        val current = session.value ?: return
        viewModelScope.launch {
            _saveState.value = SaveState.Saving
            try {
                repository.saveGrade(current.id, questionId, score, commentaire)
                // Mettre à jour la réponse localement
                val updatedReponses = current.reponses.map { r ->
                    if (r.questionId == questionId) {
                        r.copy(score = score, commentaire = commentaire)
                    } else r
                }
                val allCorrected = updatedReponses.all { it.score != null }
                holder.updateSession(
                    current.copy(
                        reponses = updatedReponses,
                        allCorrected = allCorrected,
                        needsCorrectionCount = updatedReponses.count { it.score == null }
                    )
                )
                _saveState.value = SaveState.Saved
            } catch (e: Exception) {
                _saveState.value = SaveState.Error(e.message ?: "Erreur lors de la sauvegarde")
            }
        }
    }

    /**
     * Finaliser la correction (calcule le score final, marque CORRIGEE).
     */
    fun finalize() {
        val current = session.value ?: return
        viewModelScope.launch {
            _finalizeState.value = FinalizeState.Processing
            try {
                repository.finalizeCorrectionSession(current.id)
                holder.updateSession(current.copy(statut = "CORRIGEE"))
                _finalizeState.value = FinalizeState.Done
            } catch (e: Exception) {
                _finalizeState.value = FinalizeState.Error(e.message ?: "Erreur lors de la finalisation")
            }
        }
    }

    /**
     * Retourner la copie à l'étudiant (statut RETOURNEE + notification).
     */
    fun retourner(onSuccess: () -> Unit) {
        val current = session.value ?: return
        viewModelScope.launch {
            _finalizeState.value = FinalizeState.Processing
            try {
                repository.retournerCorrectionSession(current.id)
                holder.updateSession(current.copy(statut = "RETOURNEE"))
                _finalizeState.value = FinalizeState.Done
                onSuccess()
            } catch (e: Exception) {
                _finalizeState.value = FinalizeState.Error(e.message ?: "Erreur lors du retour")
            }
        }
    }

    fun resetSaveState() { _saveState.value = SaveState.Idle }
    fun resetFinalizeState() { _finalizeState.value = FinalizeState.Idle }
}

sealed class SaveState {
    object Idle : SaveState()
    object Saving : SaveState()
    object Saved : SaveState()
    data class Error(val message: String) : SaveState()
}

sealed class FinalizeState {
    object Idle : FinalizeState()
    object Processing : FinalizeState()
    object Done : FinalizeState()
    data class Error(val message: String) : FinalizeState()
}
