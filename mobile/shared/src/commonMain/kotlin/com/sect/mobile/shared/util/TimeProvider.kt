// SECT Mobile — Time Provider (simple expect/actual for timestamps)
package com.sect.mobile.shared.util

/**
 * Provides current epoch milliseconds.
 * Simple expect/actual to avoid kotlinx-datetime Clock resolution issues in KMP.
 */
expect fun currentTimeMillis(): Long
