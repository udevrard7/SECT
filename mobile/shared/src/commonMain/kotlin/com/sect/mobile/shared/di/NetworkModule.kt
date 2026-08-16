package com.sect.mobile.shared.di

import com.sect.mobile.shared.network.api.*
import io.ktor.client.*
import org.koin.dsl.module

/**
 * Koin module for network layer: HttpClient + API services.
 *
 * Platform-specific engines are provided by PlatformModule.
 * The HttpClient singleton must be provided by the platform module
 * before this module is loaded.
 *
 * Load order: platformModule → networkModule → dataModule → domainModule
 */
val networkModule = module {
    single<AuthApi> { AuthApi(get()) }
    single<UserApi> { UserApi(get()) }
    single<EpreuveApi> { EpreuveApi(get()) }
    single<SessionApi> { SessionApi(get()) }
    single<MessagerieApi> { MessagerieApi(get()) }
    single { PushApi(get()) }
    single<StatsApi> { StatsApi(get()) }
    single<ResultatsApi> { ResultatsApi(get()) }
    single<DevoirApi> { DevoirApi(get()) }
}
