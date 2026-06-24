'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardCheck,
  Clock,
  Calendar,
  HelpCircle,
  Users,
  Eye,
  BarChart3,
  Search,
  Filter,
  AlertTriangle,
  Check,
  Activity,
  Lock,
  Edit3,
  Trophy,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  User,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { PulseSkeleton, StatCard } from '@/components/ds'

// ─── Types ───

interface EnseignantInfo {
  id: string
  name: string
  email?: string
}

interface EpreuveQuestion {
  id: string
  questionId: string
  bareme: number
  ordre: number
  question: {
    id: string
    type: string
    enonce: string
    difficulte: string
  }
}

interface Session {
  id: string
  statut: string
  score: number | null
  etudiantId: string
  alertes: number
  etudiant?: {
    id: string
    name: string
    email: string
  }
  reponses?: Array<{ id: string; questionId: string }>
  logEvents?: unknown
}

interface FiliereInfo {
  id: string
  nom: string
  code?: string
}

interface GroupesCibles {
  groupes: string[]
  niveau?: string | null
}

interface Epreuve {
  id: string
  enseignantId: string
  titre: string
  description: string | null
  duree: number
  dateDebut: string
  dateFin: string
  melangeQuestions: boolean
  melangePropositions: boolean
  blocageRetour: boolean
  statut: 'BROUILLON' | 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE' | 'CLOTUREE'
  groupesCibles: GroupesCibles | string[] | null
  questions: EpreuveQuestion[]
  sessions: Session[]
  questionCount?: number
  totalPoints?: number
  noteTotal?: number
  enseignant?: EnseignantInfo
  filiere?: FiliereInfo
  createdAt: string
}

interface FiliereOption {
  id: string
  nom: string
}

