// SECT Mobile — MessagerieRealtimeService (Phase M2)
// SECT-MOBILE-PARITY-M2 : branchement SSEClient → MessagerieViewModel.
//
// Backend : GET /api/messagerie/stream (SSE)
// Events : message_new, message_edited, message_deleted, read, typing,
//          reaction_toggle, ia_streaming, hello
//
// Le service parse les events SSE et les transforme en actions concrètes
// (recharger les messages, mettre à jour les unread, etc.)
package com.sect.mobile.shared.network.realtime

import com.sect.mobile.shared.network.api.MessagerieApi
import io.ktor.client.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * État de connexion temps réel.
 */
enum class RealtimeState {
    DISCONNECTED, CONNECTING, CONNECTED, ERROR
}

/**
 * Event temps réel reçu du backend.
 */
data class MessagerieRealtimeEvent(
    val type: String,         // message_new, message_edited, etc.
    val conversationId: String?, // conversation concernée (si applicable)
    val userId: String? = null,  // utilisateur à l'origine de l'événement (ex: typing)
    val timestamp: String
)

/**
 * Service temps réel pour la messagerie.
 *
 * Utilise SSEClient pour se connecter à /api/messagerie/stream,
 * parse les événements et notifie le ViewModel via un callback.
 *
 * Auto-reconnect : si la connexion est perdue, retry après 5s.
 */
class MessagerieRealtimeService(
    private val client: HttpClient,
    private val baseUrl: String,
    private val tokenProvider: suspend () -> String
) {
    private val json = Json { ignoreUnknownKeys = true }
    private var sseClient: SSEClient? = null
    private var scope: CoroutineScope? = null
    private var connectJob: Job? = null

    private val _state = MutableStateFlow(RealtimeState.DISCONNECTED)
    val state: StateFlow<RealtimeState> = _state.asStateFlow()

    /**
     * Démarre la connexion SSE.
     * @param scope CoroutineScope du ViewModel
     * @param onEvent Callback appelé pour chaque event reçu
     */
    fun connect(scope: CoroutineScope, onEvent: (MessagerieRealtimeEvent) -> Unit) {
        disconnect()
        this.scope = scope
        _state.value = RealtimeState.CONNECTING

        connectJob = scope.launch {
            val token = tokenProvider()
            if (token.isEmpty()) {
                _state.value = RealtimeState.ERROR
                return@launch
            }

            val newSseClient = SSEClient(client, baseUrl, json)
            sseClient = newSseClient
            newSseClient.connect(
                endpoint = "/api/messagerie/stream",
                token = token,
                scope = scope
            ) { sseEvent ->
                // Parser l'event SSE en MessagerieRealtimeEvent
                val parsed = parseEvent(sseEvent)
                if (parsed != null) {
                    onEvent(parsed)
                }
            }

            // Observer l'état de connexion SSEClient
            scope.launch {
                sseClient?.connectionState?.collect { connState ->
                    _state.value = when (connState) {
                        ConnectionState.DISCONNECTED -> RealtimeState.DISCONNECTED
                        ConnectionState.CONNECTING -> RealtimeState.CONNECTING
                        ConnectionState.CONNECTED -> RealtimeState.CONNECTED
                        ConnectionState.ERROR -> RealtimeState.ERROR
                    }
                }
            }
        }
    }

    /**
     * Déconnecte le flux temps réel.
     */
    fun disconnect() {
        sseClient?.disconnect()
        sseClient = null
        connectJob?.cancel()
        _state.value = RealtimeState.DISCONNECTED
    }

    /**
     * Parse un SSEEvent en MessagerieRealtimeEvent.
     *
     * Le backend envoie : data: {"type":"message_new","data":{...},"timestamp":"..."}
     */
    private fun parseEvent(sseEvent: SSEEvent): MessagerieRealtimeEvent? {
        return try {
            val jsonObj = json.parseToJsonElement(sseEvent.data).jsonObject
            val type = jsonObj["type"]?.jsonPrimitive?.contentOrNull ?: return null
            val timestamp = jsonObj["timestamp"]?.jsonPrimitive?.contentOrNull ?: ""
            val data = jsonObj["data"]?.let { it.jsonObject }
            val conversationId = data?.get("conversationId")?.jsonPrimitive?.contentOrNull
                ?: data?.get("sessionId")?.jsonPrimitive?.contentOrNull
            val userId = data?.get("userId")?.jsonPrimitive?.contentOrNull
                ?: data?.get("senderId")?.jsonPrimitive?.contentOrNull

            MessagerieRealtimeEvent(
                type = type,
                conversationId = conversationId,
                userId = userId,
                timestamp = timestamp
            )
        } catch (_: Exception) {
            // Si le parsing échoue (heartbeat, etc.), on ignore
            null
        }
    }
}
