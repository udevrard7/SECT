// SECT Mobile — NotificationService actual (iOS — APNs)
// Uses Apple Push Notification service (APNs) for push notifications on iOS.
package com.sect.mobile.shared.notification

import com.sect.mobile.shared.util.currentTimeMillis
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * iOS implementation of NotificationService using Apple Push Notification service (APNs).
 *
 * Setup required:
 * 1. Enable Push Notifications capability in Xcode (SECTApp.entitlements)
 * 2. Register for remote notifications in SECTApp.swift (UIApplication.registerForRemoteNotifications)
 * 3. Implement UNUserNotificationCenterDelegate for foreground notification handling
 * 4. Send device token to SECT backend
 *
 * In production, this uses UNUserNotificationCenter APIs via Kotlin/Native interop.
 * This stub provides the expect/actual contract; APNs integration
 * will be completed when the Apple Developer account is configured.
 */
actual class NotificationService {

    private val _notifications = MutableSharedFlow<PushNotification>(extraBufferCapacity = 10)

    actual suspend fun requestPermission(): Boolean {
        // On iOS, this calls UNUserNotificationCenter.requestAuthorization(options: [.alert, .badge, .sound])
        // via Kotlin/Native interop.
        // TODO: Implement with platform.darwin APIs
        return true
    }

    actual suspend fun hasPermission(): Boolean {
        // TODO: Check UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        return true
    }

    actual suspend fun subscribeToTopic(topic: String) {
        // APNs doesn't have native topic subscriptions like FCM.
        // The SECT backend manages topic subscriptions server-side:
        // When the user subscribes to a topic, we POST to /api/push/subscribe
        // and the backend sends targeted pushes via APNs.
        println("[NotificationService] Subscribe to topic: $topic (server-side APNs)")
    }

    actual suspend fun unsubscribeFromTopic(topic: String) {
        println("[NotificationService] Unsubscribe from topic: $topic (server-side APNs)")
    }

    actual fun observeNotifications(): Flow<PushNotification> {
        return _notifications.asSharedFlow()
    }

    actual suspend fun getDeviceToken(): String? {
        // The device token is received in UIApplicationDelegate.didRegisterForRemoteNotificationsWithDeviceToken
        // Store it in UserDefaults or Keychain, then return it here.
        // TODO: Implement with NSUserDefaults / platform.darwin
        return null
    }

    actual suspend fun registerDeviceWithBackend(userId: String) {
        // TODO:
        // 1. Get APNs device token (stored from didRegisterForRemoteNotifications)
        // 2. POST to SECT backend /api/push/subscribe with { userId, token, platform: "ios" }
        println("[NotificationService] Register device for user: $userId (APNs)")
    }

    /**
     * Called from Swift when a remote notification is received.
     * Converts the userInfo dictionary to a PushNotification and emits it.
     */
    fun onMessageReceived(title: String, body: String, data: Map<String, String>) {
        val notification = PushNotification(
            id = data["id"] ?: currentTimeMillis().toString(),
            title = title,
            body = body,
            data = data,
            receivedAt = currentTimeMillis()
        )
        _notifications.tryEmit(notification)
    }
}
