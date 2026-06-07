'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BookOpen,
  Clock,
  CalendarDays,
  Send,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  MessageSquare,
  ChevronRight,
  XCircle,
  Eye,
  Sparkles,
  Timer,
  Type,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search } from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ───

interface DevoirEtudiant {
  id: string
  titre: string
  description: string | null
  consignes: string | null
  typeSeance: string
  dateLimite: string
  noteMax: number
  statut: string
  anneeUniversitaire: string
  enseignant: { id: string; name: string; email: string }
  uniteEnseignement: { id: string; code: string; nom: string; niveau?: string }
  soumission: SoumissionEtudiant | null
  soumissionCount: number
}

interface SoumissionEtudiant {
  id: string
  contenuTexte: string | null
  commentaireEtudiant: string | null
  statut: string
  renduAt: string | null
  note: number | null
  commentaireEnseignant: string | null
  noteIA: number | null
  justificationIA: string | null
  createdAt: string
}

// ─── Utility functions ───

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function formatDateFR(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`
}

function formatDateTimeFR(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  const hours = d.getHours().toString().padStart(2, '0')
  const minutes = d.getMinutes().toString().padStart(2, '0')
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()} à ${hours}h${minutes}`
}

function isOverdue(dateLimite: string): boolean {
  return new Date(dateLimite) < new Date()
}

function getTimeRemaining(dateLimite: string): string {
  const now = new Date()
  const deadline = new Date(dateLimite)
  const diff = deadline.getTime() - now.getTime()

  if (diff <= 0) return 'Date limite dépassée'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days > 0) return `${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}`
  if (hours > 0) return `${hours} heure${hours > 1 ? 's' : ''} restante${hours > 1 ? 's' : ''}`
  return 'Moins d\'une heure'
}

function getTypeSeanceLabel(type: string): string {
  switch (type) {
    case 'CM': return 'CM'
    case 'TD': return 'TD'
    case 'TP': return 'TP'
    default: return type
  }
}

function getTypeSeanceBadgeClasses(type: string): string {
  switch (type) {
    case 'CM':
      return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800'
    case 'TD':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800'
    case 'TP':
      return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-800'
  }
}

function getSoumissionStatutBadge(statut: string): { label: string; classes: string; icon: React.ReactNode } {
  switch (statut) {
    case 'BROUILLON':
      return {
        label: 'Brouillon',
        classes: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-800',
        icon: <FileText className="h-3 w-3" />,
      }
    case 'SOUMIS':
      return {
        label: 'Soumis',
        classes: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
        icon: <CheckCircle2 className="h-3 w-3" />,
      }
    case 'CORRIGE':
      return {
        label: 'Corrigé',
        classes: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',
        icon: <CheckCircle2 className="h-3 w-3" />,
      }
    case 'RETOURNE':
      return {
        label: 'Retourné',
        classes: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
        icon: <Eye className="h-3 w-3" />,
      }
    default:
      return {
        label: statut,
        classes: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-800',
        icon: null,
      }
  }
}

// ─── Component ───

