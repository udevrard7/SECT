// SECT Mobile — PassationViewModel (passation d'épreuve, auto-save, timer)
package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.Question
import com.sect.mobile.shared.domain.model.Reponse
import com.sect.mobile.shared.domain.model.SessionPassation
import com.sect.mobile.shared.domain.enum.TypeQuestion
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * ViewModel pour la passation d'une épreuve.
 *
 * Gère :
 * - Démarrage/récupération de session
 * - Timer compte à rebours
 * - Navigation entre questions
 * - Sauvegarde des réponses (auto-save toutes les 30s)
 * - Soumission finale
 * - Proctoring (alertes, fullscreen)
 */
class PassationViewModel(private val repository: SECTRepositoryInterface) : ViewModel() {

    // ── État de la session ──
    private val _session = MutableStateFlow<UiState<SessionPassation>>(UiState.Loading)
    val session: StateFlow<UiState<SessionPassation>> = _session.asStateFlow()

    // ── Timer ──
    private val _remainingSeconds = MutableStateFlow(0)
    val remainingSeconds: StateFlow<Int> = _remainingSeconds.asStateFlow()

    private val _isTimeWarning = MutableStateFlow(false)
    val isTimeWarning: StateFlow<Boolean> = _isTimeWarning.asStateFlow()

    // ── Navigation questions ──
    private val _currentQuestionIndex = MutableStateFlow(0)
    val currentQuestionIndex: StateFlow<Int> = _currentQuestionIndex.asStateFlow()

    // ── Réponses locales (modifiées par l'étudiant, pas encore sauvegardées) ──
    private val _localReponses = MutableStateFlow<Map<String, String>>(emptyMap())
    val localReponses: StateFlow<Map<String, String>> = _localReponses.asStateFlow()

    // ── Auto-save ──
    private val _lastSaveTime = MutableStateFlow(0L)
    val lastSaveTime: StateFlow<Long> = _lastSaveTime.asStateFlow()

    private val _isSaving = MutableStateFlow(false)
    val isSaving: StateFlow<Boolean> = _isSaving.asStateFlow()

    // ── Soumission ──
    private val _isSubmitting = MutableStateFlow(false)
    val isSubmitting: StateFlow<Boolean> = _isSubmitting.asStateFlow()

    private val _submitError = MutableStateFlow<String?>(null)
    val submitError: StateFlow<String?> = _submitError.asStateFlow()

    private var timerJob: Job? = null
    private var autoSaveJob: Job? = null

    /**
     * Démarrer ou récupérer une session de passation.
     */
    fun startSession(epreuveId: String) {
        viewModelScope.launch {
            _session.value = UiState.Loading
            try {
                val session = repository.startSession(epreuveId)
                _session.value = UiState.Success(session)

                // Démarrer le timer
                val durationSeconds = (session.epreuve?.duree ?: 0) * 60
                _remainingSeconds.value = durationSeconds
                startTimer()

                // Charger les réponses existantes (reprise de session)
                session.reponses?.forEach { reponse ->
                    reponse.contenu?.let { contenu ->
                        _localReponses.value = _localReponses.value + (reponse.questionId to contenu)
                    }
                }

                // Démarrer l'auto-save
                startAutoSave(session.id)
            } catch (e: Exception) {
                _session.value = UiState.Error(e.message ?: "Erreur lors du démarrage")
            }
        }
    }

    /**
     * Timer compte à rebours.
     */
    private fun startTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (isActive && _remainingSeconds.value > 0) {
                delay(1000)
                _remainingSeconds.value -= 1

                // Alerte quand il reste moins de 5 minutes
                _isTimeWarning.value = _remainingSeconds.value in 1..300
            }
            // Temps écoulé — auto-submit
            if (_remainingSeconds.value <= 0) {
                submitSession()
            }
        }
    }

    /**
     * Auto-save : sauvegarde les réponses toutes les 30 secondes.
     */
    private fun startAutoSave(sessionId: String) {
        autoSaveJob?.cancel()
        autoSaveJob = viewModelScope.launch {
            while (isActive) {
                delay(30_000) // 30 secondes
                saveAllReponses(sessionId)
            }
        }
    }

    /**
     * Sauvegarder la réponse à une question (locale + API).
     */
    fun onReponseChanged(questionId: String, contenu: String) {
        _localReponses.value = _localReponses.value + (questionId to contenu)

        // Sauvegarde immédiate sur l'API (debounced côté UI)
        val sessionId = (_session.value as? UiState.Success)?.data?.id ?: return
        viewModelScope.launch {
            try {
                repository.saveReponse(sessionId, questionId, contenu)
                _lastSaveTime.value = System.currentTimeMillis()
            } catch (_: Exception) {
                // L'auto-save retry à la prochaine itération
            }
        }
    }

    /**
     * Sauvegarder toutes les réponses en attente.
     */
    private suspend fun saveAllReponses(sessionId: String) {
        _isSaving.value = true
        try {
            for ((questionId, contenu) in _localReponses.value) {
                try {
                    repository.saveReponse(sessionId, questionId, contenu)
                } catch (_: Exception) { continue }
            }
            _lastSaveTime.value = System.currentTimeMillis()
        } finally {
            _isSaving.value = false
        }
    }

    /**
     * Naviguer à la question suivante.
     */
    fun nextQuestion(totalQuestions: Int) {
        if (_currentQuestionIndex.value < totalQuestions - 1) {
            _currentQuestionIndex.value += 1
        }
    }

    /**
     * Naviguer à la question précédente.
     */
    fun previousQuestion() {
        if (_currentQuestionIndex.value > 0) {
            _currentQuestionIndex.value -= 1
        }
    }

    /**
     * Naviguer à une question spécifique.
     */
    fun goToQuestion(index: Int) {
        _currentQuestionIndex.value = index
    }

    /**
     * Soumettre la session (fin de l'épreuve).
     */
    fun submitSession() {
        val sessionId = (_session.value as? UiState.Success)?.data?.id ?: return

        viewModelScope.launch {
            _isSubmitting.value = true
            _submitError.value = null

            // Sauvegarder toutes les réponses d'abord
            saveAllReponses(sessionId)

            try {
                val reponses = _localReponses.value.map { (questionId, contenu) ->
                    mapOf("questionId" to questionId, "contenu" to contenu)
                }
                repository.submitSession(sessionId, reponses)
                _session.value = UiState.Success(
                    (_session.value as UiState.Success).data.copy(
                        statut = com.sect.mobile.shared.domain.enum.StatutSession.SOUMISE
                    )
                )
            } catch (e: Exception) {
                _submitError.value = e.message ?: "Erreur lors de la soumission"
            } finally {
                _isSubmitting.value = false
                timerJob?.cancel()
                autoSaveJob?.cancel()
            }
        }
    }

    /**
     * Formater le temps restant en MM:SS.
     */
    fun formatTime(seconds: Int): String {
        val min = seconds / 60
        val sec = seconds % 60
        return "%02d:%02d".format(min, sec)
    }

    override fun onCleared() {
        super.onCleared()
        timerJob?.cancel()
        autoSaveJob?.cancel()
    }
}
