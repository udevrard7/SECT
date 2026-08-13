package com.sect.mobile.shared.presentation.state

import com.sect.mobile.shared.domain.model.User

data class AuthState(
    val isAuthenticated: Boolean = false,
    val isCheckingToken: Boolean = true,
    val currentUser: User? = null,
    val isLoading: Boolean = false,
    val error: String? = null
)
