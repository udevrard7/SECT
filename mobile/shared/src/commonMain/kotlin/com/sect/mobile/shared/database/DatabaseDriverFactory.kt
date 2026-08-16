// SECT Mobile — Database Driver Provider (expect/actual pattern)
// SQLDelight requires a platform-specific SqlDriver.
// This expect declaration lets each platform provide its own implementation.
package com.sect.mobile.shared.database

import app.cash.sqldelight.db.SqlDriver

/**
 * Provides the SQLDelight SqlDriver for the current platform.
 *
 * Android: uses AndroidSqliteDriver (backed by framework SQLite)
 * iOS:     uses NativeSqliteDriver (backed by platform SQLite)
 */
expect class DatabaseDriverFactory {
    fun createDriver(): SqlDriver
}
