package com.sect.mobile.shared.presentation.action

sealed interface PassationAction {
    data class StartSession(val epreuveId: String) : PassationAction
    data class OnReponseChanged(val questionId: String, val contenu: String) : PassationAction
    data object NextQuestion : PassationAction
    data object PreviousQuestion : PassationAction
    data object SubmitSession : PassationAction
    data class GoToQuestion(val index: Int) : PassationAction
}
