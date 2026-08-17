// SECT Mobile — ExamPrepHelpViewModel (aide enseignant — mini messagerie)
// SECT-EXAMPREP-CONTRACT-F1
package com.sect.mobile.shared.presentation.examprep.help

import com.sect.mobile.shared.domain.model.examprep.HelpMessage
import com.sect.mobile.shared.domain.model.examprep.HelpThread
import com.sect.mobile.shared.domain.repository.examprep.ExamPrepRepository
import com.sect.mobile.shared.presentation.BaseViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ExamPrepHelpState(
    val isLoadingThreads: Boolean = true,
    val isLoadingMessages: Boolean = false,
    val error: String? = null,
    val threads: List<HelpThread> = emptyList(),
    val selectedThread: HelpThread? = null,
    val messages: List<HelpMessage> = emptyList(),
    val isSending: Boolean = false,
    val newMessageText: String = ""
) {
    /** Threads ouverts. */
    val openThreads: List<HelpThread> get() = threads.filter { it.statut == "OUVERT" }

    /** Threads clos. */
    val closedThreads: List<HelpThread> get() = threads.filter { it.statut == "CLOS" }
}

class ExamPrepHelpViewModel(
    private val repository: ExamPrepRepository
) : BaseViewModel() {

    private val _state = MutableStateFlow(ExamPrepHelpState())
    val state: StateFlow<ExamPrepHelpState> = _state.asStateFlow()

    init { loadThreads() }

    fun loadThreads() {
        _state.value = _state.value.copy(isLoadingThreads = true, error = null)
        launch {
            val threads = repository.listHelpThreads()
            _state.value = _state.value.copy(isLoadingThreads = false, threads = threads)
        }
    }

    fun selectThread(thread: HelpThread) {
        _state.value = _state.value.copy(selectedThread = thread, isLoadingMessages = true)
        launch {
            val messages = repository.listHelpMessages(thread.id)
            _state.value = _state.value.copy(isLoadingMessages = false, messages = messages)
        }
    }

    fun createThread(documentId: String, sujet: String, messageInitial: String) {
        _state.value = _state.value.copy(isSending = true, error = null)
        launch {
            try {
                val thread = repository.createHelpThread(documentId, sujet, messageInitial)
                _state.value = _state.value.copy(isSending = false, selectedThread = thread)
                loadThreads()
                selectThread(thread)
            } catch (e: Exception) {
                _state.value = _state.value.copy(isSending = false, error = e.message)
            }
        }
    }

    fun onNewMessageChange(text: String) {
        _state.value = _state.value.copy(newMessageText = text)
    }

    fun sendMessage() {
        val thread = _state.value.selectedThread ?: return
        val content = _state.value.newMessageText.trim()
        if (content.isBlank()) return

        _state.value = _state.value.copy(isSending = true, error = null)
        launch {
            try {
                val msg = repository.createHelpMessage(thread.id, content)
                _state.value = _state.value.copy(
                    isSending = false,
                    messages = _state.value.messages + msg,
                    newMessageText = ""
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(isSending = false, error = e.message)
            }
        }
    }

    fun closeThread() {
        val thread = _state.value.selectedThread ?: return
        launch {
            try {
                repository.closeHelpThread(thread.id)
                loadThreads()
                _state.value = _state.value.copy(selectedThread = thread.copy(statut = "CLOS"))
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    fun deleteThread(threadId: String) {
        launch {
            try {
                repository.deleteHelpThread(threadId)
                if (_state.value.selectedThread?.id == threadId) {
                    _state.value = _state.value.copy(selectedThread = null, messages = emptyList())
                }
                loadThreads()
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    override fun onError(error: Exception) {
        _state.value = _state.value.copy(
            isLoadingThreads = false,
            isLoadingMessages = false,
            isSending = false,
            error = error.message
        )
    }
}
