package com.sect.mobile.shared.presentation.viewmodel

import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.presentation.action.EpreuveAction
import com.sect.mobile.shared.presentation.effect.AppEffect
import com.sect.mobile.shared.presentation.state.EpreuveState
import com.sect.mobile.shared.presentation.state.UiState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

class EpreuveViewModel(
    private val repository: SECTRepositoryInterface,
    private val scope: CoroutineScope
) {
    private val _state = MutableStateFlow(EpreuveState())
    val state: StateFlow<EpreuveState> = _state.asStateFlow()

    private val _effects = MutableSharedFlow<AppEffect>(extraBufferCapacity = 10)
    val effects = _effects.asSharedFlow()

    fun handleAction(action: EpreuveAction) {
        when (action) {
            is EpreuveAction.LoadList -> loadList()
            is EpreuveAction.LoadDetail -> loadDetail(action.id)
            is EpreuveAction.Search -> search(action.query)
            is EpreuveAction.FilterByStatut -> filterByStatut(action.statut)
            is EpreuveAction.LoadNextPage -> loadNextPage()
        }
    }

    private fun loadList() {
        scope.launch {
            _state.value = _state.value.copy(epreuves = UiState.Loading)
            try {
                val result = repository.listEpreuves(
                    search = _state.value.searchQuery.ifEmpty { null },
                    statut = _state.value.statutFilter,
                    page = _state.value.currentPage,
                    limit = 20
                )
                _state.value = _state.value.copy(
                    epreuves = UiState.Success(result),
                    totalItems = result.size
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(epreuves = UiState.Error(e.message ?: "Erreur"))
            }
        }
    }

    private fun loadDetail(id: String) {
        scope.launch {
            _state.value = _state.value.copy(selectedEpreuve = UiState.Loading)
            try {
                val epreuve = repository.getEpreuve(id)
                _state.value = _state.value.copy(selectedEpreuve = UiState.Success(epreuve))
            } catch (e: Exception) {
                _state.value = _state.value.copy(selectedEpreuve = UiState.Error(e.message ?: "Erreur"))
            }
        }
    }

    private fun search(query: String) {
        _state.value = _state.value.copy(searchQuery = query, currentPage = 1)
        loadList()
    }

    private fun filterByStatut(statut: String?) {
        _state.value = _state.value.copy(statutFilter = statut, currentPage = 1)
        loadList()
    }

    private fun loadNextPage() {
        scope.launch {
            _state.value = _state.value.copy(currentPage = _state.value.currentPage + 1)
            try {
                val more = repository.listEpreuves(
                    search = _state.value.searchQuery.ifEmpty { null },
                    statut = _state.value.statutFilter,
                    page = _state.value.currentPage,
                    limit = 20
                )
                val current = (_state.value.epreuves as? UiState.Success)?.data ?: emptyList()
                _state.value = _state.value.copy(
                    epreuves = UiState.Success(current + more)
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(currentPage = _state.value.currentPage - 1)
            }
        }
    }
}
