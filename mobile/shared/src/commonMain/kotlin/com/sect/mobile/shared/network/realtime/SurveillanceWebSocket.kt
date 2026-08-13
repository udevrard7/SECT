// SECT Mobile — WebSocket Client pour surveillance d'examen (proctoring)
// Le backend Go utilise gorilla/websocket sur /api/sessions/{id}/surveillance
package com.sect.mobile.shared.network.realtime

import io.ktor.client.*
import io.ktor.client.plugins.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * SurveillanceWebSocket gère la connexion WebSocket temps réel
 * avec le hub de surveillance du backend Go.
 *
 * Fonctionnalités :
 * - L'étudiant envoie des alertes de proctoring (tab switch, fullscreen exit)
 * - L'enseignant reçoit les alertes en temps réel
 * - L'étudiant envoie des captures webcam périodiques
 *
 * Protocole (JSON sur WebSocket) :
 * - { "type": "tab_switch", "timestamp": "..." }     — alerte changement d'onglet
 * - { "type": "fullscreen_exit", "timestamp": "..." }  — alerte sortie plein écran
 * - { "type": "webcam_frame", "data": "base64..." }    — capture caméra
 * - { "type": "pong" }                                 — heartbeat réponse
 */
class SurveillanceWebSocket(
    private val client: HttpClient,
    private val baseUrl: String,
    private val json: Json = Json { ignoreUnknownKeys = true }
) {
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    private val _lastEvent = MutableStateFlow<SurveillanceEvent?>(null)
    val lastEvent: StateFlow<SurveillanceEvent?> = _lastEvent

    private var session: DefaultWebSocketSession? = null
    private var heartbeatJob: Job? = null
    private var listenJob: Job? = null

    /**
     * Se connecter au WebSocket de surveillance.
     * @param sessionId ID de la session de passation
     * @param token JWT access token pour l'authentification
     */
    suspend fun connect(
        sessionId: String,
        token: String,
        scope: CoroutineScope
    ) {
        try {
            _connectionState.value = ConnectionState.CONNECTING

            client.webSocket(
                urlString = "${baseUrl.replace("https", "wss").replace("http", "ws")}/api/sessions/$sessionId/surveillance",
                request = {
                    headers.append("Authorization", "Bearer $token")
                }
            ) {
                session = this
                _connectionState.value = ConnectionState.CONNECTED

                // Démarrer le heartbeat (ping toutes les 30s)
                heartbeatJob = scope.launch {
                    while (isActive) {
                        delay(30_000)
                        send(Frame.Text("""{"type":"ping"}"""))
                    }
                }

                // Écouter les messages entrants
                for (frame in incoming) {
                    if (frame is Frame.Text) {
                        val text = frame.readText()
                        try {
                            val event = json.decodeFromString<SurveillanceEvent>(text)
                            _lastEvent.value = event
                        } catch (_: Exception) { }
                    }
                }
            }
        } catch (e: Exception) {
            _connectionState.value = ConnectionState.ERROR
        }
    }

    /**
     * Envoyer une alerte de proctoring.
     */
    suspend fun sendAlert(type: String, details: Map<String, String> = emptyMap()) {
        val msg = buildString {
            append("""{"type":"$type","timestamp":"${kotlinx.datetime.Clock.System.now()}"""")
            details.forEach { (k, v) -> append(""","$k":"$v"""") }
            append("}")
        }
        session?.send(Frame.Text(msg))
    }

    /**
     * Envoyer un frame webcam (base64 JPEG).
     */
    suspend fun sendWebcamFrame(base64Jpeg: String) {
        // Les images sont trop grandes pour le JSON — utiliser binaire
        session?.send(Frame.Binary(true, base64Jpeg.encodeToByteArray()))
    }

    /**
     * Se déconnecter.
     */
    fun disconnect() {
        heartbeatJob?.cancel()
        listenJob?.cancel()
        session?.close()
        session = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }
}

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
}

/**
 * Événement de surveillance reçu du serveur.
 */
@kotlinx.serialization.Serializable
data class SurveillanceEvent(
    val type: String,
    val timestamp: String? = null,
    val message: String? = null,
    val alertLevel: String? = null  // "info" | "warning" | "critical"
)
