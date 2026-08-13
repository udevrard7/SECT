// SECT Mobile — MessagerieViewModel (conversations + messages temps réel)
package com.sect.mobile.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sect.mobile.shared.domain.model.Conversation
import com.sect.mobile.shared.domain.model.Message
import com.sect.mobile.shared.repository.SECTRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MessagerieViewModel(private val repository: SECTRepository) : ViewModel() {

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
            } catch (e: Exception) {
                _conversations.value = UiState.Error(e.message ?: "Erreur")
            }
        }
    }

    /**
     * Sélectionner une conversation et charger ses messages.
     */
    fun selectConversation(conversationId: String) {
        _selectedConversationId.value = conversationId
        loadMessages(conversationId)
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
}
