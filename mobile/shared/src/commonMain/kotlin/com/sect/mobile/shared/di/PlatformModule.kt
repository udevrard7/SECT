package com.sect.mobile.shared.di

import com.sect.mobile.shared.platform.*

/**
 * PlatformModule — Koin module for platform-specific dependencies.
 *
 * This module is NOT defined here — each platform provides its own implementation:
 * - Android: com.sect.mobile.android.di.platformModule
 * - iOS:     com.sect.mobile.shared.di.platformModule (in iosMain)
 *
 * Platform modules MUST provide:
 * ```
 * single<HttpClient> { ... }               // Ktor client with platform engine
 * single<TokenCache> { ... }               // Secure token storage
 * single<TimeProvider> { ... }             // System clock
 * single<HttpClientFactory> { ... }        // HTTP client factory
 * single<NotificationService> { ... }      // Push notifications (FCM/APNs)
 * single<BiometricAuth> { ... }            // Biometric auth (Face ID/Fingerprint)
 * single<PreferencesCache> { ... }         // Non-secure preferences
 * single<CoroutineScope> { ... }           // Main coroutine scope
 * ```
 *
 * Load order:
 *   platformModule → networkModule → dataModule → domainModule → presentationModule
 *
 * Example (Android):
 * ```kotlin
 * val platformModule = module {
 *     single<HttpClient> {
 *         val factory = get<HttpClientFactory>()
 *         factory.create(
 *             baseUrl = get<String>(named("apiBaseUrl")),
 *             tokenProvider = { runBlocking { get<TokenCache>().getAccessToken() } },
 *             refreshHandler = { ... }
 *         )
 *     }
 *     single<TokenCache> { AndroidTokenCache(androidContext()) }
 *     single<TimeProvider> { AndroidTimeProvider() }
 *     single<HttpClientFactory> { AndroidHttpClientFactory() }
 *     single<NotificationService> { AndroidNotificationService() }
 *     single<BiometricAuth> { AndroidBiometricAuth(androidContext()) }
 *     single<PreferencesCache> { AndroidPreferencesCache(androidContext()) }
 *     single<CoroutineScope> { CoroutineScope(SupervisorJob() + Dispatchers.Main) }
 * }
 * ```
 */

/**
 * All shared Koin modules in correct load order.
 *
 * Platform apps should load: platformModule + sharedModules
 * where platformModule provides the platform-specific singletons.
 */
val sharedModules = listOf(
    networkModule,
    dataModule,
    domainModule,
    presentationModule
)
