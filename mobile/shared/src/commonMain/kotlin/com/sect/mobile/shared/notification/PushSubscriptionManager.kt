package com.sect.mobile.shared.notification

import com.sect.mobile.shared.domain.model.User
import com.sect.mobile.shared.platform.NotificationService
import com.sect.mobile.shared.platform.NotificationTopics

/**
 * PushSubscriptionManager — Centralise la logique d'abonnement/désabonnement
 * aux topics de notifications push selon le contexte utilisateur.
 *
 * Problème résolu (SECT-MOBILE-TOPIC-PUSH-1) :
 * Avant, AndroidNotificationService.subscribeToTopic() existait mais n'était
 * JAMAIS appelé par les ViewModels → les notifications topic-based (épreuve,
 * conversation, alertes) n'étaient jamais reçues par les devices Android.
 *
 * Ce manager est instancié via Koin (DataModule) et appelé par :
 * - AuthViewModel    : après login (subscribe alerts établissement) / logout (unsubscribe all)
 * - PassationViewModel : au démarrage d'une session (subscribe topic épreuve)
 * - MessagerieViewModel : à l'ouverture d'une conversation (subscribe topic messages)
 *
 * iOS utilise le même manager via SECTRepositoryInterface (le backend stocke
 * les subscriptions côté serveur pour le routing APNs).
 */
class PushSubscriptionManager(
    private val notificationService: NotificationService
) {
    // Topics actuellement souscrits (pour unsubscribe au logout)
    private val subscribedTopics = mutableSetOf<String>()

    /**
     * S'abonner aux topics globaux après un login réussi.
     * - alerts-{etablissementId} : alertes de l'établissement (responsable/enseignant)
     * - filiere-{filiereId}      : updates de la filière (étudiant/enseignant)
     *
     * À appeler dans AuthViewModel.login() après récupération du User.
     */
    suspend fun onUserLoggedIn(user: User) {
        // Alerts établissement (tous les rôles sauf ADMIN PaaS)
        val etabId = user.etablissementId
        if (!etabId.isNullOrEmpty()) {
            subscribe(NotificationTopics.etablissementAlerts(etabId))
        }
        // Updates filière (étudiants et enseignants rattachés à une filière)
        val filId = user.filiereId
        if (!filId.isNullOrEmpty()) {
            subscribe(NotificationTopics.filiereUpdates(filId))
        }
    }

    /**
     * Se désabonner de tous les topics au logout.
     * À appeler dans AuthViewModel.logout().
     */
    suspend fun onUserLoggedOut() {
        val topics = subscribedTopics.toList()
        subscribedTopics.clear()
        for (topic in topics) {
            try {
                notificationService.unsubscribeFromTopic(topic)
            } catch (_: Exception) {
                // Best-effort : on continue même si un unsubscribe échoue
            }
        }
    }

    /**
     * S'abonner au topic d'une épreuve (rappels + résultats).
     * À appeler quand l'étudiant ouvre une épreuve ou démarre une session.
     */
    suspend fun subscribeToEpreuve(epreuveId: String) {
        subscribe(NotificationTopics.epreuveReminder(epreuveId))
        subscribe(NotificationTopics.epreuveResult(epreuveId))
    }

    /**
     * S'abonner au topic des messages d'une conversation.
     * À appeler à l'ouverture d'une conversation (et unsubscribe à la fermeture).
     */
    suspend fun subscribeToConversation(conversationId: String) {
        subscribe(NotificationTopics.conversationMessages(conversationId))
    }

    /**
     * Se désabonner du topic des messages d'une conversation.
     * À appeler à la fermeture d'une conversation.
     */
    suspend fun unsubscribeFromConversation(conversationId: String) {
        unsubscribe(NotificationTopics.conversationMessages(conversationId))
    }

    // ── Helpers internes ──

    private suspend fun subscribe(topic: String) {
        if (subscribedTopics.add(topic)) {
            try {
                notificationService.subscribeToTopic(topic)
            } catch (_: Exception) {
                // Best-effort : le topic reste dans subscribedTopics pour retry éventuel
            }
        }
    }

    private suspend fun unsubscribe(topic: String) {
        if (subscribedTopics.remove(topic)) {
            try {
                notificationService.unsubscribeFromTopic(topic)
            } catch (_: Exception) {
                // Best-effort
            }
        }
    }
}
