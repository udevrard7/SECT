package com.sect.mobile.shared.presentation.state

import com.sect.mobile.shared.domain.model.Epreuve

data class EpreuveState(
    val epreuves: UiState<List<Epreuve>> = UiState.Loading,
    val selectedEpreuve: UiState<Epreuve> = UiState.Loading,
    val searchQuery: String = "",
    val statutFilter: String? = null,
    val currentPage: Int = 1,
    val totalItems: Int = 0
)
