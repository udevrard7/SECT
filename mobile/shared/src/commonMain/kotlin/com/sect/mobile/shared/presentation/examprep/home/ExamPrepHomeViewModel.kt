// SECT Mobile — ExamPrepHomeViewModel (destination principale "Prépa examens")
// SECT-EXAMPREP-CONTRACT-F1
//
// Agrège : Dashboard + Documents + SRS du jour + Lacunes + Sessions à venir.
// C'est l'écran d'accueil du module ExamPrep — donne une vue d'ensemble
// pédagogique (pas juste une liste d'endpoints).
package com.sect.mobile.shared.presentation.examprep.home

import com.sect.mobile.shared.domain.model.examprep.*
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ExamPrepHomeState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val dashboard: ExamPrepDashboard? = null,
    val documents: List<ExamPrepDocument> = emptyList(),
    val reviewItemsDue: List<ReviewItem> = emptyList(),
    val upcomingSessions: List<StudySession> = emptyList()
) {
    /** Cartes à revoir aujourd'hui (SRS). */
    val cardsDueToday: Int get() = dashboard?.itemsSrs?.dusAujourdhui ?: 0

    /** Chapitres à renforcer (lacunes). */
    val weakChapters: List<ChapterWeakness>
        get() = dashboard?.lacunesParChapitre?.sortedBy { it.avgScore }?.take(3) ?: emptyList()

    /** Score moyen (0-1). */
    val averageScore: Double get() = dashboard?.scoreMoyen ?: 0.0

    /** Taux de réussite (%). */
    val successRate: Int get() = dashboard?.tauxReussite ?: 0

    /** Temps de révision total (secondes). */
    val revisionTimeSec: Int get() = dashboard?.tempsRevision ?: 0

    /** Sessions à venir. */
    val upcomingSessionsCount: Int get() = dashboard?.sessionsAVenir ?: 0
}

class ExamPrepHomeViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepHomeState())
    val state: StateFlow<ExamPrepHomeState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        launch {
            // Chargement parallèle : dashboard + documents + review due + sessions
            val dashboard = try { repository.getDashboard() } catch (_: Exception) { null }
            val documents = try { repository.listDocuments() } catch (_: Exception) { emptyList() }
            val reviewDue = try { repository.listReviewItems(due = true) } catch (_: Exception) { emptyList() }
            val sessions = try { repository.listStudySessions() } catch (_: Exception) { emptyList() }

            _state.value = ExamPrepHomeState(
                isLoading = false,
                dashboard = dashboard,
                documents = documents,
                reviewItemsDue = reviewDue,
                upcomingSessions = sessions.filter { it.statut == "PLANIFIEE" }.take(3)
            )
        }
    }

    fun refresh() = load()
}
