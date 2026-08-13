package com.sect.mobile.shared.proctoring

/**
 * ProctoringEvent — All detectable proctoring events.
 *
 * Each event has a severity level that determines the alert increment:
 * - LOW:      Logged only, no alert increment (e.g., webcam temporarily unavailable)
 * - MEDIUM:   +1 alert (e.g., tab switch)
 * - HIGH:     +2 alerts (e.g., app background, fullscreen exit, no face)
 * - CRITICAL: +3 alerts (e.g., copy/paste, screen capture — may terminate session)
 */
enum class ProctoringEvent {
    TAB_SWITCH,
    FULLSCREEN_EXIT,
    APP_BACKGROUND,
    COPY_PASTE_DETECTED,
    SCREEN_CAPTURE,
    WEBCAM_UNAVAILABLE,
    MULTIPLE_FACES,
    NO_FACE;

    fun severity(): AlertSeverity = when (this) {
        TAB_SWITCH -> AlertSeverity.MEDIUM
        FULLSCREEN_EXIT -> AlertSeverity.HIGH
        APP_BACKGROUND -> AlertSeverity.HIGH
        COPY_PASTE_DETECTED -> AlertSeverity.CRITICAL
        SCREEN_CAPTURE -> AlertSeverity.CRITICAL
        WEBCAM_UNAVAILABLE -> AlertSeverity.LOW
        MULTIPLE_FACES -> AlertSeverity.HIGH
        NO_FACE -> AlertSeverity.HIGH
    }
}

/**
 * AlertSeverity — Determines how much an event increments the alert counter.
 */
enum class AlertSeverity {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}
