// ─────────────────────────────────────────────────────────────
// Tableau des résultats étudiants (avec tri, pagination, mobile).
// BUGFIX (RESULTATS-PAGINATION) : le filtre par tranche (activeScoreBin)
// est désormais appliqué DANS le memo `filteredSessions` (avant pagination)
// pour que totalPages et la liste paginée soient cohérents.
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
import { Badge } from '@/components/ds/badge'
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
  getBarColor,
  scoreToPercentage,
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

// Map des tranches (cohérent avec buildDistribution dans resultats-utils.ts)
const SCORE_BINS: Record<string, [number, number]> = {
  '0-4': [0, 4],
  '4-8': [4, 8],
  '8-10': [8, 10],
  '10-12': [10, 12],
  '12-14': [12, 14],
  '14-16': [14, 16],
  '16-20': [16, 20.01],
}

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

  // ─── Réinitialiser la page quand la tranche (activeScoreBin) change ───
  // Pattern "derived state reset" recommandé par React docs (pas d'effet,
  // pas de setState-in-effect). On compare le previous props et on appelle
  // setPage pendant le rendu si nécessaire.
  // Cf. https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const effectiveScoreBin = activeScoreBin ?? null
  const [prevScoreBin, setPrevScoreBin] = useState<string | null>(effectiveScoreBin)
  if (prevScoreBin !== effectiveScoreBin) {
    setPrevScoreBin(effectiveScoreBin)
    setPage(1)
  }

  // ─── Filtrage (search + statut + scoreRange + activeScoreBin) ───
  // BUGFIX : activeScoreBin est appliqué ICI (avant pagination), pas après.
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
      // Filtre score (range)
      if (filters.scoreRange !== 'all' && s.score !== null) {
        const pct = scoreToPercentage(s.score, noteTotal)
        if (filters.scoreRange === 'success' && pct < 50) return false
        if (filters.scoreRange === 'fail' && pct >= 50) return false
        if (filters.scoreRange === 'at-risk' && pct >= 40) return false
      }
      // Filtre tranche (clic sur le chart)
      if (effectiveScoreBin) {
        if (s.score === null) return false
        const norm = (s.score / noteTotal) * 20
        const range = SCORE_BINS[effectiveScoreBin]
        if (range && !(norm >= range[0] && norm < range[1])) return false
      }
      return true
    })
  }, [sessions, filters, noteTotal, effectiveScoreBin])

  // Tri
  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => {
      const scoreA = a.score ?? -1
      const scoreB = b.score ?? -1
      return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB
    })
  }, [filteredSessions, sortOrder])

  // Pagination (cohérente avec le filtre)
  const totalPages = Math.max(1, Math.ceil(sortedSessions.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedSessions = sortedSessions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const renderRow = (session: SessionResult, index: number) => {
    const score = session.score ?? 0
    const pct = scoreToPercentage(score, noteTotal)
    const scoreOn20 = (score / noteTotal) * 20
    const isCorrected = session.statut === 'CORRIGEE' || session.statut === 'RETOURNEE'
    const hasAlerts = session.alertes > 0
    const rank = (currentPage - 1) * PAGE_SIZE + index + 1
    const rankBadge =
      rank === 1
        ? 'bg-gold text-gold-foreground'
        : rank === 2
          ? 'bg-silver text-silver-foreground'
          : rank === 3
            ? 'bg-bronze text-bronze-foreground'
            : 'bg-muted text-muted-foreground'
    return { session, score, pct, scoreOn20, isCorrected, hasAlerts, rank, rankBadge }
  }

  return (
    <Card className="ds-kente-top">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4 text-primary-text" />
              Résultats par étudiant
            </CardTitle>
            <CardDescription className="tabular-nums">
              {sortedSessions.length} copie{sortedSessions.length > 1 ? 's' : ''}
              {examTitle && ` · ${examTitle}`}
              {effectiveScoreBin && (
                <span className="ml-1 text-primary-text">· tranche {effectiveScoreBin}</span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="text-muted-foreground"
            aria-label="Inverser l'ordre de tri"
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
          <div className="ds-kente-watermark flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
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
                  {paginatedSessions.map((session, index) => {
                    const r = renderRow(session, index)
                    return (
                      <TableRow
                        key={session.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => onViewDetail(session)}
                      >
                        <TableCell className="text-center">
                          <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums ${r.rankBadge}`}>
                            {r.rank}
                          </span>
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
                          <Badge variant="default" className={`font-bold tabular-nums ${r.scoreOn20 >= 16 ? 'border-gold/40 bg-gold/15 text-gold' : r.scoreOn20 >= 10 ? 'border-success/30 bg-success/10 text-success-text' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
                            {r.score.toFixed(1)}/{noteTotal}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.min(100, r.pct)}%`,
                                  backgroundColor: getBarColor(r.scoreOn20),
                                }}
                              />
                            </div>
                            <span className={`text-sm font-medium tabular-nums ${getScoreColor(r.scoreOn20)}`}>
                              {r.pct}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {r.isCorrected ? (
                            <Badge variant="success" size="sm">
                              <CheckCircle2 className="h-3 w-3" />
                              Corrigé
                            </Badge>
                          ) : (
                            <Badge variant="warning" size="sm">
                              <Clock className="h-3 w-3" />
                              En attente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.hasAlerts ? (
                            <Badge variant="danger" size="sm" className="tabular-nums">
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
                            className="text-primary-text hover:bg-primary/5"
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
              {paginatedSessions.map((session, index) => {
                const r = renderRow(session, index)
                return (
                  <button
                    key={session.id}
                    onClick={() => onViewDetail(session)}
                    className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${r.rankBadge}`}>
                      {r.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{(session.etudiant?.name ?? '—')}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="default" size="sm" className={`tabular-nums ${r.scoreOn20 >= 16 ? 'border-gold/40 bg-gold/15 text-gold' : r.scoreOn20 >= 10 ? 'border-success/30 bg-success/10 text-success-text' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
                          {r.score.toFixed(1)}/{noteTotal}
                        </Badge>
                        {r.isCorrected ? (
                          <CheckCircle2 className="h-3 w-3 text-success-text" />
                        ) : (
                          <Clock className="h-3 w-3 text-warning" />
                        )}
                        {r.hasAlerts && (
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                        )}
                      </div>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${getScoreColor(r.scoreOn20)}`}>
                      {r.pct}%
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground tabular-nums">
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
                    <SelectTrigger className="h-8 w-20" aria-label="Sélectionner une page">
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
