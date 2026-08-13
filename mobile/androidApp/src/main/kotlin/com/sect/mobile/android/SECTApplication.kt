// SECT Mobile — Android Application
package com.sect.mobile.android

import android.app.Application
import com.sect.mobile.shared.cache.initTokenCache

class SECTApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialiser le cache de tokens avec le contexte Android
        initTokenCache(applicationContext)
    }
}
