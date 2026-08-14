// SECT Mobile — NotificationService Android (FCM) — real Firebase implementation
package com.sect.mobile.shared.platform

import android.app.Application
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.ktx.firebase
import com.google.firebase.messaging.ktx.messaging
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.tasks.await

/**
 * Android implementation of the NotificationService interface (DI-based).
 *
 * Uses Firebase Cloud Messaging (FCM) for:
 * - Topic subscriptions (epreuve, conversation, alert channels)
 * - Device token management (cached in SharedPreferences)
 * - Backend device registration (POST /api/push/mobile/register)
 * - In-app notification emission via SharedFlow
 *
 * Provided via Koin DI in AppModule:
 *   single<NotificationService> { AndroidNotificationService(androidContext()) }
 *
 * Connected to MyFirebaseMessagingService:
 * - onNewToken() → stores token + registers with backend
 * - onMessageReceived() → emits PushNotification + shows system notification
 */
class AndroidNotificationService(
    private val context: Application
) : NotificationService {

    private val _notifications = MutableSharedFlow<PushNotification>(extraBufferCapacity = 10)

    private val prefs by lazy {
        context.getSharedPreferences("sect_push_prefs", Context.MODE_PRIVATE)
    }

    override suspend fun requestPermission(): Boolean {
        // Android 13+ (API 33) requires POST_NOTIFICATIONS runtime permission.
        // The actual permission request is handled in MainActivity via ActivityCompat.
        // Here we just check the current status.
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    override suspend fun hasPermission(): Boolean {
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    override suspend fun subscribeToTopic(topic: String) {
        try {
            com.google.firebase.Firebase.messaging.subscribeToTopic(topic)
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        println("[FCM] Subscribed to topic: $topic")
                    } else {
                        println("[FCM] Failed to subscribe to topic: $topic — ${task.exception?.message}")
                    }
                }
        } catch (e: Exception) {
            println("[FCM] Error subscribing to topic: $topic — ${e.message}")
        }
    }

    override suspend fun unsubscribeFromTopic(topic: String) {
        try {
            com.google.firebase.Firebase.messaging.unsubscribeFromTopic(topic)
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        println("[FCM] Unsubscribed from topic: $topic")
                    } else {
                        println("[FCM] Failed to unsubscribe from topic: $topic — ${task.exception?.message}")
                    }
                }
        } catch (e: Exception) {
            println("[FCM] Error unsubscribing from topic: $topic — ${e.message}")
        }
    }

    override fun observeNotifications(): Flow<PushNotification> {
        return _notifications.asSharedFlow()
    }

    override suspend fun getDeviceToken(): String? {
        // First check cached token in SharedPreferences
        val cached = prefs.getString("fcm_token", null)
        if (cached != null) return cached

        // Otherwise fetch from FCM
        return try {
            val token = com.google.firebase.Firebase.messaging.token.await()
            prefs.edit().putString("fcm_token", token).apply()
            token
        } catch (e: Exception) {
            println("[FCM] Failed to get device token: ${e.message}")
            null
        }
    }

    override suspend fun registerDeviceWithBackend(userId: String) {
        val token = getDeviceToken() ?: run {
            println("[FCM] No device token available — cannot register with backend")
            return
        }

        try {
            // Get the API base URL from SharedPreferences or use default
            val apiBaseUrl = prefs.getString("api_base_url", null)
                ?: "https://sect-zead.onrender.com"

            // Get the Ktor HttpClient from Koin DI
            val client = org.koin.mp.KoinPlatform.getKoin().get<HttpClient>()

            val response = client.post {
                url("$apiBaseUrl/api/push/mobile/register")
                contentType(ContentType.Application.Json)
                setBody(
                    // Use simple map for the JSON body
                    mapOf(
                        "userId" to userId,
                        "token" to token,
                        "platform" to "android",
                        "bundleId" to "com.ftci.sect"
                    )
                )
            }

            if (response.status.value in 200..299) {
                println("[FCM] Device registered with backend for user: $userId")
                // Store the current user ID for token refresh registration
                prefs.edit().putString("current_user_id", userId).apply()
            } else {
                println("[FCM] Backend registration failed: ${response.status.value}")
            }
        } catch (e: Exception) {
            println("[FCM] Failed to register device with backend: ${e.message}")
        }
    }

    /**
     * Called by MyFirebaseMessagingService when a message is received.
     * Emits the notification to the SharedFlow for in-app consumption.
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

    /**
     * Called by MyFirebaseMessagingService when a new FCM token is generated.
     * Caches the token in SharedPreferences for later use.
     */
    fun onNewToken(token: String) {
        prefs.edit().putString("fcm_token", token).apply()
    }
}
