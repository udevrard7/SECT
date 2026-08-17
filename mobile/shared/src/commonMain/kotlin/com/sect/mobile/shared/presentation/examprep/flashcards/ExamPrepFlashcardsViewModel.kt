// SECT Mobile — ExamPrepFlashcardsViewModel (gestion flashcards)
// SECT-EXAMPREP-CONTRACT-F1
//
// Flashcard → ReviewItem SRS est best-effort côté backend : si la création
// du ReviewItem échoue, la flashcard reste créée.
package com.sect.mobile.shared.presentation.examprep.flashcards

import com.sect.mobile.shared.domain.model.examprep.Flashcard
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ExamPrepFlashcardsState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val flashcards: List<Flashcard> = emptyList(),
    val documentId: String? = null,
    val isCreating: Boolean = false,
    val lastCreated: Flashcard? = null
)

class ExamPrepFlashcardsViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepFlashcardsState())
    val state: StateFlow<ExamPrepFlashcardsState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        launch {
            val cards = repository.listFlashcards(_state.value.documentId)
            _state.value = _state.value.copy(isLoading = false, flashcards = cards)
        }
    }

    fun setDocument(documentId: String?) {
        _state.value = _state.value.copy(documentId = documentId)
        load()
    }

    fun createFromSelection(documentId: String, selectedText: String, chapterId: String? = null) {
        if (selectedText.isBlank()) return
        _state.value = _state.value.copy(isCreating = true, error = null)
        launch {
            try {
                // Limité à 4000 caractères côté backend
                val card = repository.createFlashcard(documentId, selectedText.take(4000), chapterId)
                _state.value = _state.value.copy(isCreating = false, lastCreated = card)
                load() // recharger la liste
            } catch (e: Exception) {
                _state.value = _state.value.copy(isCreating = false, error = e.message)
            }
        }
    }

    fun delete(id: String) {
        launch {
            try {
                repository.deleteFlashcard(id)
                load()
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    override fun onError(error: Exception) {
        _state.value = _state.value.copy(isLoading = false, error = error.message)
    }
}
