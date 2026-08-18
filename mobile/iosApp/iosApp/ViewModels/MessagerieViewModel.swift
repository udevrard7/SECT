// SECT Mobile — iOS Messagerie ViewModel
import SwiftUI
import Shared

@MainActor
class MessagerieViewModel: ObservableObject {
    @Published var conversations: [Conversation] = []
    @Published var selectedConversation: Conversation? = nil
    @Published var messages: [Message] = []
    @Published var newMessageText: String = ""
    @Published var isLoadingConversations = false
    @Published var isLoadingMessages = false
    @Published var isSendingMessage = false
    @Published var availableUsers: [User] = []
    @Published var isLoadingUsers = false
    @Published var error: String? = nil

    private let repository = KoinRepositoryProvider.shared.repository
    private let pageSize: Int = 20

    // ── Conversations ──

    func loadConversations() async {
        isLoadingConversations = true
        error = nil
        do {
            conversations = try await repository.listConversations()
        } catch {
            self.error = error.localizedDescription
        }
        isLoadingConversations = false
    }

    func selectConversation(_ conversation: Conversation) async {
        selectedConversation = conversation
        await loadMessages()
    }

    // ── Messages ──

    func loadMessages() async {
        guard let conversation = selectedConversation else { return }
        isLoadingMessages = true
        error = nil
        do {
            messages = try await repository.listMessages(conversationId: conversation.id, before: nil)
        } catch {
            self.error = error.localizedDescription
        }
        isLoadingMessages = false
    }

    func loadOlderMessages() async {
        guard let conversation = selectedConversation, let oldest = messages.first else { return }
        isLoadingMessages = true
        do {
            let older = try await repository.listMessages(
                conversationId: conversation.id,
                before: oldest.createdAt
            )
            messages.insert(contentsOf: older, at: 0)
        } catch {
            self.error = error.localizedDescription
        }
        isLoadingMessages = false
    }

    // ── Send Message ──

    func sendMessage() async {
        guard let conversation = selectedConversation, !newMessageText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let text = newMessageText
        newMessageText = ""
        isSendingMessage = true
        error = nil
        do {
            let message = try await repository.sendMessage(conversationId: conversation.id, contenu: text)
            messages.append(message)
        } catch {
            self.error = error.localizedDescription
            newMessageText = text  // Restore on failure
        }
        isSendingMessage = false
    }

    // ── Pagination ──

    var hasMoreMessages: Bool {
        return messages.count >= pageSize
    }

    // ── Available Users (pour nouvelle conversation) ──

    func loadAvailableUsers() async {
        isLoadingUsers = true
        do {
            let result = try await repository.listUsers(
                search: nil,
                role: nil,
                etablissementId: nil,
                page: 1,
                limit: 50
            )
            availableUsers = result.users
        } catch {
            self.error = error.localizedDescription
        }
        isLoadingUsers = false
    }

