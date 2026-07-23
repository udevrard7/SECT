'use client'

/**
 * CorrectionPage — Orchestrateur de la page Correction.
 *
 * Ce composant est volontairement minimal (présentationnel) : il appelle le
 * hook contrôleur `useCorrectionState` qui concentre toute la logique métier
 * (état, données TanStack Query, mutations, handlers, raccourcis clavier),
 * puis câble les valeurs/handlers vers les composants de présentation :
 *
 *   - CorrectionToolbar      : sélecteur d'épreuve, mode, recherche, batch
 *   - CorrectionSidebar      : sidebar desktop (collapsed/expanded) + mobile
 *   - StudentSidebar          : liste des copies (mode par-copie)
 *   - QuestionSidebar         : liste des questions (mode par-question)
 *   - ParCopieView            : correction d'un étudiant, navigation par question
 *   - ParQuestionView         : correction d'une question, toutes les copies
 *   - CorrectionLoadingSkeleton / CorrectionEmptyState : états initial/vide
 *
 * Historique de modularisation (voir worklog T2 + T3) :
 *   Phase 1 : types + helpers + ScoreCircle (commit aef60a0)
 *   Phase 2 : data layer TanStack Query (commit b0b428d)
 *   Phase 3 commits 1-3 : extraction des 9 composants présentationnels
 *   Phase 3 finalisation (ce commit) : extraction du contrôleur + sidebar
 *     → correction-page.tsx passe de 762 à ~130 lignes.
 */

import { useAuthStore } from '@/stores/auth-store'
import { CorrectionToolbar } from '@/components/correction/correction-toolbar'
import { CorrectionSidebar } from '@/components/correction/correction-sidebar'
import { StudentSidebar } from '@/components/correction/student-sidebar'
import { QuestionSidebar } from '@/components/correction/question-sidebar'
import { CorrectionLoadingSkeleton, CorrectionEmptyState } from '@/components/correction/correction-skeletons'
import { ParCopieView } from '@/components/correction/par-copie-view'
import { ParQuestionView } from '@/components/correction/par-question-view'
import { useCorrectionState } from '@/hooks/use-correction-state'

