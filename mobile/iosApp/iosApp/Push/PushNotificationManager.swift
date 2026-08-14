// SECT Mobile — PushNotificationManager (APNs)
// Centralized push notification handling for SECT iOS app.
// Responsibilities: authorization, registration, foreground presentation, tap handling, token storage, backend registration.

import UIKit
import UserNotifications

/// PushNotificationManager — Centralized push notification handling for SECT.
///
/// Responsibilities:
/// - Request notification authorization (alert, badge, sound)
/// - Register for remote notifications via APNs
/// - Handle foreground notification presentation
/// - Handle notification tap → deep link navigation
/// - Store APNs device token in UserDefaults
/// - Send device token to SECT backend
///
/// Usage: Call `PushNotificationManager.shared.setup()` in SECTApp.init()
/// or in the first View's .onAppear.
final class PushNotificationManager: NSObject, UNUserNotificationCenterDelegate {
    
    static let shared = PushNotificationManager()
    
    /// Callback invoked when a deep link should be navigated (e.g., open epreuve detail).
    var onDeepLink: ((String, [String: Any]) -> Void)?
    
    /// Callback invoked when a notification is received while app is in foreground.
    var onForegroundNotification: ((String, String, [String: Any]) -> Void)?
    
    /// Current APNs device token (hex string).
    private(set) var deviceToken: String? {
        get { UserDefaults.standard.string(forKey: "sect_apns_token") }
        set { UserDefaults.standard.set(newValue, forKey: "sect_apns_token") }
    }
    
    private override init() { super.init() }
    
    // ── Setup ──
    
    /// Call once at app launch to set the delegate and request authorization.
    func setup() {
        UNUserNotificationCenter.current().delegate = self
        PushConfig.registerNotificationCategories()
        requestAuthorization()
    }
    
