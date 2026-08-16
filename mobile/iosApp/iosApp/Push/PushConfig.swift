// SECT Mobile — PushConfig (APNs Notification Categories)
// Defines interactive notification categories for SECT push notifications.

import Foundation
import UserNotifications

/// Push notification configuration for SECT.
enum PushConfig {
    /// SECT notification categories for interactive notifications.
    ///
    /// Categories defined:
    /// - SECT_EPREUVE: "Voir l'épreuve" action button
    /// - SECT_RESULT: "Voir les résultats" action button
    /// - SECT_MESSAGE: "Répondre" text input action
    static func registerNotificationCategories() {
        // Epreuve notification category with "Voir" action
        let viewEpreuveAction = UNNotificationAction(
            identifier: "VIEW_EPREUVE",
            title: "Voir l'épreuve",
            options: .foreground
        )
        
        let epreuveCategory = UNNotificationCategory(
            identifier: "SECT_EPREUVE",
            actions: [viewEpreuveAction],
            intentIdentifiers: [],
            options: .customDismissAction
        )
        
        // Result notification category with "Voir résultats" action
        let viewResultsAction = UNNotificationAction(
            identifier: "VIEW_RESULTS",
            title: "Voir les résultats",
            options: .foreground
        )
        
        let resultCategory = UNNotificationCategory(
            identifier: "SECT_RESULT",
            actions: [viewResultsAction],
            intentIdentifiers: [],
            options: .customDismissAction
        )
        
        // Message notification category with "Répondre" action
        let replyAction = UNTextInputNotificationAction(
            identifier: "REPLY_MESSAGE",
            title: "Répondre",
            options: [],
            textInputButtonTitle: "Envoyer",
            textInputPlaceholder: "Votre message..."
        )
        
        let messageCategory = UNNotificationCategory(
            identifier: "SECT_MESSAGE",
            actions: [replyAction],
            intentIdentifiers: [],
            options: .customDismissAction
        )
        
        UNUserNotificationCenter.current().setNotificationCategories([
            epreuveCategory,
            resultCategory,
            messageCategory
        ])
        
        print("[APNs] Notification categories registered: SECT_EPREUVE, SECT_RESULT, SECT_MESSAGE")
    }
}
