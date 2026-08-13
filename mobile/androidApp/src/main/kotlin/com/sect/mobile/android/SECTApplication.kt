// SECT Mobile — Android Application (Koin DI + TokenCache init)
package com.sect.mobile.android

import android.app.Application
import com.sect.mobile.android.di.appModule
import com.sect.mobile.shared.cache.initTokenCache
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin

class SECTApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        // Initialiser le cache de tokens sécurisé
        initTokenCache(applicationContext)

        // Initialiser Koin DI
        startKoin {
            androidLogger()
            androidContext(this@SECTApplication)
            modules(appModule)
        }
    }
}
