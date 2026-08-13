package com.sect.mobile.shared.presentation.viewmodel

import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.presentation.action.PassationAction
import com.sect.mobile.shared.presentation.effect.AppEffect
import com.sect.mobile.shared.presentation.state.PassationState
import com.sect.mobile.shared.presentation.state.UiState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

class PassationViewModel(
    private val repository: SECTRepositoryInterface,
    private val scope: CoroutineScope
) {
    private val _state = MutableStateFlow(PassationState())
    val state: StateFlow<PassationState> = _state.asStateFlow()

    private val _effects = MutableSharedFlow<AppEffect>(extraBufferCapacity = 10)
    val effects = _effects.asSharedFlow()

    private var timerJob: kotlinx.coroutines.Job? = null
    private var autoSaveJob: kotlinx.coroutines.Job? = null
    private var currentSessionId: String? = null

    fun handleAction(action: PassationAction) {
        when (action) {
            is PassationAction.StartSession -> startSession(action.epreuveId)
            is PassationAction.OnReponseChanged -> onReponseChanged(action.questionId, action.contenu)
            PassationAction.NextQuestion -> nextQuestion()
            PassationAction.PreviousQuestion -> previousQuestion()
            PassationAction.SubmitSession -> submitSession()
            is PassationAction.GoToQuestion -> goToQuestion(action.index)
        }
    }

    private fun startSession(epreuveId: String) {
        scope.launch {
            _state.value = _state.value.copy(session = UiState.Loading)
            try {
                val session = repository.startSession(epreuveId)
                currentSessionId = session.id
                val epreuve = session.epreuve
                val questions = epreuve?.questions?.sortedBy { it.ordre } ?: emptyList()
                val existingReponses = session.reponses?.associate { it.questionId to (it.contenu ?: "") } ?: emptyMap()
                val totalSeconds = session.tempsRestant?.takeIf { it > 0 } ?: (epreuve?.duree?.times(60) ?: 0)

                _state.value = _state.value.copy(
                    session = UiState.Success(session),
                    epreuve = epreuve,
                    questions = questions,
                    localReponses = existingReponses,
                    remainingSeconds = totalSeconds,
                    isTimerRunning = true,
                    isSessionComplete = false
                )
                startTimer()
                startAutoSave()
            } catch (e: Exception) {
                _state.value = _state.value.copy(session = UiState.Error(e.message ?: "Erreur"))
            }
        }
    }

    private fun onReponseChanged(questionId: String, contenu: String) {
        _state.value = _state.value.copy(
            localReponses = _state.value.localReponses + (questionId to contenu)
        )
    }

    private fun nextQuestion() {
        val current = _state.value.currentQuestionIndex
        if (current < _state.value.questions.size - 1) {
            _state.value = _state.value.copy(currentQuestionIndex = current + 1)
        }
    }

    private fun previousQuestion() {
        val current = _state.value.currentQuestionIndex
        if (current > 0) {
            _state.value = _state.value.copy(currentQuestionIndex = current - 1)
        }
    }

    private fun goToQuestion(index: Int) {
        if (index in _state.value.questions.indices) {
            _state.value = _state.value.copy(currentQuestionIndex = index)
        }
    }

    private fun submitSession() {
        scope.launch {
            _state.value = _state.value.copy(isSubmitting = true)
            try {
                val sessionId = currentSessionId ?: return@launch
                val reponses = _state.value.localReponses.map { (qId, contenu) ->
                    mapOf("questionId" to qId, "contenu" to contenu)
                }
                val result = repository.submitSession(sessionId, reponses)
                _state.value = _state.value.copy(
                    session = UiState.Success(result),
                    isSubmitting = false,
                    isSessionComplete = true,
                    isTimerRunning = false
                )
                stopTimer()
                stopAutoSave()
                _effects.tryEmit(AppEffect.NavigateTo("results"))
            } catch (e: Exception) {
                _state.value = _state.value.copy(isSubmitting = false)
                _effects.tryEmit(AppEffect.ShowError(e.message ?: "Erreur de soumission"))
            }
        }
    }

    private fun startTimer() {
        timerJob = scope.launch {
            while (_state.value.remainingSeconds > 0) {
                delay(1000)
                val newSeconds = _state.value.remainingSeconds - 1
                _state.value = _state.value.copy(
                    remainingSeconds = newSeconds,
                    isTimeWarning = newSeconds < 300
                )
                if (newSeconds <= 0) {
                    _state.value = _state.value.copy(isTimerRunning = false)
                    submitSession()
                    break
                }
            }
        }
    }

    private fun stopTimer() {
        timerJob?.cancel()
        timerJob = null
    }

    private fun startAutoSave() {
        autoSaveJob = scope.launch {
            while (true) {
                delay(30_000)
                val sessionId = currentSessionId ?: break
                for ((qId, contenu) in _state.value.localReponses) {
                    try { repository.saveReponse(sessionId, qId, contenu) } catch (_: Exception) { }
                }
            }
        }
    }

    private fun stopAutoSave() {
        autoSaveJob?.cancel()
        autoSaveJob = null
    }

    fun formatTime(seconds: Int): String {
        val min = seconds / 60
        val sec = seconds % 60
        return String.format("%02d:%02d", min, sec)
    }

    fun cleanup() {
        stopTimer()
        stopAutoSave()
    }
}
