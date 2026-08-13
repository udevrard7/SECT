package com.sect.mobile.shared.proctoring

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock

/**
 * ProctoringEngine — Centralized proctoring rules engine.
 *
 * This is the BRAIN of the proctoring system, shared between Android and iOS.
 * It receives ProctoringEvent from native drivers (AndroidProctoringService, iOSProctoringService)
 * and applies business rules:
 * - Calculate alert increments based on event severity
 * - Determine if session should be terminated (max alerts exceeded)
 * - Aggregate statistics for reporting
 * - Provide the WebSocket alert format
 *
 * Native drivers only COLLECT hardware metrics (lifecycle events, camera frames).
 * The Engine PROCESSES them according to business rules.
 *
 * Architecture:
 * ```
 * Native Driver (Android/iOS)                Shared Engine
 * ┌──────────────────────┐      event      ┌──────────────────────────┐
 * │ Activity.onPause()   │ ──────────────→ │ processEvent()           │
 * │ Camera frame capture │                 │   → severity()           │
 * │ Screen capture detect│                 │   → alertIncrement       │
 * │ Clipboard paste      │                 │   → _alertCount += inc   │
 * └──────────────────────┘                 │   → shouldTerminate?     │
 *                                          │   → ProctoringResult     │
 *                                          └──────────────────────────┘
 * ```
 */
class ProctoringEngine {

    private val _state = MutableStateFlow(ProctoringState())
    val state: StateFlow<ProctoringState> = _state.asStateFlow()

    private val _alertCount = MutableStateFlow(0)
    val alertCount: StateFlow<Int> = _alertCount.asStateFlow()

    private val _shouldTerminate = MutableStateFlow(false)
    val shouldTerminate: StateFlow<Boolean> = _shouldTerminate.asStateFlow()

    private val _eventLog = MutableStateFlow<List<ProctoringEventEntry>>(emptyList())
    val eventLog: StateFlow<List<ProctoringEventEntry>> = _eventLog.asStateFlow()

    private var config: ProctoringConfig = ProctoringConfig()

    /**
     * Initialize the engine with a proctoring configuration.
     */
    fun configure(config: ProctoringConfig) {
        this.config = config
    }

    /**
     * Start the proctoring engine.
     */
    fun start() {
        _state.value = ProctoringState(isActive = true)
        _alertCount.value = 0
        _shouldTerminate.value = false
        _eventLog.value = emptyList()
    }

    /**
     * Stop the proctoring engine.
     */
    fun stop() {
        _state.value = _state.value.copy(isActive = false, webcamActive = false)
    }

    /**
     * Process a proctoring event from a native driver.
     *
     * This is the main entry point. Native drivers call this when they detect
     * an event (tab switch, face loss, screen capture, etc.)
     *
     * @return ProctoringResult indicating what action the UI should take
     */
    fun processEvent(event: ProctoringEvent): ProctoringResult {
        if (!_state.value.isActive) return ProctoringResult.Ignored

        val severity = event.severity()
        val increment = alertIncrementForSeverity(severity)

        // Log the event
        val entry = ProctoringEventEntry(
            event = event,
            severity = severity,
            increment = increment,
            timestamp = Clock.System.now().toEpochMilliseconds()
        )
        _eventLog.value = _eventLog.value + entry

        // Update alert count
        _alertCount.value += increment

        // Check termination threshold
        val shouldTerminateNow = _alertCount.value >= config.maxAlerts
        _shouldTerminate.value = shouldTerminateNow

        // Update state for specific events
        when (event) {
            ProctoringEvent.APP_BACKGROUND ->
                _state.value = _state.value.copy(isAppInForeground = false)
            ProctoringEvent.FULLSCREEN_EXIT ->
                _state.value = _state.value.copy(isFullscreen = false)
            ProctoringEvent.WEBCAM_UNAVAILABLE ->
                _state.value = _state.value.copy(webcamActive = false)
            else -> {}
        }

        return when {
            shouldTerminateNow -> ProctoringResult.TerminateSession
            increment > 0 -> ProctoringResult.AlertShown(event, increment)
            else -> ProctoringResult.LoggedOnly(event)
        }
    }

    /**
     * Get the WebSocket-compatible alert payload for a given event.
     * Used to send alerts to the backend surveillance hub.
     */
    fun alertPayloadForEvent(event: ProctoringEvent, sessionId: String): Map<String, String> {
        return mapOf(
            "type" to event.name,
            "severity" to event.severity().name,
            "sessionId" to sessionId,
            "timestamp" to Clock.System.now().toEpochMilliseconds().toString()
        )
    }

    /**
     * Get a summary of the proctoring session for reporting.
     */
    fun sessionSummary(): ProctoringSessionSummary {
        val log = _eventLog.value
        return ProctoringSessionSummary(
            totalEvents = log.size,
            totalAlerts = _alertCount.value,
            terminated = _shouldTerminate.value,
            eventsByType = log.groupBy { it.event.name }.mapValues { it.value.size },
            eventsBySeverity = log.groupBy { it.severity.name }.mapValues { it.value.size },
            maxConsecutiveAlerts = calculateMaxConsecutive(log)
        )
    }

    private fun alertIncrementForSeverity(severity: AlertSeverity): Int = when (severity) {
        AlertSeverity.LOW -> 0
        AlertSeverity.MEDIUM -> 1
        AlertSeverity.HIGH -> 2
        AlertSeverity.CRITICAL -> 3
    }

    private fun calculateMaxConsecutive(log: List<ProctoringEventEntry>): Int {
        var max = 0
        var current = 0
        for (entry in log) {
            if (entry.increment > 0) {
                current++
                if (current > max) max = current
            } else {
                current = 0
            }
        }
        return max
    }
}

// ── Supporting types ──

/**
 * A logged proctoring event with its computed severity and increment.
 */
data class ProctoringEventEntry(
    val event: ProctoringEvent,
    val severity: AlertSeverity,
    val increment: Int,
    val timestamp: Long
)

/**
 * Result of processing a proctoring event.
 * The UI uses this to decide what feedback to show.
 */
sealed class ProctoringResult {
    /** Engine is not active — event ignored. */
    data object Ignored : ProctoringResult()

    /** Event logged but no alert increment (LOW severity). */
    data class LoggedOnly(val event: ProctoringEvent) : ProctoringResult()

    /** Alert shown to user with the increment applied. */
    data class AlertShown(val event: ProctoringEvent, val increment: Int) : ProctoringResult()

    /** Max alerts exceeded — session should be terminated. */
    data object TerminateSession : ProctoringResult()
}

/**
 * Summary of a proctoring session for reporting to the backend.
 */
data class ProctoringSessionSummary(
    val totalEvents: Int,
    val totalAlerts: Int,
    val terminated: Boolean,
    val eventsByType: Map<String, Int>,
    val eventsBySeverity: Map<String, Int>,
    val maxConsecutiveAlerts: Int
)
