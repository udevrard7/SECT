package com.sect.mobile.shared.presentation.state

import com.sect.mobile.shared.domain.model.SessionPassation
import com.sect.mobile.shared.domain.model.Epreuve
import com.sect.mobile.shared.domain.model.Question

data class PassationState(
    val session: UiState<SessionPassation> = UiState.Loading,
    val epreuve: Epreuve? = null,
    val questions: List<Question> = emptyList(),
    val currentQuestionIndex: Int = 0,
    val localReponses: Map<String, String> = emptyMap(),
    val remainingSeconds: Int = 0,
    val isTimerRunning: Boolean = false,
    val isSubmitting: Boolean = false,
    val isTimeWarning: Boolean = false,
    val isSessionComplete: Boolean = false,
    val autoSaveError: String? = null
)
