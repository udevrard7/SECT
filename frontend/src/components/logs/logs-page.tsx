'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  Activity,
  PlusCircle,
  Edit3,
  Trash2,
  LogIn,
  LogOut,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PulseSkeleton } from '@/components/ds'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { toast } from 'sonner'

// ─── Types ───

interface AuditLogItem {
  id: string
  userId: string | null
  userEmail: string | null
  action: string
  entite: string
  entiteId: string | null
  details: string | null
  adresseIp: string | null
  createdAt: string
}

// ─── Utility functions ───

function getActionBadge(action: string) {
  switch (action) {
    case 'CREATE':
      return (
        <Badge className="bg-success/15 text-success-text border-success/30 gap-1">
          <PlusCircle className="h-3 w-3" />
          Création
        </Badge>
      )
    case 'UPDATE':
      return (
        <Badge className="bg-info/15 text-info border-info/30 gap-1">
          <Edit3 className="h-3 w-3" />
          Modification
        </Badge>
      )
    case 'DELETE':
      return (
        <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1">
          <Trash2 className="h-3 w-3" />
          Suppression
        </Badge>
      )
    case 'LOGIN':
      return (
        <Badge className="bg-warning/15 text-warning border-warning/30 gap-1">
          <LogIn className="h-3 w-3" />
          Connexion
        </Badge>
      )
    case 'LOGOUT':
      return (
        <Badge className="bg-muted text-muted-foreground border-border gap-1">
          <LogOut className="h-3 w-3" />
          Déconnexion
        </Badge>
      )
    default:
      return <Badge variant="outline">{action}</Badge>
  }
}

function getActionIcon(action: string) {
  switch (action) {
    case 'CREATE': return <PlusCircle className="h-5 w-5 text-success-text" />
    case 'UPDATE': return <Edit3 className="h-5 w-5 text-info" />
    case 'DELETE': return <Trash2 className="h-5 w-5 text-destructive" />
    case 'LOGIN': return <LogIn className="h-5 w-5 text-warning" />
    case 'LOGOUT': return <LogOut className="h-5 w-5 text-muted-foreground" />
    default: return <Activity className="h-5 w-5 text-muted-foreground" />
  }
}

function getEntityLabel(entite: string): string {
  switch (entite) {
    case 'User': return 'Utilisateur'
    case 'Etablissement': return 'Établissement'
    case 'Filiere': return 'Filière'
    case 'Epreuve': return 'Épreuve'
    case 'Question': return 'Question'
    case 'Document': return 'Document'
    case 'Session': return 'Session'
    default: return entite
  }
}

function formatLogDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)

  if (diffMin < 1) return 'À l\'instant'
  if (diffMin < 60) return `Il y a ${diffMin} min`
  if (diffH < 24) return `Il y a ${diffH}h`
  if (diffD < 7) return `Il y a ${diffD}j`
  return formatLogDate(dateStr)
}

function parseJsonSafe(str: string | null): unknown {
  if (!str) return null
  try {
    return JSON.parse(str)
  } catch {
    return str
  }
}

// ─── Main Component ───

