// SECT Mobile — ExamPrepPlanningViewModel (CRUD sessions de révision)
// SECT-EXAMPREP-CONTRACT-F1
//
// ⚠️ LIMITATION : updateStudySession accepte dateFin et notes mais le backend
// ne les persiste pas (colonnes DB absentes). Seuls type, dateDebut, statut
// sont réellement sauvegardés.
package com.sect.mobile.shared.presentation.examprep.planning

import com.sect.mobile.shared.domain.model.examprep.StudySession
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ExamPrepPlanningState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val sessions: List<StudySession> = emptyList(),
    val isSaving: Boolean = false,
    val lastSaved: StudySession? = null
) {
    /** Sessions à venir (PLANIFIEE). */
    val upcoming: List<StudySession> get() = sessions.filter { it.statut == "PLANIFIEE" }

    /** Sessions terminées. */
    val completed: List<StudySession> get() = sessions.filter { it.statut == "TERMINEE" }

    /** Sessions en cours. */
    val inProgress: List<StudySession> get() = sessions.filter { it.statut == "EN_COURS" }
}

class ExamPrepPlanningViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepPlanningState())
    val state: StateFlow<ExamPrepPlanningState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        launch {
            val sessions = repository.listStudySessions()
            _state.value = _state.value.copy(isLoading = false, sessions = sessions)
        }
    }

    fun create(
        documentId: String?, chapitreId: String?, type: String,
        dateDebut: String, dateFin: String?, notes: String?
    ) {
        _state.value = _state.value.copy(isSaving = true, error = null)
        launch {
            try {
                val session = repository.createStudySession(
                    documentId, chapitreId, type, dateDebut, dateFin, notes
                )
                _state.value = _state.value.copy(isSaving = false, lastSaved = session)
                load()
            } catch (e: Exception) {
                _state.value = _state.value.copy(isSaving = false, error = e.message)
            }
        }
    }

    /**
     * Update partiel (PATCH /planning/{id}).
     * ⚠️ dateFin et notes acceptés mais non persistés côté backend (limitation DB).
     */
    fun update(
        id: String, type: String? = null, dateDebut: String? = null,
        dateFin: String? = null, statut: String? = null, notes: String? = null
    ) {
        _state.value = _state.value.copy(isSaving = true, error = null)
        launch {
            try {
                val session = repository.updateStudySession(id, type, dateDebut, dateFin, statut, notes)
                _state.value = _state.value.copy(isSaving = false, lastSaved = session)
                load()
            } catch (e: Exception) {
                _state.value = _state.value.copy(isSaving = false, error = e.message)
            }
        }
    }

    fun delete(id: String) {
        launch {
            try {
                repository.deleteStudySession(id)
                load()
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    /** Marque une session comme terminée. */
    fun markCompleted(id: String) {
        update(id = id, statut = "TERMINEE")
    }

    override fun onError(error: Exception) {
        _state.value = _state.value.copy(isLoading = false, error = error.message)
    }
}
