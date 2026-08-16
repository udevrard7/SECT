package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.Devoir
import com.sect.mobile.shared.domain.model.PresignedUrl
import com.sect.mobile.shared.domain.model.Soumission
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class DevoirsUiState {
    object Loading : DevoirsUiState()
    data class Success(
        val devoirs: List<Devoir>,
        val isLoadingMore: Boolean = false,
        val hasMore: Boolean = true
    ) : DevoirsUiState()
    data class Error(val message: String) : DevoirsUiState()
}

class DevoirsViewModel(
    private val repository: SECTRepositoryInterface
) : ViewModel() {
    
    private val _uiState = MutableStateFlow<DevoirsUiState>(DevoirsUiState.Loading)
    val uiState: StateFlow<DevoirsUiState> = _uiState.asStateFlow()
    
    private var currentPage = 1
    private val pageSize = 20
    
    init {
        loadDevoirs()
    }
    
    fun loadDevoirs(statut: String? = null, refresh: Boolean = false) {
        if (refresh) {
            currentPage = 1
        }
        
        viewModelScope.launch {
            if (refresh) {
                _uiState.value = DevoirsUiState.Loading
            }
            
            try {
                val devoirs = repository.listDevoirs(
                    page = currentPage,
                    limit = pageSize,
                    statut = statut
                )
                
                _uiState.value = DevoirsUiState.Success(
                    devoirs = devoirs,
                    hasMore = devoirs.size >= pageSize
                )
            } catch (e: Exception) {
                _uiState.value = DevoirsUiState.Error(e.message ?: "Erreur lors du chargement")
            }
        }
    }
    
    fun loadMore() {
        val currentState = _uiState.value
        if (currentState !is DevoirsUiState.Success || !currentState.hasMore || currentState.isLoadingMore) {
            return
        }
        
        viewModelScope.launch {
            _uiState.value = currentState.copy(isLoadingMore = true)
            
            try {
                currentPage++
                val newDevoirs = repository.listDevoirs(
                    page = currentPage,
                    limit = pageSize
                )
                
                val allDevoirs = currentState.devoirs + newDevoirs
                
                _uiState.value = DevoirsUiState.Success(
                    devoirs = allDevoirs,
                    hasMore = newDevoirs.size >= pageSize,
                    isLoadingMore = false
                )
            } catch (e: Exception) {
                _uiState.value = DevoirsUiState.Error(e.message ?: "Erreur lors du chargement")
                currentPage--
            }
        }
    }
    
    fun getDevoir(id: String): Devoir? {
        val state = _uiState.value
        return if (state is DevoirsUiState.Success) {
            state.devoirs.find { it.id == id }
        } else null
    }
}
