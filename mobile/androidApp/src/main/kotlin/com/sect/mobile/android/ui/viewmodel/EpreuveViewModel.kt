// SECT Mobile — EpreuveViewModel (liste + détail d'épreuve)
package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.Epreuve
import com.sect.mobile.shared.domain.model.CreateEpreuveInput
import com.sect.mobile.shared.domain.model.Question
import com.sect.mobile.shared.domain.enum.StatutEpreuve
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class EpreuveViewModel(private val repository: SECTRepositoryInterface) : ViewModel() {

    // ── Liste d'épreuves ──
    private val _epreuves = MutableStateFlow<UiState<List<Epreuve>>>(UiState.Loading)
    val epreuves: StateFlow<UiState<List<Epreuve>>> = _epreuves.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedStatut = MutableStateFlow<String?>(null)
    val selectedStatut: StateFlow<String?> = _selectedStatut.asStateFlow()

    private val _page = MutableStateFlow(1)

    // ── Détail d'épreuve ──
    private val _selectedEpreuve = MutableStateFlow<UiState<Epreuve>>(UiState.Loading)
    val selectedEpreuve: StateFlow<UiState<Epreuve>> = _selectedEpreuve.asStateFlow()

    // SECT-MOBILE-PARITY-T1 : état de création (Idle → Loading → Success/Error)
    private val _createState = MutableStateFlow<CreateEpreuveState>(CreateEpreuveState.Idle)
    val createState: StateFlow<CreateEpreuveState> = _createState.asStateFlow()

    init {
        loadEpreuves()
    }

    /**
     * Charger la liste des épreuves avec filtres.
     */
    fun loadEpreuves(
        search: String = _searchQuery.value,
        statut: String? = _selectedStatut.value,
        page: Int = _page.value
    ) {
        viewModelScope.launch {
            _epreuves.value = UiState.Loading
            try {
                val result = repository.listEpreuves(
                    search = search.ifBlank { null },
                    statut = statut,
                    page = page
                )
                _epreuves.value = UiState.Success(result)
            } catch (e: Exception) {
                _epreuves.value = UiState.Error(e.message ?: "Erreur de chargement")
            }
        }
    }

    /**
     * Charger le détail d'une épreuve (avec questions).
     */
    fun loadEpreuveDetail(epreuveId: String) {
        viewModelScope.launch {
            _selectedEpreuve.value = UiState.Loading
            try {
                val epreuve = repository.getEpreuve(epreuveId)
                _selectedEpreuve.value = UiState.Success(epreuve)
            } catch (e: Exception) {
                _selectedEpreuve.value = UiState.Error(e.message ?: "Erreur")
            }
        }
    }

    /**
     * Mettre à jour le filtre de recherche.
     */
    fun onSearchChanged(query: String) {
        _searchQuery.value = query
        _page.value = 1
        loadEpreuves(search = query)
    }

    /**
     * Mettre à jour le filtre de statut.
     */
    fun onStatutFilterChanged(statut: String?) {
        _selectedStatut.value = statut
        _page.value = 1
        loadEpreuves(statut = statut)
    }

    /**
     * Charger la page suivante.
     */
    fun loadMore() {
        _page.value += 1
        loadEpreuves(page = _page.value)
    }

    /**
     * Rafraîchir (pull-to-refresh).
     */
    fun refresh() {
        _page.value = 1
        loadEpreuves()
    }

    /**
     * Statuts disponibles pour le filtre.
     */
    val statutOptions: List<Pair<String?, String>> = listOf(
        null to "Tous",
        "BROUILLON" to "Brouillon",
        "PLANIFIEE" to "Planifiée",
        "EN_COURS" to "En cours",
        "TERMINEE" to "Terminée",
        "CLOTUREE" to "Clôturée"
    )

    // ════════════════════════════════════════════════════════
    // SECT-MOBILE-PARITY-T1 : Création d'épreuve (enseignant)
    // ════════════════════════════════════════════════════════

    /**
     * Crée une épreuve via POST /api/epreuves.
     * - Passe par CreateEpreuveInput (domain) → CreateEpreuveRequest (DTO) → API.
     * - Sur succès, rafraîchit la liste automatiquement.
     * - L'état _createState passe à Success(createdEpreuve) pour que le form puisse fermer.
     */
    fun createEpreuve(input: CreateEpreuveInput) {
        viewModelScope.launch {
            _createState.value = CreateEpreuveState.Loading
            try {
                val created = repository.createEpreuve(input)
                _createState.value = CreateEpreuveState.Success(created)
                // Rafraîchir la liste pour que la nouvelle épreuve apparaisse
                _page.value = 1
                loadEpreuves()
            } catch (e: Exception) {
                _createState.value = CreateEpreuveState.Error(
                    e.message ?: "Erreur lors de la création de l'épreuve"
                )
            }
        }
    }

    /** Remet l'état de création à Idle (à appeler quand on quitte le form). */
    fun resetCreateState() {
        _createState.value = CreateEpreuveState.Idle
    }
}

// SECT-MOBILE-PARITY-T1 : état de création d'épreuve (Idle → Loading → Success/Error)
sealed class CreateEpreuveState {
    data object Idle : CreateEpreuveState()
    data object Loading : CreateEpreuveState()
    data class Success(val epreuve: Epreuve) : CreateEpreuveState()
    data class Error(val message: String) : CreateEpreuveState()
}
