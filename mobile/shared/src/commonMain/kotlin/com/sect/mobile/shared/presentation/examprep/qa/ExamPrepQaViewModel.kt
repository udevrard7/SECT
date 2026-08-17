// SECT Mobile — ExamPrepQaViewModel (Q&A RAG - question/réponse IA)
// SECT-EXAMPREP-CONTRACT-F1
//
// API simple : POST /qa → réponse directe. citations vide en V1 (future V2).
// On garde la conversation légère (pas de persistance côté mobile).
package com.sect.mobile.shared.presentation.examprep.qa

import com.sect.mobile.shared.domain.model.examprep.QAResponse
import com.sect.mobile.shared.domain.model.examprep.QAState
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ExamPrepQAState(
    val documentId: String? = null,
    val currentQuestion: String = "",
    val qaState: QAState = QAState.Idle,
    val history: List<QAHistoryItem> = emptyList()
)

data class QAHistoryItem(
    val question: String,
    val response: QAResponse,
    val timestamp: String
)

class ExamPrepQaViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepQAState())
    val state: StateFlow<ExamPrepQAState> = _state.asStateFlow()

    fun setDocument(documentId: String) {
        _state.value = _state.value.copy(documentId = documentId)
    }

    fun onQuestionChange(question: String) {
        _state.value = _state.value.copy(currentQuestion = question)
    }

    /**
     * Pose la question courante à l'IA (RAG sur le document).
     */
    fun ask() {
        val docId = _state.value.documentId ?: return
        val question = _state.value.currentQuestion.trim()
        if (question.isBlank()) return

        _state.value = _state.value.copy(qaState = QAState.Loading)
        launch {
            try {
                val response = repository.askQuestion(docId, question)
                _state.value = _state.value.copy(
                    qaState = QAState.Success(response),
                    history = _state.value.history + QAHistoryItem(question, response, nowIso()),
                    currentQuestion = ""
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(qaState = QAState.Error(e.message ?: "Erreur IA"))
            }
        }
    }

    fun reset() {
        _state.value = _state.value.copy(qaState = QAState.Idle, currentQuestion = "")
    }

    fun clearHistory() {
        _state.value = _state.value.copy(history = emptyList())
    }

    override fun onError(error: Exception) {
        _state.value = _state.value.copy(qaState = QAState.Error(error.message ?: "Erreur"))
    }
}

/** Timestamp ISO simple basé sur Clock.System. */
private fun nowIso(): String =
    kotlinx.datetime.Clock.System.now().toString()
