// ─────────────────────────────────────────────────────────────
// Barre de filtres pour le tableau de résultats
// ─────────────────────────────────────────────────────────────

'use client'

import { Search, X, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ResultatFilters } from '@/types/resultats'

interface ResultsToolbarProps {
  filters: ResultatFilters
  onFiltersChange: (filters: ResultatFilters) => void
  total: number
  filtered: number
}

export function ResultsToolbar({
  filters,
  onFiltersChange,
  total,
  filtered,
}: ResultsToolbarProps) {
  const hasActiveFilters =
    filters.search !== '' ||
    filters.statut !== 'all' ||
    filters.scoreRange !== 'all'

  const reset = () => {
    onFiltersChange({
      search: '',
      statut: 'all',
      scoreRange: 'all',
      filiereId: filters.filiereId,
    })
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Recherche */}
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher un étudiant..."
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="pl-8"
        />
        {filters.search && (
          <button
            onClick={() => onFiltersChange({ ...filters, search: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Filtre statut */}
        <Select
          value={filters.statut}
          onValueChange={(v) => onFiltersChange({ ...filters, statut: v as ResultatFilters['statut'] })}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="CORRIGEE">Corrigés</SelectItem>
            <SelectItem value="SOUMISE">En attente</SelectItem>
            <SelectItem value="RETOURNEE">Retournés</SelectItem>
          </SelectContent>
        </Select>

        {/* Filtre tranche de score */}
        <Select
          value={filters.scoreRange}
          onValueChange={(v) => onFiltersChange({ ...filters, scoreRange: v as ResultatFilters['scoreRange'] })}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Score" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les scores</SelectItem>
            <SelectItem value="success">Réussis (≥ 50%)</SelectItem>
            <SelectItem value="fail">Échoués (&lt; 50%)</SelectItem>
            <SelectItem value="at-risk">En difficulté (&lt; 40%)</SelectItem>
          </SelectContent>
        </Select>

        {/* Badge compteur */}
        {hasActiveFilters && (
          <Badge variant="secondary" className="gap-1">
            <Filter className="h-3 w-3" />
            {filtered}/{total}
          </Badge>
        )}

        {/* Bouton reset */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={reset} className="h-9">
            <X className="h-4 w-4" />
            Réinitialiser
          </Button>
        )}
      </div>
    </div>
  )
}
