// SECT Mobile — [DEPRECATED] Notification Service (expect/actual pattern)
// MIGRÉ vers interface + Koin DI :
// - Interface : com.sect.mobile.shared.platform.NotificationService
// - Android   : com.sect.mobile.shared.platform.AndroidNotificationService (FCM)
// - iOS       : com.sect.mobile.shared.platform.IOSNotificationService (APNs)
// - Injection : single<NotificationService> { AndroidNotificationService() / IOSNotificationService() }
//
// Ce fichier est conservé pour la compatibilité de compilation avec les actual declarations
// dans androidMain et iosMain. Il sera supprimé quand la migration DI sera complète.
package com.sect.mobile.shared.notification

import kotlinx.coroutines.flow.Flow

data class PushNotification(
    val id: String,
    val title: String,
    val body: String,
    val data: Map<String, String> = emptyMap(),
    val receivedAt: Long
)

@Deprecated(
    message = "Utilisez com.sect.mobile.shared.platform.NotificationService (interface) + Koin DI",
    level = DeprecationLevel.WARNING
)
expect class NotificationService() {
    suspend fun requestPermission(): Boolean
    suspend fun hasPermission(): Boolean
    suspend fun subscribeToTopic(topic: String)
    suspend fun unsubscribeFromTopic(topic: String)
    fun observeNotifications(): Flow<PushNotification>
    suspend fun getDeviceToken(): String?
    suspend fun registerDeviceWithBackend(userId: String)
}

object NotificationTopics {
    fun epreuveReminder(epreuveId: String) = "epreuve-$epreuveId"
    fun epreuveResult(epreuveId: String) = "result-$epreuveId"
    fun conversationMessages(conversationId: String) = "messages-$conversationId"
    fun etablissementAlerts(etablissementId: String) = "alerts-$etablissementId"
    fun filiereUpdates(filiereId: String) = "filiere-$filiereId"
}
