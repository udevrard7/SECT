// SECT Mobile — NotificationService iOS (APNs) — interface adapter
package com.sect.mobile.shared.platform

import com.sect.mobile.shared.platform.TimeProvider
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import platform.Foundation.NSUserDefaults

/**
 * iOS implementation of the NotificationService interface (DI-based).
 *
 * This adapter reads the APNs device token from NSUserDefaults
 * (stored by PushNotificationManager in Swift) and provides
 * the NotificationService contract for the shared KMP module.
 *
 * Topic subscriptions and backend registration are handled
 * by PushNotificationManager in Swift, since APNs doesn't
 * support native topic subscriptions like FCM.
 *
 * Provided via Koin DI in platformModule:
 *   single<NotificationService> { IOSNotificationService(get()) }
 */
class IOSNotificationService(
    private val timeProvider: TimeProvider
) : NotificationService {

    private val _notifications = MutableSharedFlow<PushNotification>(extraBufferCapacity = 10)
    
    // NSUserDefaults instance for reading token stored by Swift PushNotificationManager
    private val prefs by lazy { NSUserDefaults.standardUserDefaults }

    override suspend fun requestPermission(): Boolean {
        // On iOS, authorization is requested via PushNotificationManager.setup()
        // which is called in SECTApp.init(). This method checks the current status.
        return checkAuthorizationStatus()
    }

    override suspend fun hasPermission(): Boolean {
        return checkAuthorizationStatus()
    }

    override suspend fun subscribeToTopic(topic: String) {
        // APNs doesn't have native topic subscriptions.
        // The SECT backend manages topic subscriptions server-side.
        // PushNotificationManager.subscribeToTopic() is called from Swift.
        println("[APNs] Subscribe to topic: $topic (server-side, handled by PushNotificationManager)")
    }

    override suspend fun unsubscribeFromTopic(topic: String) {
        println("[APNs] Unsubscribe from topic: $topic (server-side, handled by PushNotificationManager)")
    }

    override fun observeNotifications(): Flow<PushNotification> {
        return _notifications.asSharedFlow()
    }

    override suspend fun getDeviceToken(): String? {
        // Read from NSUserDefaults where PushNotificationManager stores it
        val token = prefs.stringForKey("sect_apns_token")
        if (token != null) {
            println("[APNs] Device token retrieved from NSUserDefaults: ${token.take(16)}...")
        }
        return token
    }

    override suspend fun registerDeviceWithBackend(userId: String) {
        // Store userId so PushNotificationManager can use it for backend registration
        prefs.setObject(userId, forKey = "sect_current_user_id")
        println("[APNs] Device registration for user: $userId (backend registration handled by PushNotificationManager)")
    }

    /**
     * Called from Swift PushNotificationManager when a notification is received.
     * Converts the notification data to a PushNotification and emits it to the flow.
     */
    fun onMessageReceived(title: String, body: String, data: Map<String, String>) {
        val notification = PushNotification(
            id = data["id"] ?: timeProvider.currentTimeMillis().toString(),
            title = title,
            body = body,
            data = data,
            receivedAt = timeProvider.currentTimeMillis()
        )
        _notifications.tryEmit(notification)
    }

    /**
     * Check current notification authorization status.
     * Since PushNotificationManager.setup() already requested authorization
     * in SECTApp.init(), we optimistically return true.
     * A more accurate check would use UNUserNotificationCenter via Kotlin/Native interop.
     */
    private fun checkAuthorizationStatus(): Boolean {
        // If we have a stored token, authorization was definitely granted
        return prefs.stringForKey("sect_apns_token") != null
    }
}
