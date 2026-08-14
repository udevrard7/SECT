// SECT Mobile — PreferencesCache Android (DataStore<Preferences>)
package com.sect.mobile.shared.data.cache

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * Android implementation of PreferencesCache using DataStore<Preferences>.
 *
 * Provided via Koin DI in platformModule:
 *   single<PreferencesCache> { AndroidPreferencesCache(androidContext()) }
 *
 * SECURITY: This is for NON-SECURE preferences only (theme, language, etc.).
 * For secure storage (tokens, keys), use TokenCache (EncryptedSharedPreferences).
 */
class AndroidPreferencesCache(private val context: Context) : PreferencesCache {

    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "sect_preferences")

    override suspend fun getString(key: String): String? {
        return context.dataStore.data.map { it[stringPreferencesKey(key)] }.first()
    }

    override suspend fun putString(key: String, value: String) {
        context.dataStore.edit { it[stringPreferencesKey(key)] = value }
    }

    override suspend fun getBoolean(key: String): Boolean {
        return context.dataStore.data.map { it[booleanPreferencesKey(key)] ?: false }.first()
    }

    override suspend fun putBoolean(key: String, value: Boolean) {
        context.dataStore.edit { it[booleanPreferencesKey(key)] = value }
    }

    override suspend fun getInt(key: String): Int {
        return context.dataStore.data.map { it[intPreferencesKey(key)] ?: 0 }.first()
    }

    override suspend fun putInt(key: String, value: Int) {
        context.dataStore.edit { it[intPreferencesKey(key)] = value }
    }

    override suspend fun remove(key: String) {
        context.dataStore.edit { it.remove(stringPreferencesKey(key)) }
    }

    override suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
