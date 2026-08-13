package com.sect.mobile.shared.presentation.action

sealed interface AuthAction {
    data object CheckToken : AuthAction
    data class Login(val identifier: String, val password: String) : AuthAction
    data object Logout : AuthAction
    data class RequestPasswordReset(val email: String) : AuthAction
    data class ChangePassword(val current: String, val new: String) : AuthAction
}
