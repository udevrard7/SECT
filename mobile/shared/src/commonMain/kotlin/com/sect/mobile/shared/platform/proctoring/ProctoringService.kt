// SECT Mobile — Proctoring Service (abstraction shared)
// Surveillance d'examen : détection de triche, captures caméra, alerts
package com.sect.mobile.shared.platform.proctoring

import kotlinx.coroutines.flow.StateFlow

/**
 * ProctoringService gère la surveillance d'examen côté client mobile.
 *
 * Fonctionnalités :
 * 1. Détection de changement d'onglet/application
 * 2. Détection de sortie du mode plein écran
 * 3. Captures caméra périodiques (envoyées via WebSocket)
 * 4. Compteur d'alertes (transmis au backend pour pénalités)
 *
 * Le backend Go enregistre les alertes dans SessionPassation.proctoringAlerts
 * et peut appliquer des pénalités selon les règles de l'épreuve.
 *
 * Protocole :
 * - Chaque alerte est envoyée via SurveillanceWebSocket
 * - Le backend accumule les alertes et peut :
 *   - Afficher un warning à l'étudiant
 *   - Ajouter une pénalité à la note
 *   - Terminer automatiquement la session (si seuil dépassé)
 */
interface ProctoringService {

    /**
     * État courant de la surveillance.
     */
    val state: StateFlow<ProctoringState>

    /**
     * Démarrer la surveillance.
     * @param config Configuration de proctoring pour cette épreuve
     */
    suspend fun start(config: ProctoringConfig)

    /**
     * Arrêter la surveillance (fin de l'épreuve).
     */
    suspend fun stop()

    /**
     * Signaler un événement de proctoring.
     * Appelé par les listeners plateforme (lifecycle, fullscreen, etc.)
     */
    fun reportEvent(event: ProctoringEvent)

    /**
     * Nombre total d'alertes depuis le début de la session.
     */
    val alertCount: StateFlow<Int>

    /**
     * Indique si l'épreuve doit être terminée (seuil d'alertes dépassé).
     */
    val shouldTerminate: StateFlow<Boolean>
}

data class ProctoringConfig(
    val enableFullscreen: Boolean = true,      // Forcer le mode plein écran
    val enableTabDetection: Boolean = true,    // Détecter changement d'onglet
    val enableWebcam: Boolean = false,         // Captures caméra périodiques
    val webcamIntervalMs: Long = 30_000L,      // Intervalle captures (30s)
    val maxAlerts: Int = 10,                   // Seuil avant terminaison auto
    val enableScreenCapture: Boolean = false   // Captures d'écran (Android 11+)
)

data class ProctoringState(
    val isActive: Boolean = false,
    val isFullscreen: Boolean = false,
    val isAppInForeground: Boolean = true,
    val webcamActive: Boolean = false,
    val lastCaptureAt: Long = 0L
)

enum class ProctoringEvent {
    TAB_SWITCH,           // L'étudiant a changé d'onglet/app
    FULLSCREEN_EXIT,      // Sortie du mode plein écran
    APP_BACKGROUND,       // L'app est passée en arrière-plan
    COPY_PASTE_DETECTED,  // Copier-coller détecté
    SCREEN_CAPTURE,       // Capture d'écran détectée
    WEBCAM_UNAVAILABLE,   // Caméra non disponible
    MULTIPLE_FACES,       // Plusieurs visages détectés (IA)
    NO;                   // Aucun visage détecté (IA)

    fun severity(): AlertSeverity = when (this) {
        TAB_SWITCH -> AlertSeverity.MEDIUM
        FULLSCREEN_EXIT -> AlertSeverity.HIGH
        APP_BACKGROUND -> AlertSeverity.HIGH
        COPY_PASTE_DETECTED -> AlertSeverity.CRITICAL
        SCREEN_CAPTURE -> AlertSeverity.CRITICAL
        WEBCAM_UNAVAILABLE -> AlertSeverity.LOW
        MULTIPLE_FACES -> AlertSeverity.HIGH
        NO -> AlertSeverity.HIGH
    }
}

enum class AlertSeverity {
    LOW,      // Juste loggé
    MEDIUM,   // +1 alerte
    HIGH,     // +2 alertes
    CRITICAL  // +3 alertes (peut terminer la session)
}
