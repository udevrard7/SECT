'use client'

import {
  Loader2,
  Sparkles,
  Search,
  X,
  Send,
  LayoutGrid,
  List,
  Keyboard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { CorrectionSession, EpreuveOption, GradingMode } from '@/types/correction'

/**
 * Barre d'outils supérieure de la page Correction (sélecteur d'épreuve,
 * toggle par-copie/par-question, progression, recherche, actions batch,
 * raccourcis clavier).
 *
 * Extrait de correction-page.tsx (phase 3, commit 1).
 * JSX strictement identique à l'original `renderToolbar()` (L584-714).
 */
export function CorrectionToolbar({
  selectedEpreuveId,
  setSelectedEpreuveId,
  epreuves,
  gradingMode,
  setGradingMode,
  sessions,
  globalProgress,
  searchFilter,
  setSearchFilter,
  selectedSessionId,
  needsCorrectionCount,
  isLoadingSessions,
  onBatchAiGrade,
  isBatchAiLoading,
  onBatchReturn,
  isBatchReturning,
}: {
  selectedEpreuveId: string
  setSelectedEpreuveId: (value: string) => void
  epreuves: EpreuveOption[]
  gradingMode: GradingMode
  setGradingMode: (mode: GradingMode) => void
  sessions: CorrectionSession[]
  globalProgress: number
  searchFilter: string
  setSearchFilter: (value: string) => void
  selectedSessionId: string | null
  needsCorrectionCount: number
  isLoadingSessions: boolean
  onBatchAiGrade: () => void
  isBatchAiLoading: boolean
  onBatchReturn: () => void
  isBatchReturning: boolean
}) {
  return (
    <div className="ds-kente-pattern border-b border-border bg-card px-4 py-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Epreuve selector */}
        <Select
          value={selectedEpreuveId}
          onValueChange={setSelectedEpreuveId}
        >
          <SelectTrigger className="w-[200px] h-8 text-sm">
            <SelectValue placeholder="Sélectionnez une épreuve" />
          </SelectTrigger>
          <SelectContent>
            {epreuves.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.titre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Grading mode toggle */}
        {selectedEpreuveId && (
          <Tabs value={gradingMode} onValueChange={(v) => setGradingMode(v as GradingMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="par-copie" className="text-xs gap-1 px-3 h-7">
                <List className="h-3 w-3" />
                Par copie
              </TabsTrigger>
              <TabsTrigger value="par-question" className="text-xs gap-1 px-3 h-7">
                <LayoutGrid className="h-3 w-3" />
                Par question
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Progress */}
        {selectedEpreuveId && sessions.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <Progress value={globalProgress} className="w-24 h-2" />
            <span className="text-xs text-muted-foreground whitespace-nowrap font-mono tabular-nums">
              {Math.round(globalProgress)}%
            </span>
          </div>
        )}

        {/* Search */}
        {selectedEpreuveId && gradingMode === 'par-copie' && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-7 h-8 w-40 text-sm"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        )}

        {/* Batch actions */}
        {selectedEpreuveId && (
          <div className="flex items-center gap-2">
            {selectedSessionId && gradingMode === 'par-copie' && needsCorrectionCount > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onBatchAiGrade}
                      disabled={isBatchAiLoading}
                      className="h-8 text-xs border-secondary/30 text-secondary hover:bg-secondary/10"
                    >
                      {isBatchAiLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                      )}
                      Batch IA
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Évaluer toutes les questions avec l&apos;IA</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {sessions.some(s => s.statut === 'CORRIGEE') && (
              <Button
                size="sm"
                className="h-8 text-xs bg-tech hover:bg-tech/90"
                onClick={onBatchReturn}
                disabled={isBatchReturning}
              >
                {isBatchReturning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1" />
                )}
                Rendre copies (<span className="font-mono tabular-nums">{sessions.filter(s => s.statut === 'CORRIGEE').length}</span>)
              </Button>
            )}
          </div>
        )}

        {/* Keyboard shortcut hint */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="hidden md:flex items-center gap-1 text-muted-foreground">
                <Keyboard className="h-3.5 w-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              <p>← → Navigation questions</p>
              <p>Ctrl+S Sauvegarder</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
