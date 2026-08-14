// SECT Mobile — TimeProvider Android (System.currentTimeMillis)
package com.sect.mobile.shared.platform

/**
 * Android implementation of TimeProvider using System.currentTimeMillis().
 *
 * Provided via Koin DI in platformModule:
 *   single<TimeProvider> { AndroidTimeProvider() }
 *
 * Replaces the deprecated expect/actual currentTimeMillis() function.
 */
class AndroidTimeProvider : TimeProvider {
    override fun currentTimeMillis(): Long = System.currentTimeMillis()
}
