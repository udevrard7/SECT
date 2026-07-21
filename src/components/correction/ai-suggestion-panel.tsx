'use client'

import { Sparkles, Loader2, ThumbsUp, ThumbsDown, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

/**
 * Panneau "Suggestion IA" partagé entre la vue par-copie et la vue par-question.
 *
 * Extrait de correction-page.tsx (phase 3, commit 2).
 *
 * Deux variants préservant strictement le JSX original :
 *  - `collapsible` (par-copie) : wrapper Collapsible avec trigger (Sparkles +
 *    score + badge confiance + ChevronDown) et contenu (justification +
 *    boutons Appliquer/Ignorer). L'état ouvert/fermé est contrôlé par le parent.
 *  - `flat` (par-question) : div simple avec en-tête inline (Sparkles + score +
 *    badge) et boutons Appliquer/Copier note. Pas de collapsible.
 *
 * Le badge de confiance (Élevée/Moyenne/Faible) est calculé à partir du ratio
 * noteIA/bareme avec les mêmes seuils (≥70 / ≥40 / <40) que l'original.
 */
export function AiSuggestionPanel({
  variant,
  noteIA,
  bareme,
  justificationIA,
  onApply,
  isApplying = false,
  // collapsible-only
  isOpen,
  onOpenChange,
  onDismiss,
  // flat-only
  onCopyNote,
}: {
  variant: 'collapsible' | 'flat'
  noteIA: number
  bareme: number
  justificationIA: string | null
  onApply: () => void
  isApplying?: boolean
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onDismiss?: () => void
  onCopyNote?: () => void
}) {
  const pct = bareme > 0 ? (noteIA / bareme) * 100 : 0
  const confidence = pct >= 70 ? 'Élevée' : pct >= 40 ? 'Moyenne' : 'Faible'
  const confColor =
    pct >= 70
      ? 'text-success-text'
      : pct >= 40
        ? 'text-warning'
        : 'text-destructive'

  if (variant === 'collapsible') {
    return (
      <Collapsible open={isOpen} onOpenChange={onOpenChange}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left rounded-lg border-2 border-secondary/20 bg-gradient-to-r from-secondary/10 to-secondary/10 px-3 py-2 hover:from-secondary/15 hover:to-secondary/15 transition-colors">
          <Sparkles className="h-3.5 w-3.5 text-secondary" />
          <span className="text-xs font-semibold text-secondary">
            Suggestion IA
          </span>
          <span className="text-xs font-bold text-secondary font-mono tabular-nums">
            {noteIA}/{bareme}
          </span>
          <Badge variant="outline" className={`text-[9px] h-4 ${confColor}`}>
            {confidence}
          </Badge>
          <ChevronDown className={`h-3.5 w-3.5 ml-auto text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-b-lg border-2 border-t-0 border-secondary/20 bg-secondary/10 px-3 py-3 space-y-2.5">
            {justificationIA && (
              <div className="rounded-md bg-white/60 dark:bg-white/5 p-2.5">
                <p className="text-[10px] font-medium text-secondary mb-0.5">Justification</p>
                <p className="text-xs text-secondary whitespace-pre-wrap leading-relaxed">
                  {justificationIA}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onApply}
                disabled={isApplying}
                className="flex-1 h-7 text-xs bg-secondary hover:bg-secondary/90 text-white"
              >
                {isApplying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ThumbsUp className="h-3 w-3 mr-1" />}
                Valider la note
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onDismiss}
                className="h-7 text-xs border-secondary/30 text-secondary hover:bg-secondary/10"
              >
                <ThumbsDown className="h-3 w-3 mr-1" />
                Ajuster
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  // variant === 'flat'
  return (
    <div className="px-4 py-3 border-b border-border bg-secondary/10">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-secondary" />
        <span className="text-xs font-semibold text-secondary">Suggestion IA</span>
        <span className="text-xs font-bold text-secondary font-mono tabular-nums">
          {noteIA}/{bareme}
        </span>
        <Badge variant="outline" className={`text-[9px] h-4 ${confColor}`}>
          {confidence}
        </Badge>
      </div>
      {justificationIA && (
        <p className="text-xs text-secondary whitespace-pre-wrap mb-2 rounded-md bg-white/60 dark:bg-white/5 p-2">
          {justificationIA}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onApply}
          className="h-7 text-xs bg-secondary hover:bg-secondary/90 text-white"
        >
          <ThumbsUp className="h-3 w-3 mr-1" />
          Valider la note
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCopyNote}
          className="h-7 text-xs border-secondary/30 text-secondary hover:bg-secondary/10"
        >
          Ajuster
        </Button>
      </div>
    </div>
  )
}
