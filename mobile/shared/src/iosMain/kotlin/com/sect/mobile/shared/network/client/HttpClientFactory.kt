// SECT Mobile — Client HTTP Ktor (iOS — engine Darwin/NSURLSession)
package com.sect.mobile.shared.network.client

import io.ktor.client.*
import io.ktor.client.engine.*
import io.ktor.client.engine.darwin.*

actual fun createHttpClient(
    engine: HttpClientEngine,
    baseUrl: String,
    tokenProvider: () -> String,
    refreshHandler: suspend () -> String
): HttpClient {
    val client = HttpClient(engine)
    return configureHttpClient(client, baseUrl, tokenProvider, refreshHandler)
}
