// SECT Mobile — TokenCache iOS (Keychain via platform.posix / Security framework)
// Note: En production, utilisez un wrapper Kotlin/Native vers le Keychain iOS.
// Cette implémentation utilise NSUserDefaults comme base, à remplacer par
// un wrapper Keychain pour la production (kotlinx-coroutines + objc).
package com.sect.mobile.shared.cache

import platform.Foundation.NSUserDefaults

class IOSTokenCache : TokenCache {

    companion object {
        private const val KEY_ACCESS_TOKEN = "sect_access_token"
        private const val KEY_REFRESH_TOKEN = "sect_refresh_token"
        private const val KEY_EXPIRES_AT = "sect_expires_at"
    }

    private val defaults = NSUserDefaults.standardUserDefaults

    override suspend fun saveAccessToken(token: String) {
        defaults.setObject(token, forKey = KEY_ACCESS_TOKEN)
    }

    override suspend fun getAccessToken(): String {
        return defaults.stringForKey(KEY_ACCESS_TOKEN) ?: ""
    }

    override suspend fun saveRefreshToken(token: String) {
        defaults.setObject(token, forKey = KEY_REFRESH_TOKEN)
    }

    override suspend fun getRefreshToken(): String {
        return defaults.stringForKey(KEY_REFRESH_TOKEN) ?: ""
    }

    override suspend fun saveSession(accessToken: String, refreshToken: String, expiresAt: String) {
        defaults.setObject(accessToken, forKey = KEY_ACCESS_TOKEN)
        defaults.setObject(refreshToken, forKey = KEY_REFRESH_TOKEN)
        defaults.setObject(expiresAt, forKey = KEY_EXPIRES_AT)
    }

    override suspend fun clear() {
        defaults.removeObjectForKey(KEY_ACCESS_TOKEN)
        defaults.removeObjectForKey(KEY_REFRESH_TOKEN)
        defaults.removeObjectForKey(KEY_EXPIRES_AT)
    }
}

actual fun createTokenCache(): TokenCache = IOSTokenCache()
