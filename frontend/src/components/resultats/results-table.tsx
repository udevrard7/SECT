// ─────────────────────────────────────────────────────────────
// Tableau des résultats étudiants (avec tri, pagination, mobile)
// ─────────────────────────────────────────────────────────────

'use client'

import { useMemo, useState } from 'react'
import {
  Award,
  Eye,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getScoreColor,
  getScoreBg,
  getBarColor,
  scoreToPercentage,
  formatDateShortFR,
} from '@/lib/resultats-utils'
import { ResultsToolbar } from './results-toolbar'
import type { SessionResult, ResultatFilters, SortOrder } from '@/types/resultats'

interface ResultsTableProps {
  sessions: SessionResult[]
  noteTotal: number
  examTitle?: string
  onViewDetail: (session: SessionResult) => void
  activeScoreBin?: string | null
}

const PAGE_SIZE = 10

export function ResultsTable({
  sessions,
  noteTotal,
  examTitle,
  onViewDetail,
  activeScoreBin,
}: ResultsTableProps) {
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<ResultatFilters>({
    search: '',
    statut: 'all',
    scoreRange: 'all',
    filiereId: '',
  })

  // Réinitialiser la page quand les filtres changent
  const handleFiltersChange = (newFilters: ResultatFilters) => {
    setFilters(newFilters)
    setPage(1)
  }

  // Filtrage
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      // Recherche texte
      if (filters.search) {
        const q = filters.search.toLowerCase()
        const match =
          (s.etudiant?.name ?? '—').toLowerCase().includes(q) ||
          (s.etudiant?.email ?? '').toLowerCase().includes(q) ||
          (s.etudiant?.filiere?.toLowerCase().includes(q) ?? false)
        if (!match) return false
      }
      // Filtre statut
      if (filters.statut !== 'all' && s.statut !== filters.statut) return false
      // Filtre score
      if (filters.scoreRange !== 'all' && s.score !== null) {
        const pct = scoreToPercentage(s.score, noteTotal)
        if (filters.scoreRange === 'success' && pct < 50) return false
        if (filters.scoreRange === 'fail' && pct >= 50) return false
        if (filters.scoreRange === 'at-risk' && pct >= 40) return false
      }
      return true
    })
  }, [sessions, filters, noteTotal])

  // Tri
  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => {
      const scoreA = a.score ?? -1
      const scoreB = b.score ?? -1
      return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB
    })
  }, [filteredSessions, sortOrder])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedSessions.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedSessions = sortedSessions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const scoreBinMatch = (s: SessionResult): boolean => {
    if (!activeScoreBin) return true
    if (s.score === null) return false
    const norm = (s.score / noteTotal) * 20
    const bins: Record<string, [number, number]> = {
      '0-4': [0, 4],
      '4-8': [4, 8],
      '8-10': [8, 10],
      '10-12': [10, 12],
      '12-14': [12, 14],
      '14-16': [14, 16],
      '16-20': [16, 20.01],
    }
    const range = bins[activeScoreBin]
    if (!range) return true
    return norm >= range[0] && norm < range[1]
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Résultats par étudiant
            </CardTitle>
            <CardDescription>
              {sortedSessions.length} copie{sortedSessions.length > 1 ? 's' : ''}
              {examTitle && ` · ${examTitle}`}
              {activeScoreBin && (
                <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                  · tranche {activeScoreBin}
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="text-muted-foreground"
          >
            <ArrowUpDown className="h-4 w-4" />
            {sortOrder === 'desc' ? 'Meilleur en premier' : 'Moins bon en premier'}
          </Button>
        </div>

        {/* Barre de filtres */}
        <div className="mt-2">
          <ResultsToolbar
            filters={filters}
            onFiltersChange={handleFiltersChange}
            total={sessions.length}
            filtered={sortedSessions.length}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {sortedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              {sessions.length === 0
                ? 'Aucune copie soumise pour cette épreuve'
                : 'Aucune copie ne correspond à vos filtres'}
            </p>
          </div>
        ) : (
          <>
            {/* Vue desktop : tableau */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rang</TableHead>
                    <TableHead>Étudiant</TableHead>
                    <TableHead className="w-28 text-center">Score</TableHead>
                    <TableHead className="w-32 text-center">Progression</TableHead>
                    <TableHead className="w-28 text-center">Statut</TableHead>
                    <TableHead className="w-24 text-center">Alertes</TableHead>
                    <TableHead className="w-20 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSessions
                    .filter(scoreBinMatch)
                    .map((session, index) => {
                      const score = session.score ?? 0
                      const pct = scoreToPercentage(score, noteTotal)
                      const scoreOn20 = (score / noteTotal) * 20
                      const isCorrected = session.statut === 'CORRIGEE' || session.statut === 'RETOURNEE'
                      const hasAlerts = session.alertes > 0
                      const rank = (currentPage - 1) * PAGE_SIZE + index + 1

                      return (
                        <TableRow
                          key={session.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => onViewDetail(session)}
                        >
                          <TableCell className="text-center font-bold text-muted-foreground">
                            {rank <= 3 ? (
                              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                                rank === 1 ? 'bg-amber-500' : rank === 2 ? 'bg-slate-400' : 'bg-orange-700'
                              }`}>
                                {rank}
                              </span>
                            ) : (
                              rank
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{(session.etudiant?.name ?? '—')}</p>
                              <p className="text-xs text-muted-foreground">
                                {(session.etudiant?.email ?? '')}
                                {session.etudiant?.filiere && ` · ${session.etudiant?.filiere}`}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`font-bold ${getScoreBg(scoreOn20)}`}>
                              {score.toFixed(1)}/{noteTotal}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(100, pct)}%`,
                                    backgroundColor: getBarColor(scoreOn20),
                                  }}
                                />
                              </div>
                              <span className={`text-sm font-medium ${getScoreColor(scoreOn20)}`}>
                                {pct}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {isCorrected ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
                                <CheckCircle2 className="h-3 w-3" />
                                Corrigé
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
                                <Clock className="h-3 w-3" />
                                En attente
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {hasAlerts ? (
                              <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">
                                <AlertTriangle className="h-3 w-3" />
                                {session.alertes}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                onViewDetail(session)
                              }}
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                              aria-label={`Voir le détail de ${(session.etudiant?.name ?? '—')}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
            </div>

            {/* Vue mobile : cards */}
            <div className="space-y-2 md:hidden">
              {paginatedSessions
                .filter(scoreBinMatch)
                .map((session, index) => {
                  const score = session.score ?? 0
                  const pct = scoreToPercentage(score, noteTotal)
                  const scoreOn20 = (score / noteTotal) * 20
                  const isCorrected = session.statut === 'CORRIGEE' || session.statut === 'RETOURNEE'
                  const hasAlerts = session.alertes > 0
                  const rank = (currentPage - 1) * PAGE_SIZE + index + 1

                  return (
                    <button
                      key={session.id}
                      onClick={() => onViewDetail(session)}
                      className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{(session.etudiant?.name ?? '—')}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${getScoreBg(scoreOn20)}`}>
                            {score.toFixed(1)}/{noteTotal}
                          </Badge>
                          {isCorrected ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Clock className="h-3 w-3 text-amber-600" />
                          )}
                          {hasAlerts && (
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                          )}
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${getScoreColor(scoreOn20)}`}>
                        {pct}%
                      </span>
                    </button>
                  )
                })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Page {currentPage} sur {totalPages} · {sortedSessions.length} copie(s)
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Page précédente"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Select
                    value={String(currentPage)}
                    onValueChange={(v) => setPage(Number(v))}
                  >
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: totalPages }).map((_, i) => (
                        <SelectItem key={i} value={String(i + 1)}>
                          Page {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Page suivante"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
