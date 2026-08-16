// SECT Mobile — SECTAppDelegate (APNs Registration Bridge)
// SwiftUI's App lifecycle doesn't directly expose didRegisterForRemoteNotificationsWithDeviceToken.
// This UIResponder subclass bridges the gap.

import UIKit

/// SECTAppDelegate — Handles APNs device token registration callbacks.
///
/// SwiftUI's App lifecycle doesn't directly expose `didRegisterForRemoteNotificationsWithDeviceToken`.
/// This UIResponder subclass bridges the gap.
///
/// Usage: Add `@UIApplicationDelegateAdaptor(SECTAppDelegate.self)` to SECTApp.
final class SECTAppDelegate: NSObject, UIApplicationDelegate {
    
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        PushNotificationManager.shared.didRegisterForRemoteNotifications(withDeviceToken: deviceToken)
    }
    
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        PushNotificationManager.shared.didFailToRegisterForRemoteNotifications(withError: error)
    }
}
