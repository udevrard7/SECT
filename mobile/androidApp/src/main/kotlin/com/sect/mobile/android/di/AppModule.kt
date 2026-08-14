// SECT Mobile — Dependency Injection (Koin) — Android platform module only
package com.sect.mobile.android.di

import com.sect.mobile.android.ui.viewmodel.*
import com.sect.mobile.shared.cache.TokenCache
import com.sect.mobile.shared.data.cache.AndroidPreferencesCache
import com.sect.mobile.shared.data.cache.PreferencesCache
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.network.api.AuthApi
import com.sect.mobile.shared.notification.PushSubscriptionManager
import com.sect.mobile.shared.platform.AndroidBiometricAuth
import com.sect.mobile.shared.platform.AndroidHttpClientFactory
import com.sect.mobile.shared.platform.AndroidNotificationService
import com.sect.mobile.shared.platform.AndroidTimeProvider
import com.sect.mobile.shared.platform.BiometricAuth
import com.sect.mobile.shared.platform.HttpClientFactory
import com.sect.mobile.shared.platform.NotificationService
import com.sect.mobile.shared.platform.TimeProvider
import com.sect.mobile.shared.cache.AndroidTokenCache
import io.ktor.client.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import org.koin.android.ext.koin.androidContext
import org.koin.androidx.viewmodel.dsl.viewModel
import org.koin.dsl.module

/**
 * Android platform-specific Koin module.
 *
 * This module provides ONLY platform-specific singletons and Android ViewModels.
 * Shared DI (networkModule, dataModule, domainModule, presentationModule) is
 * loaded from sharedModules in SECTApplication.kt.
 *
 * Platform singletons provided:
 * - HttpClient (Ktor with OkHttp engine)
 * - TokenCache (EncryptedSharedPreferences)
 * - TimeProvider (System.currentTimeMillis)
 * - HttpClientFactory (OkHttp-based)
 * - NotificationService (FCM adapter)
 * - BiometricAuth (BiometricPrompt API 28+)
 * - PreferencesCache (DataStore<Preferences>)
 * - CoroutineScope (Main dispatcher + SupervisorJob)
 *
 * Load order:
 *   appModule (platform) → sharedModules (network → data → domain → presentation)
 */
val appModule = module {
    // ── Configuration ──
    single<String>(named("apiBaseUrl")) {
        "https://sect-zead.onrender.com"
    }

    // ── Platform-specific singletons ──

    single<HttpClientFactory> { AndroidHttpClientFactory() }

    single<HttpClient> {
        val factory = get<HttpClientFactory>()
        val tokenCache = get<TokenCache>()
        val apiAuthApi = get<AuthApi>()
        factory.create(
            baseUrl = get<String>(named("apiBaseUrl")),
            tokenProvider = { runBlocking { tokenCache.getAccessToken() } },
            refreshHandler = {
                try {
                    val rt = runBlocking { tokenCache.getRefreshToken() }
                    if (rt.isNotEmpty()) {
                        val dto = apiAuthApi.refresh(rt)
                        runBlocking {
                            tokenCache.saveAccessToken(dto.accessToken)
                            tokenCache.saveRefreshToken(dto.refreshToken)
                        }
                        dto.accessToken
                    } else ""
                } catch (_: Exception) { "" }
            }
        )
    }

    single<TokenCache> { AndroidTokenCache(androidContext()) }

    single<TimeProvider> { AndroidTimeProvider() }

    single<NotificationService> { AndroidNotificationService(androidContext()) }

    single<BiometricAuth> { AndroidBiometricAuth(androidContext()) }

    single<PreferencesCache> { AndroidPreferencesCache(androidContext()) }

    single<CoroutineScope> { CoroutineScope(SupervisorJob() + Dispatchers.Main) }

    // ── Android ViewModels (depend on SECTRepositoryInterface, not SECTRepository) ──
    viewModel { AuthViewModel(get<SECTRepositoryInterface>(), get<PushSubscriptionManager>()) }
    viewModel { DashboardViewModel(get<SECTRepositoryInterface>()) }
    viewModel { EpreuveViewModel(get<SECTRepositoryInterface>()) }
    viewModel { PassationViewModel(get<SECTRepositoryInterface>(), get<PushSubscriptionManager>()) }
    viewModel { MessagerieViewModel(get<SECTRepositoryInterface>(), get<PushSubscriptionManager>()) }
    viewModel { ProfileViewModel(get<SECTRepositoryInterface>()) }
}

// Helper for named qualifiers
private fun named(name: String) = org.koin.core.qualifier.named(name)
