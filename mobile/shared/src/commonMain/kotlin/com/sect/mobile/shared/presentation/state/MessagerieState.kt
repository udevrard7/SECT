package com.sect.mobile.shared.presentation.state

import com.sect.mobile.shared.domain.model.Conversation
import com.sect.mobile.shared.domain.model.Message

data class MessagerieState(
    val conversations: UiState<List<Conversation>> = UiState.Loading,
    val selectedConversation: Conversation? = null,
    val messages: UiState<List<Message>> = UiState.Loading,
    val messageText: String = "",
    val isSending: Boolean = false
)
