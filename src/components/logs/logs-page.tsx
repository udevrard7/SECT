'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'
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
import { Skeleton } from '@/components/ui/skeleton'
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
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
          <PlusCircle className="h-3 w-3" />
          Création
        </Badge>
      )
    case 'UPDATE':
      return (
        <Badge className="bg-sky-100 text-sky-800 border-sky-200 gap-1 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">
          <Edit3 className="h-3 w-3" />
          Modification
        </Badge>
      )
    case 'DELETE':
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 gap-1 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">
          <Trash2 className="h-3 w-3" />
          Suppression
        </Badge>
      )
    case 'LOGIN':
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
          <LogIn className="h-3 w-3" />
          Connexion
        </Badge>
      )
    case 'LOGOUT':
      return (
        <Badge className="bg-gray-100 text-gray-700 border-gray-200 gap-1 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
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
    case 'CREATE': return <PlusCircle className="h-5 w-5 text-emerald-500" />
    case 'UPDATE': return <Edit3 className="h-5 w-5 text-sky-500" />
    case 'DELETE': return <Trash2 className="h-5 w-5 text-red-500" />
    case 'LOGIN': return <LogIn className="h-5 w-5 text-amber-500" />
    case 'LOGOUT': return <LogOut className="h-5 w-5 text-gray-500" />
    default: return <Activity className="h-5 w-5 text-gray-500" />
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
  // ─── Data state ───
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const limit = 20

  // ─── Filter state ───
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [searchEmail, setSearchEmail] = useState('')

  // ─── Expanded log state ───
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  // ─── Fetch logs ───
  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (actionFilter && actionFilter !== 'all') params.set('action', actionFilter)
      if (entityFilter && entityFilter !== 'all') params.set('entite', entityFilter)
      if (searchEmail) params.set('search', searchEmail)
      params.set('page', page.toString())
      params.set('limit', limit.toString())

      const res = await fetch(`/api/logs?${params.toString()}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs ?? [])
        setTotal(data.total ?? 0)
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [dateFrom, dateTo, actionFilter, entityFilter, searchEmail, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // ─── Reset page when filters change ───
  useEffect(() => {
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <FileText className="h-7 w-7 text-emerald-600" />
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
        <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 py-1 px-3">
          <Activity className="h-3 w-3" />
          {total} entrée{total > 1 ? 's' : ''}
        </Badge>
        {actionFilter !== 'all' && (
          <Badge variant="secondary" className="gap-1 bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300 py-1 px-3">
            <Filter className="h-3 w-3" />
            Filtré par: {actionFilter}
          </Badge>
        )}
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="flex items-start gap-4 p-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && logs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <FileText className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun log trouvé</h3>
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
                className={`transition-all hover:shadow-sm ${isExpanded ? 'ring-1 ring-emerald-200 dark:ring-emerald-800' : ''}`}
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
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                          {getInitials(log.userEmail)}
                        </div>
                        <span className="text-sm text-muted-foreground truncate">
                          {log.userEmail || 'Système'}
                        </span>
                      </div>

                      {/* Details preview */}
                      {details && typeof details === 'object' && (
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
                      )}

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
                              className="mt-1 h-7 text-xs text-emerald-700 dark:text-emerald-400"
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
          <p className="text-sm text-muted-foreground">
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
            <span className="text-sm font-medium">
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
