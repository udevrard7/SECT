package com.sect.mobile.shared.di

import com.sect.mobile.shared.data.repository.SECTRepositoryImpl
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.repository.AutoSaveService
import kotlinx.coroutines.CoroutineScope
import org.koin.dsl.module

/**
 * Koin module for data layer: Repository + AutoSaveService.
 *
 * Registers SECTRepositoryImpl (which uses mappers) as SECTRepositoryInterface,
 * so all consumers depend on the domain interface — not the concrete data class.
 *
 * Depends on:
 * - networkModule (AuthApi, UserApi, EpreuveApi, SessionApi, MessagerieApi)
 * - platformModule (TokenCache, CoroutineScope)
 */
val dataModule = module {
    single<SECTRepositoryInterface> {
        SECTRepositoryImpl(
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
