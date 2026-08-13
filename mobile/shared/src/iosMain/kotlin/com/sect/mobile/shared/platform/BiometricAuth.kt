// SECT Mobile — Biometric Auth iOS (LAContext — Face ID / Touch ID)
package com.sect.mobile.shared.platform

import kotlinx.coroutines.suspendCancellableCoroutine
import platform.LocalAuthentication.LAContext
import platform.LocalAuthentication.LAPolicy
import platform.Foundation.NSUserDefaults
import kotlin.coroutines.resume

class IOSBiometricAuth : BiometricAuth {

    companion object {
        private const val KEY_BIOMETRIC_ENABLED = "sect_biometric_enabled"
    }

    private val defaults = NSUserDefaults.standardUserDefaults

    override suspend fun isAvailable(): BiometricAvailability {
        val context = LAContext()
        val canEvaluate = context.canEvaluatePolicy(
            LAPolicy.LAPolicyDeviceOwnerAuthenticationWithBiometrics,
            null
        )
        return if (canEvaluate) {
            BiometricAvailability.AVAILABLE
        } else {
            // Pas de biométrie sur ce simulateur/appareil
            BiometricAvailability.NOT_AVAILABLE
        }
    }

    override suspend fun authenticate(reason: String): BiometricResult {
        return suspendCancellableCoroutine { continuation ->
            val context = LAContext()
            context.localizedReason = reason

            val canEvaluate = context.canEvaluatePolicy(
                LAPolicy.LAPolicyDeviceOwnerAuthenticationWithBiometrics,
                null
            )

            if (!canEvaluate) {
                continuation.resume(BiometricResult.Failure("Biométrie non disponible"))
                return@suspendCancellableCoroutine
            }

            context.evaluatePolicy(
                LAPolicy.LAPolicyDeviceOwnerAuthenticationWithBiometrics,
                reason
            ) { success, error ->
                if (continuation.isActive) {
                    when {
                        success -> continuation.resume(BiometricResult.Success)
                        error != null -> {
                            val nsError = error
                            // -2 = user cancelled
                            if (nsError?.code?.toInt() == -2) {
                                continuation.resume(BiometricResult.Cancelled)
                            } else {
                                continuation.resume(BiometricResult.Failure(nsError?.localizedDescription ?: "Erreur"))
                            }
                        }
                        else -> continuation.resume(BiometricResult.Failure("Échec de l'authentification"))
                    }
                }
            }

            continuation.invokeOnCancellation {
                context.invalidate()
            }
        }
    }

    override suspend fun enable() {
        defaults.setObject(true, forKey = KEY_BIOMETRIC_ENABLED)
    }

    override suspend fun disable() {
        defaults.setObject(false, forKey = KEY_BIOMETRIC_ENABLED)
    }

    override suspend fun isEnabled(): Boolean {
        return defaults.boolForKey(KEY_BIOMETRIC_ENABLED)
    }
}

actual fun createBiometricAuth(): BiometricAuth = IOSBiometricAuth()
