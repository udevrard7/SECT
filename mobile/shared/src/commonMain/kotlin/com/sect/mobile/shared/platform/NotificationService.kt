package com.sect.mobile.shared.platform

import kotlinx.coroutines.flow.Flow

/**
 * PushNotification — A push notification received by the app.
 */
data class PushNotification(
    val id: String,
    val title: String,
    val body: String,
    val data: Map<String, String> = emptyMap(),
    val receivedAt: Long
)

/**
 * NotificationService — Interface for push notifications (DI-based).
 *
 * Replaces the old expect/actual pattern:
 *   OLD: expect class NotificationService() { ... }  (in notification/NotificationService.kt)
 *   NEW: interface NotificationService                (in platform/NotificationService.kt)
 *
 * Platform implementations:
 * - Android: Firebase Cloud Messaging (FCM)
 * - iOS:     Apple Push Notification service (APNs)
 *
 * Usage via Koin:
 *   val notificationService: NotificationService = get()
 */
interface NotificationService {
    /**
     * Request notification permission from the OS.
     * Returns true if permission was granted.
     */
    suspend fun requestPermission(): Boolean

    /**
     * Check if notification permission is currently granted.
     */
    suspend fun hasPermission(): Boolean

    /**
     * Subscribe to a push notification topic.
     * Examples: "epreuve-{id}", "messages-{conversationId}", "alerts-{etablissementId}"
     */
    suspend fun subscribeToTopic(topic: String)

    /**
     * Unsubscribe from a push notification topic.
     */
    suspend fun unsubscribeFromTopic(topic: String)

    /**
     * Observe incoming push notifications.
     * Used by ViewModels to react to notifications (e.g., show in-app banner).
     */
    fun observeNotifications(): Flow<PushNotification>

    /**
     * Get the current device push token (FCM token on Android, APNs token on iOS).
     * Returns null if not yet generated or permission not granted.
     */
    suspend fun getDeviceToken(): String?

    /**
     * Send the device token to the SECT backend for server-side push.
     * Called after login to register the device for the current user.
     */
    suspend fun registerDeviceWithBackend(userId: String)
}

/**
 * Notification topics used across the SECT app.
 */
object NotificationTopics {
    fun epreuveReminder(epreuveId: String) = "epreuve-$epreuveId"
    fun epreuveResult(epreuveId: String) = "result-$epreuveId"
    fun conversationMessages(conversationId: String) = "messages-$conversationId"
    fun etablissementAlerts(etablissementId: String) = "alerts-$etablissementId"
    fun filiereUpdates(filiereId: String) = "filiere-$filiereId"
}
