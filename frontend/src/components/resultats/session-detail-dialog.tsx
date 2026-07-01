// ─────────────────────────────────────────────────────────────
// Dialog de détail d'un résultat étudiant (refonte Savane EdTech).
// Score circulaire SVG + synthèse + détail par question (BADGE DS).
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
import { Badge } from '@/components/ds/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  getScoreColor,
  scoreToPercentage,
  formatDateFR,
  formatDateTimeFR,
  getQuestionTypeBadgeVariant,
  normalizeQuestionDetails,
} from '@/lib/resultats-utils'
import { useChartColors } from './resultats-charts'
import type { SessionResult } from '@/types/resultats'

interface SessionDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: SessionResult | null
  epreuveTitre?: string
  noteTotal?: number
  /** Map {questionId → enonce} depuis Epreuve.contenu.questions.
   *  Permet d'afficher l'énoncé réel de chaque question (RESULTATS-ENONCE-1). */
  enonceMap?: Record<string, string>
}

export function SessionDetailDialog({
  open,
  onOpenChange,
  session,
  epreuveTitre,
  noteTotal = 20,
  enonceMap,
}: SessionDetailDialogProps) {
  const colors = useChartColors()

  if (!session) return null

  const score = session.score ?? 0
  const pct = scoreToPercentage(score, noteTotal)
  const scoreOn20 = (score / noteTotal) * 20
  const isCorrected = session.statut === 'CORRIGEE' || session.statut === 'RETOURNEE'
  // BUGFIX (DETAIL-NORM-2) : normaliser le format BRUT DB (schéma A : bareme/
  // score/questionId) vers le format frontend (schéma B : pointsMax/
  // pointsObtenus/correct). Avant, le dialog affichait '0/0 point' car q.pointsMax
  // était undefined (le champ DB est 'bareme').
  // BUGFIX (RESULTATS-ENONCE-1) : enrichir avec enonceMap pour afficher l'énoncé réel.
  const enonceMapObj = enonceMap ? new Map(Object.entries(enonceMap)) : undefined
  const details = normalizeQuestionDetails(session.resultat?.detailParQuestion, enonceMapObj)
  const hasDetails = details.length > 0

  const ringColor = scoreOn20 >= 16 ? colors.gold : scoreOn20 >= 10 ? colors.primary : colors.destructive

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary-text" />
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
                      stroke={ringColor}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${(pct / 100) * 213.6} 213.6`}
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className={`font-mono text-lg font-bold tabular-nums ${getScoreColor(scoreOn20)}`}>
                      {pct}%
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Score final</p>
                  <p className={`font-mono text-2xl font-bold tabular-nums ${getScoreColor(scoreOn20)}`}>
                    {score.toFixed(1)}
                    <span className="text-base font-normal text-muted-foreground">/{noteTotal}</span>
                  </p>
                  <Badge
                    variant={scoreOn20 >= 16 ? 'gold' : scoreOn20 >= 10 ? 'success' : 'danger'}
                    size="sm"
                    className="mt-1 tabular-nums"
                  >
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
                    <span className="text-muted-foreground tabular-nums">Soumis le {formatDateTimeFR(session.dateFin)}</span>
                  </div>
                )}
                {session.dateDebut && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums">Commencé le {formatDateFR(session.dateDebut)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Statut + alertes */}
            <div className="flex flex-wrap items-center gap-2">
              {isCorrected ? (
                <Badge variant="success" size="md">
                  <CheckCircle2 className="h-3 w-3" />
                  Corrigé
                </Badge>
              ) : (
                <Badge variant="warning" size="md">
                  <Clock className="h-3 w-3" />
                  En attente de correction
                </Badge>
              )}
              {session.alertes > 0 && (
                <Badge variant="danger" size="md" className="tabular-nums">
                  <AlertTriangle className="h-3 w-3" />
                  {session.alertes} alerte{session.alertes > 1 ? 's' : ''}
                </Badge>
              )}
              {session.penalite && session.penalite > 0 && (
                <Badge variant="warning" size="md" className="tabular-nums">
                  Pénalité : -{session.penalite.toFixed(1)}
                </Badge>
              )}
            </div>

            <Separator />

            {/* Synthèse rapide */}
            {hasDetails && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-success/20 bg-success/5 p-3 text-center">
                  <p className="font-mono text-2xl font-bold tabular-nums text-success-text">
                    {details!.filter((q) => q.correct === true).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Correctes</p>
                </div>
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
                  <p className="font-mono text-2xl font-bold tabular-nums text-destructive">
                    {details!.filter((q) => q.correct === false).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Incorrectes</p>
                </div>
                <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-center">
                  <p className="font-mono text-2xl font-bold tabular-nums text-warning">
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
                  <Target className="h-4 w-4 text-primary-text" />
                  Détail par question
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    ({details!.length} question{details!.length > 1 ? 's' : ''})
                  </span>
                </h4>
                <div className="space-y-3">
                  {details!.map((q, idx) => {
                    const isGraded = q.pointsObtenus !== null
                    const isCorrect = q.correct === true
                    const isIncorrect = q.correct === false
                    const qPct = q.pointsMax > 0 ? (q.pointsObtenus ?? 0) / q.pointsMax : 0
                    const variant = getQuestionTypeBadgeVariant(q.type)

                    return (
                      <div
                        key={idx}
                        className={`rounded-lg border p-4 transition-colors ${
                          isGraded && isCorrect
                            ? 'border-success/30 bg-success/5'
                            : isGraded && isIncorrect
                              ? 'border-destructive/30 bg-destructive/5'
                              : 'border-border'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Numéro + icône */}
                          <div className="flex flex-col items-center gap-1">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
                              {q.index ?? idx + 1}
                            </span>
                            {isGraded && isCorrect && (
                              <CheckCircle2 className="h-4 w-4 text-success-text" />
                            )}
                            {isGraded && isIncorrect && (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </div>

                          {/* Contenu */}
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={variant} size="sm">
                                {q.type}
                              </Badge>
                              <span className="text-xs text-muted-foreground tabular-nums">
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
                                  className={`font-mono text-sm font-semibold tabular-nums ${
                                    isCorrect ? 'text-success-text' : 'text-destructive'
                                  }`}
                                >
                                  {q.pointsObtenus?.toFixed(2) ?? '0'}/{q.pointsMax}
                                </span>
                                {/* Barre de progression */}
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${Math.max(0, Math.min(100, qPct * 100))}%`,
                                      backgroundColor: isCorrect ? 'var(--primary)' : 'var(--destructive)',
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" />
                                <span className="text-xs text-warning-foreground">
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
                              <div className="rounded-md border border-success/30 bg-success/5 p-2">
                                <p className="text-xs font-medium text-success-text">
                                  Réponse attendue :
                                </p>
                                <p className="mt-0.5 whitespace-pre-wrap text-sm">{q.reponseAttendue}</p>
                              </div>
                            )}

                            {/* Commentaire */}
                            {q.commentaire && (
                              <div className="rounded-md border-l-2 border-info bg-info/5 p-2">
                                <p className="text-xs font-medium text-info-foreground">
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
              <div className="ds-kente-watermark flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
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
