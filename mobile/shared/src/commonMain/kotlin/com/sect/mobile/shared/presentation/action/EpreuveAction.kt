package com.sect.mobile.shared.presentation.action

sealed interface EpreuveAction {
    data object LoadList : EpreuveAction
    data class LoadDetail(val id: String) : EpreuveAction
    data class Search(val query: String) : EpreuveAction
    data class FilterByStatut(val statut: String?) : EpreuveAction
    data class LoadNextPage(val epreuveId: String) : EpreuveAction
}
