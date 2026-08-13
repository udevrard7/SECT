package com.sect.mobile.shared.presentation.viewmodel

import com.sect.mobile.shared.domain.repository.SECTRepositoryInterface
import com.sect.mobile.shared.presentation.action.MessagerieAction
import com.sect.mobile.shared.presentation.effect.AppEffect
import com.sect.mobile.shared.presentation.state.MessagerieState
import com.sect.mobile.shared.presentation.state.UiState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch

class MessagerieViewModel(
    private val repository: SECTRepositoryInterface,
    private val scope: CoroutineScope
) {
    private val _state = MutableStateFlow(MessagerieState())
    val state: StateFlow<MessagerieState> = _state.asStateFlow()

    private val _effects = MutableSharedFlow<AppEffect>(extraBufferCapacity = 10)
    val effects = _effects.asSharedFlow()

    fun handleAction(action: MessagerieAction) {
        when (action) {
            MessagerieAction.LoadConversations -> loadConversations()
            is MessagerieAction.SelectConversation -> selectConversation(action.id)
            is MessagerieAction.LoadMessages -> loadMessages(action.conversationId)
            is MessagerieAction.OnMessageTextChanged -> onMessageTextChanged(action.text)
            MessagerieAction.SendMessage -> sendMessage()
        }
    }

    private fun loadConversations() {
        scope.launch {
            _state.value = _state.value.copy(conversations = UiState.Loading)
            try {
                val convs = repository.listConversations()
                _state.value = _state.value.copy(conversations = UiState.Success(convs))
            } catch (e: Exception) {
                _state.value = _state.value.copy(conversations = UiState.Error(e.message ?: "Erreur"))
            }
        }
    }

    private fun selectConversation(id: String) {
        scope.launch {
            try {
                val conv = repository.getConversation(id)
                _state.value = _state.value.copy(selectedConversation = conv)
                loadMessages(id)
            } catch (e: Exception) {
                _effects.tryEmit(AppEffect.ShowError(e.message ?: "Erreur"))
            }
        }
    }

    private fun loadMessages(conversationId: String) {
        scope.launch {
            _state.value = _state.value.copy(messages = UiState.Loading)
            try {
                val msgs = repository.listMessages(conversationId)
                _state.value = _state.value.copy(messages = UiState.Success(msgs))
            } catch (e: Exception) {
                _state.value = _state.value.copy(messages = UiState.Error(e.message ?: "Erreur"))
            }
        }
    }

    private fun onMessageTextChanged(text: String) {
        _state.value = _state.value.copy(messageText = text)
    }

    private fun sendMessage() {
        scope.launch {
            val convId = _state.value.selectedConversation?.id ?: return@launch
            val text = _state.value.messageText.trim()
            if (text.isEmpty()) return@launch

            _state.value = _state.value.copy(isSending = true, messageText = "")
            try {
                val msg = repository.sendMessage(convId, text)
                val current = (_state.value.messages as? UiState.Success)?.data ?: emptyList()
                _state.value = _state.value.copy(
                    messages = UiState.Success(current + msg),
                    isSending = false
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    isSending = false,
                    messageText = text
                )
                _effects.tryEmit(AppEffect.ShowError(e.message ?: "Erreur d'envoi"))
            }
        }
    }
}
