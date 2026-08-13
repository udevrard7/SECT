// SECT Mobile — Database Helper (shared)
// Initializes the SectDatabase and provides convenient access.
package com.sect.mobile.shared.database

import com.sect.mobile.shared.database.SectDatabase

/**
 * Creates and provides the SectDatabase instance.
 * Call once at app startup (in SECTApplication / iOSApp).
 */
class DatabaseProvider(driverFactory: DatabaseDriverFactory) {
    val database: SectDatabase = SectDatabase(driverFactory.createDriver())
}
