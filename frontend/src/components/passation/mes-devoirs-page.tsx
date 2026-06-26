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
  Eye,
  Sparkles,
  Type,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import {
  Card,
  CardContent,
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
import { EntityCard } from '@/components/ds'

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
      return 'bg-info/10 text-info border-info/20'
    case 'TD':
      return 'bg-success/10 text-success-text border-success/20'
    case 'TP':
      return 'bg-warning/10 text-warning border-warning/20'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

function getSoumissionStatutBadge(statut: string): { label: string; classes: string; icon: React.ReactNode } {
  switch (statut) {
    case 'BROUILLON':
      return {
        label: 'Brouillon',
        classes: 'bg-muted text-muted-foreground border-border',
        icon: <FileText className="h-3 w-3" />,
      }
    case 'SOUMIS':
      return {
        label: 'Soumis',
        classes: 'bg-success/10 text-success-text border-success/20',
        icon: <CheckCircle2 className="h-3 w-3" />,
      }
    case 'CORRIGE':
      return {
        label: 'Corrigé',
        classes: 'bg-secondary/10 text-secondary border-secondary/20',
        icon: <CheckCircle2 className="h-3 w-3" />,
      }
    case 'RETOURNE':
      return {
        label: 'Retourné',
        classes: 'bg-warning/10 text-warning border-warning/20',
        icon: <Eye className="h-3 w-3" />,
      }
    default:
      return {
        label: statut,
        classes: 'bg-muted text-muted-foreground border-border',
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
      {/* ─── Hero canonique ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 ds-logo-glow">
            <BookOpen className="h-6 w-6 text-primary-text" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Mes Devoirs
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Consultez et soumettez vos devoirs
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {overdueCount > 0 && (
            <Badge variant="secondary" className="gap-1.5 bg-destructive/15 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {overdueCount} en retard
            </Badge>
          )}
          {draftCount > 0 && (
            <Badge variant="secondary" className="gap-1.5 bg-warning/15 text-warning">
              <FileText className="h-3.5 w-3.5" />
              {draftCount} brouillon{draftCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* ─── Stats cards ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-l-4 border-l-success">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10">
                <BookOpen className="h-4 w-4 text-success-text" />
              </div>
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums">{devoirsAFaire.length}</p>
                <p className="text-xs text-muted-foreground">À faire</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                <FileText className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums">{draftCount}</p>
                <p className="text-xs text-muted-foreground">Brouillons</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums">{overdueCount}</p>
                <p className="text-xs text-muted-foreground">En retard</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-info">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10">
                <Send className="h-4 w-4 text-info" />
              </div>
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums">{devoirsSoumis.length}</p>
                <p className="text-xs text-muted-foreground">En attente</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Search + Tabs ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
            <TabsTrigger value="a-faire" className="gap-1.5">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">À faire</span>
              <span className="sm:hidden">À faire</span>
              {devoirsAFaire.filter(filterBySearch).length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1 text-[10px] font-bold bg-success/15 text-success-text font-mono tabular-nums">
                  {devoirsAFaire.filter(filterBySearch).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="soumis" className="gap-1.5">
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Soumis</span>
              <span className="sm:hidden">Soumis</span>
              {devoirsSoumis.filter(filterBySearch).length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1 text-[10px] font-bold bg-info/15 text-info font-mono tabular-nums">
                  {devoirsSoumis.filter(filterBySearch).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="corriges" className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Corrigés</span>
              <span className="sm:hidden">Corrigés</span>
              {devoirsCorriges.filter(filterBySearch).length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1 text-[10px] font-bold bg-secondary/15 text-secondary font-mono tabular-nums">
                  {devoirsCorriges.filter(filterBySearch).length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

        {/* ─── À faire tab ─── */}
        <TabsContent value="a-faire">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <EntityCard key={i} loading title="" />
              ))}
            </div>
          ) : devoirsAFaire.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                <BookOpen className="h-10 w-10 text-success-text" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Aucun devoir à faire</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez aucun devoir en attente pour le moment. Les nouveaux devoirs apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {devoirsAFaire.filter(filterBySearch).map((devoir, idx) => {
                const overdue = isOverdue(devoir.dateLimite)
                const timeRemaining = getTimeRemaining(devoir.dateLimite)
                const isDraft = devoir.soumission?.statut === 'BROUILLON'
                const canSubmit = devoir.statut === 'PUBLIE' && !overdue

                const badgeLabel = overdue ? 'En retard' : isDraft ? 'Brouillon' : 'À faire'
                const badgeVariant = overdue ? 'danger' as const : isDraft ? 'warning' as const : 'success' as const
                const thumbnailIcon = overdue ? AlertTriangle : BookOpen

                return (
                  <EntityCard
                    key={devoir.id}
                    index={idx}
                    title={devoir.titre}
                    subtitle={`${devoir.uniteEnseignement.code} — ${devoir.uniteEnseignement.nom}`}
                    thumbnailIcon={thumbnailIcon}
                    badge={{ label: badgeLabel, variant: badgeVariant }}
                    meta={`Limite : ${formatDateTimeFR(devoir.dateLimite)} · ${devoir.noteMax} pts`}
                  >
                    {/* Type seance + time remaining */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${getTypeSeanceBadgeClasses(devoir.typeSeance)}`}
                      >
                        {getTypeSeanceLabel(devoir.typeSeance)}
                      </Badge>
                      {overdue ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {timeRemaining}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 text-success-text" />
                          {timeRemaining}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {devoir.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {devoir.description}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {canSubmit && (
                        <Button
                          size="sm"
                          className="bg-success hover:bg-success/90 gap-1.5"
                          onClick={() => handleOpenSubmit(devoir)}
                        >
                          <Send className="h-4 w-4" />
                          {isDraft ? 'Modifier' : 'Soumettre'}
                        </Button>
                      )}
                      {overdue && !isDraft && (
                        <Button size="sm" variant="outline" disabled>
                          <Clock className="h-4 w-4" />
                          Expiré
                        </Button>
                      )}
                      {devoir.soumission && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-success/30 text-success-text hover:bg-success/10"
                          onClick={() => handleOpenDetail(devoir)}
                        >
                          <Eye className="h-4 w-4" />
                          Détail
                        </Button>
                      )}
                    </div>
                  </EntityCard>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Soumis tab ─── */}
        <TabsContent value="soumis">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <EntityCard key={i} loading title="" />
              ))}
            </div>
          ) : devoirsSoumis.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary/10">
                <CheckCircle2 className="h-10 w-10 text-secondary" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Aucun devoir soumis</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez pas encore soumis de devoir. Vos soumissions apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {devoirsSoumis.filter(filterBySearch).map((devoir, idx) => {
                const soumission = devoir.soumission!
                const statutInfo = getSoumissionStatutBadge(soumission.statut)

                const badgeVariant =
                  soumission.statut === 'SOUMIS' ? 'primary' as const
                  : soumission.statut === 'BROUILLON' ? 'secondary' as const
                  : 'success' as const

                return (
                  <EntityCard
                    key={devoir.id}
                    index={idx}
                    title={devoir.titre}
                    subtitle={`${devoir.uniteEnseignement.code} — ${devoir.uniteEnseignement.nom}`}
                    thumbnailIcon={CheckCircle2}
                    badge={{ label: statutInfo.label, variant: badgeVariant }}
                    meta={
                      soumission.renduAt
                        ? `Soumis le ${formatDateTimeFR(soumission.renduAt)}`
                        : 'En attente de correction'
                    }
                  >
                    {/* Type seance + status badges */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${getTypeSeanceBadgeClasses(devoir.typeSeance)}`}
                      >
                        {getTypeSeanceLabel(devoir.typeSeance)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-xs bg-info/10 text-info border-info/20"
                      >
                        <Clock className="h-3 w-3" />
                        En attente de correction
                      </Badge>
                    </div>

                    {/* Action button */}
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-success/30 text-success-text hover:bg-success/10"
                        onClick={() => handleOpenDetail(devoir)}
                      >
                        <Eye className="h-4 w-4" />
                        Voir le détail
                      </Button>
                    </div>
                  </EntityCard>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Corrigés tab ─── */}
        <TabsContent value="corriges">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <EntityCard key={i} loading title="" />
              ))}
            </div>
          ) : devoirsCorriges.filter(filterBySearch).length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary/10">
                <Sparkles className="h-10 w-10 text-secondary" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Aucun devoir corrigé</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vos devoirs corrigés apparaîtront ici une fois notés par l&apos;enseignant.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {devoirsCorriges.filter(filterBySearch).map((devoir, idx) => {
                const soumission = devoir.soumission!
                const statutInfo = getSoumissionStatutBadge(soumission.statut)
                const notePercent = soumission.note !== null ? Math.round((soumission.note / devoir.noteMax) * 100) : 0
                const isPassing = soumission.note !== null && soumission.note >= devoir.noteMax / 2

                const badgeVariant =
                  soumission.statut === 'CORRIGE' ? 'success' as const
                  : soumission.statut === 'RETOURNE' ? 'warning' as const
                  : 'secondary' as const
                const thumbnailIcon = isPassing ? Sparkles : AlertTriangle

                return (
                  <EntityCard
                    key={devoir.id}
                    index={idx}
                    title={devoir.titre}
                    subtitle={`${devoir.uniteEnseignement.code} — ${devoir.uniteEnseignement.nom}`}
                    thumbnailIcon={thumbnailIcon}
                    progress={soumission.note !== null ? notePercent : undefined}
                    badge={{ label: statutInfo.label, variant: badgeVariant }}
                    meta={
                      soumission.note !== null
                        ? `Note : ${soumission.note.toFixed(1)} / ${devoir.noteMax} · ${notePercent}%`
                        : 'En attente de notation'
                    }
                  >
                    {/* Type seance + status */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${getTypeSeanceBadgeClasses(devoir.typeSeance)}`}>
                        {getTypeSeanceLabel(devoir.typeSeance)}
                      </Badge>
                    </div>

                    {/* Grade display */}
                    {soumission.note !== null && (
                      <div className="mt-3">
                        <div className={`rounded-lg border p-3 ${
                          isPassing
                            ? 'border-success/20 bg-success/15'
                            : 'border-destructive/20 bg-destructive/15'
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                              isPassing ? 'bg-success/10' : 'bg-destructive/10'
                            }`}>
                              <span className={`text-base font-bold ${
                                isPassing ? 'text-success-text' : 'text-destructive'
                              }`}>
                                {soumission.note.toFixed(1)}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs font-medium">
                                Note : {soumission.note.toFixed(1)} / {devoir.noteMax}
                              </p>
                              <p className="text-[11px] text-muted-foreground">{notePercent}%</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* AI feedback */}
                    {soumission.noteIA !== null && soumission.noteIA !== undefined && (
                      <div className="mt-2">
                        <div className="rounded-lg border border-secondary/20 bg-secondary/15 p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Sparkles className="h-3.5 w-3.5 text-secondary" />
                            <span className="text-[11px] font-medium text-secondary">
                              IA : {soumission.noteIA.toFixed(1)}/{devoir.noteMax}
                            </span>
                          </div>
                          {soumission.justificationIA && (
                            <p className="text-[11px] text-secondary line-clamp-3 whitespace-pre-wrap">
                              {soumission.justificationIA}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Teacher comment */}
                    {soumission.commentaireEnseignant && (
                      <div className="mt-2">
                        <div className="rounded-lg border border-success/20 bg-success/15 p-2.5">
                          <p className="text-[11px] font-medium text-success-text mb-1">
                            Commentaire de l&apos;enseignant
                          </p>
                          <p className="text-xs line-clamp-3">{soumission.commentaireEnseignant}</p>
                        </div>
                      </div>
                    )}

                    {/* Action button */}
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-success/30 text-success-text hover:bg-success/10"
                        onClick={() => handleOpenDetail(devoir)}
                      >
                        <Eye className="h-4 w-4" />
                        Détail
                      </Button>
                    </div>
                  </EntityCard>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un devoir…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>
      </div>

      {/* ─── Submit Dialog ─── */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-success-text" />
              {selectedDevoir?.titre ?? 'Soumettre un devoir'}
            </DialogTitle>
            <DialogDescription>
              {selectedDevoir
                ? `${selectedDevoir.uniteEnseignement.code} — ${selectedDevoir.uniteEnseignement.nom} · Date limite : ${formatDateTimeFR(selectedDevoir.dateLimite)}`
                : 'Rédigez votre réponse'}
            </DialogDescription>
          </DialogHeader>

          {selectedDevoir?.consignes && (
            <div className="rounded-lg border bg-warning/10 p-3">
              <p className="text-xs font-medium text-warning mb-1">
                Consignes
              </p>
              <p className="text-sm text-warning">
                {selectedDevoir.consignes}
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contenu-texte" className="text-sm font-medium">
                Votre réponse <span className="text-destructive">*</span>
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
              className="bg-success hover:bg-success/90 gap-1.5"
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
              <BookOpen className="h-5 w-5 text-success-text" />
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
                      className="text-xs bg-muted text-muted-foreground border-border"
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
                    <div className="rounded-lg border bg-warning/10 p-3">
                      <p className="text-xs font-medium text-warning mb-1">
                        Consignes
                      </p>
                      <p className="text-sm text-warning">
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
                      <FileText className="h-4 w-4 text-success-text" />
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
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-success/10">
                            <span className="text-lg font-bold text-success-text">
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
                        <p className="text-xs font-medium text-success-text">
                          Commentaire de l&apos;enseignant
                        </p>
                        <div className="rounded-lg border border-success/20 bg-success/15 p-3 text-sm">
                          {detailDevoir.soumission.commentaireEnseignant}
                        </div>
                      </div>
                    )}

                    {/* AI Evaluation */}
                    {detailDevoir.soumission.noteIA !== null && detailDevoir.soumission.noteIA !== undefined && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-secondary flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Évaluation IA
                        </p>
                        <div className="rounded-lg border border-secondary/20 bg-secondary/15 p-3">
                          <p className="text-sm font-medium text-secondary mb-1">
                            Note IA : {detailDevoir.soumission.noteIA.toFixed(1)}/{detailDevoir.noteMax}
                          </p>
                          {detailDevoir.soumission.justificationIA && (
                            <p className="text-xs text-secondary whitespace-pre-wrap">
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
