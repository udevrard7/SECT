package com.sect.mobile.shared.proctoring

/**
 * ProctoringConfig — Configuration for a proctoring session.
 *
 * Passed from the backend (epreuve settings) or set by default.
 * Controls which detection features are enabled and the termination threshold.
 */
data class ProctoringConfig(
    val enableFullscreen: Boolean = true,
    val enableTabDetection: Boolean = true,
    val enableWebcam: Boolean = false,
    val webcamIntervalMs: Long = 30_000L,
    val maxAlerts: Int = 10,
    val enableScreenCapture: Boolean = false
)
