// SECT Mobile — Dependency Injection (Koin)
package com.sect.mobile.android.di

import com.sect.mobile.android.ui.viewmodel.*
import com.sect.mobile.shared.cache.createTokenCache
import com.sect.mobile.shared.network.api.*
import com.sect.mobile.shared.network.client.createHttpClient
import com.sect.mobile.shared.repository.SECTRepository
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import org.koin.androidx.viewmodel.dsl.viewModel
import org.koin.dsl.module

/**
 * Module Koin pour l'application SECT Android.
 *
 * Injection en cascade :
 * HttpClient → APIs → Repository → ViewModels
 */
val appModule = module {
    // ── Configuration ──
    single<String>(named("apiBaseUrl")) {
        // En debug: configurable via BuildConfig, en prod: Render
        "https://sect-zead.onrender.com"
    }

    // ── HttpClient (Ktor + OkHttp) ──
    single<HttpClient> {
        val tokenCache = get<com.sect.mobile.shared.cache.TokenCache>()
        createHttpClient(
            engine = OkHttp.create(),
            baseUrl = get<String>(named("apiBaseUrl")),
            tokenProvider = { kotlinx.coroutines.runBlocking { tokenCache.getAccessToken() } },
            refreshHandler = {
                // TODO: Implémenter le refresh flow via AuthApi
                ""
            }
        )
    }

    // ── Token Cache ──
    single<com.sect.mobile.shared.cache.TokenCache> { createTokenCache() }

    // ── API Services ──
    single<AuthApi> { AuthApi(get()) }
    single<UserApi> { UserApi(get()) }
    single<EpreuveApi> { EpreuveApi(get()) }
    single<SessionApi> { SessionApi(get()) }
    single<MessagerieApi> { MessagerieApi(get()) }

    // ── Repository ──
    single<SECTRepository> {
        SECTRepository(
            authApi = get(),
            userApi = get(),
            epreuveApi = get(),
            sessionApi = get(),
            messagerieApi = get(),
            tokenCache = get()
        )
    }

    // ── ViewModels ──
    viewModel { AuthViewModel(get()) }
    viewModel { DashboardViewModel(get()) }
    viewModel { EpreuveViewModel(get()) }
    viewModel { PassationViewModel(get()) }
    viewModel { MessagerieViewModel(get()) }
    viewModel { ProfileViewModel(get()) }
}

// Helper for named qualifiers
private fun named(name: String) = org.koin.core.qualifier.named(name)
