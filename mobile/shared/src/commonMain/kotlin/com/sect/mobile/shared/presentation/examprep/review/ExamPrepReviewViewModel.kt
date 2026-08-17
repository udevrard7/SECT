// SECT Mobile — ExamPrepReviewViewModel (révision SRS spaced repetition)
// SECT-EXAMPREP-CONTRACT-F1
//
// Le mobile ne calcule PAS le SRS. Il envoie juste quality (0-5) et le backend
// met à jour le ReviewItem (interval, easeFactor, nextReviewAt).
package com.sect.mobile.shared.presentation.examprep.review

import com.sect.mobile.shared.domain.model.examprep.ReviewItem
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

data class ExamPrepReviewState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val reviewItems: List<ReviewItem> = emptyList(),
    val documentId: String? = null,
    val dueOnly: Boolean = true,
    val lastReviewedId: String? = null
) {
    /** Items dus aujourd'hui. */
    val dueItems: List<ReviewItem>
        get() = if (dueOnly) reviewItems.filter { it.nextReviewAt == null || isDue(it.nextReviewAt) }
                else reviewItems
}

/** Vérifie si une date ISO est due (passée ou null). */
private fun isDue(nextReviewAt: String?): Boolean {
    if (nextReviewAt == null) return true
    return try {
        val now = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).toString()
        nextReviewAt <= now
    } catch (_: Exception) {
        true // En cas d'erreur de parsing, on considère comme dû
    }
}

class ExamPrepReviewViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepReviewState())
    val state: StateFlow<ExamPrepReviewState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        launch {
            val items = repository.listReviewItems(_state.value.documentId, _state.value.dueOnly)
            _state.value = _state.value.copy(isLoading = false, reviewItems = items)
        }
    }

    fun setDocument(documentId: String?) {
        _state.value = _state.value.copy(documentId = documentId)
        load()
    }

    fun toggleDueOnly() {
        _state.value = _state.value.copy(dueOnly = !_state.value.dueOnly)
        load()
    }

    /**
     * Marque un item comme révisé avec une qualité (0-5, algorithme SM-2).
     * quality : 0=oubli total, 3=difficile, 5=parfait.
     * Le backend calcule le prochain intervalle.
     */
    fun markReviewed(reviewItemId: String, quality: Int) {
        launch {
            try {
                repository.markReviewed(reviewItemId, quality)
                _state.value = _state.value.copy(lastReviewedId = reviewItemId)
                // Recharger la liste pour refléter le nouvel interval
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
