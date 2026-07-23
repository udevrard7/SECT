'use client'

// ═══════════════════════════════════════════════════════════════════════════
// SECT-ETABLISSEMENT-AUDIT-1 : AuditTab — onglet "Audit" de la page Paramètres
// établissement (ResponsableParametresPage).
//
// Permet à un RESPONSABLE de consulter l'intégralité du journal d'audit de SON
// établissement (le backend filtre via RLS + defense-in-depth sur
// claims.EtablissementID). Le composant :
//   - charge lazy (TanStack Query, enabled=!!etablissementId)
//   - expose 5 filtres : action, entité, recherche texte, plage de dates,
//     auto-refresh 30s
//   - affiche un tableau responsive (Date / Acteur / Action / Entité / Détails
//     collapsible / Raison / IP) avec pagination 20/page
//   - gère les états loading (skeleton), empty, error (retry)
//
// Helpers partagés (AuditLogItem, getActionBadge, getActionIcon,
// getEntityLabel, formatLogDate, formatRelativeDate, parseJsonSafe) sont
// importés depuis @/lib/audit-helpers — également consommés par LogsPage admin.
//
// Palette Savane EdTech : bg-success / text-success-text / bg-info / bg-warning
// / bg-destructive. Aucune couleur indigo/bleu.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileSearch,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCw,
  AlertCircle,
  Ban,
  LogIn,
  ShieldAlert,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PulseSkeleton } from '@/components/ds'
import {
  type AuditLogItem,
  getActionBadge,
  getActionIcon,
  getEntityLabel,
  formatLogDate,
  formatRelativeDate,
  parseJsonSafe,
} from '@/lib/audit-helpers'

// ─── Props ───

interface AuditTabProps {
  /** ID de l'établissement actif (responsable) ou sélectionné (admin). */
  etablissementId: string
}

// ─── Constantes ───

const LIMIT = 20

/**
 * ACTION_OPTIONS — liste statique des actions auditées exposées au RESPONSABLE.
 * Couvre les actions auth (LOGIN/LOGOUT/etc.) + accès (ACCESS_REVOKED*) + la
 * nouvelle action SIGNUP_LINK_REVOKED. Le label est en français.
 */
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'LOGIN', label: 'Connexion' },
  { value: 'LOGIN_FAILED', label: 'Échec connexion' },
  { value: 'LOGIN_LOCKED', label: 'Compte verrouillé' },
  { value: 'LOGOUT', label: 'Déconnexion' },
  { value: 'TOKEN_REFRESHED', label: 'Refresh token' },
  { value: 'CHANGE_PASSWORD', label: 'Changement mot de passe' },
  { value: 'PASSWORD_RESET', label: 'Réinitialisation mot de passe' },
  { value: 'ACCESS_REVOKED', label: 'Accès révoqué' },
  { value: 'ACCESS_REVOKED_SELF', label: 'Expiration accès' },
  { value: 'SIGNUP_LINK_CREATED', label: 'Création de lien d\'inscription' },
  { value: 'SIGNUP_LINK_REVOKED', label: 'Révocation de lien d\'inscription' },
]

/**
 * ENTITY_OPTIONS — entités filtrables pour un RESPONSABLE (scope restreint vs
 * admin qui peut voir toutes les entités). On se limite aux entités
 * Establishment-scoped.
 */
const ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'User', label: 'Utilisateur' },
  { value: 'Etablissement', label: 'Établissement' },
  { value: 'EtablissementAccess', label: 'Accès établissement' },
  { value: 'StudentSignupLink', label: 'Lien d\'inscription étudiante' },
  { value: 'RegistrationEvent', label: 'Événement d\'inscription' },
  { value: 'SecuritySettings', label: 'Paramètres sécurité' },
  { value: 'IpWhitelist', label: 'Liste blanche IP' },
]

// ─── Helpers locaux ───

/** getInitials — 1ère lettre de l'email pour l'avatar. */
function getInitials(email: string | null): string {
  if (!email) return '?'
  return email[0].toUpperCase()
}

