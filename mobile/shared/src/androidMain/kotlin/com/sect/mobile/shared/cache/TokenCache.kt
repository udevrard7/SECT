// SECT Mobile — TokenCache Android (EncryptedSharedPreferences)
package com.sect.mobile.shared.cache

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class AndroidTokenCache(private val context: Context) : TokenCache {

    companion object {
        private const val FILE_NAME = "sect_auth_tokens"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_EXPIRES_AT = "expires_at"
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        FILE_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    override suspend fun saveAccessToken(token: String) {
        prefs.edit().putString(KEY_ACCESS_TOKEN, token).apply()
    }

    override suspend fun getAccessToken(): String {
        return prefs.getString(KEY_ACCESS_TOKEN, "") ?: ""
    }

    override suspend fun saveRefreshToken(token: String) {
        prefs.edit().putString(KEY_REFRESH_TOKEN, token).apply()
    }

    override suspend fun getRefreshToken(): String {
        return prefs.getString(KEY_REFRESH_TOKEN, "") ?: ""
    }

    override suspend fun saveSession(accessToken: String, refreshToken: String, expiresAt: String) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putString(KEY_EXPIRES_AT, expiresAt)
            .apply()
    }

    override suspend fun clear() {
        prefs.edit().clear().apply()
    }
}

// Instance singleton — initialisée par l'AndroidApp
internal var appContext: Context? = null

fun initTokenCache(context: Context) {
    appContext = context
}

actual fun createTokenCache(): TokenCache {
    val ctx = appContext ?: throw IllegalStateException(
        "TokenCache not initialized. Call initTokenCache(context) in your Application.onCreate()"
    )
    return AndroidTokenCache(ctx)
}
