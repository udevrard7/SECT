// SECT Mobile — Biometric Auth iOS (LAContext — Face ID / Touch ID)
//
// NOTE : L'API LAPolicy en Kotlin/Native nécessite des imports cinterop spécifiques
// qui varient selon la version de Kotlin. Cette implémentation stub retourne
// NOT_AVAILABLE en attendant l'intégration complète via un wrapper Swift.
// TODO : Implémenter via iosApp/Utilities/BiometricHelper.swift exposé à KMP.
package com.sect.mobile.shared.platform

import platform.Foundation.NSUserDefaults

class IOSBiometricAuth : BiometricAuth {

    companion object {
        private const val KEY_BIOMETRIC_ENABLED = "sect_biometric_enabled"
    }

    private val defaults = NSUserDefaults.standardUserDefaults

    override suspend fun isAvailable(): BiometricAvailability {
        // TODO : Utiliser LAContext.canEvaluatePolicy via un wrapper Swift
        // L'API LAPolicy en Kotlin/Native nécessite une investigation approfondie
        // des bindings cinterop pour LocalAuthentication.framework
        return BiometricAvailability.NOT_AVAILABLE
    }

    override suspend fun authenticate(reason: String): BiometricResult {
        return BiometricResult.Failure("Biométrie non disponible sur iOS (stub)")
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
