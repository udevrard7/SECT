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
            messages = try await repository.listMessages(conversationId: conversation.id)
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
                before: oldest.createdAt.toString()
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
}
