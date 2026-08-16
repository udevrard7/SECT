// SECT Mobile — Time Provider (DEPRECATED — use platform.TimeProvider interface + Koin DI)
// Préférer : com.sect.mobile.shared.platform.TimeProvider (interface)
// Injecter via Koin : single<TimeProvider> { AndroidTimeProvider() / IOSTimeProvider() }
// Avantage : testabilité (FakeTimeProvider en tests unitaires)
package com.sect.mobile.shared.util

@Deprecated(
    message = "Utilisez com.sect.mobile.shared.platform.TimeProvider (interface) + Koin DI pour la testabilité",
    level = DeprecationLevel.WARNING,
    replaceWith = ReplaceWith("TimeProvider.currentTimeMillis()", "com.sect.mobile.shared.platform.TimeProvider")
)
expect fun currentTimeMillis(): Long
