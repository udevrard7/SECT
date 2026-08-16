// SECT Mobile — SSE Client pour notifications et messagerie temps réel
// Le backend Go utilise des handlers SSE pour :
// - /api/messagerie/events (nouveaux messages)
// - /api/notifications/events (notifications push)
package com.sect.mobile.shared.network.realtime

import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.util.cio.*
import io.ktor.utils.io.*
import io.ktor.http.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json

/**
 * SSE (Server-Sent Events) Client pour recevoir des événements temps réel.
 */
class SSEClient(
    private val client: HttpClient,
    private val baseUrl: String,
    private val json: Json = Json { ignoreUnknownKeys = true }
) {
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    private val _events = MutableStateFlow<List<SSEEvent>>(emptyList())
    val events: StateFlow<List<SSEEvent>> = _events

    private var connectJob: Job? = null

    /**
     * Se connecter à un flux SSE.
     */
    fun connect(
        endpoint: String,
        token: String,
        scope: CoroutineScope,
        onEvent: (SSEEvent) -> Unit = {}
    ) {
        disconnect()
        _connectionState.value = ConnectionState.CONNECTING

        connectJob = scope.launch {
            try {
                val response: HttpResponse = client.get("$baseUrl$endpoint") {
                    headers {
                        append("Authorization", "Bearer $token")
                        append("Accept", "text/event-stream")
                        append("Cache-Control", "no-cache")
                    }
                }

                _connectionState.value = ConnectionState.CONNECTED

                // Lire le flux SSE ligne par ligne via ByteReadChannel
                val channel: ByteReadChannel = response.bodyAsChannel()
                var currentEvent = ""
                var currentData = StringBuilder()

                while (!channel.isClosedForRead && isActive) {
                    val line = channel.readUTF8Line() ?: continue

                    when {
                        line.startsWith("event:") -> {
                            currentEvent = line.removePrefix("event:").trim()
                        }
                        line.startsWith("data:") -> {
                            currentData.appendLine(line.removePrefix("data:").trim())
                        }
                        line.isBlank() && currentData.isNotEmpty() -> {
                            // Fin d'événement — dispatch
                            val event = SSEEvent(
                                event = currentEvent,
                                data = currentData.toString().trim()
                            )
                            _events.value = _events.value + event
                            onEvent(event)
                            currentEvent = ""
                            currentData = StringBuilder()
                        }
                        line.startsWith("id:") -> {
                            // Event ID pour reconnexion — ignoré pour l'instant
                        }
                        line.startsWith("retry:") -> {
                            // Retry interval — ignoré pour l'instant
                        }
                    }
                }
            } catch (e: Exception) {
                if (isActive) {
                    _connectionState.value = ConnectionState.ERROR
                    // Auto-reconnect après 5 secondes
                    delay(5_000)
                    connect(endpoint, token, scope, onEvent)
                }
            }
        }
    }

    /**
     * Se déconnecter du flux SSE.
     */
    fun disconnect() {
        connectJob?.cancel()
        connectJob = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }

    /**
     * Effacer les événements accumulés.
     */
    fun clearEvents() {
        _events.value = emptyList()
    }
}

/**
 * Événement SSE reçu du serveur.
 */
data class SSEEvent(
    val event: String,  // "message", "notification", "correction", etc.
    val data: String     // JSON payload
)
