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
    private val json: Json = Json { ignoreUnknownKeys = true },
    private val maxEventsBuffer: Int = 50
) {
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    private val _events = MutableStateFlow<List<SSEEvent>>(emptyList())
    val events: StateFlow<List<SSEEvent>> = _events

    private var connectJob: Job? = null
    private var lastEventId: String? = null
    private var currentBackoffMs: Long = 1_000L

    /**
     * Se connecter à un flux SSE avec gestion du Last-Event-ID,
     * backoff exponentiel et limite de tampon d'événements.
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
                        lastEventId?.let { id ->
                            append("Last-Event-ID", id)
                        }
                    }
                }

                _connectionState.value = ConnectionState.CONNECTED
                // Réinitialiser le backoff après connexion réussie
                currentBackoffMs = 1_000L

                // Lire le flux SSE ligne par ligne via ByteReadChannel
                val channel: ByteReadChannel = response.bodyAsChannel()
                var currentEvent = ""
                var currentData = StringBuilder()
                var currentId: String? = null

                while (!channel.isClosedForRead && isActive) {
                    val line = channel.readUTF8Line() ?: continue

                    when {
                        line.startsWith("event:") -> {
                            currentEvent = line.removePrefix("event:").trim()
                        }
                        line.startsWith("data:") -> {
                            currentData.appendLine(line.removePrefix("data:").trim())
                        }
                        line.startsWith("id:") -> {
                            currentId = line.removePrefix("id:").trim()
                        }
                        line.startsWith("retry:") -> {
                            val retryMs = line.removePrefix("retry:").trim().toLongOrNull()
                            if (retryMs != null && retryMs > 0) {
                                currentBackoffMs = retryMs
                            }
                        }
                        line.isBlank() && currentData.isNotEmpty() -> {
                            // Fin d'événement — dispatch
                            if (currentId != null) {
                                lastEventId = currentId
                            }
                            val event = SSEEvent(
                                event = currentEvent,
                                data = currentData.toString().trim(),
                                id = lastEventId
                            )
                            _events.value = (_events.value + event).takeLast(maxEventsBuffer)
                            onEvent(event)
                            currentEvent = ""
                            currentData = StringBuilder()
                            currentId = null
                        }
                    }
                }
            } catch (e: Exception) {
                if (isActive) {
                    _connectionState.value = ConnectionState.ERROR
                    // Backoff exponentiel capé à 30s
                    delay(currentBackoffMs)
                    currentBackoffMs = (currentBackoffMs * 2).coerceAtMost(30_000L)
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
    val data: String,   // JSON payload
    val id: String? = null
)
