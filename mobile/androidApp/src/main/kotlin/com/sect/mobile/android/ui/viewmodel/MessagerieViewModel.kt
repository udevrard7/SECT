// SECT Mobile — MessagerieViewModel (conversations + messages temps réel)
package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.android.ui.components.BadgeManager
import com.sect.mobile.shared.domain.model.Conversation
import com.sect.mobile.shared.domain.model.Message
import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.network.realtime.MessagerieRealtimeEvent
import com.sect.mobile.shared.network.realtime.MessagerieRealtimeService
import com.sect.mobile.shared.network.realtime.RealtimeState
import com.sect.mobile.shared.notification.PushSubscriptionManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MessagerieViewModel(
    private val repository: SECTRepositoryInterface,
    private val pushSubscriptionManager: PushSubscriptionManager,
    private val realtimeService: MessagerieRealtimeService
) : ViewModel() {

    // ── Conversations ──
    private val _conversations = MutableStateFlow<UiState<List<Conversation>>>(UiState.Loading)
    val conversations: StateFlow<UiState<List<Conversation>>> = _conversations.asStateFlow()

    // ── Messages d'une conversation ──
    private val _messages = MutableStateFlow<UiState<List<Message>>>(UiState.Loading)
    val messages: StateFlow<UiState<List<Message>>> = _messages.asStateFlow()

    private val _selectedConversationId = MutableStateFlow<String?>(null)
    val selectedConversationId: StateFlow<String?> = _selectedConversationId.asStateFlow()

    // ── Envoi de message ──
    private val _isSending = MutableStateFlow(false)
    val isSending: StateFlow<Boolean> = _isSending.asStateFlow()

    private val _messageText = MutableStateFlow("")
    val messageText: StateFlow<String> = _messageText.asStateFlow()

    init {
        loadConversations()
    }

    /**
     * Charger la liste des conversations.
     */
    fun loadConversations() {
        viewModelScope.launch {
            _conversations.value = UiState.Loading
            try {
                val result = repository.listConversations()
                _conversations.value = UiState.Success(result)
                // SECT-MOBILE-PARITY-T1-ACTIVATION : alimenter le BadgeManager
                // (était dead code avant — le badge Messages restait toujours à 0)
                BadgeManager.setUnreadMessages(result.sumOf { it.unreadCount })
            } catch (e: Exception) {
                _conversations.value = UiState.Error(e.message ?: "Erreur")
            }
        }
    }

    /**
     * Calculer le nombre total de messages non lus
     */
    fun getTotalUnreadCount(): Int {
        return (_conversations.value as? UiState.Success)?.data
            ?.sumOf { it.unreadCount }
            ?: 0
    }

    /**
     * Sélectionner une conversation et charger ses messages.
     * SECT-MOBILE-PARITY-T1-ACTIVATION : marque la conversation comme lue côté backend
     * + décrémente le badge Messages (était jamais appelé avant).
     */
    fun selectConversation(conversationId: String) {
        // SECT-MOBILE-TOPIC-PUSH-1 : se désabonner de l'ancienne conversation
        // et s'abonner à la nouvelle pour recevoir les push de nouveaux messages
        val previousId = _selectedConversationId.value
        if (previousId != null && previousId != conversationId) {
            viewModelScope.launch {
                pushSubscriptionManager.unsubscribeFromConversation(previousId)
            }
        }
        _selectedConversationId.value = conversationId
        viewModelScope.launch {
            pushSubscriptionManager.subscribeToConversation(conversationId)
        }
        loadMessages(conversationId)
        // SECT-MOBILE-PARITY-T1-ACTIVATION : markAsRead + badge refresh
        markAsRead(conversationId)
    }

    /**
     * Charger les messages d'une conversation.
     */
    fun loadMessages(conversationId: String, before: String? = null) {
        viewModelScope.launch {
            _messages.value = UiState.Loading
            try {
                val result = repository.listMessages(conversationId, before)
                _messages.value = UiState.Success(result)
            } catch (e: Exception) {
                _messages.value = UiState.Error(e.message ?: "Erreur")
            }
        }
    }

    /**
     * Envoyer un message.
     */
    fun sendMessage() {
        val conversationId = _selectedConversationId.value ?: return
        val text = _messageText.value.trim()
        if (text.isEmpty()) return

        viewModelScope.launch {
            _isSending.value = true
            try {
                val newMessage = repository.sendMessage(conversationId, text)
                _messageText.value = ""

                // Ajouter le message à la liste locale
                val currentMessages = (_messages.value as? UiState.Success)?.data ?: emptyList()
                _messages.value = UiState.Success(currentMessages + newMessage)
            } catch (e: Exception) {
                // Ne pas effacer le texte en cas d'erreur
            } finally {
                _isSending.value = false
            }
        }
    }

    /**
     * Mettre à jour le texte du message en cours de frappe.
     */
    fun onMessageTextChanged(text: String) {
        _messageText.value = text
    }

    /**
     * Charger plus de messages (pagination avant).
     */
    fun loadMoreMessages() {
        val conversationId = _selectedConversationId.value ?: return
        val oldestMessage = (_messages.value as? UiState.Success)?.data?.firstOrNull()
        val before = oldestMessage?.id
        if (before != null) {
            loadMessages(conversationId, before)
        }
    }

    /**
     * Retour à la liste des conversations.
     */
    fun backToConversations() {
        _selectedConversationId.value = null
        _messages.value = UiState.Loading
    }

    fun refresh() = loadConversations()

    // SECT-MOBILE-PARITY P1-9 : méthodes Messages avancées

    fun markAsRead(conversationId: String) {
        viewModelScope.launch {
            try {
                repository.markConversationAsRead(conversationId)
                // SECT-MOBILE-PARITY-T1-ACTIVATION : rafraîchir la liste pour que
                // les unreadCount soient recalculés côté client + badge mis à jour.
                loadConversations()
            } catch (_: Exception) {}
        }
    }

    fun toggleMute(conversationId: String, muted: Boolean) {
        viewModelScope.launch {
            try {
                repository.setConversationMuted(conversationId, muted)
                loadConversations()
            } catch (_: Exception) {}
        }
    }

    fun editMessage(messageId: String, newContent: String) {
        viewModelScope.launch {
            try {
                repository.editMessage(messageId, newContent)
                _selectedConversationId.value?.let { loadMessages(it) }
            } catch (_: Exception) {}
        }
    }

    fun deleteMessage(messageId: String) {
        viewModelScope.launch {
            try {
                repository.deleteMessage(messageId)
                _selectedConversationId.value?.let { loadMessages(it) }
            } catch (_: Exception) {}
        }
    }

    fun toggleReaction(messageId: String, emoji: String) {
        viewModelScope.launch {
            try {
                repository.toggleReaction(messageId, emoji)
                _selectedConversationId.value?.let { loadMessages(it) }
            } catch (_: Exception) {}
        }
    }

    fun signalMessage(messageId: String, raison: String) {
        viewModelScope.launch {
            try { repository.signalMessage(messageId, raison) } catch (_: Exception) {}
        }
    }

    fun startIAPrivateConversation() {
        viewModelScope.launch {
            try {
                val conv = repository.getOrCreateIAPrivateConversation()
                selectConversation(conv.id)
            } catch (_: Exception) {}
        }
    }

    // SECT-MOBILE-PARITY P1-8 : Correction IA des devoirs
    fun aiGradeSoumission(soumissionId: String) {
        viewModelScope.launch {
            try { repository.aiGradeSoumission(soumissionId) } catch (_: Exception) {}
        }
    }

    // SECT-MOBILE-PARITY-M1 : endpoints restants
    fun leaveConversation(conversationId: String) {
        viewModelScope.launch {
            try {
                repository.leaveConversation(conversationId)
                loadConversations()
            } catch (_: Exception) {}
        }
    }

    fun clearConversation(conversationId: String) {
        viewModelScope.launch {
            try {
                repository.clearConversation(conversationId)
                _selectedConversationId.value?.let { loadMessages(it) }
            } catch (_: Exception) {}
        }
    }

    fun hideMessages(messageIds: List<String>) {
        viewModelScope.launch {
            try { repository.hideMessages(messageIds) } catch (_: Exception) {}
        }
    }

    /** URL du flux SSE temps réel. */
    fun streamUrl(): String = "/api/messagerie/stream"

    // ════════════════════════════════════════════════════════
    // SECT-MOBILE-PARITY-M2 : Flux temps réel SSE
    // ════════════════════════════════════════════════════════

    private val _realtimeState = MutableStateFlow(RealtimeState.DISCONNECTED)
    val realtimeState: StateFlow<RealtimeState> = _realtimeState.asStateFlow()

    private val _typingUsers = MutableStateFlow<Set<String>>(emptySet())
    val typingUsers: StateFlow<Set<String>> = _typingUsers.asStateFlow()

    /**
     * Démarre la connexion SSE temps réel.
     * À appeler quand l'utilisateur ouvre la messagerie.
     */
    fun startRealtime() {
        realtimeService.connect(viewModelScope) { event ->
            handleRealtimeEvent(event)
        }
        viewModelScope.launch {
            realtimeService.state.collect { state ->
                _realtimeState.value = state
            }
        }
    }

    /**
     * Arrête la connexion SSE.
     * À appeler quand l'utilisateur quitte la messagerie.
     */
    fun stopRealtime() {
        realtimeService.disconnect()
        _typingUsers.value = emptySet()
    }

    /**
     * Traite un événement temps réel reçu du backend.
     *
     * Events backend (messagerie_hub.go) :
     * - message_new : recharger les messages + rafraîchir les conversations
     * - message_edited : recharger les messages
     * - message_deleted : recharger les messages
     * - read : mettre à jour le badge non-lu
     * - typing : afficher l'indicateur de frappe
     * - reaction_toggle : recharger les messages
     * - ia_streaming : afficher le streaming IA
     * - hello : connexion établie
     */
    private fun handleRealtimeEvent(event: MessagerieRealtimeEvent) {
        when (event.type) {
            "message_new" -> {
                // Nouveau message : recharger la conversation active + rafraîchir la liste
                val activeConvId = _selectedConversationId.value
                if (activeConvId != null && event.conversationId == activeConvId) {
                    loadMessages(activeConvId)
                }
                loadConversations()
            }
            "message_edited", "message_deleted", "reaction_toggle" -> {
                // Message modifié/supprimé/réaction : recharger la conversation active
                val activeConvId = _selectedConversationId.value
                if (activeConvId != null && event.conversationId == activeConvId) {
                    loadMessages(activeConvId)
                }
            }
            "read" -> {
                // Conversation marquée comme lue : rafraîchir les unread + badge.
                // SECT-MOBILE-PARITY-T1-ACTIVATION : loadConversations() alimente
                // maintenant BadgeManager.setUnreadMessages() automatiquement.
                loadConversations()
            }
            "typing" -> {
                // Indicateur de frappe : ajouter temporairement l'utilisateur
                // (le backend envoie {userId, conversationId})
                // On nettoie après 3s
                if (event.conversationId == _selectedConversationId.value) {
                    // Marquer comme "typing" — le UI affiche "..." pendant 3s
                    viewModelScope.launch {
                        _typingUsers.value = _typingUsers.value + event.conversationId.orEmpty()
                        kotlinx.coroutines.delay(3_000)
                        _typingUsers.value = _typingUsers.value - event.conversationId.orEmpty()
                    }
                }
            }
            "ia_streaming" -> {
                // Streaming IA : recharger pour afficher le contenu accumulé
                val activeConvId = _selectedConversationId.value
                if (activeConvId != null && event.conversationId == activeConvId) {
                    loadMessages(activeConvId)
                }
            }
            "hello" -> {
                // Connexion établie — pas d'action nécessaire
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopRealtime()
    }
}