export function LogsPage() {
  // ─── Data state (dérivé de useQuery) ───
  const limit = 20

  // ─── Filter state ───
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [searchEmail, setSearchEmail] = useState('')
  const [page, setPage] = useState(1)

  // ─── Expanded log state ───
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  // ─── Fetch logs (TanStack Query) ───
  // BUGFIX (QUERY-CACHE-2) : migration de useEffect+fetch vers TanStack Query.
  // Le queryKey inclut les filtres + page car l'API les prend en query params.
  const logsQuery = useQuery<{ logs: AuditLogItem[]; total: number }>({
    queryKey: ['logs', dateFrom, dateTo, actionFilter, entityFilter, searchEmail, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (actionFilter && actionFilter !== 'all') params.set('action', actionFilter)
      if (entityFilter && entityFilter !== 'all') params.set('entite', entityFilter)
      if (searchEmail) params.set('search', searchEmail)
      params.set('page', page.toString())
      params.set('limit', limit.toString())

      const res = await fetch(`/api/logs?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch logs')
      const data = await res.json()
      return { logs: data.logs ?? [], total: data.total ?? 0 }
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const logs = logsQuery.data?.logs ?? []
  const total = logsQuery.data?.total ?? 0
  const isLoading = logsQuery.isLoading

  // ─── Reset page when filters change ───
  // NOTE : ce useEffect existait dans le code original (avant migration TanStack
  // Query). Le React Compiler le flagge désormais comme `set-state-in-effect`
  // car `page` est dans le queryKey de useQuery. La logique est correcte (reset
  // de pagination quand les filtres changent) — disable ciblé.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination on filter change, pattern original
    setPage(1)
  }, [dateFrom, dateTo, actionFilter, entityFilter, searchEmail])

  const totalPages = Math.ceil(total / limit)

  // ─── Get initials for avatar ───
  const getInitials = (email: string | null) => {
    if (!email) return '?'
    return email[0].toUpperCase()
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
        <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <FileText className="h-7 w-7 text-success-text" />
          Journaux d&apos;Audit
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulter les journaux d&apos;activité du système
        </p>
      </div>

      {/* ─── Toolbar / Filters ─── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs">Date début</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full lg:w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date fin</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full lg:w-[160px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Action</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-full lg:w-[160px]">
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les actions</SelectItem>
                  <SelectItem value="CREATE">Création</SelectItem>
                  <SelectItem value="UPDATE">Modification</SelectItem>
                  <SelectItem value="DELETE">Suppression</SelectItem>
                  <SelectItem value="LOGIN">Connexion</SelectItem>
                  <SelectItem value="LOGOUT">Déconnexion</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Entité</Label>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-full lg:w-[160px]">
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les entités</SelectItem>
                  <SelectItem value="User">Utilisateur</SelectItem>
                  <SelectItem value="Etablissement">Établissement</SelectItem>
                  <SelectItem value="Filiere">Filière</SelectItem>
                  <SelectItem value="Epreuve">Épreuve</SelectItem>
                  <SelectItem value="Question">Question</SelectItem>
                  <SelectItem value="Document">Document</SelectItem>
                  <SelectItem value="Session">Session</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label className="text-xs">Email utilisateur</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par email..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Stats summary ─── */}
      <div className="flex gap-3 flex-wrap">
        <Badge variant="secondary" className="gap-1 bg-success/10 text-success-text py-1 px-3">
          <Activity className="h-3 w-3" />
          <span className="font-mono tabular-nums">{total}</span> entrée{total > 1 ? 's' : ''}
        </Badge>
        {actionFilter !== 'all' && (
          <Badge variant="secondary" className="gap-1 bg-info/10 text-info py-1 px-3">
            <Filter className="h-3 w-3" />
            Filtré par: {actionFilter}
          </Badge>
        )}
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-start gap-4 p-4">
                <PulseSkeleton className="h-10 w-10" variant="circle" />
                <div className="flex-1 space-y-2">
                  <PulseSkeleton className="h-4 w-48" />
                  <PulseSkeleton className="h-3 w-32" />
                </div>
                <PulseSkeleton className="h-6 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && logs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <FileText className="h-10 w-10 text-success-text" />
          </div>
          <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">Aucun log trouvé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Aucune entrée de journal ne correspond à vos critères de recherche.
            Essayez de modifier vos filtres.
          </p>
        </div>
      )}

      {/* ─── Timeline ─── */}
      {!isLoading && logs.length > 0 && (
        <div className="space-y-3">
          {logs.map((log) => {
            const details = parseJsonSafe(log.details)
            const isExpanded = expandedLogId === log.id

            return (
              <Card
                key={log.id}
                className={`transition-all hover:shadow-sm ds-lift ${isExpanded ? 'ring-1 ring-success/40' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Timeline icon */}
                    <div className="flex flex-col items-center gap-1 pt-0.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                        {getActionIcon(log.action)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getActionBadge(log.action)}
                          <span className="text-sm font-medium">
                            {getEntityLabel(log.entite)}
                          </span>
                          {log.entiteId && (
                            <span className="text-xs text-muted-foreground font-mono">
                              #{log.entiteId.slice(0, 8)}
                            </span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                          <Clock className="h-3 w-3" />
                          {formatRelativeDate(log.createdAt)}
                        </span>
                      </div>

                      {/* User info */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-xs font-bold text-success-text font-mono tabular-nums">
                          {getInitials(log.userEmail as string | null)}
                        </div>
                        <span className="text-sm text-muted-foreground truncate">
                          {(log.userEmail as string | null) || 'Système'}
                        </span>
                      </div>

                      {/* Details preview */}
                      {details && typeof details === 'object' ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {Object.entries(details as Record<string, unknown>).slice(0, 3).map(([key, value]) => (
                            <span key={key} className="inline-flex items-center gap-1 mr-3">
                              <span className="font-medium">{key}:</span>{' '}
                              <span className="truncate max-w-[150px] inline-block align-bottom">
                                {String(value)}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {/* Expandable JSON details */}
                      {log.details && (
                        <Collapsible
                          open={isExpanded}
                          onOpenChange={(open) => setExpandedLogId(open ? log.id : null)}
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-7 text-xs text-success-text"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="h-3 w-3 mr-1" />
                                  Masquer les détails
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3 w-3 mr-1" />
                                  Voir les détails
                                </>
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-2 rounded-lg bg-muted p-3 overflow-x-auto">
                              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                                {JSON.stringify(details, null, 2)}
                              </pre>
                            </div>
                            {log.adresseIp && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Adresse IP : <span className="font-mono">{log.adresseIp}</span>
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Horodatage exact : <span className="font-mono">{formatLogDate(log.createdAt)}</span>
                            </p>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Pagination ─── */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground font-mono tabular-nums">
            {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} sur {total} entrées
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Précédent
            </Button>
            <span className="text-sm font-medium font-mono tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
