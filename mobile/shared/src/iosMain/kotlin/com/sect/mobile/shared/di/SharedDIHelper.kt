// SECT Mobile — SharedDIHelper: Swift↔Koin bridge for iOS
// Swift cannot directly call Koin's get<T>() due to Kotlin/Native type system
// limitations. This helper exposes typed resolution methods for iOS.
package com.sect.mobile.shared.di

import com.sect.mobile.shared.cache.TokenCache
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import org.koin.core.KoinApplication
import org.koin.core.module.Module
import org.koin.mp.KoinPlatform

/**
 * SharedDIHelper — Bridge for Swift to resolve Koin dependencies.
 *
 * Swift cannot directly call Koin's generic get<T>() because Kotlin/Native
 * generics are erased in the framework headers. This helper provides
 * typed properties that Swift can call directly.
 *
 * Usage from Swift:
 * ```swift
 * let repository = SharedDIHelper.shared.sectRepositoryInterface
 * let tokenCache = SharedDIHelper.shared.tokenCache
 * ```
 *
 * Prerequisite: Koin must be started (via KoinStartup.start()) before
 * calling any resolve methods. This is guaranteed by SECTApp.init().
 */
object SharedDIHelper {

    /**
     * Start Koin with the given modules.
     * Called from Swift KoinStartup.start().
     */
    fun startKoin(modules: List<Module>) {
        KoinPlatform.startKoin(modules = modules)
    }

    /**
     * Check if Koin is already started.
     */
    fun isKoinStarted(): Boolean {
        return try {
            KoinPlatform.getKoin()
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Resolve SECTRepositoryInterface from Koin.
     *
     * This is the primary access point for all iOS ViewModels.
     * Returns the SECTRepositoryImpl instance registered in DataModule,
     * typed as SECTRepositoryInterface (domain layer abstraction).
     */
    val sectRepositoryInterface: SECTRepositoryInterface
        get() = KoinPlatform.getKoin().get<SECTRepositoryInterface>()

    /**
     * Resolve TokenCache from Koin.
     *
     * Returns the IOSTokenCache instance registered in iosPlatformModule.
     * Used by KoinRepositoryProvider for in-memory token caching.
     */
    val tokenCache: TokenCache
        get() = KoinPlatform.getKoin().get<TokenCache>()
}
