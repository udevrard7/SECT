package com.sect.mobile.shared.presentation.state

import com.sect.mobile.shared.domain.model.User

data class ProfileState(
    val user: UiState<User> = UiState.Loading,
    val isChangingPassword: Boolean = false,
    val passwordChangeSuccess: Boolean = false,
    val error: String? = null
)
