// SECT Mobile — PreferencesCache iOS (NSUserDefaults)
package com.sect.mobile.shared.data.cache

import platform.Foundation.NSUserDefaults

/**
 * iOS implementation of PreferencesCache using NSUserDefaults.
 *
 * Provided via Koin DI in platformModule:
 *   single<PreferencesCache> { IOSPreferencesCache() }
 *
 * SECURITY: This is for NON-SECURE preferences only (theme, language, etc.).
 * For secure storage (tokens, keys), use TokenCache (Keychain).
 */
class IOSPreferencesCache : PreferencesCache {

    private val defaults = NSUserDefaults.standardUserDefaults

    override suspend fun getString(key: String): String? {
        return defaults.stringForKey(key)
    }

    override suspend fun putString(key: String, value: String) {
        defaults.setObject(value, forKey = key)
    }

    override suspend fun getBoolean(key: String): Boolean {
        // NSUserDefaults.boolForKey returns false if key is absent — matches interface contract
        if (defaults.objectForKey(key) == null) return false
        return defaults.boolForKey(key)
    }

    override suspend fun putBoolean(key: String, value: Boolean) {
        defaults.setObject(value, forKey = key)
    }

    override suspend fun getInt(key: String): Int {
        // NSUserDefaults.integerForKey returns 0 if key is absent — matches interface contract
        if (defaults.objectForKey(key) == null) return 0
        return defaults.integerForKey(key).toInt()
    }

    override suspend fun putInt(key: String, value: Int) {
        defaults.setObject(value.toLong(), forKey = key)
    }

    override suspend fun remove(key: String) {
        defaults.removeObjectForKey(key)
    }

    override suspend fun clear() {
        // NSUserDefaults doesn't have a bulk clear, remove known keys
        val knownKeys = listOf(
            "theme_dark", "language", "biometric_enabled", "notifications_enabled",
            "auto_save_enabled", "auto_save_interval_sec", "last_user_id"
        )
        knownKeys.forEach { defaults.removeObjectForKey(it) }
    }
}
