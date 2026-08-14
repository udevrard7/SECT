package com.sect.mobile.shared.network.api

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*

/**
 * PushApi — API client for mobile push notification registration.
 *
 * Endpoints:
 * - POST /api/push/mobile/register — Register device token (FCM/APNs)
 * - DELETE /api/push/mobile/register — Deactivate device token
 * - POST /api/push/mobile/topic — Subscribe/unsubscribe to a topic
 */
class PushApi(private val client: HttpClient) {

    /**
     * Register a mobile device token with the backend.
     * Called after FCM token is received (Android) or APNs token is received (iOS).
     */
    suspend fun registerDeviceToken(
        userId: String,
        token: String,
        platform: String, // "android" or "ios"
        bundleId: String = if (platform == "android") "ci.sect.app" else "ci.sect.app.ios"
    ) {
        client.post("/api/push/mobile/register") {
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "userId" to userId,
                "token" to token,
                "platform" to platform,
                "bundleId" to bundleId
            ))
        }
    }

    /**
     * Deactivate a device token (e.g., user logged out).
     */
    suspend fun unregisterDeviceToken(platform: String) {
        client.delete("/api/push/mobile/register") {
            contentType(ContentType.Application.Json)
            setBody(mapOf("platform" to platform))
        }
    }

    /**
     * Subscribe to a notification topic.
     * For iOS (APNs), this is stored server-side for routing.
     * For Android (FCM), FCM handles topic routing automatically.
     */
    suspend fun subscribeToTopic(topic: String, platform: String) {
        client.post("/api/push/mobile/topic") {
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "topic" to topic,
                "action" to "subscribe",
                "platform" to platform
            ))
        }
    }

    /**
     * Unsubscribe from a notification topic.
     */
    suspend fun unsubscribeFromTopic(topic: String, platform: String) {
        client.post("/api/push/mobile/topic") {
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "topic" to topic,
                "action" to "unsubscribe",
                "platform" to platform
            ))
        }
    }
}
