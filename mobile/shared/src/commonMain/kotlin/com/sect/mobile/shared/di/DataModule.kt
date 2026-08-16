package com.sect.mobile.shared.di

import com.sect.mobile.shared.data.repository.SECTRepositoryImpl
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.notification.PushSubscriptionManager
import com.sect.mobile.shared.platform.NotificationService
import com.sect.mobile.shared.repository.AutoSaveService
import kotlinx.coroutines.CoroutineScope
import org.koin.dsl.module

/**
 * Koin module for data layer: Repository + AutoSaveService + PushSubscriptionManager.
 *
 * Registers SECTRepositoryImpl (which uses mappers) as SECTRepositoryInterface,
 * so all consumers depend on the domain interface — not the concrete data class.
 *
 * Depends on:
 * - networkModule (AuthApi, UserApi, EpreuveApi, SessionApi, MessagerieApi)
 * - platformModule (TokenCache, CoroutineScope, NotificationService)
 */
val dataModule = module {
    single<SECTRepositoryInterface> {
        SECTRepositoryImpl(
            authApi = get(),
            userApi = get(),
            epreuveApi = get(),
            sessionApi = get(),
            messagerieApi = get(),
            statsApi = get(),
            resultatsApi = get(),
            devoirApi = get(),
            tokenCache = get()
        )
    }
    single { AutoSaveService(get(), scope = get<CoroutineScope>()) }
    single { PushSubscriptionManager(get<NotificationService>()) }
}
