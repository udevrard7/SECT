package com.sect.mobile.shared.platform

/**
 * TimeProvider — Provides current epoch milliseconds.
 *
 * Interface for DI — replaces the old expect/actual pattern:
 *   OLD: expect fun currentTimeMillis(): Long  (in util/TimeProvider.kt)
 *   NEW: interface TimeProvider               (in platform/TimeProvider.kt)
 *
 * Platform implementations:
 * - Android: System.currentTimeMillis()
 * - iOS:     (NSDate().timeIntervalSince1970 * 1000).toLong()
 *
 * Usage via Koin:
 *   val timeProvider: TimeProvider = get()
 *   val now = timeProvider.currentTimeMillis()
 */
interface TimeProvider {
    fun currentTimeMillis(): Long
}
