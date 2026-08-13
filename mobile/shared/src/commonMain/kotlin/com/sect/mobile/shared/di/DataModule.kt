package com.sect.mobile.shared.di

import com.sect.mobile.shared.cache.TokenCache
import com.sect.mobile.shared.repository.SECTRepository
import com.sect.mobile.shared.repository.AutoSaveService
import kotlinx.coroutines.CoroutineScope
import org.koin.dsl.module

/**
 * Koin module for data layer: Repository + AutoSaveService.
 *
 * Depends on:
 * - networkModule (AuthApi, UserApi, EpreuveApi, SessionApi, MessagerieApi)
 * - platformModule (TokenCache, CoroutineScope)
 */
val dataModule = module {
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
    single { AutoSaveService(get(), scope = get<CoroutineScope>()) }
}
