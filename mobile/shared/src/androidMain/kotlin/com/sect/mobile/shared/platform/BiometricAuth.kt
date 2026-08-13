// SECT Mobile — Biometric Auth Android (BiometricPrompt API 28+)
package com.sect.mobile.shared.platform

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

class AndroidBiometricAuth(private val context: Context) : BiometricAuth {

    companion object {
        private val KEY_BIOMETRIC_ENABLED = booleanPreferencesKey("biometric_enabled")
    }

    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "sect_biometric")

    private val biometricManager by lazy { BiometricManager.from(context) }

    override suspend fun isAvailable(): BiometricAvailability {
        return when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> BiometricAvailability.AVAILABLE
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> BiometricAvailability.NOT_AVAILABLE
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> BiometricAvailability.NOT_AVAILABLE
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> BiometricAvailability.NOT_ENROLLED
            else -> BiometricAvailability.HARDWARE_UNSUPPORTED
        }
    }

    override suspend fun authenticate(reason: String): BiometricResult {
        return suspendCancellableCoroutine { continuation ->
            val executor = ContextCompat.getMainExecutor(context)

            val prompt = BiometricPrompt(
                context as androidx.fragment.app.FragmentActivity,
                executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        if (continuation.isActive) continuation.resume(BiometricResult.Success)
                    }

                    override fun onAuthenticationFailed() {
                        // Ne pas resume — laisser l'utilisateur réessayer
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        if (continuation.isActive) {
                            if (errorCode == BiometricPrompt.ERROR_USER_CANCELED) {
                                continuation.resume(BiometricResult.Cancelled)
                            } else {
                                continuation.resume(BiometricResult.Failure(errString.toString()))
                            }
                        }
                    }
                }
            )

            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("SECT — Authentification")
                .setSubtitle(reason)
                .setNegativeButtonText("Utiliser le mot de passe")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build()

            prompt.authenticate(promptInfo)

            continuation.invokeOnCancellation { prompt.cancelAuthentication() }
        }
    }

    override suspend fun enable() {
        context.dataStore.edit { it[KEY_BIOMETRIC_ENABLED] = true }
    }

    override suspend fun disable() {
        context.dataStore.edit { it[KEY_BIOMETRIC_ENABLED] = false }
    }

    override suspend fun isEnabled(): Boolean {
        return context.dataStore.data.map { it[KEY_BIOMETRIC_ENABLED] ?: false }.first()
    }
}

// Instance singleton — initialisée par l'AndroidApp
internal var biometricContext: Context? = null

fun initBiometricAuth(context: Context) {
    biometricContext = context
}

actual fun createBiometricAuth(): BiometricAuth {
    val ctx = biometricContext ?: throw IllegalStateException(
        "BiometricAuth not initialized. Call initBiometricAuth(context) in Application.onCreate()"
    )
    return AndroidBiometricAuth(ctx)
}
