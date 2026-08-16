// SECT Mobile — DatabaseDriverFactory actual (Android)
// Uses AndroidSqliteDriver backed by the framework SQLite database.
package com.sect.mobile.shared.database

import android.content.Context
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.android.AndroidSqliteDriver

/**
 * Android implementation: provides an AndroidSqliteDriver.
 * Requires an Android Context (Application context recommended).
 */
actual class DatabaseDriverFactory(private val context: Context) {
    actual fun createDriver(): SqlDriver {
        return AndroidSqliteDriver(
            schema = SectDatabase.Schema,
            name = "sect.db",
            context = context
        )
    }
}
