package com.sect.mobile.shared.presentation.action

sealed interface MessagerieAction {
    data object LoadConversations : MessagerieAction
    data class SelectConversation(val id: String) : MessagerieAction
    data class LoadMessages(val conversationId: String) : MessagerieAction
    data class OnMessageTextChanged(val text: String) : MessagerieAction
    data object SendMessage : MessagerieAction
}
