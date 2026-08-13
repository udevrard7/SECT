// SECT Mobile — TokenCache iOS (Keychain via Security framework)
// Utilise le Keychain iOS pour le stockage sécurisé des JWT.
// Plus sécurisé que NSUserDefaults (chiffré, persistant, accessible uniquement par l'app).
package com.sect.mobile.shared.cache

import platform.Foundation.NSData
import platform.Foundation.NSKeyedArchiver
import platform.Foundation.NSKeyedUnarchiver
import platform.Foundation.NSString
import platform.Foundation.NSUTF8StringEncoding
import platform.Foundation.create
import platform.Foundation.dataUsingEncoding
import platform.Foundation.length
import platform.Foundation.stringUsingEncoding
import platform.Security.*

/**
 * TokenCache iOS utilisant le Keychain pour un stockage sécurisé.
 *
 * Avantages du Keychain vs NSUserDefaults :
 * - Chiffré automatiquement par iOS
 * - Persistant même après désinstallation (si kSecAttrAccessibleAlways)
 * - Accessible uniquement par l'application (sandbox)
 * - Supporte Access Control (Face ID / Touch ID)
 */
class IOSTokenCache : TokenCache {

    companion object {
        private const val KEY_ACCESS_TOKEN = "ci.sect.app.access_token"
        private const val KEY_REFRESH_TOKEN = "ci.sect.app.refresh_token"
        private const val KEY_EXPIRES_AT = "ci.sect.app.expires_at"
        private const val SERVICE_NAME = "ci.sect.app.auth"
    }

    override suspend fun saveAccessToken(token: String) {
        saveToKeychain(KEY_ACCESS_TOKEN, token)
    }

    override suspend fun getAccessToken(): String {
        return getFromKeychain(KEY_ACCESS_TOKEN) ?: ""
    }

    override suspend fun saveRefreshToken(token: String) {
        saveToKeychain(KEY_REFRESH_TOKEN, token)
    }

    override suspend fun getRefreshToken(): String {
        return getFromKeychain(KEY_REFRESH_TOKEN) ?: ""
    }

    override suspend fun saveSession(accessToken: String, refreshToken: String, expiresAt: String) {
        saveToKeychain(KEY_ACCESS_TOKEN, accessToken)
        saveToKeychain(KEY_REFRESH_TOKEN, refreshToken)
        saveToKeychain(KEY_EXPIRES_AT, expiresAt)
    }

    override suspend fun clear() {
        deleteFromKeychain(KEY_ACCESS_TOKEN)
        deleteFromKeychain(KEY_REFRESH_TOKEN)
        deleteFromKeychain(KEY_EXPIRES_AT)
    }

    // ── Keychain Operations ──

    private fun saveToKeychain(key: String, value: String) {
        // D'abord supprimer l'entrée existante
        deleteFromKeychain(key)

        val data = value.encodeToByteArray().toNSData()
        if (data == null) return

        val query = mapOf<Any?, Any?>(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to SERVICE_NAME,
            kSecAttrAccount to key,
            kSecValueData to data,
            kSecAttrAccessible to kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        )

        SecItemAdd(query, null)
    }

    private fun getFromKeychain(key: String): String? {
        val query = mapOf<Any?, Any?>(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to SERVICE_NAME,
            kSecAttrAccount to key,
            kSecReturnData to true,
            kSecMatchLimit to kSecMatchLimitOne
        )

        var result: Any? = null
        val status = SecItemCopyMatching(query, &result)

        if (status != errSecSuccess || result == null) return null

        val data = result as? NSData ?: return null
        return data.toStringFromUTF8()
    }

    private fun deleteFromKeychain(key: String) {
        val query = mapOf<Any?, Any?>(
            kSecClass to kSecClassGenericPassword,
            kSecAttrService to SERVICE_NAME,
            kSecAttrAccount to key
        )

        SecItemDelete(query)
    }

    // ── Helpers ──

    private fun ByteArray.toNSData(): NSData? {
        // Conversion ByteArray → NSData via NSString intermédiaire
        val nsString = NSString.create(string = this.decodeToString())
        return nsString.dataUsingEncoding(NSUTF8StringEncoding)
    }

    private fun NSData.toStringFromUTF8(): String? {
        return NSString.create(data = this, encoding = NSUTF8StringEncoding)?.toString()
    }
}

actual fun createTokenCache(): TokenCache = IOSTokenCache()