export function CorrectionPage() {
  const user = useAuthStore((s) => s.user)
  const s = useCorrectionState(user)

  // ─── Guards : loading / empty ───
  if (s.isLoadingEpreuves) {
    return <CorrectionLoadingSkeleton />
  }
  if (s.epreuves.length === 0) {
    return <CorrectionEmptyState />
  }

  // ─── Sidebar content (variable réutilisée desktop + mobile) ───
  const sidebarContent = s.gradingMode === 'par-question' ? (
    <QuestionSidebar
      horizontalQuestions={s.horizontalQuestions}
      horizontalQuestionIndex={s.horizontalQuestionIndex}
      sessions={s.sessions}
      onSelectQuestion={s.setHorizontalQuestionIndex}
      isLoadingSessions={s.isLoadingSessions}
    />
  ) : (
    <StudentSidebar
      filteredSessions={s.filteredSessions}
      selectedSessionId={s.selectedSessionId}
      onSelectSession={s.selectSession}
      isLoadingSessions={s.isLoadingSessions}
    />
  )

  // ─── Main content (selon le mode de correction) ───
  const mainContent = s.gradingMode === 'par-copie' ? (
    <ParCopieView
      selectedSession={s.selectedSession}
      selectedSessionId={s.selectedSessionId}
      questions={s.questions}
      currentQuestion={s.currentQuestion}
      currentQuestionIndex={s.currentQuestionIndex}
      currentReponse={s.currentReponse}
      totalQuestions={s.totalQuestions}
      manualCorrectedCount={s.manualCorrectedCount}
      noteFinale={s.noteFinale}
      commentaire={s.commentaire}
      selectedCriteria={s.selectedCriteria}
      currentRubricCriteria={s.currentRubricCriteria}
      computedScore={s.computedScore}
      showAiSuggestion={s.showAiSuggestion}
      aiSuggestionOpen={s.aiSuggestionOpen}
      expectedAnswerOpen={s.expectedAnswerOpen}
      isAiLoading={s.isAiLoading}
      isSaving={s.isSaving}
      isApplyingAi={s.isApplyingAi}
      isFinalizing={s.isFinalizing}
      mainContentRef={s.mainContentRef}
      setNoteFinale={s.setNoteFinale}
      setCommentaire={s.setCommentaire}
      setAiSuggestionOpen={s.setAiSuggestionOpen}
      setExpectedAnswerOpen={s.setExpectedAnswerOpen}
      handleToggleCriterion={s.handleToggleCriterion}
      handleAiGrade={s.handleAiGrade}
      handleSave={s.handleSave}
      handleApplyAi={s.handleApplyAi}
      handleDismissAi={s.handleDismissAi}
      handleFinalize={s.handleFinalize}
      goToQuestion={s.goToQuestion}
    />
  ) : (
    <ParQuestionView
      sessions={s.sessions}
      horizontalQuestions={s.horizontalQuestions}
      horizontalCurrentQuestion={s.horizontalCurrentQuestion}
      horizontalQuestionIndex={s.horizontalQuestionIndex}
      setHorizontalQuestionIndex={s.setHorizontalQuestionIndex}
      horizontalGradedCount={s.horizontalGradedCount}
      horizontalScores={s.horizontalScores}
      setHorizontalScores={s.setHorizontalScores}
      horizontalComments={s.horizontalComments}
      setHorizontalComments={s.setHorizontalComments}
      horizontalCriteria={s.horizontalCriteria}
      expectedAnswerOpen={s.expectedAnswerOpen}
      setExpectedAnswerOpen={s.setExpectedAnswerOpen}
      isAiLoading={s.isAiLoading}
      isBatchAiLoading={s.isBatchAiLoading}
      savingSessionId={s.savingSessionId}
      setIsBatchAiLoading={s.setIsBatchAiLoading}
      handleHorizontalToggleCriterion={s.handleHorizontalToggleCriterion}
      handleHorizontalSave={s.handleHorizontalSave}
      handleAiGrade={s.handleAiGrade}
      getReponseForSession={s.getReponseForSession}
      aiGradeMutation={s.aiGradeMutation}
    />
  )

  return (
    <div className="flex flex-col rounded-xl border border-border bg-background overflow-hidden h-[calc(100vh-10rem)]">
      {/* Toolbar */}
      <CorrectionToolbar
        selectedEpreuveId={s.selectedEpreuveId}
        setSelectedEpreuveId={s.setSelectedEpreuveId}
        epreuves={s.epreuves}
        gradingMode={s.gradingMode}
        setGradingMode={s.setGradingMode}
        sessions={s.sessions}
        globalProgress={s.globalProgress}
        searchFilter={s.searchFilter}
        setSearchFilter={s.setSearchFilter}
        selectedSessionId={s.selectedSessionId}
        needsCorrectionCount={s.needsCorrectionCount}
        isLoadingSessions={s.isLoadingSessions}
        onBatchAiGrade={s.handleBatchAiGrade}
        isBatchAiLoading={s.isBatchAiLoading}
        onBatchReturn={s.handleBatchReturn}
        isBatchReturning={s.isBatchReturning}
        onApplyAllAiSuggestions={s.handleApplyAllAiSuggestions}
        isApplyingAllAi={s.isApplyingAllAi}
      />

      {/* Body: Sidebar + Main */}
      <div className="flex flex-1 min-h-0">
        <CorrectionSidebar
          gradingMode={s.gradingMode}
          sidebarCollapsed={s.sidebarCollapsed}
          setSidebarCollapsed={s.setSidebarCollapsed}
          mobileSheetOpen={s.mobileSheetOpen}
          setMobileSheetOpen={s.setMobileSheetOpen}
          isLoadingSessions={s.isLoadingSessions}
          sidebarContent={sidebarContent}
          filteredSessions={s.filteredSessions}
          selectedSessionId={s.selectedSessionId}
          selectSession={s.selectSession}
          horizontalQuestions={s.horizontalQuestions}
          horizontalQuestionIndex={s.horizontalQuestionIndex}
          setHorizontalQuestionIndex={s.setHorizontalQuestionIndex}
        />

        {/* Main content area */}
        <div className="flex-1 min-w-0 flex flex-col">
          {mainContent}
        </div>
      </div>
    </div>
  )
}
