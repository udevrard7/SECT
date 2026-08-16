package com.sect.mobile.shared.proctoring

/**
 * ProctoringState — Snapshot of the proctoring system state.
 *
 * Observed via StateFlow by the UI and by ProctoringService implementations.
 */
data class ProctoringState(
    val isActive: Boolean = false,
    val isFullscreen: Boolean = false,
    val isAppInForeground: Boolean = true,
    val webcamActive: Boolean = false,
    val lastCaptureAt: Long = 0L
)
