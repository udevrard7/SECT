// SECT Mobile — DatabaseDriverFactory actual (iOS)
// Uses NativeSqliteDriver backed by the platform SQLite library.
package com.sect.mobile.shared.database

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.native.NativeSqliteDriver

/**
 * iOS implementation: provides a NativeSqliteDriver.
 * No Context required — iOS uses the default SQLite from the system library.
 */
actual class DatabaseDriverFactory {
    actual fun createDriver(): SqlDriver {
        return NativeSqliteDriver(
            schema = SectDatabase.Schema,
            name = "sect.db"
        )
    }
}
