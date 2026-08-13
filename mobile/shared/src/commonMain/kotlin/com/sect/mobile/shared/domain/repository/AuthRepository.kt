package com.sect.mobile.shared.domain.repository

import com.sect.mobile.shared.domain.model.*

/**
 * Domain repository interface for authentication.
 * The data layer provides the implementation.
 */
interface AuthRepository {
    suspend fun login(identifier: String, password: String): AuthSession
    suspend fun refreshToken(): AuthSession
    suspend fun logout()
    suspend fun isAuthenticated(): Boolean
    suspend fun getCurrentUser(): User
    suspend fun requestPasswordReset(email: String)
    suspend fun confirmPasswordReset(token: String, newPassword: String)
    suspend fun changePassword(currentPassword: String, newPassword: String)
}
