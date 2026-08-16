package com.sect.mobile.shared.proctoring

import kotlinx.coroutines.flow.StateFlow

/**
 * ProctoringService — Native driver interface.
 *
 * Platform implementations (Android/iOS) COLLECT hardware metrics
 * and report them to the ProctoringEngine via processEvent().
 *
 * The Engine (shared Kotlin) handles business rules.
 *
 * Architecture split:
 * - ProctoringService (platform): Detects events (lifecycle, camera, clipboard)
 * - ProctoringEngine (shared):   Processes events, applies rules, manages state
 *
 * Platform implementations should delegate to ProctoringEngine:
 * ```
 * class AndroidProctoringService(...) : ProctoringService {
 *     private val engine = ProctoringEngine()  // injected via DI
 *
 *     override fun reportEvent(event: ProctoringEvent) {
 *         val result = engine.processEvent(event)
 *         // Show UI feedback based on result
 *     }
 * }
 * ```
 */
interface ProctoringService {
    /** Current proctoring state. */
    val state: StateFlow<ProctoringState>

    /** Total alert count for this session. */
    val alertCount: StateFlow<Int>

    /** Whether the session should be terminated (threshold exceeded). */
    val shouldTerminate: StateFlow<Boolean>

    /**
     * Start proctoring with the given configuration.
     * Platform implementations should also register native listeners
     * (lifecycle observer, fullscreen detector, etc.)
     */
    suspend fun start(config: ProctoringConfig)

    /**
     * Stop proctoring and clean up native listeners.
     */
    suspend fun stop()

    /**
     * Report a proctoring event detected by the platform.
     * Called by native listeners (Activity.onPause, clipboard detector, etc.)
     */
    fun reportEvent(event: ProctoringEvent)
}
