package com.sect.mobile.shared.di

import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.examprep.audio.ExamPrepAudioViewModel
import com.sect.mobile.shared.presentation.examprep.documents.ExamPrepDocumentsViewModel
import com.sect.mobile.shared.presentation.examprep.flashcards.ExamPrepFlashcardsViewModel
import com.sect.mobile.shared.presentation.examprep.help.ExamPrepHelpViewModel
import com.sect.mobile.shared.presentation.examprep.home.ExamPrepHomeViewModel
import com.sect.mobile.shared.presentation.examprep.planning.ExamPrepPlanningViewModel
import com.sect.mobile.shared.presentation.examprep.practice.ExamPrepPracticeViewModel
import com.sect.mobile.shared.presentation.examprep.progress.ExamPrepProgressViewModel
import com.sect.mobile.shared.presentation.examprep.qa.ExamPrepQaViewModel
import com.sect.mobile.shared.presentation.examprep.reader.ExamPrepReaderViewModel
import com.sect.mobile.shared.presentation.examprep.review.ExamPrepReviewViewModel
import org.koin.dsl.module

/**
 * Koin module for presentation layer.
 *
 * SECT-EXAMPREP-CONTRACT-F1 : ViewModels commonMain pour le module ExamPrep.
 * 11 ViewModels partagés, consommés simultanément par Android (Compose) et iOS (SwiftUI).
 *
 * Pattern : les VMs sont des classes plain Kotlin avec StateFlow (pas de
 * dépendance androidx.lifecycle). Chaque plateforme les wrappe dans son propre
 * cycle de vie :
 * - Android : androidx.lifecycle.ViewModel(viewModelScope) → delegate au commonState
 * - iOS : ObservableObject avec @Published qui observe le StateFlow
 */
val presentationModule = module {
    // ── ExamPrep ViewModels (11) ──
    single { ExamPrepHomeViewModel(get<ExamPrepRepository>()) }
    single { ExamPrepDocumentsViewModel(get<ExamPrepRepository>()) }
    single { ExamPrepReaderViewModel(get<ExamPrepRepository>()) }
    single { ExamPrepPracticeViewModel(get<ExamPrepRepository>()) }
    single { ExamPrepReviewViewModel(get<ExamPrepRepository>()) }
    single { ExamPrepFlashcardsViewModel(get<ExamPrepRepository>()) }
    single { ExamPrepProgressViewModel(get<ExamPrepRepository>()) }
    single { ExamPrepPlanningViewModel(get<ExamPrepRepository>()) }
    single { ExamPrepAudioViewModel(get<ExamPrepRepository>()) }
    single { ExamPrepQaViewModel(get<ExamPrepRepository>()) }
    single { ExamPrepHelpViewModel(get<ExamPrepRepository>()) }
}
