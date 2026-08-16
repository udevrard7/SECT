package com.sect.mobile.shared.platform

/**
 * BiometricAuth — Interface for biometric authentication (DI-based).
 *
 * Replaces the old expect/actual pattern:
 *   OLD: interface BiometricAuth + expect fun createBiometricAuth()
 *   NEW: interface BiometricAuth  (provided via Koin platformModule)
 *
 * Platform implementations:
 * - Android: BiometricPrompt (API 28+) / FingerprintManager (fallback)
 * - iOS:     LAContext (Face ID / Touch ID)
 *
 * Usage via Koin:
 *   val biometricAuth: BiometricAuth = get()
 *
 * Security flow:
 * 1. User logs in with email/password (first time)
 * 2. App offers to enable biometric for subsequent logins
 * 3. If enabled, JWT is stored securely and unlocked by biometric
 * 4. On next launch, app prompts Face ID/Touch ID instead of password
 */
interface BiometricAuth {
    /**
     * Check if the device supports biometric authentication.
     */
    suspend fun isAvailable(): BiometricAvailability

    /**
     * Authenticate the user via biometrics.
     * Shows the system prompt (Face ID, Touch ID, fingerprint).
     *
     * @param reason Text displayed in the system prompt
     * @return BiometricResult.Success or BiometricResult.Failure
     */
    suspend fun authenticate(reason: String): BiometricResult

    /**
     * Enable biometric login for the current user.
     * Stores a flag + allows token unlock by biometric.
     */
    suspend fun enable()

    /**
     * Disable biometric login.
     */
    suspend fun disable()

    /**
     * Check if biometric login is enabled for the current user.
     */
    suspend fun isEnabled(): Boolean
}

enum class BiometricAvailability {
    AVAILABLE,           // Biometric available and configured
    NOT_AVAILABLE,       // No biometric sensor
    NOT_ENROLLED,        // Sensor present but no biometrics enrolled
    HARDWARE_UNSUPPORTED // Device too old
}

sealed class BiometricResult {
    data object Success : BiometricResult()
    data class Failure(val reason: String) : BiometricResult()
    data object Cancelled : BiometricResult()
}
