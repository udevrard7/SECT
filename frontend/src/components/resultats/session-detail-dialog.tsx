// ─────────────────────────────────────────────────────────────
// Dialog de détail d'un résultat étudiant (version refondue)
// ─────────────────────────────────────────────────────────────

'use client'

import {
  Award,
  Target,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Mail,
  Calendar,
  TrendingUp,
  FileText,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  getScoreColor,
  getScoreBg,
  scoreToPercentage,
  formatDateFR,
  formatDateTimeFR,
} from '@/lib/resultats-utils'
import type { SessionResult } from '@/types/resultats'

interface SessionDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: SessionResult | null
  epreuveTitre?: string
  noteTotal?: number
}

const QUESTION_TYPE_STYLES: Record<string, string> = {
  QCU: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800',
  QCM: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  QRC: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  TRS: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800',
  CODE: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
  REFLEXION: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
}

export function SessionDetailDialog({
  open,
  onOpenChange,
  session,
  epreuveTitre,
  noteTotal = 20,
}: SessionDetailDialogProps) {
  if (!session) return null

  const score = session.score ?? 0
  const pct = scoreToPercentage(score, noteTotal)
  const scoreOn20 = (score / noteTotal) * 20
  const isCorrected = session.statut === 'CORRIGEE' || session.statut === 'RETOURNEE'
  const details = session.resultat?.detailParQuestion
  const hasDetails = Array.isArray(details) && details.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Détail du résultat
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{session.etudiant.name}</span>
            {epreuveTitre && <span>— {epreuveTitre}</span>}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-2">
          <div className="space-y-5 pb-4">
            {/* En-tête : score + infos étudiant */}
            <div className="flex flex-col gap-4 rounded-xl border bg-gradient-to-br from-muted/40 to-muted/10 p-4 sm:flex-row sm:items-center">
              {/* Score circulaire */}
              <div className="flex items-center gap-4">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                  <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      className="text-muted/40"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke={scoreOn20 >= 10 ? '#10b981' : scoreOn20 >= 8 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${(pct / 100) * 213.6} 213.6`}
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className={`text-lg font-bold ${getScoreColor(scoreOn20)}`}>
                      {pct}%
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Score final</p>
                  <p className={`text-2xl font-bold ${getScoreColor(scoreOn20)}`}>
                    {score.toFixed(1)}
                    <span className="text-base font-normal text-muted-foreground">/{noteTotal}</span>
                  </p>
                  <Badge variant="outline" className={`mt-1 ${getScoreBg(scoreOn20)}`}>
                    {scoreOn20.toFixed(1)}/20 équivalent
                  </Badge>
                </div>
              </div>

              <Separator orientation="vertical" className="hidden h-20 sm:block" />

              {/* Infos étudiant */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{session.etudiant.email}</span>
                </div>
                {session.etudiant.filiere && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{session.etudiant.filiere}</span>
                  </div>
                )}
                {session.dateFin && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Soumis le {formatDateTimeFR(session.dateFin)}</span>
                  </div>
                )}
                {session.dateDebut && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Commencé le {formatDateFR(session.dateDebut)}
                  </div>
                )}
              </div>
            </div>

            {/* Statut + alertes */}
            <div className="flex flex-wrap items-center gap-2">
              {isCorrected ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
                  <CheckCircle2 className="h-3 w-3" />
                  Corrigé
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
                  <Clock className="h-3 w-3" />
                  En attente de correction
                </Badge>
              )}
              {session.alertes > 0 && (
                <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">
                  <AlertTriangle className="h-3 w-3" />
                  {session.alertes} alerte{session.alertes > 1 ? 's' : ''}
                </Badge>
              )}
              {session.penalite && session.penalite > 0 && (
                <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800">
                  Pénalité : -{session.penalite.toFixed(1)}
                </Badge>
              )}
            </div>

            <Separator />

            {/* Synthèse rapide */}
            {hasDetails && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-emerald-50/50 p-3 text-center dark:bg-emerald-950/20">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                    {details!.filter((q) => q.correct === true).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Correctes</p>
                </div>
                <div className="rounded-lg border bg-red-50/50 p-3 text-center dark:bg-red-950/20">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                    {details!.filter((q) => q.correct === false).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Incorrectes</p>
                </div>
                <div className="rounded-lg border bg-amber-50/50 p-3 text-center dark:bg-amber-950/20">
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {details!.filter((q) => q.correct === null && q.pointsObtenus === null).length}
                  </p>
                  <p className="text-xs text-muted-foreground">En attente</p>
                </div>
              </div>
            )}

            {/* Détail par question */}
            {hasDetails ? (
              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Détail par question
                  <span className="text-xs font-normal text-muted-foreground">
                    ({details!.length} question{details!.length > 1 ? 's' : ''})
                  </span>
                </h4>
                <div className="space-y-3">
                  {details!.map((q, idx) => {
                    const isGraded = q.pointsObtenus !== null
                    const isCorrect = q.correct === true
                    const isIncorrect = q.correct === false
                    const qPct = q.pointsMax > 0 ? (q.pointsObtenus ?? 0) / q.pointsMax : 0

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
                          {/* Numéro + icône */}
                          <div className="flex flex-col items-center gap-1">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">
                              {q.index ?? idx + 1}
                            </span>
                            {isGraded && isCorrect && (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            )}
                            {isGraded && isIncorrect && (
                              <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
                            )}
                          </div>

                          {/* Contenu */}
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${QUESTION_TYPE_STYLES[q.type] ?? QUESTION_TYPE_STYLES.QRC}`}
                              >
                                {q.type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {q.pointsMax} point{q.pointsMax > 1 ? 's' : ''}
                                {q.pointsMax > 0 && isGraded && (
                                  <span className="ml-1">· {Math.round(qPct * 100)}%</span>
                                )}
                              </span>
                            </div>

                            <p className="text-sm leading-relaxed">
                              {q.enonce || `Question ${q.index ?? idx + 1}`}
                            </p>

                            {/* Score */}
                            {isGraded ? (
                              <div className="flex items-center gap-3">
                                <span
                                  className={`text-sm font-semibold ${
                                    isCorrect
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-red-700 dark:text-red-400'
                                  }`}
                                >
                                  {q.pointsObtenus?.toFixed(2) ?? '0'}/{q.pointsMax}
                                </span>
                                {/* Barre de progression */}
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isCorrect ? 'bg-emerald-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.max(0, Math.min(100, qPct * 100))}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-900 dark:bg-amber-950/30">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                                <span className="text-xs text-amber-700 dark:text-amber-400">
                                  En attente de correction
                                </span>
                              </div>
                            )}

                            {/* Réponse étudiant */}
                            {q.reponseEtudiant && (
                              <div className="rounded-md bg-muted/40 p-2">
                                <p className="text-xs font-medium text-muted-foreground">Réponse de l&apos;étudiant :</p>
                                <p className="mt-0.5 whitespace-pre-wrap text-sm">{q.reponseEtudiant}</p>
                              </div>
                            )}

                            {/* Réponse attendue */}
                            {q.reponseAttendue && isIncorrect && (
                              <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-2 dark:border-emerald-900 dark:bg-emerald-950/20">
                                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                  Réponse attendue :
                                </p>
                                <p className="mt-0.5 whitespace-pre-wrap text-sm">{q.reponseAttendue}</p>
                              </div>
                            )}

                            {/* Commentaire */}
                            {q.commentaire && (
                              <div className="rounded-md border-l-2 border-sky-400 bg-sky-50/50 p-2 dark:bg-sky-950/20">
                                <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                                  <TrendingUp className="mr-1 inline h-3 w-3" />
                                  Commentaire :
                                </p>
                                <p className="mt-0.5 text-sm">{q.commentaire}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Target className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Le détail par question n&apos;est pas encore disponible.
                </p>
              </div>
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