    func createConversation(otherUserId: String) async {
        // SECT-MOBILE-PARITY P1-9 : création conversation direct
        do {
            let conv = try await repository.createDirectConversation(targetUserId: otherUserId)
            selectedConversation = conv
            await loadMessages()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // SECT-MOBILE-PARITY P1-9 : méthodes Messages avancées

    func markAsRead(conversationId: String) async {
        try? await repository.markConversationAsRead(conversationId: conversationId)
    }

    func toggleMute(conversationId: String, muted: Bool) async {
        try? await repository.setConversationMuted(conversationId: conversationId, muted: muted)
        await loadConversations()
    }

    func editMessage(messageId: String, newContent: String) async {
        do {
            _ = try await repository.editMessage(messageId: messageId, contenu: newContent)
            await loadMessages()
        } catch {}
    }

    func deleteMessage(messageId: String) async {
        try? await repository.deleteMessage(messageId: messageId)
        await loadMessages()
    }

    func toggleReaction(messageId: String, emoji: String) async {
        try? await repository.toggleReaction(messageId: messageId, emoji: emoji)
        await loadMessages()
    }

    func startIAPrivate() async {
        do {
            let conv = try await repository.getOrCreateIAPrivateConversation()
            selectedConversation = conv
            await loadMessages()
        } catch {}
    }

    // SECT-MOBILE-PARITY P1-8 : Correction IA des devoirs
    func aiGradeSoumission(soumissionId: String) async {
        try? await repository.aiGradeSoumission(soumissionId: soumissionId)
    }

    // SECT-MOBILE-PARITY-M1 : endpoints restants
    func leaveConversation(conversationId: String) async {
        try? await repository.leaveConversation(conversationId: conversationId)
        await loadConversations()
    }

    func clearConversation(conversationId: String) async {
        try? await repository.clearConversation(conversationId: conversationId)
        await loadMessages()
    }

    func hideMessages(messageIds: [String]) async {
        try? await repository.hideMessages(messageIds: messageIds)
    }

    func streamUrl() -> String {
        return "/api/messagerie/stream"
    }

    // ════════════════════════════════════════════════════════
    // SECT-MOBILE-PARITY-M2 : Flux temps réel SSE
    // ════════════════════════════════════════════════════════

    @Published var realtimeState: String = "disconnected" // disconnected, connecting, connected, error
    @Published var typingIndicator: Bool = false
    private var sseTask: Task<Void, Never>?

    /**
     * Démarre la connexion SSE temps réel.
     * À appeler quand l'utilisateur ouvre la messagerie.
     */
    func startRealtime() {
        guard sseTask == nil else { return }
        realtimeState = "connecting"

        let token = KoinRepositoryProvider.shared.cachedAccessToken
        guard !token.isEmpty else { return }

        let streamPath = "/api/messagerie/stream"
        let fullUrl = "https://sect-zead.onrender.com\(streamPath)"

        sseTask = Task { [weak self] in
            var request = URLRequest(url: URL(string: fullUrl)!)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")

            do {
                let (bytes, response) = try await URLSession.shared.bytes(for: request)
                guard let httpResponse = response as? HTTPURLResponse,
                      httpResponse.statusCode == 200 else { return }

                await MainActor.run { self?.realtimeState = "connected" }

                var currentEvent = ""
                var currentData = ""

                for try await line in bytes.lines {
                    if Task.isCancelled { break }

                    if line.hasPrefix("event:") {
                        currentEvent = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                    } else if line.hasPrefix("data:") {
                        currentData += String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                    } else if line.isEmpty && !currentData.isEmpty {
                        // Fin d'événement — traiter
                        await self?.handleRealtimeEvent(type: currentEvent, data: currentData)
                        currentEvent = ""
                        currentData = ""
                    }
                }
            } catch {
                if !Task.isCancelled {
                    await MainActor.run { self?.realtimeState = "error" }
                    // Auto-reconnect après 5s
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    await MainActor.run { self?.startRealtime() }
                }
            }
        }
    }

    /**
     * Arrête la connexion SSE.
     */
    func stopRealtime() {
        sseTask?.cancel()
        sseTask = nil
        realtimeState = "disconnected"
        typingIndicator = false
    }

    /**
     * Traite un événement temps réel reçu du backend.
     */
    private func handleRealtimeEvent(type: String, data: String) async {
        // Parser le JSON pour extraire conversationId
        guard let jsonData = data.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else { return }

        let eventType = type.isEmpty ? (json["type"] as? String ?? "") : type
        let innerData = json["data"] as? [String: Any]
        let conversationId = innerData?["conversationId"] as? String
        let activeConvId = selectedConversation?.id

        switch eventType {
        case "message_new":
            // Nouveau message : recharger la conversation active + rafraîchir la liste
            if conversationId == activeConvId { await loadMessages() }
            await loadConversations()

        case "message_edited", "message_deleted", "reaction_toggle":
            // Message modifié/supprimé/réaction : recharger la conversation active
            if conversationId == activeConvId { await loadMessages() }

        case "read":
            // Conversation marquée comme lue : rafraîchir les unread
            await loadConversations()

        case "typing":
            // Indicateur de frappe pendant 3s
            if conversationId == activeConvId {
                await MainActor.run { self.typingIndicator = true }
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await MainActor.run { self.typingIndicator = false }
            }

        case "ia_streaming":
            // Streaming IA : recharger pour afficher le contenu accumulé
            if conversationId == activeConvId { await loadMessages() }

        case "hello":
            // Connexion établie — pas d'action nécessaire
            break

        default:
            break
        }
    }

    deinit {
        sseTask?.cancel()
    }
}
