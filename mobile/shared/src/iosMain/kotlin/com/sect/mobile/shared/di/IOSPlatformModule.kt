// SECT Mobile — iOS Platform Koin Module
// Provides platform-specific singletons for iOS: HttpClient, TokenCache, TimeProvider,
// HttpClientFactory, BiometricAuth, PreferencesCache, CoroutineScope.
package com.sect.mobile.shared.di

import com.sect.mobile.shared.cache.IOSTokenCache
import com.sect.mobile.shared.cache.TokenCache
import com.sect.mobile.shared.data.cache.IOSPreferencesCache
import com.sect.mobile.shared.data.cache.PreferencesCache
import com.sect.mobile.shared.network.api.AuthApi
import com.sect.mobile.shared.platform.BiometricAuth
import com.sect.mobile.shared.platform.HttpClientFactory
import com.sect.mobile.shared.platform.IOSBiometricAuth
import com.sect.mobile.shared.platform.IOSHttpClientFactory
import com.sect.mobile.shared.platform.IOSNotificationService
import com.sect.mobile.shared.platform.IOSTimeProvider
import com.sect.mobile.shared.platform.NotificationService
import com.sect.mobile.shared.platform.TimeProvider
import io.ktor.client.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.koin.core.qualifier.named
import org.koin.dsl.module
import org.koin.mp.KoinPlatform

/**
 * iOS platform-specific Koin module.
 *
 * This module provides ONLY platform-specific singletons for iOS.
 * Shared DI (networkModule, dataModule, domainModule, presentationModule) is
 * loaded from sharedModules in KoinStartup.swift.
 *
 * Platform singletons provided:
 * - HttpClient (Ktor with Darwin/NSURLSession engine)
 * - TokenCache (Keychain via IOSTokenCache)
 * - TimeProvider (NSDate)
 * - HttpClientFactory (Darwin-based)
 * - BiometricAuth (LAContext — Face ID / Touch ID)
 * - PreferencesCache (NSUserDefaults)
 * - CoroutineScope (Main dispatcher + SupervisorJob)
 *
 * Load order:
 *   iosPlatformModule (platform) -> sharedModules (network -> data -> domain -> presentation)
 *
 * This mirrors the Android appModule pattern from AppModule.kt.
 */
val iosPlatformModule = module {
    // -- Configuration --
    single<String>(named("apiBaseUrl")) {
        "https://sect-zead.onrender.com"
    }

    // -- Platform-specific singletons --

    single<HttpClientFactory> { IOSHttpClientFactory() }

    single<HttpClient> {
        val factory = get<HttpClientFactory>()
        val tokenCache = get<TokenCache>()
        // ⚠️ ATTENTION : AuthApi dépend de HttpClient → dépendance circulaire.
        // On ne peut PAS faire get<AuthApi>() pendant la création de HttpClient,
        // sinon Koin lève une StackOverflowError / KoinInstanceCreationException
        // au runtime → l'app iOS crashe au lancement (KoinStartup.start() → SECTApp.init()).
        //
        // Solution : résolution lazy via KoinPlatform.getKoin().get<AuthApi>()
        // à l'intérieur du refreshHandler (appelé uniquement quand un token
        // expire, pas à la création du singleton HttpClient).
        // C'est le même pattern que côté Android (AppModule.kt).
        factory.create(
            baseUrl = get<String>(named("apiBaseUrl")),
            tokenProvider = { kotlinx.coroutines.runBlocking { tokenCache.getAccessToken() } },
            refreshHandler = {
                try {
                    val rt = kotlinx.coroutines.runBlocking { tokenCache.getRefreshToken() }
                    if (rt.isNotEmpty()) {
                        val apiAuthApi = KoinPlatform.getKoin().get<AuthApi>()
                        val session = apiAuthApi.refresh(rt)
                        kotlinx.coroutines.runBlocking {
                            tokenCache.saveAccessToken(session.accessToken)
                            tokenCache.saveRefreshToken(session.refreshToken)
                        }
                        session.accessToken
                    } else ""
                } catch (_: Exception) { "" }
            }
        )
    }

    single<TokenCache> { IOSTokenCache() }

    single<TimeProvider> { IOSTimeProvider() }

    single<BiometricAuth> { IOSBiometricAuth() }

    single<NotificationService> { IOSNotificationService(get()) }

    single<PreferencesCache> { IOSPreferencesCache() }

    single<CoroutineScope> { CoroutineScope(SupervisorJob() + Dispatchers.Main) }
}
