// ─────────────────────────────────────────────────────────────
// Dialog de détail "Mon résultat" (étudiant) — refondu
// Score circulaire SVG + synthèse + détail par question
// ─────────────────────────────────────────────────────────────

'use client'

import { useMemo } from 'react'
import {
  BarChart3,
  Target,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  Clock,
  PenLine,
  MessageSquare,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ds/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ScoreDisplay } from './score-display'
import { formatDateTimeFR, getQuestionTypeBadgeVariant } from '@/lib/resultats-utils'
import type { StudentSession } from '@/types/resultats'

interface MonResultatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: StudentSession | null
}

// NOTE : QUESTION_TYPE_STYLES est désormais centralisé dans
// `@/lib/resultats-utils` et exposé via `getQuestionTypeBadgeVariant`.
// On conserve juste la liste des types manuels (QRC/TRS/REFLEXION).
const MANUAL_TYPES = ['QRC', 'TRS', 'REFLEXION']

export function MonResultatDialog({ open, onOpenChange, session }: MonResultatDialogProps) {
  // ─── Construction du détail par question (unifié) ───
  const questionDetails = useMemo(() => {
    if (!session) return []

    const epreuveQuestions = session.epreuve.questions ?? []
    const reponses = session.reponses ?? []

    // Format riche depuis epreuve.questions
    if (epreuveQuestions.length > 0) {
      return epreuveQuestions.map((eq, idx) => {
        const reponse = reponses.find((r) => r.questionId === eq.questionId)
        const pointsObtenus = reponse?.score ?? null
        const isGraded = pointsObtenus !== null && pointsObtenus !== undefined
        const ratio = eq.bareme > 0 && isGraded ? (pointsObtenus as number) / eq.bareme : 0
        return {
          index: idx + 1,
          type: eq.question.type,
          enonce: eq.question.enonce,
          pointsMax: eq.bareme,
          pointsObtenus,
          correct: isGraded ? (pointsObtenus as number) >= eq.bareme * 0.5 : null,
          ratio,
          reponseEtudiant: reponse?.contenu ?? null,
          commentaire: reponse?.commentaire ?? null,
          noteIA: reponse?.noteIA ?? null,
        }
      })
    }

    // Fallback : detailParQuestion
    const details = session.resultat?.detailParQuestion
    if (details && Array.isArray(details) && details.length > 0) {
      return details.map((q: Record<string, unknown>, idx: number) => {
        const score = typeof q.score === 'number' ? q.score : null
        const bareme = typeof q.bareme === 'number' ? q.bareme : 1
        const isGraded = score !== null
        return {
          index: idx + 1,
          type: String(q.type || ''),
          enonce: String(q.enonce || `Question ${idx + 1}`),
          pointsMax: bareme,
          pointsObtenus: score,
          correct: isGraded ? (score as number) >= bareme * 0.5 : null,
          ratio: bareme > 0 && isGraded ? (score as number) / bareme : 0,
          reponseEtudiant: typeof q.reponseEtudiant === 'string' ? q.reponseEtudiant : null,
          commentaire: typeof q.commentaire === 'string' ? q.commentaire : null,
          noteIA: null,
        }
      })
    }

    return []
  }, [session])

  if (!session) return null

  const correctCount = questionDetails.filter((q) => q.correct === true).length
  const incorrectCount = questionDetails.filter((q) => q.correct === false).length
  const pendingCount = questionDetails.filter(
    (q) => q.correct === null && q.pointsObtenus === null
  ).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {session.epreuve.titre}
          </DialogTitle>
          <DialogDescription>
            {session.dateDebut
              ? `Passé le ${formatDateTimeFR(session.dateDebut)} — ${session.epreuve.enseignant.name}`
              : 'Résultat de l\'épreuve'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-2">
          <div className="space-y-5 pb-4">
            {/* En-tête : score circulaire */}
            <ScoreDisplay session={session} variant="hero" />

            {/* Synthèse 3 KPIs */}
            {questionDetails.length > 0 && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-emerald-50/50 p-3 text-center dark:bg-emerald-950/20">
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {correctCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Correctes</p>
                  </div>
                  <div className="rounded-lg border bg-red-50/50 p-3 text-center dark:bg-red-950/20">
                    <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                      {incorrectCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Incorrectes</p>
                  </div>
                  <div className="rounded-lg border bg-amber-50/50 p-3 text-center dark:bg-amber-950/20">
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                      {pendingCount}
                    </p>
                    <p className="text-xs text-muted-foreground">En attente</p>
                  </div>
                </div>

                <Separator />

                {/* Détail par question */}
                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Détail par question
                    <span className="text-xs font-normal text-muted-foreground">
                      ({questionDetails.length} question{questionDetails.length > 1 ? 's' : ''})
                    </span>
                  </h4>
                  <div className="space-y-3">
                    {questionDetails.map((q, idx) => {
                      const isGraded = q.pointsObtenus !== null
                      const isCorrect = q.correct === true
                      const isIncorrect = q.correct === false
                      const isManual = MANUAL_TYPES.includes(q.type)

                      return (
                        <div
                          key={idx}
                          className={`rounded-lg border p-4 transition-colors ${
                            isGraded && isCorrect
                              ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
                              : isGraded && isIncorrect
                                ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
                                : 'border-muted'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Numéro + statut */}
                            <div className="flex flex-col items-center gap-1">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">
                                {q.index}
                              </span>
                              {isGraded && isCorrect && (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              )}
                              {isGraded && isIncorrect && (
                                <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
                              )}
                              {isGraded && q.correct === null && isManual && (
                                <MinusCircle className="h-4 w-4 text-gray-400" />
                              )}
                              {!isGraded && (
                                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                              )}
                            </div>

                            {/* Contenu */}
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={getQuestionTypeBadgeVariant(q.type)}
                                  size="sm"
                                  className="text-[10px]"
                                >
                                  {q.type}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {q.pointsMax} point{q.pointsMax > 1 ? 's' : ''}
                                  {q.pointsMax > 0 && isGraded && (
                                    <span className="ml-1">· {Math.round(q.ratio * 100)}%</span>
                                  )}
                                </span>
                              </div>

                              <p className="text-sm leading-relaxed">
                                {q.enonce || `Question ${q.index}`}
                              </p>

                              {/* Score + barre */}
                              {isGraded ? (
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`text-sm font-semibold ${
                                      isCorrect
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : 'text-red-700 dark:text-red-400'
                                    }`}
                                  >
                                    {(q.pointsObtenus as number).toFixed(2)}/{q.pointsMax}
                                  </span>
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        isCorrect ? 'bg-emerald-500' : 'bg-red-500'
                                      }`}
                                      style={{ width: `${Math.max(0, Math.min(100, q.ratio * 100))}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-900 dark:bg-amber-950/30">
                                  {isManual ? (
                                    <>
                                      <PenLine className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                      <span className="text-xs text-amber-700 dark:text-amber-400">
                                        En attente de correction par l&apos;enseignant
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                      <span className="text-xs text-amber-700 dark:text-amber-400">
                                        En attente de correction
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}

                              {/* Votre réponse */}
                              {q.reponseEtudiant && (
                                <div className="rounded-md bg-muted/40 p-2">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    {q.type === 'QRC' || q.type === 'TRS' ? 'Votre réponse :' : 'Réponse :'}
                                  </p>
                                  <p className="mt-0.5 whitespace-pre-wrap text-sm">
                                    {q.reponseEtudiant}
                                  </p>
                                </div>
                              )}

                              {/* Note IA */}
                              {q.noteIA !== null && q.noteIA !== undefined && (
                                <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50/50 px-2 py-1 dark:border-sky-900 dark:bg-sky-950/20">
                                  <span className="text-xs text-sky-700 dark:text-sky-400">
                                    🤖 Suggestion IA : {q.noteIA.toFixed(1)}/{q.pointsMax}
                                  </span>
                                </div>
                              )}

                              {/* Commentaire enseignant */}
                              {q.commentaire && (
                                <div className="rounded-md border-l-2 border-emerald-400 bg-emerald-50/50 p-2 dark:bg-emerald-950/20">
                                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                    Commentaire de l&apos;enseignant :
                                  </p>
                                  <p className="mt-0.5 text-sm leading-relaxed">{q.commentaire}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
