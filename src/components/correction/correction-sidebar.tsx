'use client'

import type { ReactNode } from 'react'
import {
  List,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { CorrectionSession, GradingMode } from '@/types/correction'
import {
  getQuestionTypeLabel,
  getStudentStatusDot,
} from '@/lib/correction-utils'

/**
 * Sidebar de la page Correction : gère 3 variantes de rendu.
 *
 *  1. Desktop expanded (280px) : affiche le contenu passé en prop
 *     `sidebarContent` (StudentSidebar ou QuestionSidebar selon le mode).
 *  2. Desktop collapsed (48px) : affiche des icônes compacts (dots pour les
 *     étudiants, numéros pour les questions) avec tooltips.
 *  3. Mobile : un bouton flottant qui ouvre une Sheet (drawer gauche)
 *     contenant le même `sidebarContent`.
 *
 * Le header de la sidebar (titre + bouton collapse) est géré ici.
 *
 * Extrait de correction-page.tsx (phase 3, finalisation — voir worklog T3).
 * JSX strictement identique à l'original (L640-753).
 */
export function CorrectionSidebar({
  gradingMode,
  sidebarCollapsed,
  setSidebarCollapsed,
  mobileSheetOpen,
  setMobileSheetOpen,
  isLoadingSessions,
  sidebarContent,
  // collapsed-mode data (par-copie)
  filteredSessions,
  selectedSessionId,
  selectSession,
  // collapsed-mode data (par-question)
  horizontalQuestions,
  horizontalQuestionIndex,
  setHorizontalQuestionIndex,
}: {
  gradingMode: GradingMode
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  mobileSheetOpen: boolean
  setMobileSheetOpen: (open: boolean) => void
  isLoadingSessions: boolean
  sidebarContent: ReactNode
  filteredSessions: CorrectionSession[]
  selectedSessionId: string | null
  selectSession: (id: string) => void
  horizontalQuestions: CorrectionSession['epreuve']['questions']
  horizontalQuestionIndex: number
  setHorizontalQuestionIndex: (index: number) => void
}) {
  return (
    <>
      {/* ─── Desktop sidebar ─── */}
      <div className={`hidden md:flex flex-col border-r border-border bg-card transition-all duration-200 ${sidebarCollapsed ? 'w-12' : 'w-[280px]'}`}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          {!sidebarCollapsed && (
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {gradingMode === 'par-copie' ? 'Étudiants' : 'Questions'}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="h-6 w-6 p-0"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Sidebar content */}
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center py-2 gap-1">
            {gradingMode === 'par-copie' ? (
              filteredSessions.slice(0, 20).map((session) => {
                const status = getStudentStatusDot(session)
                const isSelected = session.id === selectedSessionId
                return (
                  <TooltipProvider key={session.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => selectSession(session.id)}
                          className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-emerald-50 ring-1 ring-emerald-300 dark:bg-emerald-950/30 dark:ring-emerald-700'
                              : 'hover:bg-muted/60'
                          }`}
                        >
                          <span className={`h-2.5 w-2.5 rounded-full ${status.color}`} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{session.etudiant.name}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              })
            ) : (
              horizontalQuestions.slice(0, 20).map((q, idx) => (
                <TooltipProvider key={q.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setHorizontalQuestionIndex(idx)}
                        className={`h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-bold transition-colors ${
                          idx === horizontalQuestionIndex
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'hover:bg-muted/60 text-muted-foreground'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Q{idx + 1} — {getQuestionTypeLabel(q.question.type)}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))
            )}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="py-1">
              {isLoadingSessions ? (
                <div className="space-y-2 px-2 py-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="animate-pulse rounded-md border p-2.5 space-y-1.5">
                      <div className="h-3 w-24 rounded bg-muted" />
                      <div className="h-2 w-16 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              ) : (
                sidebarContent
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* ─── Mobile sidebar (Sheet / drawer) ─── */}
      <div className="md:hidden">
        <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="fixed bottom-4 left-4 z-40 h-9 w-9 p-0 rounded-full shadow-lg bg-card"
            >
              <List className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetTitle className="px-4 pt-4 text-sm">
              {gradingMode === 'par-copie' ? 'Étudiants' : 'Questions'}
            </SheetTitle>
            <ScrollArea className="flex-1 h-[calc(100vh-6rem)]">
              <div className="py-2">
                {sidebarContent}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
