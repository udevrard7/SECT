// SECT Mobile — Biometric Auth abstraction (expect/actual)
// Permet l'authentification biométrique : Face ID, Touch ID, empreinte digitale
package com.sect.mobile.shared.platform

/**
 * Interface pour l'authentification biométrique.
 *
 * Android : BiometricPrompt (API 28+) / FingerprintManager (fallback)
 * iOS : LAContext (Face ID / Touch ID)
 *
 * Utilisation :
 * 1. L'utilisateur se connecte avec email/password (première fois)
 * 2. L'app propose d'activer la biometric pour les connexions suivantes
 * 3. Si activé, le JWT est stocké de manière sécurisée et déverrouillé par biometric
 * 4. Au prochain lancement, l'app demande Face ID/Touch ID au lieu du password
 */
interface BiometricAuth {
    /**
     * Vérifier si l'appareil supporte la biométrie.
     */
    suspend fun isAvailable(): BiometricAvailability

    /**
     * Authentifier l'utilisateur via biométrie.
     * Affiche le prompt système (Face ID, Touch ID, empreinte).
     *
     * @param reason Texte affiché dans le prompt système
     * @return BiometricResult.Success ou BiometricResult.Failure
     */
    suspend fun authenticate(reason: String): BiometricResult

    /**
     * Activer la connexion biométrique pour l'utilisateur courant.
     * Stocke un flag + permet le déverrouillage du token par biométrie.
     */
    suspend fun enable()

    /**
     * Désactiver la connexion biométrique.
     */
    suspend fun disable()

    /**
     * Vérifier si la biométrie est activée pour l'utilisateur courant.
     */
    suspend fun isEnabled(): Boolean
}

enum class BiometricAvailability {
    AVAILABLE,           // Biométrie disponible et configurée
    NOT_AVAILABLE,       // Pas de capteur biométrique
    NOT_ENROLLED,        // Capteur présent mais aucune biométrie enregistrée
    HARDWARE_UNSUPPORTED // Appareil trop ancien
}

sealed class BiometricResult {
    data object Success : BiometricResult()
    data class Failure(val reason: String) : BiometricResult()
    data object Cancelled : BiometricResult()
}

/**
 * Factory expect/actual pour créer l'implémentation biométrique de la plateforme.
 */
expect fun createBiometricAuth(): BiometricAuth
