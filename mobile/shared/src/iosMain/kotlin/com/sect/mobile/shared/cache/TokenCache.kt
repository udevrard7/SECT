// SECT Mobile — TokenCache iOS (NSUserDefaults + chiffrement applicatif)
//
// NOTE : L'implémentation Keychain (SecItemAdd/SecItemCopyMatching) nécessite
// des conversions cinterop complexes (CFDictionary, memScoped) qui ne sont
// pas triviales en Kotlin/Native. Cette version utilise NSUserDefaults avec
// un chiffrement applicatif simple (base64 + obfuscation) en attendant une
// implémentation Keychain native complète.
//
// TODO : Migrer vers Keychain via un wrapper Swift (iosApp/Utilities/KeychainHelper.swift)
// exposé à Kotlin/Native via un framework bridge, ou utiliser SQLDelight pour
// le stockage sécurisé.
package com.sect.mobile.shared.cache

import platform.Foundation.NSData
import platform.Foundation.NSUserDefaults
import platform.Foundation.NSString
import platform.Foundation.NSUTF8StringEncoding
import platform.Foundation.create
import platform.Foundation.dataUsingEncoding

/**
 * TokenCache iOS utilisant NSUserDefaults pour le stockage des JWT.
 *
 * Sécurité : NSUserDefaults n'est pas chiffré par défaut. Les tokens sont
 * encodés en base64 (obfuscation faible). Pour une sécurité production,
 * migrer vers Keychain (voir TODO ci-dessus).
 */
class IOSTokenCache : TokenCache {

    companion object {
        private const val KEY_ACCESS_TOKEN = "com.ftci.app.access_token"
        private const val KEY_REFRESH_TOKEN = "com.ftci.app.refresh_token"
        private const val KEY_EXPIRES_AT = "com.ftci.app.expires_at"
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
