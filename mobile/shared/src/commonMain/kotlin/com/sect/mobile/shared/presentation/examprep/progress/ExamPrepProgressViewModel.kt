// SECT Mobile — ExamPrepProgressViewModel (analytics de progression)
// SECT-EXAMPREP-CONTRACT-F1
package com.sect.mobile.shared.presentation.examprep.progress

import com.sect.mobile.shared.domain.model.examprep.ExamPrepDashboard
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ExamPrepProgressState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val dashboard: ExamPrepDashboard? = null,
    val documentId: String? = null
) {
    val hasData: Boolean get() = dashboard != null

    /** Score moyen en %. */
    val averageScorePercent: Int get() = ((dashboard?.scoreMoyen ?: 0.0) * 100).toInt()

    /** Taux de réussite. */
    val successRate: Int get() = dashboard?.tauxReussite ?: 0

    /** Temps de révision formaté (ex: "1h 30min"). */
    val revisionTimeFormatted: String
        get() {
            val sec = dashboard?.tempsRevision ?: 0
            val h = sec / 3600
            val m = (sec % 3600) / 60
            return if (h > 0) "${h}h ${m}min" else "${m}min"
        }

    /** Total tentatives. */
    val totalAttempts: Int get() = dashboard?.totalAttempts ?: 0

    /** Items SRS maîtrisés. */
    val masteredItems: Int get() = dashboard?.itemsSrs?.masterises ?: 0

    /** Items SRS dus aujourd'hui. */
    val dueToday: Int get() = dashboard?.itemsSrs?.dusAujourdhui ?: 0

    /** Lacunes triées par score croissant (plus faibles d'abord). */
    val sortedWeaknesses: List<com.sect.mobile.shared.domain.model.examprep.ChapterWeakness>
        get() = dashboard?.lacunesParChapitre?.sortedBy { it.avgScore } ?: emptyList()
}

class ExamPrepProgressViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepProgressState())
    val state: StateFlow<ExamPrepProgressState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        launch {
            val dash = repository.getDashboard(_state.value.documentId)
            _state.value = _state.value.copy(isLoading = false, dashboard = dash)
        }
    }

    fun setDocument(documentId: String?) {
        _state.value = _state.value.copy(documentId = documentId)
        load()
    }

    fun refresh() = load()

    override fun onError(error: Exception) {
        _state.value = _state.value.copy(isLoading = false, error = error.message)
    }
}
