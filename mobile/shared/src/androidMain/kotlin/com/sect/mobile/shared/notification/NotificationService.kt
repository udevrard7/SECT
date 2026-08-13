// SECT Mobile — NotificationService actual (Android — FCM)
// Uses Firebase Cloud Messaging for push notifications on Android.
package com.sect.mobile.shared.notification

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Android implementation of NotificationService using Firebase Cloud Messaging (FCM).
 *
 * Setup required:
 * 1. Add google-services.json to androidApp/
 * 2. Add firebase-messaging dependency to androidApp/build.gradle.kts
 * 3. Create a FirebaseMessagingService subclass in androidApp
 * 4. Call NotificationServiceAndroid.initialize() in SECTApplication.onCreate()
 *
 * In production, this calls FirebaseMessaging.getInstance() APIs.
 * This stub provides the expect/actual contract; FCM integration
 * will be completed when the Firebase project is configured.
 */
actual class NotificationService {

    private val _notifications = MutableSharedFlow<PushNotification>(extraBufferCapacity = 10)

    actual suspend fun requestPermission(): Boolean {
        // On Android 13+ (API 33), runtime permission POST_NOTIFICATIONS is required.
        // For now, return true — the Android app will handle the permission request
        // via ActivityCompat.requestPermissions() in MainActivity.
        // TODO: Implement with NotificationManagerCompat.areNotificationsEnabled()
        return true
    }

    actual suspend fun hasPermission(): Boolean {
        // TODO: Check NotificationManagerCompat.areNotificationsEnabled()
        return true
    }

    actual suspend fun subscribeToTopic(topic: String) {
        // TODO: Firebase.messaging.subscribeToTopic(topic)
        println("[NotificationService] Subscribe to topic: $topic")
    }

    actual suspend fun unsubscribeFromTopic(topic: String) {
        // TODO: Firebase.messaging.unsubscribeFromTopic(topic)
        println("[NotificationService] Unsubscribe from topic: $topic")
    }

    actual fun observeNotifications(): Flow<PushNotification> {
        return _notifications.asSharedFlow()
    }

    actual suspend fun getDeviceToken(): String? {
        // TODO: Firebase.messaging.token.await()
        return null
    }

    actual suspend fun registerDeviceWithBackend(userId: String) {
        // TODO:
        // 1. Get FCM token via Firebase.messaging.token.await()
        // 2. POST to SECT backend /api/push/subscribe with { userId, token, platform: "android" }
        println("[NotificationService] Register device for user: $userId")
    }

    /**
     * Called by the FirebaseMessagingService subclass when a message is received.
     * Converts the RemoteMessage to a PushNotification and emits it.
     */
    fun onMessageReceived(title: String, body: String, data: Map<String, String>) {
        val notification = PushNotification(
            id = data["id"] ?: System.currentTimeMillis().toString(),
            title = title,
            body = body,
            data = data,
            receivedAt = System.currentTimeMillis()
        )
        _notifications.tryEmit(notification)
    }
}
