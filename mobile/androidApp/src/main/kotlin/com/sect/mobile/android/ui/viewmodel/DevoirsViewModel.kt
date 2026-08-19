package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.Devoir
import com.sect.mobile.shared.domain.model.CreateDevoirInput
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

// SECT-MOBILE-PARITY-T1 : état de création de devoir (Idle → Loading → Success/Error)
sealed class CreateDevoirState {
    data object Idle : CreateDevoirState()
    data object Loading : CreateDevoirState()
    data class Success(val devoir: Devoir) : CreateDevoirState()
    data class Error(val message: String) : CreateDevoirState()
}

class DevoirsViewModel(
    private val repository: SECTRepositoryInterface
) : ViewModel() {
    
    private val _uiState = MutableStateFlow<DevoirsUiState>(DevoirsUiState.Loading)
    val uiState: StateFlow<DevoirsUiState> = _uiState.asStateFlow()

    // SECT-MOBILE-PARITY-T1 : état création de devoir
    private val _createState = MutableStateFlow<CreateDevoirState>(CreateDevoirState.Idle)
    val createState: StateFlow<CreateDevoirState> = _createState.asStateFlow()

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

    // SECT-MOBILE-PARITY P1-6 : Soumission étudiant
    fun submitDevoir(devoirId: String, fichierUrl: String, commentaire: String?) {
        viewModelScope.launch {
            try {
                repository.submitDevoir(devoirId, fichierUrl, commentaire)
                loadDevoirs(refresh = true)
            } catch (_: Exception) {}
        }
    }

    // SECT-MOBILE-PARITY P1-7 : Correction enseignant
    fun noterSoumission(soumissionId: String, note: Float, commentaire: String?) {
        viewModelScope.launch {
            try {
                repository.noterSoumission(soumissionId, note, commentaire)
            } catch (_: Exception) {}
        }
    }

    // SECT-MOBILE-PARITY P1-8 : Correction IA
    fun aiGradeSoumission(soumissionId: String) {
        viewModelScope.launch {
            try { repository.aiGradeSoumission(soumissionId) } catch (_: Exception) {}
        }
    }

    // ════════════════════════════════════════════════════════
    // SECT-MOBILE-PARITY-T1 : Création de devoir (enseignant)
    // ════════════════════════════════════════════════════════

    /**
     * Crée un devoir via POST /api/devoirs.
     * - CreateDevoirInput (domain) → CreateDevoirRequest (DTO) → API.
     * - Sur succès, rafraîchit la liste.
     * - Rôle : ENSEIGNANT uniquement (validé côté backend).
     */
    fun createDevoir(input: CreateDevoirInput) {
        viewModelScope.launch {
            _createState.value = CreateDevoirState.Loading
            try {
                val created = repository.createDevoir(input)
                _createState.value = CreateDevoirState.Success(created)
                // Rafraîchir la liste
                loadDevoirs(refresh = true)
            } catch (e: Exception) {
                _createState.value = CreateDevoirState.Error(
                    e.message ?: "Erreur lors de la création du devoir"
                )
            }
        }
    }

    /** Remet l'état de création à Idle (à appeler quand on quitte le form). */
    fun resetCreateState() {
        _createState.value = CreateDevoirState.Idle
    }
}