    /// Request notification authorization. On success, registers for remote notifications.
    func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] granted, error in
            if let error = error {
                print("[APNs] Authorization error: \(error)")
                return
            }
            if granted {
                print("[APNs] Authorization granted, registering for remote notifications")
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            } else {
                print("[APNs] Authorization denied by user")
            }
        }
    }
    
    /// Call this from AppDelegate.didRegisterForRemoteNotificationsWithDeviceToken.
    func didRegisterForRemoteNotifications(withDeviceToken deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02x", $0) }.joined()
        self.deviceToken = tokenString
        print("[APNs] Device token received: \(tokenString.prefix(16))...")
        
        // Send to backend (async, fire-and-forget)
        registerDeviceWithBackend(token: tokenString)
    }
    
    /// Call this from AppDelegate.didFailToRegisterForRemoteNotificationsWithError.
    func didFailToRegisterForRemoteNotifications(withError error: Error) {
        print("[APNs] Failed to register for remote notifications: \(error)")
    }
    
    // ── UNUserNotificationCenterDelegate ──
    
    /// Handle notification presentation while app is in foreground.
    /// Show the notification banner even when the app is active.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let userInfo = notification.request.content.userInfo
        let title = notification.request.content.title
        let body = notification.request.content.body
        
        print("[APNs] Foreground notification: \(title)")
        
        // Notify the app (for in-app banner)
        onForegroundNotification?(title, body, userInfo)
        
        // Show the notification banner (iOS 14+)
        completionHandler([.banner, .sound, .badge])
    }
    
    /// Handle notification tap (user tapped on notification).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        
        // Handle interactive notification actions
        switch response.actionIdentifier {
        case "VIEW_EPREUVE":
            if let epreuveId = userInfo["epreuveId"] as? String {
                onDeepLink?("epreuve", ["epreuveId": epreuveId])
            }
        case "VIEW_RESULTS":
            if let epreuveId = userInfo["epreuveId"] as? String {
                onDeepLink?("results", ["epreuveId": epreuveId])
            }
        case "REPLY_MESSAGE":
            if let textResponse = response as? UNTextInputNotificationResponse,
               let conversationId = userInfo["conversationId"] as? String {
                let replyText = textResponse.userText
                onDeepLink?("messages", ["conversationId": conversationId, "replyText": replyText])
            }
        case UNNotificationDefaultActionIdentifier:
            // Default tap — deep link based on notification type
            handleNotificationTap(userInfo: userInfo)
        default:
            break
        }
        
        completionHandler()
    }
    
    // ── Deep Link Handling ──
    
    private func handleNotificationTap(userInfo: [AnyHashable: Any]) {
        // Extract the notification type and target ID from the payload
        guard let type = userInfo["type"] as? String else { return }
        
        switch type {
        case "EPREUVE_PUBLISHED", "EPREUVE_REMINDER":
            if let epreuveId = userInfo["epreuveId"] as? String {
                onDeepLink?("epreuve", ["epreuveId": epreuveId])
            }
        case "RESULTAT_PUBLIE":
            if let epreuveId = userInfo["epreuveId"] as? String {
                onDeepLink?("results", ["epreuveId": epreuveId])
            }
        case "NEW_MESSAGE":
            if let conversationId = userInfo["conversationId"] as? String {
                onDeepLink?("messages", ["conversationId": conversationId])
            }
        case "AFFECTATION_PUBLISHED":
            onDeepLink?("dashboard", [:])
        default:
            onDeepLink?("notifications", [:])
        }
    }
    
    // ── Backend Registration ──
    
    /// Send the APNs device token to the SECT backend.
    private func registerDeviceWithBackend(token: String) {
        guard let userId = getCurrentUserId() else {
            print("[APNs] No user ID, will register after login")
            return
        }
        
        guard let baseUrl = getApiBaseUrl() else { return }
        
        let url = URL(string: "\(baseUrl)/api/push/mobile/register")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Add auth token if available
        if let authToken = getAuthToken() {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        
        let body: [String: Any] = [
            "userId": userId,
            "token": token,
            "platform": "ios",
            "bundleId": Bundle.main.bundleIdentifier ?? "com.ftci.app"
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                print("[APNs] Backend registration failed: \(error)")
                return
            }
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201 {
                print("[APNs] Device token registered with backend")
            } else if let httpResponse = response as? HTTPURLResponse {
                print("[APNs] Backend registration responded with status: \(httpResponse.statusCode)")
            }
        }.resume()
    }
    
    /// Subscribe to a topic (server-side — APNs doesn't have native topic subscriptions).
    /// Sends a POST to the backend which manages the subscription.
    func subscribeToTopic(_ topic: String) {
        sendTopicRequest(topic: topic, action: "subscribe")
    }
    
    /// Unsubscribe from a topic.
    func unsubscribeFromTopic(_ topic: String) {
        sendTopicRequest(topic: topic, action: "unsubscribe")
    }
    
    private func sendTopicRequest(topic: String, action: String) {
        guard let baseUrl = getApiBaseUrl(),
              let userId = getCurrentUserId() else { return }
        
        let url = URL(string: "\(baseUrl)/api/push/mobile/topic")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let authToken = getAuthToken() {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        
        let body: [String: Any] = [
            "userId": userId,
            "topic": topic,
            "action": action,
            "platform": "ios"
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { _, _, _ in }.resume()
    }
    
    /// Re-register device token with backend (call after login when userId becomes available).
    func reRegisterAfterLogin(userId: String) {
        UserDefaults.standard.set(userId, forKey: "sect_current_user_id")
        if let token = deviceToken {
            registerDeviceWithBackend(token: token)
        }
    }
    
    // ── Helpers ──
    
    private func getApiBaseUrl() -> String? {
        // Use the same API URL as the shared module
        return ProcessInfo.processInfo.environment["API_BASE_URL"] 
            ?? "https://sect-zead.onrender.com"
    }
    
    private func getCurrentUserId() -> String? {
        return UserDefaults.standard.string(forKey: "sect_current_user_id")
    }
    
    private func getAuthToken() -> String? {
        return UserDefaults.standard.string(forKey: "sect_access_token")
    }
}
