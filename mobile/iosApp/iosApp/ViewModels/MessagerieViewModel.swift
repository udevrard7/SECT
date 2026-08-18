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
            // Utiliser l'API directe car createDirectConversation peut ne pas être visible
            // dans le protocol compilé si le cache Gradle n'est pas invalidé
            let conv = try await repository.createDirectConversation(targetUserId: otherUserId)
            selectedConversation = conv
            await loadMessages(conversationId: conv.id)
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
            if let convId = selectedConversation?.id { await loadMessages(conversationId: convId) }
        } catch {}
    }

    func deleteMessage(messageId: String) async {
        try? await repository.deleteMessage(messageId: messageId)
        if let convId = selectedConversation?.id { await loadMessages(conversationId: convId) }
    }

    func toggleReaction(messageId: String, emoji: String) async {
        try? await repository.toggleReaction(messageId: messageId, emoji: emoji)
        if let convId = selectedConversation?.id { await loadMessages(conversationId: convId) }
    }

    func startIAPrivate() async {
        do {
            let conv = try await repository.getOrCreateIAPrivateConversation()
            selectedConversation = conv
            await loadMessages(conversationId: conv.id)
        } catch {}
    }

    // SECT-MOBILE-PARITY P1-8 : Correction IA des devoirs
    func aiGradeSoumission(soumissionId: String) async {
        try? await repository.aiGradeSoumission(soumissionId: soumissionId)
    }
}