// ─── Utility functions ───

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ]
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateText(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trim() + '...'
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case 'BROUILLON':
      return (
        <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
          <Edit3 className="h-3 w-3" />
          Brouillon
        </Badge>
      )
    case 'PLANIFIEE':
      return (
        <Badge variant="outline" className="gap-1 bg-warning/10 text-warning border-warning/20">
          <Calendar className="h-3 w-3" />
          Planifiée
        </Badge>
      )
    case 'EN_COURS':
      return (
        <Badge variant="outline" className="gap-1 bg-success/10 text-success border-success/20">
          <Activity className="h-3 w-3" />
          En cours
        </Badge>
      )
    case 'TERMINEE':
      return (
        <Badge variant="outline" className="gap-1 bg-info/10 text-info border-info/20">
          <Check className="h-3 w-3" />
          Terminée
        </Badge>
      )
    case 'CLOTUREE':
      return (
        <Badge variant="outline" className="gap-1 bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:border-gray-700">
          <Lock className="h-3 w-3" />
          Clôturée
        </Badge>
      )
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getScoreColor(score: number): string {
  if (score >= 10) return 'text-success'
  if (score >= 8) return 'text-warning'
  return 'text-destructive'
}

function getScoreBadgeClasses(score: number): string {
  if (score >= 10) return 'bg-success/10 text-success border-success/20'
  if (score >= 8) return 'bg-warning/10 text-warning border-warning/20'
  return 'bg-destructive/10 text-destructive border-destructive/20'
}

function getSessionBadge(statut: string) {
  switch (statut) {
    case 'EN_COURS':
      return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">En cours</Badge>
    case 'SOUMISE':
      return <Badge variant="outline" className="bg-info/10 text-info border-info/20">Soumise</Badge>
    case 'CORRIGEE':
      return <Badge variant="outline" className="bg-success/10 text-success border-success/20">Corrigée</Badge>
    case 'RETOURNEE':
      return <Badge variant="outline" className="bg-secondary/10 text-secondary border-secondary/20">Retournée</Badge>
    case 'NON_COMMENCEE':
      return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">Non commencée</Badge>
    case 'ABSENT':
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">Absent</Badge>
    case 'NON_SOUMIS':
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">Non soumis</Badge>
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

// ─── Score distribution mini chart ───

function ScoreDistributionChart({ sessions }: { sessions: Session[] }) {
  const scored = sessions.filter((s) => s.score !== null)
  if (scored.length === 0) return null

  const bins = [
    { label: '0-4', min: 0, max: 4, count: 0, color: 'bg-destructive' },
    { label: '4-8', min: 4, max: 8, count: 0, color: 'bg-warning' },
    { label: '8-10', min: 8, max: 10, count: 0, color: 'bg-warning' },
    { label: '10-12', min: 10, max: 12, count: 0, color: 'bg-success' },
    { label: '12-14', min: 12, max: 14, count: 0, color: 'bg-success' },
    { label: '14-16', min: 14, max: 16, count: 0, color: 'bg-secondary' },
    { label: '16-20', min: 16, max: 20, count: 0, color: 'bg-secondary' },
  ]

  scored.forEach((s) => {
    const score = s.score ?? 0
    const bin = bins.find((b) => score >= b.min && score < b.max)
    if (bin) bin.count++
    else if (score >= 16) bins[6].count++
  })

  const maxCount = Math.max(...bins.map((b) => b.count), 1)

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">Répartition des notes</h4>
      <div className="flex items-end gap-1 h-20">
        {bins.map((bin) => (
          <div key={bin.label} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{bin.count > 0 ? bin.count : ''}</span>
            <div
              className={`w-full rounded-t ${bin.color} transition-all`}
              style={{ height: `${Math.max((bin.count / maxCount) * 56, bin.count > 0 ? 4 : 0)}px` }}
            />
            <span className="text-[9px] text-muted-foreground">{bin.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───

export function EvaluationsPage() {
  const user = useAuthStore((s) => s.user)

  // ─── State ───
  const [epreuves, setEpreuves] = useState<Epreuve[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('all')
  const [filiereFilter, setFiliereFilter] = useState('all')
  const [filieres, setFilieres] = useState<FiliereOption[]>([])
  const [showFilters, setShowFilters] = useState(false)

  // Detail dialog
  const [detailEpreuve, setDetailEpreuve] = useState<Epreuve | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sessionsExpanded, setSessionsExpanded] = useState(false)
  const [dialogMode, setDialogMode] = useState<'details' | 'results'>('details')

  // ─── Fetch epreuves using responsableId ───
  const fetchEpreuves = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('responsableId', user.id)
      if (filiereFilter !== 'all') params.set('filiereId', filiereFilter)
      if (statutFilter !== 'all') params.set('statut', statutFilter)

      const res = await fetch(`/api/epreuves?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEpreuves(data.epreuves ?? [])
        // The API also returns the filieres for this responsable
        if (data.filieres && data.filieres.length > 0 && filieres.length === 0) {
          setFilieres(data.filieres.map((f: { id: string; nom: string }) => ({ id: f.id, nom: f.nom })))
        }
      } else {
        const data = await res.json().catch(() => ({}))
        console.error('Epreuves API error:', data.error)
        setEpreuves([])
      }
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger les évaluations.' })
      setEpreuves([])
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, statutFilter, filiereFilter, filieres.length])

  useEffect(() => {
    fetchEpreuves()
  }, [fetchEpreuves])

  // ─── Client-side search filter ───
  const filteredEpreuves = epreuves.filter((ep) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const matchTitre = ep.titre.toLowerCase().includes(q)
    const matchDesc = ep.description?.toLowerCase().includes(q) ?? false
    const matchEnseignant = ep.enseignant?.name?.toLowerCase().includes(q) ?? false
    const matchFiliere = ep.filiere?.nom?.toLowerCase().includes(q) ?? false
    return matchTitre || matchDesc || matchEnseignant || matchFiliere
  })

  // ─── Computed stats (from filtered epreuves) ───
  const totalEvaluations = filteredEpreuves.length
  const enCoursCount = filteredEpreuves.filter((e) => e.statut === 'EN_COURS').length
  const planifieesCount = filteredEpreuves.filter((e) => e.statut === 'PLANIFIEE').length
  const termineesCount = filteredEpreuves.filter((e) => e.statut === 'TERMINEE' || e.statut === 'CLOTUREE').length
  const totalAlerts = filteredEpreuves.reduce((sum, ep) => {
    return sum + (ep.sessions ?? []).reduce((s, sess) => s + (sess.alertes ?? 0), 0)
  }, 0)

  // ─── Open detail dialog (configuration/metadata) ───
  const handleOpenDetail = async (epreuve: Epreuve) => {
    setDialogMode('details')
    setDetailEpreuve(epreuve)
    setDetailDialogOpen(true)
    setSessionsExpanded(false)
    setDetailLoading(true)

    try {
      const res = await fetch(`/api/epreuves/${epreuve.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailEpreuve(data.epreuve ?? epreuve)
      }
    } catch {
      // Keep existing epreuve data
    } finally {
      setDetailLoading(false)
    }
  }

  // ─── Open results dialog (scoring/statistics) ───
  const handleOpenResults = async (epreuve: Epreuve) => {
    setDialogMode('results')
    setDetailEpreuve(epreuve)
    setDetailDialogOpen(true)
    setSessionsExpanded(true)
    setDetailLoading(true)

    try {
      const res = await fetch(`/api/epreuves/${epreuve.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailEpreuve(data.epreuve ?? epreuve)
      }
    } catch {
      // Keep existing epreuve data
    } finally {
      setDetailLoading(false)
    }
  }

  // ─── Get stats for a single epreuve ───
  const getEpreuveStats = (epreuve: Epreuve) => {
    const sessions = epreuve.sessions ?? []
    const totalSessions = sessions.length
    const completedSessions = sessions.filter(
      (s) => s.statut === 'SOUMISE' || s.statut === 'CORRIGEE'
    ).length
    const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0
    const totalAlertsEpreuve = sessions.reduce((sum, s) => sum + (s.alertes ?? 0), 0)
    const scoredSessions = sessions.filter((s) => s.score !== null)
    const avgScore = scoredSessions.length > 0
      ? Math.round((scoredSessions.reduce((sum, s) => sum + (s.score ?? 0), 0) / scoredSessions.length) * 10) / 10
      : null
    const questionCount = epreuve.questions?.length ?? epreuve.questionCount ?? 0
    const totalPoints = epreuve.questions
      ? epreuve.questions.reduce((sum, eq) => sum + eq.bareme, 0)
      : (epreuve.totalPoints ?? 0)

    return { totalSessions, completedSessions, completionRate, totalAlerts: totalAlertsEpreuve, avgScore, questionCount, totalPoints }
  }

  const hasActiveFilters = statutFilter !== 'all' || filiereFilter !== 'all' || search.trim() !== ''

  const resetFilters = () => {
    setSearch('')
    setStatutFilter('all')
    setFiliereFilter('all')
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7 text-success" />
          Suivi des Évaluations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Supervisez les épreuves de vos filières
        </p>
      </div>

      {/* ─── Stats cards ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard icon={ClipboardCheck} label="Total" value={totalEvaluations} accent="primary" index={0} />
        <StatCard icon={Activity} label="En cours" value={enCoursCount} accent="primary" index={1} />
        <StatCard icon={Calendar} label="Planifiées" value={planifieesCount} accent="primary" index={2} />
        <StatCard icon={Trophy} label="Terminées" value={termineesCount} accent="primary" index={3} />
        <StatCard icon={AlertTriangle} label="Alertes" value={totalAlerts} accent="primary" index={4} />
      </div>

      {/* ─── Filter toolbar ─── */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par titre, description, enseignant ou filière..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch('')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Select value={statutFilter} onValueChange={setStatutFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="BROUILLON">Brouillon</SelectItem>
                <SelectItem value="PLANIFIEE">Planifiée</SelectItem>
                <SelectItem value="EN_COURS">En cours</SelectItem>
                <SelectItem value="TERMINEE">Terminée</SelectItem>
                <SelectItem value="CLOTUREE">Clôturée</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchEpreuves()}
              title="Rafraîchir"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Advanced filters toggle + active filters display */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            Filtres avancés
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="text-success hover:text-success"
              onClick={resetFilters}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Réinitialiser
            </Button>
          )}
          {/* Active filter badges */}
          {statutFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Statut: {statutFilter === 'BROUILLON' ? 'Brouillon' : statutFilter === 'PLANIFIEE' ? 'Planifiée' : statutFilter === 'EN_COURS' ? 'En cours' : statutFilter === 'TERMINEE' ? 'Terminée' : 'Clôturée'}
              <button onClick={() => setStatutFilter('all')} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {filiereFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Filière: {filieres.find(f => f.id === filiereFilter)?.nom ?? filiereFilter}
              <button onClick={() => setFiliereFilter('all')} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {search.trim() && (
            <Badge variant="secondary" className="gap-1">
              Recherche: &ldquo;{search.trim().length > 20 ? search.trim().slice(0, 20) + '...' : search.trim()}&rdquo;
              <button onClick={() => setSearch('')} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          )}
        </div>

        {showFilters && (
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Filière</Label>
                <Select value={filiereFilter} onValueChange={setFiliereFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes les filières" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes mes filières</SelectItem>
                    {filieres.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select value={statutFilter} onValueChange={setStatutFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous les statuts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    <SelectItem value="BROUILLON">Brouillon</SelectItem>
                    <SelectItem value="PLANIFIEE">Planifiée</SelectItem>
                    <SelectItem value="EN_COURS">En cours</SelectItem>
                    <SelectItem value="TERMINEE">Terminée</SelectItem>
                    <SelectItem value="CLOTUREE">Clôturée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ─── Loading skeleton ─── */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 p-6 rounded-lg border border-border bg-card">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <PulseSkeleton className="h-5 w-48" />
                  <PulseSkeleton className="h-3 w-32" />
                </div>
                <PulseSkeleton className="h-6 w-20" variant="circle" />
              </div>
              <PulseSkeleton className="h-3 w-full" />
              <div className="flex gap-4">
                <PulseSkeleton className="h-3 w-16" />
                <PulseSkeleton className="h-3 w-24" />
                <PulseSkeleton className="h-3 w-20" />
              </div>
              <div className="flex gap-2 pt-2">
                <PulseSkeleton className="h-8 w-24" />
                <PulseSkeleton className="h-8 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && filteredEpreuves.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <ClipboardCheck className="h-10 w-10 text-success" />
          </div>
          <h3 className="mt-4 font-display tracking-tight text-lg font-semibold">Aucune évaluation trouvée</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'Aucun résultat ne correspond à vos critères de recherche. Essayez de modifier vos filtres.'
              : 'Aucune épreuve n\'a encore été créée par les enseignants de vos filières.'}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              className="mt-6 border-success/30 text-success hover:bg-success/10"
              onClick={resetFilters}
            >
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      )}

      {/* ─── Evaluation cards ─── */}
      {!isLoading && filteredEpreuves.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredEpreuves.map((epreuve) => {
            const stats = getEpreuveStats(epreuve)

            return (
              <Card key={epreuve.id} className="group transition-shadow hover:shadow-md ds-lift">
                <CardContent className="flex flex-col gap-4 p-6">
                  {/* Title + Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display tracking-tight text-base font-semibold leading-tight">{epreuve.titre}</h3>
                      {epreuve.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {truncateText(epreuve.description, 100)}
                        </p>
                      )}
                    </div>
                    {getStatutBadge(epreuve.statut)}
                  </div>

                  {/* Teacher + Filiere info */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {epreuve.enseignant && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <User className="h-3.5 w-3.5 text-secondary" />
                        <span className="font-medium text-foreground">{epreuve.enseignant.name}</span>
                      </div>
                    )}
                    {epreuve.filiere && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <ClipboardCheck className="h-3.5 w-3.5 text-success" />
                        <span>{epreuve.filiere.nom}</span>
                      </div>
                    )}
                  </div>

                  {/* Duration + Date range */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-success" />
                      {epreuve.duree} min
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-secondary" />
                      {formatDateTime(epreuve.dateDebut)} — {formatDateTime(epreuve.dateFin)}
                    </span>
                  </div>

                  {/* Question count + total points + participants + completion */}
                  <div className="flex flex-wrap gap-3">
                    <Badge variant="secondary" className="gap-1 bg-success/10 text-success">
                      <HelpCircle className="h-3 w-3" />
                      {stats.questionCount} question{stats.questionCount > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="secondary" className="gap-1 bg-secondary/10 text-secondary">
                      <Trophy className="h-3 w-3" />
                      {stats.totalPoints} point{stats.totalPoints > 1 ? 's' : ''}
                    </Badge>
                    {stats.totalSessions > 0 ? (
                      <Badge variant="secondary" className="gap-1 bg-warning/10 text-warning">
                        <Users className="h-3 w-3" />
                        {stats.completedSessions}/{stats.totalSessions} ({stats.completionRate}%)
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 bg-gray-50 text-gray-500 dark:bg-gray-900/20 dark:text-gray-400">
                        <Users className="h-3 w-3" />
                        Aucun participant
                      </Badge>
                    )}
                  </div>

                  {/* Alert count */}
                  {stats.totalAlerts > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-destructive font-medium">
                        {stats.totalAlerts} alerte{stats.totalAlerts > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}

                  {/* Average score (if TERMINEE/CLOTUREE) */}
                  {(epreuve.statut === 'TERMINEE' || epreuve.statut === 'CLOTUREE') && stats.avgScore !== null && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Moyenne :</span>
                      <span className={`font-bold text-lg ${getScoreColor(stats.avgScore)}`}>
                        {stats.avgScore}/20
                      </span>
                      <Badge variant="outline" className={getScoreBadgeClasses(stats.avgScore)}>
                        {Math.round((stats.avgScore / 20) * 100)}%
                      </Badge>
                    </div>
                  )}

                  <Separator />

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-success/30 text-success hover:bg-success/10"
                      onClick={() => handleOpenDetail(epreuve)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Voir les détails
                    </Button>
                    {(epreuve.statut === 'TERMINEE' || epreuve.statut === 'CLOTUREE') && stats.avgScore !== null && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-secondary/30 text-secondary hover:bg-secondary/10"
                        onClick={() => handleOpenResults(epreuve)}
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                        Voir les résultats
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Evaluation Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => { if (!open) setDetailDialogOpen(false) }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {dialogMode === 'details' ? (
                <>
                  <Eye className="h-5 w-5 text-success" />
                  Détails de l’évaluation
                </>
              ) : (
                <>
                  <BarChart3 className="h-5 w-5 text-secondary" />
                  Résultats de l’évaluation
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'details'
                ? 'Configuration et métadonnées de l’épreuve'
                : 'Statistiques de notation et performances des étudiants'}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex-1 space-y-4 py-4">
              <PulseSkeleton className="h-6 w-48" />
              <PulseSkeleton className="h-4 w-full" />
              <div className="grid grid-cols-2 gap-4">
                <PulseSkeleton className="h-20" />
                <PulseSkeleton className="h-20" />
              </div>
              <PulseSkeleton className="h-40" />
            </div>
          ) : detailEpreuve ? (
            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
              <div className="space-y-6 pb-4">

              {/* ====== MODE: DETAILS (configuration/metadata) ====== */}
              {dialogMode === 'details' && (
                <>
                  {/* Title & Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display tracking-tight text-lg font-bold">{detailEpreuve.titre}</h3>
                      {detailEpreuve.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{detailEpreuve.description}</p>
                      )}
                    </div>
                    {getStatutBadge(detailEpreuve.statut)}
                  </div>

                  {/* Teacher info */}
                  {detailEpreuve.enseignant && (
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/10">
                        <User className="h-4 w-4 text-secondary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{detailEpreuve.enseignant.name}</p>
                        {detailEpreuve.enseignant.email && (
                          <p className="text-xs text-muted-foreground">{detailEpreuve.enseignant.email}</p>
                        )}
                      </div>
                      {detailEpreuve.filiere && (
                        <Badge variant="secondary" className="ml-auto gap-1">
                          <ClipboardCheck className="h-3 w-3" />
                          {detailEpreuve.filiere.nom}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard icon={Clock} label="Durée" value={`${detailEpreuve.duree} min`} accent="primary" index={0} />
                    <StatCard icon={HelpCircle} label="Questions" value={detailEpreuve.questions && detailEpreuve.questions.length > 0 ? detailEpreuve.questions.length : (detailEpreuve.questionCount ?? 0)} accent="primary" index={1} />
                    <StatCard icon={Trophy} label="Points total" value={detailEpreuve.questions != null && detailEpreuve.questions.length > 0 ? detailEpreuve.questions.reduce((sum, eq) => sum + eq.bareme, 0) : (detailEpreuve.totalPoints ?? detailEpreuve.noteTotal ?? 0)} accent="primary" index={2} />
                    <StatCard icon={Users} label="Participants" value={detailEpreuve.sessions?.length ?? 0} accent="primary" index={3} />
                  </div>

                  {/* Date range */}
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Période</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{formatDateTime(detailEpreuve.dateDebut)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{formatDateTime(detailEpreuve.dateFin)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Créée le {formatDate(detailEpreuve.createdAt)}
                    </p>
                  </div>

                  {/* Options */}
                  {(detailEpreuve.melangeQuestions || detailEpreuve.melangePropositions || detailEpreuve.blocageRetour) && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Options de l’épreuve</p>
                      <div className="flex flex-wrap gap-2">
                        {detailEpreuve.melangeQuestions && (
                          <Badge variant="outline" className="text-xs gap-1">
                            Questions mélangées
                          </Badge>
                        )}
                        {detailEpreuve.melangePropositions && (
                          <Badge variant="outline" className="text-xs gap-1">
                            Propositions mélangées
                          </Badge>
                        )}
                        {detailEpreuve.blocageRetour && (
                          <Badge variant="outline" className="text-xs gap-1 text-destructive">
                            Retour bloqué
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Questions list */}
                  {detailEpreuve.questions && detailEpreuve.questions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Liste des questions</p>
                      <div className="space-y-2">
                        {detailEpreuve.questions
                          .sort((a, b) => a.ordre - b.ordre)
                          .map((eq, idx) => (
                          <div key={eq.id} className="flex items-start gap-3 rounded-lg border p-3">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                              {eq.ordre || idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm line-clamp-2">{eq.question.enonce}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {eq.question.type}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {eq.bareme} pt{eq.bareme > 1 ? 's' : ''}
                                </Badge>
                                {eq.question.difficulte && (
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                    eq.question.difficulte === 'FACILE' ? 'text-success' :
                                    eq.question.difficulte === 'MOYEN' ? 'text-warning' : 'text-destructive'
                                  }`}>
                                    {eq.question.difficulte}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Groupes cibles */}
                  {(() => {
                    const gc = detailEpreuve.groupesCibles
                    if (!gc) return null
                    const isObj = typeof gc === 'object' && gc !== null && !Array.isArray(gc) && 'groupes' in gc
                    const groupes: string[] = isObj ? ((gc as { groupes: string[] }).groupes) : Array.isArray(gc) ? (gc as string[]) : []
                    const niveau: string | null = isObj ? ((gc as { niveau?: string | null }).niveau ?? null) : null
                    const hasContent = groupes.length > 0 || niveau
                    if (!hasContent) return null
                    return (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Groupes cibles</p>
                        <div className="flex flex-wrap gap-2">
                          {niveau && (
                            <Badge variant="secondary" className="text-xs gap-1 bg-secondary/10 text-secondary">
                              <ClipboardCheck className="h-3 w-3" />
                              Niveau : {niveau}
                            </Badge>
                          )}
                          {groupes.map((g, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{g}</Badge>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}

              {/* ====== MODE: RESULTS (scoring/statistics) ====== */}
              {dialogMode === 'results' && (
                <>
                  {/* Title & Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display tracking-tight text-lg font-bold">{detailEpreuve.titre}</h3>
                      <p className="text-sm text-muted-foreground">
                        {detailEpreuve.enseignant?.name} {detailEpreuve.filiere ? `• ${detailEpreuve.filiere.nom}` : ''}
                      </p>
                    </div>
                    {getStatutBadge(detailEpreuve.statut)}
                  </div>

                  {/* Score distribution chart */}
                  <ScoreDistributionChart sessions={detailEpreuve.sessions ?? []} />

                  {/* Average / median / pass rate stats */}
                  {(() => {
                    const scored = (detailEpreuve.sessions ?? []).filter((s: Session) => s.score !== null)
                    if (scored.length === 0) return (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Aucun résultat disponible pour le moment
                      </div>
                    )
                    const scores = scored.map((s: Session) => s.score ?? 0)
                    const avg = Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
                    const sorted = [...scores].sort((a: number, b: number) => a - b)
                    const median = sorted.length % 2 === 0
                      ? Math.round(((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) * 10) / 10
                      : sorted[Math.floor(sorted.length / 2)]
                    const passRate = Math.round((scores.filter((s: number) => s >= 10).length / scores.length) * 100)
                    const minScore = sorted[0]
                    const maxScore = sorted[sorted.length - 1]
                    const failedCount = scores.filter((s: number) => s < 10).length
                    const passedCount = scores.filter((s: number) => s >= 10).length

                    return (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center p-3 rounded-lg bg-success/10">
                            <p className="text-xs text-muted-foreground">Moyenne</p>
                            <p className={`text-lg font-bold ${getScoreColor(avg)}`}>{avg}/20</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-secondary/10">
                            <p className="text-xs text-muted-foreground">Médiane</p>
                            <p className={`text-lg font-bold ${getScoreColor(median)}`}>{median}/20</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-warning/10">
                            <p className="text-xs text-muted-foreground">Réussite</p>
                            <p className="font-mono text-lg font-bold tabular-nums text-warning">{passRate}%</p>
                          </div>
                        </div>

                        {/* Detailed stats grid */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <Card className="border-l-4 border-l-sky-500">
                            <CardContent className="p-3">
                              <p className="text-xs text-muted-foreground">Note min</p>
                              <p className={`text-sm font-semibold ${getScoreColor(minScore)}`}>{minScore}/20</p>
                            </CardContent>
                          </Card>
                          <Card className="border-l-4 border-l-emerald-500">
                            <CardContent className="p-3">
                              <p className="text-xs text-muted-foreground">Note max</p>
                              <p className={`text-sm font-semibold ${getScoreColor(maxScore)}`}>{maxScore}/20</p>
                            </CardContent>
                          </Card>
                          <Card className="border-l-4 border-l-emerald-500">
                            <CardContent className="p-3">
                              <p className="text-xs text-muted-foreground">Réussis</p>
                              <p className="text-sm font-semibold text-success">{passedCount}</p>
                            </CardContent>
                          </Card>
                          <Card className="border-l-4 border-l-red-500">
                            <CardContent className="p-3">
                              <p className="text-xs text-muted-foreground">Échoués</p>
                              <p className="text-sm font-semibold text-destructive">{failedCount}</p>
                            </CardContent>
                          </Card>
                        </div>
                      </>
                    )
                  })()}

                  {/* Participants ranking */}
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-warning" />
                        Classement des participants
                      </h4>
                    </div>

                    {(detailEpreuve.sessions?.length ?? 0) === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Aucun participant pour le moment
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {[...(detailEpreuve.sessions ?? [])]
                          .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
                          .map((session: Session, rank: number) => (
                          <div
                            key={session.id}
                            className="flex items-center justify-between rounded-lg border p-3 gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                rank === 0 ? 'bg-warning/10 text-warning' :
                                rank === 1 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' :
                                rank === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' :
                                'bg-muted text-muted-foreground'
                              }`}>
                                {rank + 1}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{session.etudiant?.name ?? 'Étudiant inconnu'}</p>
                                {session.etudiant?.email && (
                                  <p className="text-xs text-muted-foreground truncate">{session.etudiant.email}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                              {session.score !== null && (
                                <Badge variant="outline" className={getScoreBadgeClasses(session.score)}>
                                  {session.score}/20
                                </Badge>
                              )}
                              {getSessionBadge(session.statut)}
                              {session.alertes > 0 && (
                                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {session.alertes}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              </div>
            </div>
          ) : null}
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
