'use client'

import { motion } from 'framer-motion'
import { PenTool, Loader2, Wand2, Save, Check, CircleDot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScoreCircle } from '@/components/correction/score-circle'
import type { RubricCriterion } from '@/types/correction'

/**
 * Formulaire de notation manuelle partagé entre la vue par-copie et la vue
 * par-question.
 *
 * Extrait de correction-page.tsx (phase 3, commit 2).
 *
 * Deux variants préservant strictement le JSX original :
 *  - `par-copie` : conteneur `rounded-xl border-2 ... shadow-sm` avec header
 *    `px-3 py-2 ... rounded-t-xl`, body `p-3`, critères sans wrapper `<div>`,
 *    boutons critère en `text-[11px]`, label bouton IA "Suggérer une note",
 *    hint `<kbd>Ctrl+S</kbd>` visible.
 *  - `par-question` : conteneur `rounded-b-xl border-t-2` (sans shadow), header
 *    `px-4 py-2` (sans rounded-t-xl), body `p-4`, critères dans un wrapper
 *    `<div>` avec `mt-1.5`, boutons critère en `text-xs`, label bouton IA
 *    "Suggérer note IA", pas de hint `<kbd>`.
 *
 * Le hint "(auto : X)" s'affiche quand la note saisie diffère du score calculé
 * depuis les critères. En par-question, il requiert en plus `computedScore > 0`
 * (comportement original préservé).
 */
export function GradingForm({
  variant,
  bareme,
  rubricCriteria,
  selectedCriteria,
  onToggleCriterion,
  noteFinale,
  onNoteChange,
  commentaire,
  onCommentChange,
  computedScore,
  onSave,
  isSaving,
  onAiGrade,
  isAiLoading,
}: {
  variant: 'par-copie' | 'par-question'
  bareme: number
  rubricCriteria: RubricCriterion[]
  selectedCriteria: Set<string>
  onToggleCriterion: (id: string) => void
  noteFinale: string
  onNoteChange: (value: string) => void
  commentaire: string
  onCommentChange: (value: string) => void
  computedScore: number
  onSave: () => void
  isSaving: boolean
  onAiGrade: () => void
  isAiLoading: boolean
}) {
  const isParCopie = variant === 'par-copie'
  const containerClass = isParCopie
    ? 'rounded-xl border-2 border-success/30 bg-gradient-to-b from-success/10 to-success/10 shadow-sm'
    : 'rounded-b-xl border-t-2 border-success/30 bg-gradient-to-b from-success/10 to-success/10'
  const headerClass = isParCopie
    ? 'px-3 py-2 border-b border-success/20 bg-success/15 rounded-t-xl flex items-center gap-2'
    : 'px-4 py-2 border-b border-success/20 bg-success/15 flex items-center gap-2'
  const bodyClass = isParCopie ? 'p-3 space-y-3' : 'p-4 space-y-3'
  const criteriaBtnTextClass = isParCopie ? 'text-[11px]' : 'text-xs'
  const aiButtonLabel = isParCopie ? 'Suggérer une note' : 'Suggérer note IA'

  // Hint "(auto : X)" : s'affiche quand la note saisie diffère du score calculé.
  // En par-question, préservation de la condition supplémentaire `computedScore > 0`.
  const showAutoHint =
    noteFinale !== '' &&
    parseFloat(noteFinale) !== computedScore &&
    (isParCopie || computedScore > 0)

  return (
    <div className={containerClass}>
      {/* Grading header */}
      <div className={headerClass}>
        <PenTool className="h-3.5 w-3.5 text-success-text" />
        <span className="text-xs font-bold text-success-text uppercase tracking-wider">
          Notation
        </span>
        <span className="ml-auto text-xs text-success-text font-mono tabular-nums">
          {bareme} pts dispo.
        </span>
      </div>

      <div className={bodyClass}>
        {/* Critères de notation */}
        {isParCopie ? (
          <>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Critères
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {rubricCriteria.map((c) => {
                const isSelected = selectedCriteria.has(c.id)
                return (
                  <motion.button
                    key={c.id}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onToggleCriterion(c.id)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 ${criteriaBtnTextClass} font-medium transition-all ${
                      isSelected
                        ? 'border-success/40 bg-success/10 text-success-text shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:border-success/20 hover:bg-success/10'
                    }`}
                  >
                    {isSelected ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : (
                      <CircleDot className="h-2.5 w-2.5 opacity-40" />
                    )}
                    {c.label}
                  </motion.button>
                )
              })}
            </div>
          </>
        ) : (
          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Critères
            </Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {rubricCriteria.map((c) => {
                const isActive = selectedCriteria.has(c.id)
                return (
                  <motion.button
                    key={c.id}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onToggleCriterion(c.id)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 ${criteriaBtnTextClass} font-medium transition-all ${
                      isActive
                        ? 'border-success/40 bg-success/10 text-success-text shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:border-success/20 hover:bg-success/10'
                    }`}
                  >
                    {isActive ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : (
                      <CircleDot className="h-2.5 w-2.5 opacity-40" />
                    )}
                    {c.label}
                  </motion.button>
                )
              })}
            </div>
          </div>
        )}

        <Separator />

        {/* Note input */}
        <div className="flex items-center gap-3">
          <Label className="text-sm font-bold whitespace-nowrap">Note</Label>
          <ScoreCircle
            score={noteFinale !== '' ? parseFloat(noteFinale) || 0 : computedScore}
            total={bareme}
            size="md"
          />
          <Input
            type="number"
            min={0}
            max={bareme}
            step={0.5}
            value={noteFinale}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={String(Math.round(computedScore * 10) / 10)}
            className="w-24 h-9 text-base font-bold font-mono tabular-nums"
          />
          <span className="text-base font-semibold text-muted-foreground font-mono tabular-nums">/ {bareme}</span>
          {showAutoHint && (
            <span className="text-[10px] text-warning font-mono tabular-nums">
              (auto : {Math.round(computedScore * 10) / 10})
            </span>
          )}
        </div>

        {/* Comment textarea */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Commentaire pour l&apos;étudiant
          </Label>
          <Textarea
            value={commentaire}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Ajoutez votre commentaire..."
            rows={2}
            className="resize-none text-sm"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onAiGrade}
            disabled={isAiLoading}
            className="h-9 text-xs border-secondary/30 text-secondary hover:bg-secondary/10"
          >
            {isAiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
            {aiButtonLabel}
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving}
            className="h-9 text-xs bg-success hover:bg-success/90 px-4"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Sauvegarder
          </Button>
          {isParCopie && (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Ctrl+S
            </kbd>
          )}
        </div>
      </div>
    </div>
  )
}
