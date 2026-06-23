'use client'

import { FileCheck } from 'lucide-react'
import type { CorrectionSession } from '@/types/correction'
import { getScoreColor, getStudentStatusDot } from '@/lib/correction-utils'

/**
 * Sidebar étudiante pour le mode par-copie : liste les copies en attente de
 * correction puis les copies rendues, avec statut (dot coloré), score et
 * alertes éventuelles.
 *
 * Extrait de correction-page.tsx (phase 3, commit 1).
 * JSX strictement identique à l'original `renderStudentSidebar()` (L722-823).
 */
export function StudentSidebar({
  filteredSessions,
  selectedSessionId,
  onSelectSession,
  isLoadingSessions,
}: {
  filteredSessions: CorrectionSession[]
  selectedSessionId: string | null
  onSelectSession: (id: string) => void
  isLoadingSessions: boolean
}) {
  const pending = filteredSessions.filter(s => s.statut !== 'RETOURNEE')
  const returned = filteredSessions.filter(s => s.statut === 'RETOURNEE')

  return (
    <div className="flex flex-col h-full">
      {/* Section: En attente */}
      {pending.length > 0 && (
        <div className="pb-2">
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            À corriger ({pending.length})
          </p>
          <div className="space-y-0.5 px-1">
            {pending.map((session) => {
              const isSelected = session.id === selectedSessionId
              const status = getStudentStatusDot(session)
              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full text-left rounded-md px-2.5 py-2 transition-all flex items-center gap-2.5 group ${
                    isSelected
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-300 dark:ring-emerald-700'
                      : 'hover:bg-muted/60'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${status.color}`} title={status.label} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                      {session.etudiant.name}
                    </p>
                  </div>
                  {session.alertes > 0 && (
                    <span className="shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-[9px] font-bold dark:bg-rose-900/40 dark:text-rose-300">
                      {session.alertes}
                    </span>
                  )}
                  {session.score !== null && (
                    <span className={`text-xs font-semibold shrink-0 ${getScoreColor(session.score, session.autoGradedTotal > 0 ? session.autoGradedTotal : 20)}`}>
                      {session.score.toFixed(1)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Section: Rendues */}
      {returned.length > 0 && (
        <div className="pb-2">
          <p className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            Rendues ({returned.length})
          </p>
          <div className="space-y-0.5 px-1">
            {returned.map((session) => {
              const isSelected = session.id === selectedSessionId
              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full text-left rounded-md px-2.5 py-2 transition-all flex items-center gap-2.5 group opacity-70 ${
                    isSelected
                      ? 'bg-teal-50 dark:bg-teal-950/30 ring-1 ring-teal-300 dark:ring-teal-700 opacity-100'
                      : 'hover:bg-muted/60'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                      {session.etudiant.name}
                    </p>
                  </div>
                  {session.score !== null && (
                    <span className={`text-xs font-semibold shrink-0 ${getScoreColor(session.score, session.autoGradedTotal > 0 ? session.autoGradedTotal : 20)}`}>
                      {session.score.toFixed(1)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {filteredSessions.length === 0 && !isLoadingSessions && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <FileCheck className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Aucune copie
          </p>
        </div>
      )}
    </div>
  )
}
