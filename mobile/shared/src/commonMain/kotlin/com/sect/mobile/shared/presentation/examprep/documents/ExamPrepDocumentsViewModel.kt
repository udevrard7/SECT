// SECT Mobile — ExamPrepDocumentsViewModel (liste des supports de cours)
// SECT-EXAMPREP-CONTRACT-F1
package com.sect.mobile.shared.presentation.examprep.documents

import com.sect.mobile.shared.domain.model.examprep.ExamPrepDocument
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ExamPrepDocumentsState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val documents: List<ExamPrepDocument> = emptyList(),
    val searchQuery: String = "",
    val filterUE: String? = null,
    val isRefreshing: Boolean = false
) {
    /** Documents filtrés par recherche + UE. */
    val filteredDocuments: List<ExamPrepDocument>
        get() = documents.filter { doc ->
            (searchQuery.isEmpty() || doc.nomFichier.contains(searchQuery, ignoreCase = true)) &&
            (filterUE == null || doc.uniteEnseignement?.id == filterUE)
        }

    /** UEs distinctes pour le filtre. */
    val availableUEs: List<String>
        get() = documents.mapNotNull { it.uniteEnseignement?.id }.distinct()
}

class ExamPrepDocumentsViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepDocumentsState())
    val state: StateFlow<ExamPrepDocumentsState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        launch {
            val docs = repository.listDocuments()
            _state.value = _state.value.copy(isLoading = false, documents = docs)
        }
    }

    fun refresh() {
        _state.value = _state.value.copy(isRefreshing = true)
        launch {
            val docs = repository.listDocuments()
            _state.value = _state.value.copy(isRefreshing = false, documents = docs)
        }
    }

    fun onSearchChange(query: String) {
        _state.value = _state.value.copy(searchQuery = query)
    }

    fun onFilterUEChange(ueId: String?) {
        _state.value = _state.value.copy(filterUE = ueId)
    }

    override fun onError(error: Exception) {
        _state.value = _state.value.copy(isLoading = false, isRefreshing = false, error = error.message)
    }
}
