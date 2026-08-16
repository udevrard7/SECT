// SECT Mobile — Android Application (Koin DI + Firebase + Notification Channels)
package com.sect.mobile.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.google.firebase.FirebaseApp
import com.sect.mobile.android.di.appModule
import com.sect.mobile.shared.cache.initTokenCache
import com.sect.mobile.shared.di.sharedModules
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin

class SECTApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        // Initialiser Firebase
        FirebaseApp.initializeApp(this)

        // Initialiser le cache de tokens sécurisé
        initTokenCache(applicationContext)

        // Créer les canaux de notifications (Android 8+)
        createNotificationChannels()

        // Initialiser Koin DI
        // Load order: appModule (platform) → sharedModules (network → data → domain → presentation)
        startKoin {
            androidLogger()
            androidContext(this@SECTApplication)
            modules(appModule + sharedModules)
        }
    }

    /**
     * Create notification channels required for Android 8.0+ (API 26+).
     *
     * Channels:
     * - "sect_notifications" (IMPORTANCE_HIGH) — Main channel for results, messages, alerts
     * - "sect_reminders" (IMPORTANCE_DEFAULT) — Reminders for upcoming exams
     *
     * These channel IDs must match those used in MyFirebaseMessagingService.
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Main notifications channel (high priority)
            val mainChannel = NotificationChannel(
                "sect_notifications",
                "Notifications SECT",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications d'épreuves, résultats et messages"
                enableLights(true)
                lightColor = 0xFF10B981.toInt() // SECT green
                enableVibration(true)
                setShowBadge(true)
            }

            // Reminders channel (default priority — less intrusive)
            val reminderChannel = NotificationChannel(
                "sect_reminders",
                "Rappels d'épreuves",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Rappels pour les épreuves à venir"
                setShowBadge(true)
            }

            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(mainChannel)
            manager.createNotificationChannel(reminderChannel)
        }
    }
}
