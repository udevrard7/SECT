// SECT Mobile — Firebase Cloud Messaging Service
package com.sect.mobile.android.push

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.sect.mobile.android.MainActivity
import com.sect.mobile.shared.platform.AndroidNotificationService
import org.koin.mp.KoinPlatform

/**
 * MyFirebaseMessagingService — Handles incoming FCM messages and token refresh.
 *
 * Responsibilities:
 * - onNewToken: Store the FCM token locally and register with the backend
 * - onMessageReceived: Show system notification + emit to in-app SharedFlow
 *
 * Notification channels:
 * - "sect_notifications" (IMPORTANCE_HIGH) — Main channel for results, messages, alerts
 * - "sect_reminders" (IMPORTANCE_DEFAULT) — Reminders for upcoming exams
 *
 * Deep links supported (via data payload):
 * - epreuveId    → navigate to exam detail screen
 * - sessionId    → navigate to exam session screen
 * - conversationId → navigate to conversation screen
 */
class MyFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FCM"
        const val CHANNEL_ID = "sect_notifications"
        const val CHANNEL_REMINDERS_ID = "sect_reminders"

        // Deep link data keys
        const val KEY_EPREUVE_ID = "epreuveId"
        const val KEY_SESSION_ID = "sessionId"
        const val KEY_CONVERSATION_ID = "conversationId"
        const val KEY_NOTIFICATION_TYPE = "type"
    }

    /**
     * Called when a new FCM registration token is generated.
     * This happens when:
     * - The app is restored on a new device
     * - The user uninstalls/reinstalls the app
     * - The FCM token expires (rarely)
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        println("[$TAG] New FCM token received: ${token.take(10)}...")

        // Store token in SharedPreferences via the DI NotificationService
        try {
            val notificationService = KoinPlatform.getKoin().get<AndroidNotificationService>()
            notificationService.onNewToken(token)
        } catch (e: Exception) {
            // Koin may not be initialized yet — store directly in SharedPreferences
            println("[$TAG] Koin not available yet, caching token directly")
            getSharedPreferences("sect_push_prefs", Context.MODE_PRIVATE)
                .edit()
                .putString("fcm_token", token)
                .apply()
        }

        // Attempt to register with backend if we have a stored user ID
        tryRegisterWithBackend(token)
    }

    /**
     * Called when an FCM message is received.
     * This is called for BOTH notification messages and data messages.
     * For notification-only messages, this is called only when the app is in the foreground.
     */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data = message.data
        val title = data["title"] ?: message.notification?.title ?: "SECT"
        val body = data["body"] ?: message.notification?.body ?: ""

        println("[$TAG] Message received — title: $title, data keys: ${data.keys}")

        // 1. Emit to SharedFlow for in-app banner (foreground)
        emitToNotificationService(title, body, data)

        // 2. Always show a system notification
        showSystemNotification(title, body, data)
    }

    /**
     * Emit the notification to the SharedFlow via AndroidNotificationService.
     * This allows ViewModels to react to notifications (e.g., show in-app banner).
     */
    private fun emitToNotificationService(title: String, body: String, data: Map<String, String>) {
        try {
            val notificationService = KoinPlatform.getKoin().get<AndroidNotificationService>()
            notificationService.onMessageReceived(title, body, data)
        } catch (e: Exception) {
            println("[$TAG] Could not emit to NotificationService: ${e.message}")
        }
    }

    /**
     * Show a system notification with appropriate channel and deep link.
     */
    private fun showSystemNotification(title: String, body: String, data: Map<String, String>) {
        val notificationId = (data["id"] ?: System.currentTimeMillis().toString()).hashCode()

        // Determine the notification channel
        val type = data[KEY_NOTIFICATION_TYPE]
        val channelId = if (type == "reminder") CHANNEL_REMINDERS_ID else CHANNEL_ID

        // Build the deep link intent
        val contentIntent = buildDeepLinkIntent(data)
        val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val contentPendingIntent = PendingIntent.getActivity(
            this,
            notificationId,
            contentIntent,
            pendingIntentFlags
        )

        // Build the notification
        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info) // TODO: Replace with R.drawable.ic_notification_sect
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText(body)
            )
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(contentPendingIntent)
            .setAutoCancel(true)
            .setShowWhen(true)
            .setColor(0xFF10B981.toInt()) // SECT green (#10B981)
            .setDefaults(NotificationCompat.DEFAULT_ALL)

        // Add action buttons based on notification type
        addNotificationActions(builder, data, notificationId)

        // Show the notification
        try {
            NotificationManagerCompat.from(this).notify(notificationId, builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS permission not granted on Android 13+
            println("[$TAG] Cannot show notification — permission not granted: ${e.message}")
        }
    }

    /**
     * Build a deep link intent based on the data payload.
     *
     * Supported deep links:
     * - epreuveId    → sect://epreuve/{id}
     * - sessionId    → sect://session/{id}
     * - conversationId → sect://conversation/{id}
     */
    private fun buildDeepLinkIntent(data: Map<String, String>): Intent {
        val epreuveId = data[KEY_EPREUVE_ID]
        val sessionId = data[KEY_SESSION_ID]
        val conversationId = data[KEY_CONVERSATION_ID]

        val deepLink = when {
            epreuveId != null -> "sect://epreuve/$epreuveId"
            sessionId != null -> "sect://session/$sessionId"
            conversationId != null -> "sect://conversation/$conversationId"
            else -> null
        }

        return if (deepLink != null) {
            Intent(Intent.ACTION_VIEW, android.net.Uri.parse(deepLink)).apply {
                setPackage(packageName)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
        } else {
            // Fallback: open the main activity
            Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
        }
    }

    /**
     * Add contextual action buttons to the notification based on its type.
     *
     * Actions:
     * - "result" or "correction" → "Voir les résultats"
     * - "message" → "Ouvrir la conversation"
     * - "reminder" → "Voir l'épreuve"
     */
    private fun addNotificationActions(
        builder: NotificationCompat.Builder,
        data: Map<String, String>,
        notificationId: Int
    ) {
        val type = data[KEY_NOTIFICATION_TYPE] ?: return

        val actionLabel = when (type) {
            "result", "correction" -> "Voir les résultats"
            "message" -> "Ouvrir la conversation"
            "reminder" -> "Voir l'épreuve"
            else -> return
        }

        val actionIntent = buildDeepLinkIntent(data)
        val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val actionPendingIntent = PendingIntent.getActivity(
            this,
            notificationId + 1, // Unique request code for the action
            actionIntent,
            pendingIntentFlags
        )

        builder.addAction(
            android.R.drawable.ic_menu_view, // TODO: Replace with custom icon
            actionLabel,
            actionPendingIntent
        )
    }

    /**
     * Try to register the new token with the SECT backend.
     * This requires a stored userId — if not available, the registration
     * will be deferred to login time.
     */
    private fun tryRegisterWithBackend(token: String) {
        val prefs = getSharedPreferences("sect_push_prefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("current_user_id", null)

        if (userId != null) {
            try {
                val notificationService = KoinPlatform.getKoin().get<AndroidNotificationService>()
                kotlinx.coroutines.runBlocking {
                    notificationService.registerDeviceWithBackend(userId)
                }
            } catch (e: Exception) {
                println("[$TAG] Could not register token with backend: ${e.message}")
            }
        } else {
            println("[$TAG] No stored user ID — token registration deferred to login")
        }
    }
}