/** isMobile — détection responsive pour décider du rendu timeline vs table. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile('matches' in e ? e.matches : false)
    }
    onChange(mq)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

// ─── Composant principal ───

export function AuditTab({ etablissementId }: AuditTabProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()

  // ─── Filtres ───
  const [action, setAction] = useState<string>('all')
  const [entite, setEntite] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [page, setPage] = useState<number>(1)

  // ─── Auto-refresh (30s) ───
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false)

  // ─── Ligne expandée (détails JSON) ───
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  // ─── Query ───
  const logsQuery = useQuery<{ logs: AuditLogItem[]; total: number; page: number; limit: number }>({
    queryKey: [
      'responsable-audit-logs',
      etablissementId,
      action,
      entite,
      search,
      dateFrom,
      dateTo,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (action && action !== 'all') params.set('action', action)
      if (entite && entite !== 'all') params.set('entite', entite)
      if (search) params.set('search', search)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      params.set('page', page.toString())
      params.set('limit', LIMIT.toString())

      const res = await fetch(
        `/api/etablissements/${etablissementId}/audit-logs?${params.toString()}`,
        { credentials: 'same-origin' }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur lors du chargement du journal d\'audit')
      }
      const data = await res.json()
      return {
        logs: (data.logs ?? []) as AuditLogItem[],
        total: data.total ?? 0,
        page: data.page ?? page,
        limit: data.limit ?? LIMIT,
      }
    },
    enabled: !!etablissementId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: autoRefresh ? 30_000 : false,
    refetchIntervalInBackground: false,
  })

  const logs = logsQuery.data?.logs ?? []
  const total = logsQuery.data?.total ?? 0
  const isLoading = logsQuery.isLoading
  const isError = logsQuery.isError
  const error = logsQuery.error

  // ─── Reset pagination quand les filtres changent ───
  // Le React Compiler le flagge comme `set-state-in-effect` car `page` est dans
  // le queryKey. La logique est correcte (reset de pagination sur changement de
  // filtre) — disable ciblé, même pattern que logs-page.tsx.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset pagination on filter change, pattern original
    setPage(1)
  }, [action, entite, search, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  // ─── Stats (page courante uniquement, comme admin LogsPage) ───
  const stats = useMemo(() => {
    const loginCount = logs.filter(
      (l) => l.action === 'LOGIN' || l.action === 'LOGIN_MATRICULE'
    ).length
    const revokeCount = logs.filter(
      (l) =>
        l.action === 'SIGNUP_LINK_REVOKED' ||
        l.action === 'ACCESS_REVOKED' ||
        l.action === 'ACCESS_REVOKED_SELF'
    ).length
    const failedCount = logs.filter(
      (l) => l.action === 'LOGIN_FAILED' || l.action === 'LOGIN_LOCKED'
    ).length
    return { total, loginCount, revokeCount, failedCount }
  }, [logs, total])

  const handleRetry = () => {
    queryClient.invalidateQueries({ queryKey: ['responsable-audit-logs', etablissementId] })
  }

  // ─── Rendu d'une ligne (timeline card pour mobile, TableRow pour desktop) ───
  const renderLogRow = (log: AuditLogItem) => {
    const details = parseJsonSafe(log.details)
    const isExpanded = expandedLogId === log.id
    const detailEntries =
      details && typeof details === 'object'
        ? Object.entries(details as Record<string, unknown>)
        : []

    if (isMobile) {
      // ─── Mobile : timeline cards (comme admin LogsPage) ───
      return (
        <Card key={log.id} className={`transition-all ${isExpanded ? 'ring-1 ring-success/40' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted shrink-0">
                {getActionIcon(log.action)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getActionBadge(log.action)}
                    <span className="text-sm font-medium">{getEntityLabel(log.entite)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{formatRelativeDate(log.createdAt)}</span>
                      </TooltipTrigger>
                      <TooltipContent>{formatLogDate(log.createdAt)}</TooltipContent>
                    </Tooltip>
                    {log.adresseIp && (
                      <span className="font-mono">• IP : {log.adresseIp}</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-xs font-bold text-success-text font-mono shrink-0">
                      {getInitials(log.userEmail)}
                    </div>
                    <span className="text-sm truncate">
                      {log.userEmail ?? 'Système'}
                    </span>
                  </div>
                  {log.reason && (
                    <p className="mt-1 text-xs italic text-muted-foreground">
                      Raison : {log.reason}
                    </p>
                  )}
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
                          aria-label={isExpanded ? 'Masquer les détails' : 'Voir les détails'}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3 mr-1" />
                              Masquer
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
                          {detailEntries.length > 0 ? (
                            <dl className="text-xs space-y-1">
                              {detailEntries.map(([key, value]) => (
                                <div key={key} className="flex gap-2">
                                  <dt className="font-medium text-muted-foreground shrink-0">{key}:</dt>
                                  <dd className="font-mono break-all">{String(value)}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                              {String(details)}
                            </pre>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }

    // ─── Desktop : TableRow ───
    return (
      <>
        <TableRow
          key={log.id}
          className="cursor-pointer hover:bg-muted/50"
          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
        >
          <TableCell className="whitespace-nowrap text-sm">
            <div className="flex flex-col">
              <span className="font-medium">{formatLogDate(log.createdAt)}</span>
              <span className="text-xs text-muted-foreground">{formatRelativeDate(log.createdAt)}</span>
            </div>
          </TableCell>
          <TableCell className="text-sm">
            <div className="flex items-center gap-2 min-w-[160px]">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success/15 text-xs font-bold text-success-text font-mono shrink-0">
                {getInitials(log.userEmail)}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate max-w-[180px]">
                    {log.userEmail ?? 'Système'}
                  </span>
                </TooltipTrigger>
                {log.userEmail && (
                  <TooltipContent>{log.userEmail}</TooltipContent>
                )}
              </Tooltip>
            </div>
          </TableCell>
          <TableCell>{getActionBadge(log.action)}</TableCell>
          <TableCell className="text-sm">{getEntityLabel(log.entite)}</TableCell>
          <TableCell className="text-sm max-w-[260px]">
            {log.reason ? (
              <p className="italic text-muted-foreground truncate" title={log.reason}>
                « {log.reason} »
              </p>
            ) : detailEntries.length > 0 ? (
              <span className="text-xs text-muted-foreground truncate inline-block max-w-full">
                {detailEntries.slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`).join(' • ')}
                {detailEntries.length > 2 && ' …'}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </TableCell>
          <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
            {log.adresseIp ?? '—'}
          </TableCell>
          <TableCell className="text-right">
            {log.details && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                aria-label={isExpanded ? 'Masquer les détails' : 'Voir les détails'}
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedLogId(isExpanded ? null : log.id)
                }}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Masquer
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Détails
                  </>
                )}
              </Button>
            )}
          </TableCell>
        </TableRow>
        {isExpanded && log.details && (
          <TableRow key={`${log.id}-details`} className="bg-muted/30 hover:bg-muted/30">
            <TableCell colSpan={7} className="p-4">
              <div className="rounded-lg bg-muted p-3 overflow-x-auto">
                {detailEntries.length > 0 ? (
                  <dl className="text-xs space-y-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    {detailEntries.map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <dt className="font-medium text-muted-foreground shrink-0">{key}:</dt>
                        <dd className="font-mono break-all">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                    {String(details)}
                  </pre>
                )}
              </div>
              {log.reason && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  Raison journalisée : « {log.reason} »
                </p>
              )}
              {log.adresseIp && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Adresse IP : <span className="font-mono">{log.adresseIp}</span>
                </p>
              )}
            </TableCell>
          </TableRow>
        )}
      </>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Stats Row (4 KPI) ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <FileSearch className="h-5 w-5 text-success-text" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total (filtré)</p>
              <p className="text-xl font-bold font-mono tabular-nums">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <LogIn className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Connexions (page)</p>
              <p className="text-xl font-bold font-mono tabular-nums">{stats.loginCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <Ban className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Révocations (page)</p>
              <p className="text-xl font-bold font-mono tabular-nums">{stats.revokeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Échecs (page)</p>
              <p className="text-xl font-bold font-mono tabular-nums">{stats.failedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Filters Card ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <Filter className="h-4 w-4 text-success-text" />
            Filtres
          </CardTitle>
          <CardDescription className="text-xs">
            Affinez la liste des événements d&apos;audit de votre établissement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="space-y-1.5 flex-1 min-w-[160px]">
              <Label htmlFor="audit-filter-action" className="text-xs">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger id="audit-filter-action" className="w-full">
                  <SelectValue placeholder="Toutes les actions" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="all">Toutes les actions</SelectItem>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[160px]">
              <Label htmlFor="audit-filter-entite" className="text-xs">Entité</Label>
              <Select value={entite} onValueChange={setEntite}>
                <SelectTrigger id="audit-filter-entite" className="w-full">
                  <SelectValue placeholder="Toutes les entités" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="all">Toutes les entités</SelectItem>
                  {ENTITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label htmlFor="audit-filter-search" className="text-xs">Recherche (email / IP)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="audit-filter-search"
                  placeholder="user@etab.edu ou 1.2.3.4"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  aria-label="Rechercher dans le journal d'audit"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-date-from" className="text-xs">Date début</Label>
              <Input
                id="audit-filter-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full lg:w-[150px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-date-to" className="text-xs">Date fin</Label>
              <Input
                id="audit-filter-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full lg:w-[150px]"
              />
            </div>
          </div>

          {/* ─── Auto-refresh toggle ─── */}
          <div className="flex items-center justify-between gap-3 pt-1 border-t">
            <div className="flex items-center gap-2">
              <Switch
                id="audit-auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                aria-label="Activer l'auto-actualisation toutes les 30 secondes"
              />
              <Label htmlFor="audit-auto-refresh" className="text-xs flex items-center gap-1 cursor-pointer">
                <RefreshCw className={`h-3 w-3 ${autoRefresh ? 'animate-spin text-success-text' : 'text-muted-foreground'}`} />
                Auto-actualisation (30s)
              </Label>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['responsable-audit-logs', etablissementId] })}
              aria-label="Rafraîchir manuellement le journal d'audit"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Rafraîchir
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Audit log table ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <FileSearch className="h-5 w-5 text-success-text" />
            Journal d&apos;audit
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-success/15 text-success-text text-xs font-medium px-2 py-0.5">
              {total} événement{total > 1 ? 's' : ''}
            </span>
          </CardTitle>
          <CardDescription>
            Liste chronologique (la plus récente en premier) des actions
            effectuées par les utilisateurs de votre établissement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* ─── Loading state ─── */}
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 p-3 rounded-lg border">
                  <PulseSkeleton className="h-9 w-9" variant="circle" />
                  <div className="flex-1 space-y-2">
                    <PulseSkeleton className="h-4 w-48" />
                    <PulseSkeleton className="h-3 w-32" />
                  </div>
                  <PulseSkeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          )}

          {/* ─── Error state ─── */}
          {!isLoading && isError && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">
                Erreur lors du chargement du journal d&apos;audit.
              </h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'Veuillez réessayer dans quelques instants.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleRetry}
                aria-label="Réessayer le chargement du journal d'audit"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Réessayer
              </Button>
            </div>
          )}

          {/* ─── Empty state ─── */}
          {!isLoading && !isError && logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <FileSearch className="h-8 w-8 text-success-text" />
              </div>
              <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">
                Aucun événement d&apos;audit pour cet établissement.
              </h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Les actions des utilisateurs de votre établissement (connexions,
                créations et révocations de liens, modifications de paramètres…)
                apparaîtront ici.
              </p>
            </div>
          )}

          {/* ─── Data rendering ─── */}
          {!isLoading && !isError && logs.length > 0 && (
            isMobile ? (
              <div className="space-y-3">
                {logs.map(renderLogRow)}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[36rem] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="font-display whitespace-nowrap">Date</TableHead>
                      <TableHead className="font-display whitespace-nowrap">Acteur</TableHead>
                      <TableHead className="font-display whitespace-nowrap">Action</TableHead>
                      <TableHead className="font-display whitespace-nowrap">Entité</TableHead>
                      <TableHead className="font-display whitespace-nowrap">Détails / Raison</TableHead>
                      <TableHead className="font-display whitespace-nowrap">IP</TableHead>
                      <TableHead className="text-right font-display whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(renderLogRow)}
                  </TableBody>
                </Table>
              </div>
            )
          )}

          {/* ─── Pagination ─── */}
          {!isLoading && !isError && logs.length > 0 && totalPages > 1 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-4 pt-3 border-t">
              <p className="text-xs text-muted-foreground font-mono tabular-nums">
                {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} sur {total} entrée{total > 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Page précédente"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Précédent
                </Button>
                <span className="text-sm font-medium font-mono tabular-nums">
                  Page {page} sur {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Page suivante"
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