export function MesDevoirsPage() {
  const user = useAuthStore((s) => s.user)

  const [devoirs, setDevoirs] = useState<DevoirEtudiant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('a-faire')
  const [searchQuery, setSearchQuery] = useState('')

  // Submit dialog state
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [selectedDevoir, setSelectedDevoir] = useState<DevoirEtudiant | null>(null)
  const [contenuTexte, setContenuTexte] = useState('')
  const [commentaireEtudiant, setCommentaireEtudiant] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Detail dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [detailDevoir, setDetailDevoir] = useState<DevoirEtudiant | null>(null)

  // ─── Fetch devoirs ───
  const fetchDevoirs = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/devoirs?etudiantId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setDevoirs(data.devoirs ?? [])
      }
    } catch {
      toast.error('Erreur de chargement', {
        description: 'Impossible de charger vos devoirs.',
      })
    }
  }, [user])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await fetchDevoirs()
      setIsLoading(false)
    }
    load()
  }, [fetchDevoirs])

  // ─── Split devoirs ───
  const devoirsAFaire = devoirs.filter((d) => {
    const overdue = isOverdue(d.dateLimite)
    if (d.soumission && (d.soumission.statut === 'SOUMIS' || d.soumission.statut === 'CORRIGE' || d.soumission.statut === 'RETOURNE')) {
      return false
    }
    if (d.statut === 'ARCHIVE') return false
    return true
  })

  const devoirsSoumis = devoirs.filter((d) => {
    return d.soumission && d.soumission.statut === 'SOUMIS'
  })

  const devoirsCorriges = devoirs.filter((d) => {
    return d.soumission && (d.soumission.statut === 'CORRIGE' || d.soumission.statut === 'RETOURNE')
  })

  // ─── Handlers ───
  const handleOpenSubmit = (devoir: DevoirEtudiant) => {
    setSelectedDevoir(devoir)
    setContenuTexte(devoir.soumission?.contenuTexte || '')
    setCommentaireEtudiant(devoir.soumission?.commentaireEtudiant || '')
    setSubmitDialogOpen(true)
  }

  const handleOpenDetail = (devoir: DevoirEtudiant) => {
    setDetailDevoir(devoir)
    setDetailDialogOpen(true)
  }

  const handleSubmit = async (statut: 'SOUMIS' | 'BROUILLON') => {
    if (!selectedDevoir || !user?.id) return

    if (statut === 'SOUMIS' && !contenuTexte.trim()) {
      toast.error('Contenu requis', {
        description: 'Veuillez écrire votre réponse avant de soumettre.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/soumissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          devoirId: selectedDevoir.id,
          etudiantId: user.id,
          contenuTexte: contenuTexte.trim(),
          commentaireEtudiant: commentaireEtudiant.trim() || null,
          statut,
        }),
      })

      if (res.ok) {
        toast.success(
          statut === 'SOUMIS' ? 'Devoir soumis avec succès' : 'Brouillon sauvegardé',
          {
            description: statut === 'SOUMIS'
              ? 'Votre réponse a été envoyée à l\'enseignant.'
              : 'Vous pouvez continuer à modifier votre brouillon.',
          }
        )
        setSubmitDialogOpen(false)
        setContenuTexte('')
        setCommentaireEtudiant('')
        await fetchDevoirs()
      } else {
        const data = await res.json()
        toast.error('Erreur', {
          description: data.error || 'Impossible de soumettre le devoir.',
        })
      }
    } catch {
      toast.error('Erreur réseau', {
        description: 'Vérifiez votre connexion et réessayez.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Stats ───
  const overdueCount = devoirsAFaire.filter((d) => isOverdue(d.dateLimite)).length
  const draftCount = devoirsAFaire.filter((d) => d.soumission?.statut === 'BROUILLON').length
  const avgNote = devoirsCorriges.filter(d => d.soumission?.note !== null).length > 0
    ? (devoirsCorriges.filter(d => d.soumission?.note !== null).reduce((sum, d) => sum + (d.soumission?.note ?? 0), 0) / devoirsCorriges.filter(d => d.soumission?.note !== null).length)
    : null

  // Search filter helper
  const filterBySearch = (d: DevoirEtudiant) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return d.titre.toLowerCase().includes(q)
      || d.uniteEnseignement.code.toLowerCase().includes(q)
      || d.uniteEnseignement.nom.toLowerCase().includes(q)
      || (d.description?.toLowerCase().includes(q) ?? false)
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Mes Devoirs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consultez et soumettez vos devoirs
        </p>
      </div>

      {/* ─── Stats cards ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{devoirsAFaire.length}</p>
                <p className="text-xs text-muted-foreground">À faire</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{draftCount}</p>
                <p className="text-xs text-muted-foreground">Brouillons</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overdueCount}</p>
                <p className="text-xs text-muted-foreground">En retard</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{devoirsSoumis.length}</p>
                <p className="text-xs text-muted-foreground">En attente</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500 sm:col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
                <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{devoirsCorriges.length}</p>
                <p className="text-xs text-muted-foreground">Corrigés{avgNote !== null ? ` · ${avgNote.toFixed(1)} moy` : ''}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Search ─── */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un devoir..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="a-faire" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            À faire
            {devoirsAFaire.filter(filterBySearch).length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 px-1.5 text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              >
                {devoirsAFaire.filter(filterBySearch).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="soumis" className="gap-1.5">
            <Send className="h-4 w-4" />
            Soumis
            {devoirsSoumis.filter(filterBySearch).length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 px-1.5 text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
              >
                {devoirsSoumis.filter(filterBySearch).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="corriges" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            Corrigés
            {devoirsCorriges.filter(filterBySearch).length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 px-1.5 text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
              >
                {devoirsCorriges.filter(filterBySearch).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── À faire tab ─── */}
        <TabsContent value="a-faire">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="h-5 w-2/3 rounded bg-muted" />
                        <div className="h-4 w-1/2 rounded bg-muted" />
                        <div className="flex gap-4">
                          <div className="h-3 w-24 rounded bg-muted" />
                          <div className="h-3 w-20 rounded bg-muted" />
                          <div className="h-3 w-16 rounded bg-muted" />
                        </div>
                      </div>
                      <div className="h-10 w-32 rounded bg-muted" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : devoirsAFaire.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                <BookOpen className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucun devoir à faire</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez aucun devoir en attente pour le moment. Les nouveaux devoirs apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {devoirsAFaire.filter(filterBySearch).map((devoir) => {
                const overdue = isOverdue(devoir.dateLimite)
                const timeRemaining = getTimeRemaining(devoir.dateLimite)
                const isDraft = devoir.soumission?.statut === 'BROUILLON'
                const canSubmit = devoir.statut === 'PUBLIE' && !overdue

                return (
                  <Card
                    key={devoir.id}
                    className={`group transition-shadow hover:shadow-md ${
                      overdue ? 'border-red-200 dark:border-red-900' : ''
                    }`}
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        {/* Left: Devoir info */}
                        <div className="flex-1 space-y-3">
                          {/* Title row */}
                          <div className="flex items-start gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                              overdue
                                ? 'bg-red-100 dark:bg-red-900/40'
                                : 'bg-emerald-100 dark:bg-emerald-900/40'
                            }`}>
                              <BookOpen className={`h-5 w-5 ${
                                overdue
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-base font-semibold leading-tight">
                                {devoir.titre}
                              </h3>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {devoir.uniteEnseignement.code} — {devoir.uniteEnseignement.nom}
                              </p>
                            </div>
                          </div>

                          {/* Meta info */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[52px]">
                            <span className={`flex items-center gap-1.5 text-sm ${
                              overdue
                                ? 'text-red-600 dark:text-red-400 font-medium'
                                : 'text-muted-foreground'
                            }`}>
                              <CalendarDays className={`h-3.5 w-3.5 ${
                                overdue
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`} />
                              {formatDateTimeFR(devoir.dateLimite)}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-xs ${getTypeSeanceBadgeClasses(devoir.typeSeance)}`}
                            >
                              {getTypeSeanceLabel(devoir.typeSeance)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-xs bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-800"
                            >
                              {devoir.noteMax} pts
                            </Badge>
                          </div>

                          {/* Time remaining */}
                          <div className="pl-[52px]">
                            {overdue ? (
                              <span className="flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {timeRemaining}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                {timeRemaining}
                              </span>
                            )}
                          </div>

                          {/* Draft indicator */}
                          {isDraft && (
                            <div className="pl-[52px]">
                              <Badge
                                variant="outline"
                                className="text-xs bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800"
                              >
                                <FileText className="h-3 w-3" />
                                Brouillon en cours
                              </Badge>
                            </div>
                          )}

                          {/* Description */}
                          {devoir.description && (
                            <p className="line-clamp-2 text-sm text-muted-foreground pl-[52px]">
                              {devoir.description}
                            </p>
                          )}
                        </div>

                        {/* Right: Action buttons */}
                        <div className="flex shrink-0 items-center gap-2 sm:ml-4">
                          {canSubmit && (
                            <Button
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => handleOpenSubmit(devoir)}
                            >
                              <Send className="h-4 w-4" />
                              {isDraft ? 'Modifier' : 'Soumettre'}
                            </Button>
                          )}
                          {overdue && !isDraft && (
                            <Button variant="outline" disabled>
                              <Clock className="h-4 w-4" />
                              Expiré
                            </Button>
                          )}
                          {devoir.soumission && (
                            <Button
                              variant="outline"
                              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                              onClick={() => handleOpenDetail(devoir)}
                            >
                              <Eye className="h-4 w-4" />
                              Détail
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Soumis tab ─── */}
        <TabsContent value="soumis">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="h-5 w-2/3 rounded bg-muted" />
                        <div className="h-4 w-1/2 rounded bg-muted" />
                        <div className="h-3 w-full rounded bg-muted" />
                      </div>
                      <div className="h-10 w-32 rounded bg-muted" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : devoirsSoumis.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/30">
                <CheckCircle2 className="h-10 w-10 text-teal-500 dark:text-teal-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucun devoir soumis</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez pas encore soumis de devoir. Vos soumissions apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {devoirsSoumis.filter(filterBySearch).map((devoir) => {
                const soumission = devoir.soumission!
                const statutInfo = getSoumissionStatutBadge(soumission.statut)

                return (
                  <Card
                    key={devoir.id}
                    className="group transition-shadow hover:shadow-md"
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        {/* Left: Devoir info */}
                        <div className="flex-1 space-y-3">
                          {/* Title row */}
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
                              <CheckCircle2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-base font-semibold leading-tight">
                                {devoir.titre}
                              </h3>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {devoir.uniteEnseignement.code} — {devoir.uniteEnseignement.nom}
                              </p>
                            </div>
                          </div>

                          {/* Submission meta */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[52px]">
                            {soumission.renduAt && (
                              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <CalendarDays className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                                Soumis le {formatDateTimeFR(soumission.renduAt)}
                              </span>
                            )}
                            <Badge
                              variant="outline"
                              className={`text-xs ${getTypeSeanceBadgeClasses(devoir.typeSeance)}`}
                            >
                              {getTypeSeanceLabel(devoir.typeSeance)}
                            </Badge>
                          </div>

                          {/* Status */}
                          <div className="flex flex-wrap items-center gap-3 pl-[52px]">
                            <Badge variant="outline" className={`text-xs ${statutInfo.classes}`}>
                              {statutInfo.icon}
                              {statutInfo.label}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-xs bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800"
                            >
                              <Clock className="h-3 w-3" />
                              En attente de correction
                            </Badge>
                          </div>
                        </div>

                        {/* Right: Action button */}
                        <div className="shrink-0 sm:ml-4">
                          <Button
                            variant="outline"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                            onClick={() => handleOpenDetail(devoir)}
                          >
                            <Eye className="h-4 w-4" />
                            Voir le détail
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Corrigés tab ─── */}
        <TabsContent value="corriges">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-5 w-2/3 rounded bg-muted" />
                    <div className="h-4 w-1/2 rounded bg-muted mt-3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : devoirsCorriges.filter(filterBySearch).length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-950/30">
                <Sparkles className="h-10 w-10 text-purple-500 dark:text-purple-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucun devoir corrigé</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vos devoirs corrigés apparaîtront ici une fois notés par l&apos;enseignant.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {devoirsCorriges.filter(filterBySearch).map((devoir) => {
                const soumission = devoir.soumission!
                const statutInfo = getSoumissionStatutBadge(soumission.statut)
                const notePercent = soumission.note !== null ? Math.round((soumission.note / devoir.noteMax) * 100) : 0
                const isPassing = soumission.note !== null && soumission.note >= devoir.noteMax / 2

                return (
                  <Card
                    key={devoir.id}
                    className={`group transition-shadow hover:shadow-md ${
                      isPassing ? 'border-emerald-200 dark:border-emerald-900' : 'border-red-200 dark:border-red-900'
                    }`}
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        {/* Left: Devoir info */}
                        <div className="flex-1 space-y-3">
                          <div className="flex items-start gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                              isPassing
                                ? 'bg-emerald-100 dark:bg-emerald-900/40'
                                : 'bg-red-100 dark:bg-red-900/40'
                            }`}>
                              <Sparkles className={`h-5 w-5 ${
                                isPassing ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                              }`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-base font-semibold leading-tight">{devoir.titre}</h3>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {devoir.uniteEnseignement.code} — {devoir.uniteEnseignement.nom}
                              </p>
                            </div>
                          </div>

                          {/* Meta */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-[52px]">
                            <Badge variant="outline" className={`text-xs ${getTypeSeanceBadgeClasses(devoir.typeSeance)}`}>
                              {getTypeSeanceLabel(devoir.typeSeance)}
                            </Badge>
                            <Badge variant="outline" className={`text-xs ${statutInfo.classes}`}>
                              {statutInfo.icon}
                              {statutInfo.label}
                            </Badge>
                          </div>

                          {/* Grade display */}
                          {soumission.note !== null && (
                            <div className="pl-[52px]">
                              <div className={`rounded-lg border p-4 ${
                                isPassing
                                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
                                  : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20'
                              }`}>
                                <div className="flex items-center gap-4">
                                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${
                                    isPassing
                                      ? 'bg-emerald-100 dark:bg-emerald-900/40'
                                      : 'bg-red-100 dark:bg-red-900/40'
                                  }`}>
                                    <span className={`text-lg font-bold ${
                                      isPassing ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                                    }`}>
                                      {soumission.note.toFixed(1)}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      Note : {soumission.note.toFixed(1)} / {devoir.noteMax}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{notePercent}%</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* AI feedback */}
                          {soumission.noteIA !== null && soumission.noteIA !== undefined && (
                            <div className="pl-[52px]">
                              <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/20 p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                  <span className="text-xs font-medium text-purple-800 dark:text-purple-300">
                                    Évaluation IA : {soumission.noteIA.toFixed(1)}/{devoir.noteMax}
                                  </span>
                                </div>
                                {soumission.justificationIA && (
                                  <p className="text-xs text-purple-700 dark:text-purple-400 whitespace-pre-wrap">
                                    {soumission.justificationIA}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Teacher comment */}
                          {soumission.commentaireEnseignant && (
                            <div className="pl-[52px]">
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 p-3">
                                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">
                                  Commentaire de l&apos;enseignant
                                </p>
                                <p className="text-sm">{soumission.commentaireEnseignant}</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Action button */}
                        <div className="shrink-0 sm:ml-4">
                          <Button
                            variant="outline"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                            onClick={() => handleOpenDetail(devoir)}
                          >
                            <Eye className="h-4 w-4" />
                            Détail
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Submit Dialog ─── */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              {selectedDevoir?.titre ?? 'Soumettre un devoir'}
            </DialogTitle>
            <DialogDescription>
              {selectedDevoir
                ? `${selectedDevoir.uniteEnseignement.code} — ${selectedDevoir.uniteEnseignement.nom} · Date limite : ${formatDateTimeFR(selectedDevoir.dateLimite)}`
                : 'Rédigez votre réponse'}
            </DialogDescription>
          </DialogHeader>

          {selectedDevoir?.consignes && (
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                Consignes
              </p>
              <p className="text-sm text-amber-900 dark:text-amber-300">
                {selectedDevoir.consignes}
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contenu-texte" className="text-sm font-medium">
                Votre réponse <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="contenu-texte"
                placeholder="Écrivez votre réponse ici..."
                value={contenuTexte}
                onChange={(e) => setContenuTexte(e.target.value)}
                className="min-h-[200px] resize-y"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Type className="h-3 w-3" />
                  {contenuTexte.trim() ? contenuTexte.trim().split(/\s+/).length : 0} mot{contenuTexte.trim() && contenuTexte.trim().split(/\s+/).length > 1 ? 's' : ''}
                </span>
                <span>{contenuTexte.length} caractère{contenuTexte.length > 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="commentaire" className="text-sm font-medium">
                Commentaire (optionnel)
              </Label>
              <Textarea
                id="commentaire"
                placeholder="Ajoutez un commentaire pour l'enseignant..."
                value={commentaireEtudiant}
                onChange={(e) => setCommentaireEtudiant(e.target.value)}
                className="min-h-[80px] resize-y"
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => handleSubmit('BROUILLON')}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Sauvegarder en brouillon
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => handleSubmit('SOUMIS')}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Soumettre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              {detailDevoir?.titre ?? 'Détail du devoir'}
            </DialogTitle>
            <DialogDescription>
              {detailDevoir
                ? `${detailDevoir.uniteEnseignement.code} — ${detailDevoir.uniteEnseignement.nom}`
                : 'Détails de votre soumission'}
            </DialogDescription>
          </DialogHeader>

          {detailDevoir && (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-6 pb-4">
                {/* Devoir info */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge
                      variant="outline"
                      className={`text-xs ${getTypeSeanceBadgeClasses(detailDevoir.typeSeance)}`}
                    >
                      {getTypeSeanceLabel(detailDevoir.typeSeance)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-800"
                    >
                      {detailDevoir.noteMax} pts
                    </Badge>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Limite : {formatDateTimeFR(detailDevoir.dateLimite)}
                    </span>
                  </div>

                  {detailDevoir.description && (
                    <p className="text-sm text-muted-foreground">
                      {detailDevoir.description}
                    </p>
                  )}

                  {detailDevoir.consignes && (
                    <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                        Consignes
                      </p>
                      <p className="text-sm text-amber-900 dark:text-amber-300">
                        {detailDevoir.consignes}
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Submission info */}
                {detailDevoir.soumission ? (
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Votre soumission
                    </h4>

                    <div className="flex flex-wrap items-center gap-3">
                      {(() => {
                        const info = getSoumissionStatutBadge(detailDevoir.soumission.statut)
                        return (
                          <Badge variant="outline" className={`text-xs ${info.classes}`}>
                            {info.icon}
                            {info.label}
                          </Badge>
                        )
                      })()}
                      {detailDevoir.soumission.renduAt && (
                        <span className="text-sm text-muted-foreground">
                          Soumis le {formatDateTimeFR(detailDevoir.soumission.renduAt)}
                        </span>
                      )}
                    </div>

                    {/* Grade */}
                    {(detailDevoir.soumission.statut === 'CORRIGE' || detailDevoir.soumission.statut === 'RETOURNE') && (
                      <div className="rounded-lg border bg-muted/30 p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                              {detailDevoir.soumission.note?.toFixed(1) ?? '—'}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              Note : {detailDevoir.soumission.note?.toFixed(1) ?? '—'} / {detailDevoir.noteMax}
                            </p>
                            {detailDevoir.soumission.note !== null && (
                              <p className="text-xs text-muted-foreground">
                                {Math.round((detailDevoir.soumission.note / detailDevoir.noteMax) * 100)}%
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Content */}
                    {detailDevoir.soumission.contenuTexte && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Votre réponse</p>
                        <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap">
                          {detailDevoir.soumission.contenuTexte}
                        </div>
                      </div>
                    )}

                    {/* Student comment */}
                    {detailDevoir.soumission.commentaireEtudiant && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Votre commentaire</p>
                        <div className="rounded-lg border p-3 text-sm bg-muted/30">
                          {detailDevoir.soumission.commentaireEtudiant}
                        </div>
                      </div>
                    )}

                    {/* Teacher comment */}
                    {detailDevoir.soumission.commentaireEnseignant && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          Commentaire de l&apos;enseignant
                        </p>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 p-3 text-sm">
                          {detailDevoir.soumission.commentaireEnseignant}
                        </div>
                      </div>
                    )}

                    {/* AI Evaluation */}
                    {detailDevoir.soumission.noteIA !== null && detailDevoir.soumission.noteIA !== undefined && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Évaluation IA
                        </p>
                        <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/20 p-3">
                          <p className="text-sm font-medium text-purple-800 dark:text-purple-300 mb-1">
                            Note IA : {detailDevoir.soumission.noteIA.toFixed(1)}/{detailDevoir.noteMax}
                          </p>
                          {detailDevoir.soumission.justificationIA && (
                            <p className="text-xs text-purple-700 dark:text-purple-400 whitespace-pre-wrap">
                              {detailDevoir.soumission.justificationIA}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <AlertTriangle className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Vous n&apos;avez pas encore soumis ce devoir.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailDialogOpen(false)}
            >
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
