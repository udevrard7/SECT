// SECT Mobile — ExamPrepReaderViewModel (lecteur de cours + hub pédagogique)
// SECT-EXAMPREP-CONTRACT-F1
//
// Le Reader n'est pas qu'un lecteur : c'est un hub où l'étudiant sélectionne
// du texte et peut : demander à l'IA (Q&A) ou créer une flashcard.
package com.sect.mobile.shared.presentation.examprep.reader

import com.sect.mobile.shared.domain.model.examprep.*
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ExamPrepReaderState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val document: ExamPrepReaderDocument? = null,
    val selectedText: String = "",
    val showFlashcardDialog: Boolean = false,
    val showQADialog: Boolean = false,
    val flashcardCreated: Boolean = false,
    val qaState: QAState = QAState.Idle
)

class ExamPrepReaderViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepReaderState())
    val state: StateFlow<ExamPrepReaderState> = _state.asStateFlow()

    fun loadDocument(documentId: String) {
        _state.value = _state.value.copy(isLoading = true, error = null)
        launch {
            val doc = repository.readDocument(documentId)
            _state.value = _state.value.copy(isLoading = false, document = doc)
        }
    }

    fun onTextSelected(text: String) {
        _state.value = _state.value.copy(selectedText = text)
    }

    fun showFlashcardDialog() {
        _state.value = _state.value.copy(showFlashcardDialog = true)
    }

    fun hideFlashcardDialog() {
        _state.value = _state.value.copy(showFlashcardDialog = false, flashcardCreated = false)
    }

    fun showQADialog() {
        _state.value = _state.value.copy(showQADialog = true)
    }

    fun hideQADialog() {
        _state.value = _state.value.copy(showQADialog = false, qaState = QAState.Idle)
    }

    /**
     * Crée une flashcard à partir du texte sélectionné.
     * Le backend génère recto/verso via IA + crée le ReviewItem SRS (best-effort).
     */
    fun createFlashcardFromSelection(documentId: String, chapterId: String? = null) {
        val selected = _state.value.selectedText
        if (selected.isBlank()) return
        launch {
            _state.value = _state.value.copy(flashcardCreated = false)
            try {
                repository.createFlashcard(documentId, selected.take(4000), chapterId)
                _state.value = _state.value.copy(flashcardCreated = true, selectedText = "")
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    /**
     * Pose une question à l'IA sur le document (RAG).
     */
    fun askQuestion(documentId: String, question: String) {
        if (question.isBlank()) return
        launch {
            _state.value = _state.value.copy(qaState = QAState.Loading)
            try {
                val response = repository.askQuestion(documentId, question)
                _state.value = _state.value.copy(qaState = QAState.Success(response))
            } catch (e: Exception) {
                _state.value = _state.value.copy(qaState = QAState.Error(e.message ?: "Erreur IA"))
            }
        }
    }

    override fun onError(error: Exception) {
        _state.value = _state.value.copy(isLoading = false, error = error.message)
    }
}
