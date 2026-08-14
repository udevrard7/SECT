// SECT Mobile — TimeProvider iOS (NSDate)
package com.sect.mobile.shared.platform

import platform.Foundation.NSDate
import platform.Foundation.timeIntervalSince1970

/**
 * iOS implementation of TimeProvider using NSDate.
 *
 * Provided via Koin DI in platformModule:
 *   single<TimeProvider> { IOSTimeProvider() }
 *
 * Replaces the deprecated expect/actual currentTimeMillis() function.
 */
class IOSTimeProvider : TimeProvider {
    override fun currentTimeMillis(): Long = (NSDate().timeIntervalSince1970 * 1000.0).toLong()
}
