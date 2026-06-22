// ─────────────────────────────────────────────────────────────
// Liste des résultats étudiant — recherche, filtres, tri
// ─────────────────────────────────────────────────────────────

'use client'

import { useMemo, useState } from 'react'
import {
  Trophy,
  Clock,
  Eye,
  Search,
  X,
  Filter,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScoreDisplay } from './score-display'
import { formatDateTimeFR } from '@/lib/resultats-utils'
import type { StudentSession } from '@/types/resultats'

interface MesEpreuvesTabProps {
  sessions: StudentSession[]
  onViewDetail: (session: StudentSession) => void
}

type SortField = 'date' | 'score' | 'titre'
type SortOrder = 'asc' | 'desc'

interface Filters {
  search: string
  statut: 'all' | 'CORRIGEE' | 'SOUMISE' | 'RETOURNEE'
}

export function MesEpreuvesTab({ sessions, onViewDetail }: MesEpreuvesTabProps) {
  const [filters, setFilters] = useState<Filters>({ search: '', statut: 'all' })
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const hasActiveFilters = filters.search !== '' || filters.statut !== 'all'

  const resetFilters = () => setFilters({ search: '', statut: 'all' })

  // Filtrage
  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        const match =
          s.epreuve.titre.toLowerCase().includes(q) ||
          s.epreuve.enseignant.name.toLowerCase().includes(q)
        if (!match) return false
      }
      if (filters.statut !== 'all' && s.statut !== filters.statut) return false
      return true
    })
  }, [sessions, filters])

  // Tri
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') {
        const da = a.dateFin ? new Date(a.dateFin).getTime() : 0
        const db = b.dateFin ? new Date(b.dateFin).getTime() : 0
        cmp = da - db
      } else if (sortField === 'score') {
        const sa = a.resultat?.scoreFinal ?? a.score ?? -1
        const sb = b.resultat?.scoreFinal ?? b.score ?? -1
        cmp = sa - sb
      } else {
        cmp = a.epreuve.titre.localeCompare(b.epreuve.titre)
      }
      return sortOrder === 'desc' ? -cmp : cmp
    })
  }, [filtered, sortField, sortOrder])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher une épreuve, un enseignant..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-8"
              />
              {filters.search && (
                <button
                  onClick={() => setFilters({ ...filters, search: '' })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={filters.statut}
                onValueChange={(v) => setFilters({ ...filters, statut: v as Filters['statut'] })}
              >
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="RETOURNEE">Rendus</SelectItem>
                  <SelectItem value="CORRIGEE">Corrigés</SelectItem>
                  <SelectItem value="SOUMISE">En attente</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Badge variant="secondary" className="gap-1">
                  <Filter className="h-3 w-3" />
                  {filtered.length}/{sessions.length}
                </Badge>
              )}

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9">
                  <X className="h-4 w-4" />
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>

          {/* Contrôles de tri */}
          <div className="mt-3 flex items-center gap-2 border-t pt-3">
            <span className="text-xs font-medium text-muted-foreground">Trier par :</span>
            {(['date', 'score', 'titre'] as SortField[]).map((field) => (
              <Button
                key={field}
                variant={sortField === field ? 'default' : 'ghost'}
                size="sm"
                onClick={() => toggleSort(field)}
                className="h-7 gap-1 text-xs"
              >
                {field === 'date' ? 'Date' : field === 'score' ? 'Note' : 'Titre'}
                {sortField === field &&
                  (sortOrder === 'desc' ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronUp className="h-3 w-3" />
                  ))}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Compteur */}
      <p className="text-sm text-muted-foreground">
        {sorted.length} épreuve{sorted.length > 1 ? 's' : ''}
        {hasActiveFilters && ` (sur ${sessions.length})`}
      </p>

      {/* Liste */}
      {sorted.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">Aucune épreuve trouvée</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {hasActiveFilters
                ? 'Aucune épreuve ne correspond à vos filtres.'
                : 'Vous n\'avez pas encore passé d\'épreuve.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((session) => {
            const isReturned = session.statut === 'RETOURNEE'
            const isCorrected = session.statut === 'CORRIGEE'

            return (
              <Card key={session.id} className="group transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    {/* Gauche : infos */}
                    <div className="flex-1 space-y-3">
                      {/* Titre */}
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                          <Trophy className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-semibold leading-tight">
                            {session.epreuve.titre}
                          </h3>
                          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                            {session.epreuve.enseignant.name}
                          </p>
                        </div>
                      </div>

                      {/* Date */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[60px]">
                        {session.dateDebut && (
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                            Passé le {formatDateTimeFR(session.dateDebut)}
                          </span>
                        )}
                        {session.alertes > 0 && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800 text-xs">
                            {session.alertes} alerte{session.alertes > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>

                      {/* Score */}
                      <div className="pl-[60px]">
                        <ScoreDisplay session={session} variant="card" />
                      </div>
                    </div>

                    {/* Droite : bouton */}
                    <div className="shrink-0 sm:ml-4">
                      <Button
                        variant="outline"
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        onClick={() => onViewDetail(session)}
                      >
                        <Eye className="h-4 w-4" />
                        Voir détail
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
