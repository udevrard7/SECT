'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  Clock,
  Send,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Eye,
  Sparkles,
  Upload,
  X,
  PlusCircle,
  Inbox,
  CalendarDays,
  Award,
  RefreshCw,
  Trash2,
  FileWarning,
  Info,
  ListChecks,
  Settings2,
  Paperclip,
  GraduationCap,
  Edit3,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  EntityCard,
  GlassModal,
  PulseSkeleton,
  ProgressRing,
  RewardToast,
} from '@/components/ds'
import { toast } from 'sonner'
import type {
  Devoir,
  Soumission,
  TypeSeance,
  StatutSoumission,
  StatutIA,
} from '@/lib/devoirs-types'

// ═══════════════════════════════════════════
//  CONSTANTS & UTILITIES
// ═══════════════════════════════════════════

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

function formatDateFR(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (isNaN(d.getTime())) return '—'
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`
}

function formatDateTimeFR(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (isNaN(d.getTime())) return '—'
  const hours = d.getHours().toString().padStart(2, '0')
  const minutes = d.getMinutes().toString().padStart(2, '0')
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()} à ${hours}h${minutes}`
}

function isOverdue(dateLimite: string): boolean {
  return new Date(dateLimite) < new Date()
}

function getTimeRemaining(dateLimite: string): {
  text: string
  urgent: boolean
  overdue: boolean
} {
  const now = new Date()
  const deadline = new Date(dateLimite)
  const diff = deadline.getTime() - now.getTime()
  if (diff <= 0) return { text: 'Échu', urgent: true, overdue: true }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 7) return { text: `${days}j restants`, urgent: false, overdue: false }
  if (days > 0) return { text: `${days}j ${hours}h`, urgent: days <= 2, overdue: false }
  if (hours > 0) return { text: `${hours}h`, urgent: true, overdue: false }
  return { text: '< 1h', urgent: true, overdue: false }
}

function bytesToMo(bytes: number): number {
  if (!bytes || bytes <= 0) return 0
  return Math.round((bytes / (1024 * 1024)) * 10) / 10
}

/** Tente de parser un JSON string `fichiersSoumis` en tableau de clés. */
function parseFichiersSoumis(fichiersSoumis: string | null): string[] {
  if (!fichiersSoumis) return []
  try {
    const parsed = JSON.parse(fichiersSoumis)
    if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === 'string')
    if (typeof parsed === 'string') return [parsed]
  } catch {
    // Si c'est juste une string non-JSON, on la retourne telle quelle
    if (fichiersSoumis.trim()) return [fichiersSoumis.trim()]
  }
  return []
}

/** Récupère un nom de fichier lisible depuis une clé R2 (ex: "devoirs/123/file.pdf"). */
function prettyKey(key: string): string {
  const parts = key.split('/')
  return parts[parts.length - 1] || key
}

function statutSoumissionBadge(statut: StatutSoumission) {
  switch (statut) {
    case 'BROUILLON':
      return 'border-border bg-muted text-muted-foreground'
    case 'SOUMIS':
      return 'border-info/30 bg-info/15 text-info'
    case 'CORRIGE':
      return 'border-success/30 bg-success/15 text-success-text'
    case 'RETOURNE':
      return 'border-secondary/30 bg-secondary/15 text-secondary'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

function statutIaConfig(statutIA: StatutIA | undefined) {
  switch (statutIA) {
    case 'EN_ATTENTE':
      return { label: 'IA en attente', badge: 'border-muted bg-muted text-muted-foreground', spinner: false }
    case 'EN_COURS':
      return { label: 'IA en cours…', badge: 'border-info/30 bg-info/15 text-info', spinner: true }
    case 'TERMINE':
      return { label: 'IA terminée', badge: 'border-success/30 bg-success/15 text-success-text', spinner: false }
    case 'ERREUR':
      return { label: 'IA en erreur', badge: 'border-destructive/30 bg-destructive/15 text-destructive', spinner: false }
    default:
      return { label: 'IA non demandée', badge: 'border-border bg-muted text-muted-foreground', spinner: false }
  }
}

function typeSeanceBadge(type: string) {
  switch (type) {
    case 'CM':
      return 'border-info/40 bg-info/10 text-info'
    case 'TD':
      return 'border-primary/40 bg-primary/10 text-primary-text'
    case 'TP':
      return 'border-secondary/40 bg-secondary/10 text-secondary'
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

function typeSeanceIcon(type: string) {
  switch (type) {
    case 'CM':
      return BookOpen
    case 'TD':
      return ListChecks
    case 'TP':
      return Settings2
    default:
      return BookOpen
  }
}

// ═══════════════════════════════════════════
//  MAIN COMPONENT — Page étudiant "Mes Devoirs"
// ═══════════════════════════════════════════

export function MesDevoirsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'afaire' | 'soumis' | 'corriges'>('afaire')

  // ─── Dialog soumission ───
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [submitTarget, setSubmitTarget] = useState<Devoir | null>(null)
  const [submitContenu, setSubmitContenu] = useState('')
  const [submitCommentaire, setSubmitCommentaire] = useState('')
  const [submitFichiers, setSubmitFichiers] = useState<File[]>([])
  const [submitFichiersKeys, setSubmitFichiersKeys] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Dialog détail (corrigé) ───
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState<Devoir | null>(null)

  // ─── Reward toast (soumission réussie) ───
  const [rewardToast, setRewardToast] = useState<{ title: string; description?: string } | null>(null)

  // ═══════════════════════════════════════
  //  DATA FETCHING
  // ═══════════════════════════════════════

  const devoirsQuery = useQuery<{ devoirs: Devoir[]; total: number }>({
    queryKey: ['mes-devoirs', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/devoirs?etudiantId=${user!.id}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur serveur')
      }
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const devoirs = devoirsQuery.data?.devoirs ?? []
  const isLoading = devoirsQuery.isLoading
  const loadError = devoirsQuery.error
    ? devoirsQuery.error instanceof Error
      ? devoirsQuery.error.message
      : 'Impossible de charger vos devoirs'
    : null

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['mes-devoirs', user?.id] })

  // ═══════════════════════════════════════
  //  PARTITION PAR STATUT DE SOUMISSION
  // ═══════════════════════════════════════

  const { aFaire, soumis, corriges } = useMemo(() => {
    const aFaire: Devoir[] = []
    const soumis: Devoir[] = []
    const corriges: Devoir[] = []
    for (const d of devoirs) {
      // Un devoir ARCHIVE n'est jamais visible étudiant
      if (d.statut === 'ARCHIVE') continue
      const sStatut = d.soumission?.statut
      if (sStatut === 'CORRIGE' || sStatut === 'RETOURNE') {
        corriges.push(d)
      } else if (sStatut === 'SOUMIS') {
        soumis.push(d)
      } else {
        // Pas de soumission OU brouillon → à faire (si PUBLIE ou FERME)
        if (d.statut === 'PUBLIE' || d.statut === 'FERME') {
          aFaire.push(d)
        }
      }
    }
    // Tri : plus urgent en premier
    const sortByDeadline = (a: Devoir, b: Devoir) =>
      new Date(a.dateLimite).getTime() - new Date(b.dateLimite).getTime()
    aFaire.sort(sortByDeadline)
    soumis.sort(sortByDeadline)
    // Corrigés : plus récemment corrigés en premier (par updatedAt de soumission)
    corriges.sort(
      (a, b) =>
        new Date(b.soumission?.updatedAt ?? 0).getTime() -
        new Date(a.soumission?.updatedAt ?? 0).getTime(),
    )
    return { aFaire, soumis, corriges }
  }, [devoirs])

  // ─── KPIs locaux ───
  const kpis = useMemo(() => {
    const enRetard = aFaire.filter((d) => isOverdue(d.dateLimite)).length
    const brouillons = devoirs.filter((d) => d.soumission?.statut === 'BROUILLON').length
    const notes = corriges
      .map((d) => d.soumission?.note)
      .filter((n): n is number => n !== null && n !== undefined)
    const moyenne = notes.length > 0 ? notes.reduce((a, b) => a + b, 0) / notes.length : null
    return { enRetard, brouillons, moyenne, notesCount: notes.length }
  }, [aFaire, corriges, devoirs])

  // ═══════════════════════════════════════
  //  SUBMIT DIALOG
  // ═══════════════════════════════════════

  const openSubmitDialog = (devoir: Devoir) => {
    setSubmitTarget(devoir)
    setSubmitContenu(devoir.soumission?.contenuTexte ?? '')
    setSubmitCommentaire(devoir.soumission?.commentaireEtudiant ?? '')
    // Récupère les noms de fichiers déjà soumis (pour réaffichage, mais on ne peut pas re-upload)
    setSubmitFichiers([])
    setSubmitFichiersKeys(parseFichiersSoumis(devoir.soumission?.fichiersSoumis ?? null))
    setSubmitDialogOpen(true)
  }

  const closeSubmitDialog = () => {
    setSubmitDialogOpen(false)
    setSubmitTarget(null)
    setSubmitContenu('')
    setSubmitCommentaire('')
    setSubmitFichiers([])
    setSubmitFichiersKeys([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!submitTarget) return
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    const maxFiles = submitTarget.nbMaxFichiers || 5
    const maxSizeBytes = submitTarget.tailleMaxFichier || 10 * 1024 * 1024
    const totalExisting = submitFichiers.length + submitFichiersKeys.length

    if (totalExisting + files.length > maxFiles) {
      toast.error('Trop de fichiers', {
        description: `Maximum ${maxFiles} fichier(s) autorisé(s).`,
      })
      return
    }

    const valid: File[] = []
    for (const f of files) {
      if (f.size > maxSizeBytes) {
        toast.error('Fichier trop volumineux', {
          description: `"${f.name}" dépasse la taille max (${bytesToMo(maxSizeBytes)} Mo).`,
        })
        continue
      }
      valid.push(f)
    }
    setSubmitFichiers((prev) => [...prev, ...valid])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (idx: number) => {
    setSubmitFichiers((prev) => prev.filter((_, i) => i !== idx))
  }

  const removeExistingFile = (idx: number) => {
    setSubmitFichiersKeys((prev) => prev.filter((_, i) => i !== idx))
  }

  /**
   * Upload un fichier vers R2 via URL présignée.
   * 1. POST /api/soumissions/presign-upload → { uploadUrl, key, ... }
   * 2. PUT direct vers uploadUrl avec le contenu du fichier
   * 3. Stocke la clé dans fichiersSoumisKeys
   */
  const uploadOneFile = async (file: File, devoirId: string): Promise<string | null> => {
    try {
      const presignRes = await fetch('/api/soumissions/presign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          devoirId,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      })
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur de présignature')
      }
      const { uploadUrl, key } = await presignRes.json()

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!putRes.ok) {
        throw new Error(`Upload R2 échoué (${putRes.status})`)
      }
      return key
    } catch (err) {
      toast.error('Upload échoué', {
        description: `"${file.name}" : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
      })
      return null
    }
  }

  const handleSubmit = async (mode: 'BROUILLON' | 'SOUMIS') => {
    if (!submitTarget || !user?.id) return
    if (mode === 'SOUMIS' && !submitContenu.trim() && submitFichiers.length === 0 && submitFichiersKeys.length === 0) {
      toast.error('Contenu requis', {
        description: 'Ajoutez du texte ou un fichier avant de soumettre.',
      })
      return
    }
    setIsSubmitting(true)
    try {
      // Upload des nouveaux fichiers vers R2
      let allKeys = [...submitFichiersKeys]
      if (submitFichiers.length > 0) {
        setIsUploading(true)
        for (const f of submitFichiers) {
          const key = await uploadOneFile(f, submitTarget.id)
          if (key) allKeys.push(key)
        }
        setIsUploading(false)
      }

      const existingSoumissionId = submitTarget.soumission?.id
      const body: Record<string, unknown> = {
        devoirId: submitTarget.id,
        etudiantId: user.id,
        contenuTexte: submitContenu.trim() || null,
        commentaireEtudiant: submitCommentaire.trim() || null,
        fichiersSoumis: allKeys.length > 0 ? JSON.stringify(allKeys) : null,
        statut: mode,
      }

      let res: Response
      if (existingSoumissionId) {
        // PATCH la soumission existante
        res = await fetch(`/api/soumissions/${existingSoumissionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        // POST création
        res = await fetch('/api/soumissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Erreur lors de l'enregistrement")
      }

      if (mode === 'SOUMIS') {
        toast.success('Devoir soumis !', {
          description: 'Votre enseignant sera notifié.',
        })
        setRewardToast({
          title: 'Devoir soumis !',
          description: 'Bonne chance, l\'enseignant vous notifiera après correction.',
        })
      } else {
        toast.success('Brouillon enregistré', {
          description: 'Pensez à soumettre avant la date limite.',
        })
      }
      closeSubmitDialog()
      await refresh()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
      setIsUploading(false)
    }
  }

  const openDetailDialog = (devoir: Devoir) => {
    setDetailTarget(devoir)
    setDetailDialogOpen(true)
  }

  // ═══════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ─── Header hero avec kente ─── */}
      <header className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="ds-kente-strip" aria-hidden />
        <div className="ds-kente-pattern px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
                  <BookOpen className="h-7 w-7 text-primary-text" />
                </div>
                <span className="absolute -right-1 -top-1 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary/50 opacity-75" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-primary" />
                </span>
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Mes Devoirs
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Consultez et soumettez vos devoirs TD/TP en ligne.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {kpis.enRetard > 0 && (
                    <Badge variant="outline" className="gap-1.5 border-destructive/30 bg-destructive/15 px-2.5 py-1 text-destructive">
                      <FileWarning className="h-3 w-3" />
                      {kpis.enRetard} en retard
                    </Badge>
                  )}
                  {kpis.brouillons > 0 && (
                    <Badge variant="outline" className="gap-1.5 border-warning/30 bg-warning/15 px-2.5 py-1 text-warning">
                      <Save className="h-3 w-3" />
                      {kpis.brouillons} brouillon{kpis.brouillons > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {kpis.moyenne !== null && (
                    <Badge variant="outline" className="gap-1.5 border-success/30 bg-success/15 px-2.5 py-1 text-success-text">
                      <Award className="h-3 w-3" />
                      Moy. {kpis.moyenne.toFixed(2)}/20
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refresh()} aria-label="Rafraîchir">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Actualiser
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Error ─── */}
      {loadError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-2 text-sm font-medium text-destructive">Erreur de chargement</p>
            <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => refresh()} className="mt-3">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'afaire' | 'soumis' | 'corriges')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="afaire" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              À faire
              {aFaire.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary-text">
                  {aFaire.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="soumis" className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Soumis
              {soumis.length > 0 && (
                <span className="ml-1 rounded-full bg-info/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-info">
                  {soumis.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="corriges" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Corrigés
              {corriges.length > 0 && (
                <span className="ml-1 rounded-full bg-success/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-success-text">
                  {corriges.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ─── À FAIRE ─── */}
          <TabsContent value="afaire" className="space-y-4">
            {isLoading ? (
              <DevoirSkeletonGrid />
            ) : aFaire.length === 0 ? (
              <EmptyStateTab
                icon={CalendarDays}
                title="Aucun devoir à faire"
                description="Vous êtes à jour ! Les nouveaux devoirs publiés par vos enseignants apparaîtront ici."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {aFaire.map((devoir, idx) => (
                  <DevoirCardStudent
                    key={devoir.id}
                    devoir={devoir}
                    index={idx}
                    mode="afaire"
                    onSubmit={() => openSubmitDialog(devoir)}
                    onViewDetail={() => openSubmitDialog(devoir)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── SOUMIS ─── */}
          <TabsContent value="soumis" className="space-y-4">
            {isLoading ? (
              <DevoirSkeletonGrid />
            ) : soumis.length === 0 ? (
              <EmptyStateTab
                icon={Inbox}
                title="Aucune soumission en attente"
                description="Vos soumissions en attente de correction apparaîtront ici."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {soumis.map((devoir, idx) => (
                  <DevoirCardStudent
                    key={devoir.id}
                    devoir={devoir}
                    index={idx}
                    mode="soumis"
                    onSubmit={() => openSubmitDialog(devoir)}
                    onViewDetail={() => openSubmitDialog(devoir)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── CORRIGÉS ─── */}
          <TabsContent value="corriges" className="space-y-4">
            {isLoading ? (
              <DevoirSkeletonGrid />
            ) : corriges.length === 0 ? (
              <EmptyStateTab
                icon={Award}
                title="Aucun devoir corrigé"
                description="Vos devoirs corrigés par l'enseignant apparaîtront ici avec votre note et les commentaires."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {corriges.map((devoir, idx) => (
                  <DevoirCardStudent
                    key={devoir.id}
                    devoir={devoir}
                    index={idx}
                    mode="corriges"
                    onSubmit={() => openSubmitDialog(devoir)}
                    onViewDetail={() => openDetailDialog(devoir)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* ─── Dialog soumission ─── */}
      <SubmitDialog
        open={submitDialogOpen}
        onClose={closeSubmitDialog}
        devoir={submitTarget}
        contenu={submitContenu}
        setContenu={setSubmitContenu}
        commentaire={submitCommentaire}
        setCommentaire={setSubmitCommentaire}
        fichiers={submitFichiers}
        existingFichiersKeys={submitFichiersKeys}
        fileInputRef={fileInputRef}
        onFileSelect={handleFileSelect}
        onRemoveFile={removeFile}
        onRemoveExistingFile={removeExistingFile}
        isSubmitting={isSubmitting}
        isUploading={isUploading}
        onSubmit={handleSubmit}
      />

      {/* ─── Dialog détail (corrigé) ─── */}
      <DetailDialog open={detailDialogOpen} onClose={() => setDetailDialogOpen(false)} devoir={detailTarget} />

      {/* ─── RewardToast (soumission réussie) ─── */}
      <RewardToast
        open={!!rewardToast}
        onClose={() => setRewardToast(null)}
        title={rewardToast?.title ?? ''}
        description={rewardToast?.description}
        tier="gold"
        duration={3500}
      />
    </div>
  )
}

// ═══════════════════════════════════════════
//  SOUS-COMPOSANTS
// ═══════════════════════════════════════════

function DevoirSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <PulseSkeleton key={i} className="h-64 w-full" variant="card" />
      ))}
    </div>
  )
}

function EmptyStateTab({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <Card className="border-dashed border-border bg-card">
      <CardContent className="ds-kente-pattern flex flex-col items-center justify-center p-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
          <Icon className="h-7 w-7 text-primary-text" />
        </div>
        <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function DevoirCardStudent({
  devoir,
  index,
  mode,
  onSubmit,
  onViewDetail,
}: {
  devoir: Devoir
  index: number
  mode: 'afaire' | 'soumis' | 'corriges'
  onSubmit: () => void
  onViewDetail: () => void
}) {
  const TypeIcon = typeSeanceIcon(devoir.typeSeance)
  const time = getTimeRemaining(devoir.dateLimite)
  const overdue = isOverdue(devoir.dateLimite)
  const soumission = devoir.soumission as Partial<Soumission> | null
  const soumissionStatut = soumission?.statut as StatutSoumission | undefined

  // Badge variant selon le mode
  let badge: { label: string; variant: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' } | undefined
  if (mode === 'afaire') {
    if (overdue) {
      badge = { label: 'En retard', variant: 'danger' }
    } else if (time.urgent) {
      badge = { label: 'Bientôt', variant: 'warning' }
    } else {
      badge = { label: devoir.statut === 'FERME' ? 'Fermé' : 'À faire', variant: 'primary' }
    }
  } else if (mode === 'soumis') {
    badge = { label: 'En attente', variant: 'warning' }
  } else if (mode === 'corriges') {
    badge = { label: soumissionStatut === 'RETOURNE' ? 'Rendu' : 'Corrigé', variant: 'success' }
  }

  // Note (mode corrigé)
  const note = soumission?.note ?? null
  const noteMax = devoir.noteMax
  const percent = note !== null ? Math.min(100, (note / noteMax) * 100) : 0
  const noteAccent = percent >= 80 ? 'success' : percent >= 50 ? 'warning' : 'danger'

  return (
    <EntityCard
      title={devoir.titre}
      subtitle={`${devoir.UniteEnseignement?.code ?? '—'} — ${devoir.UniteEnseignement?.nom ?? ''}`}
      thumbnailIcon={TypeIcon}
      badge={badge}
      meta={`Prof. ${devoir.User?.name ?? '—'} · ${noteMax} pts`}
      index={index}
    >
      {/* Tags type + statut soumission */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={`text-[10px] gap-0.5 py-0 ${typeSeanceBadge(devoir.typeSeance)}`}>
          {devoir.typeSeance}
        </Badge>
        {soumissionStatut && (
          <Badge variant="outline" className={`text-[10px] gap-0.5 py-0 ${statutSoumissionBadge(soumissionStatut)}`}>
            {soumissionStatut}
          </Badge>
        )}
        {devoir.renduFichiers && (
          <Badge variant="outline" className="text-[10px] gap-0.5 py-0 border-info/30 bg-info/10 text-info">
            <Paperclip className="h-2.5 w-2.5" />
            Fichiers
          </Badge>
        )}
      </div>

      {/* Échéance + note (mode corrigé) */}
      <div className="mt-2 flex items-center justify-between gap-2">
        {mode === 'corriges' && note !== null ? (
          <div className="flex items-center gap-2">
            <ProgressRing
              value={percent}
              size={48}
              strokeWidth={5}
              accent={noteAccent}
              label={note.toFixed(1)}
              showPercent={false}
              sublabel={`/${noteMax}`}
            />
            <div className="text-xs">
              <p className="font-semibold text-success-text">Note attribuée</p>
              <p className="text-muted-foreground">
                {soumissionStatut === 'RETOURNE' ? 'Rendue' : 'Corrigée'}
              </p>
            </div>
          </div>
        ) : (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              overdue ? 'text-destructive' : time.urgent ? 'text-warning' : 'text-muted-foreground'
            }`}
          >
            <Clock className="h-3 w-3" />
            {mode === 'afaire' ? time.text : `Échéance ${formatDateFR(devoir.dateLimite)}`}
          </span>
        )}
        {devoir.soumission?.renduAt && mode !== 'corriges' && (
          <span className="text-[11px] text-muted-foreground" title="Date de rendu">
            Rendu le {formatDateFR(devoir.soumission.renduAt)}
          </span>
        )}
      </div>

      {/* IA status (mode corrigé) */}
      {mode === 'corriges' && soumission?.statutIA === 'TERMINE' && soumission.noteIA !== null && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-info">
          <Sparkles className="h-3 w-3" />
          Note IA proposée : <span className="font-semibold">{soumission.noteIA}/{noteMax}</span>
        </div>
      )}
      {mode === 'corriges' && soumission?.statutIA === 'ERREUR' && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertTriangle className="h-3 w-3" />
          Évaluation IA échouée
        </div>
      )}

      {/* Action button */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        {mode === 'afaire' && (
          <Button size="sm" className="w-full" onClick={onSubmit}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {soumission?.statut === 'BROUILLON' ? 'Reprendre le brouillon' : 'Soumettre'}
          </Button>
        )}
        {mode === 'soumis' && (
          <>
            <Button variant="outline" size="sm" className="flex-1" onClick={onViewDetail}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Voir ma copie
            </Button>
            {!overdue && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={onSubmit}>
                <Edit3 className="mr-1 h-3 w-3" />
                Modifier
              </Button>
            )}
          </>
        )}
        {mode === 'corriges' && (
          <Button size="sm" className="w-full" onClick={onViewDetail}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Voir le détail
          </Button>
        )}
      </div>
    </EntityCard>
  )
}

// Icône "Edit" : on réutilise Edit3 du module lucide-react directement dans le JSX.

// ─── Dialog soumission ───
function SubmitDialog({
  open,
  onClose,
  devoir,
  contenu,
  setContenu,
  commentaire,
  setCommentaire,
  fichiers,
  existingFichiersKeys,
  fileInputRef,
  onFileSelect,
  onRemoveFile,
  onRemoveExistingFile,
  isSubmitting,
  isUploading,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  devoir: Devoir | null
  contenu: string
  setContenu: (v: string) => void
  commentaire: string
  setCommentaire: (v: string) => void
  fichiers: File[]
  existingFichiersKeys: string[]
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveFile: (idx: number) => void
  onRemoveExistingFile: (idx: number) => void
  isSubmitting: boolean
  isUploading: boolean
  onSubmit: (mode: 'BROUILLON' | 'SOUMIS') => void
}) {
  if (!devoir) return null
  const time = getTimeRemaining(devoir.dateLimite)
  const overdue = isOverdue(devoir.dateLimite)
  const maxMo = bytesToMo(devoir.tailleMaxFichier)
  const totalFiles = fichiers.length + existingFichiersKeys.length

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={`Soumettre : ${devoir.titre}`}
      description={`${devoir.UniteEnseignement?.code} — Prof. ${devoir.User?.name ?? '—'}`}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onSubmit.bind(null, 'BROUILLON')} disabled={isSubmitting || isUploading}>
            <Save className="mr-1.5 h-4 w-4" />
            Brouillon
          </Button>
          <Button onClick={onSubmit.bind(null, 'SOUMIS')} disabled={isSubmitting || isUploading}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Envoi…
              </>
            ) : (
              <>
                <Send className="mr-1.5 h-4 w-4" />
                Soumettre
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Bandeau échéance */}
        <div
          className={`flex items-center gap-2 rounded-md border p-3 text-sm ${
            overdue
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : time.urgent
                ? 'border-warning/30 bg-warning/5 text-warning'
                : 'border-info/30 bg-info/5 text-info'
          }`}
        >
          {overdue ? <FileWarning className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          <span className="font-medium">
            {overdue ? 'Échéance dépassée' : `Échéance : ${formatDateTimeFR(devoir.dateLimite)}`}
          </span>
          <span className="ml-auto text-xs">{time.text}</span>
        </div>

        {/* Consignes */}
        {devoir.consignes && (
          <div className="space-y-1.5">
            <Label>Consignes</Label>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {devoir.consignes}
            </div>
          </div>
        )}

        {/* Description */}
        {devoir.description && !devoir.consignes && (
          <div className="space-y-1.5">
            <Label>Description</Label>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">{devoir.description}</div>
          </div>
        )}

        <Separator />

        {/* Contenu texte */}
        <div className="space-y-1.5">
          <Label htmlFor="submit-contenu">
            Votre travail {devoir.renduFichiers ? '(optionnel si fichiers)' : '(obligatoire)'}
          </Label>
          <Textarea
            id="submit-contenu"
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder="Saisissez votre réponse ici…"
            rows={8}
            className="resize-y"
          />
          <p className="text-[11px] text-muted-foreground">
            {contenu.length} caractère{contenu.length > 1 ? 's' : ''}
          </p>
        </div>

        {/* Upload fichiers (si renduFichiers truthy) */}
        {devoir.renduFichiers && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fichiers ({totalFiles}/{devoir.nbMaxFichiers})</Label>
              <span className="text-[11px] text-muted-foreground">Max {maxMo} Mo / fichier</span>
            </div>

            {/* Drop zone */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={totalFiles >= devoir.nbMaxFichiers}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-6 text-center transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Ajouter un fichier"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">Cliquez pour ajouter un fichier</span>
              <span className="text-[11px] text-muted-foreground">
                PDF, image, document… max {maxMo} Mo par fichier
              </span>
            </button>
            <Input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onFileSelect}
              aria-label="Sélectionner des fichiers"
            />

            {/* Liste nouveaux fichiers */}
            {fichiers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Nouveaux fichiers
                </p>
                {fichiers.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-sm"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-[11px] text-muted-foreground">({bytesToMo(f.size)} Mo)</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => onRemoveFile(idx)}
                      aria-label={`Retirer ${f.name}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Liste fichiers déjà soumis (brouillon existant) */}
            {existingFichiersKeys.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Fichiers déjà soumis
                </p>
                {existingFichiersKeys.map((key, idx) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2 text-sm"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{prettyKey(key)}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => onRemoveExistingFile(idx)}
                      aria-label={`Retirer ${key}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {isUploading && (
              <div className="flex items-center gap-2 text-xs text-info">
                <Loader2 className="h-3 w-3 animate-spin" />
                Upload vers Cloudflare R2…
              </div>
            )}
          </div>
        )}

        {/* Commentaire étudiant */}
        <div className="space-y-1.5">
          <Label htmlFor="submit-comm">Commentaire pour l'enseignant (optionnel)</Label>
          <Textarea
            id="submit-comm"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Une remarque, une question, un contexte…"
            rows={2}
          />
        </div>

        {/* Info bar */}
        <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 p-2.5 text-[11px] text-info">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p>
            <strong>Brouillon</strong> : enregistré sans envoyer. Vous pourrez reprendre plus tard.<br />
            <strong>Soumettre</strong> : envoie définitif à l'enseignant. Vérifiez bien votre travail.
          </p>
        </div>
      </div>
    </GlassModal>
  )
}

// ─── Dialog détail (corrigé) ───
function DetailDialog({
  open,
  onClose,
  devoir,
}: {
  open: boolean
  onClose: () => void
  devoir: Devoir | null
}) {
  if (!devoir) return null
  const soumission = devoir.soumission as Partial<Soumission> | null
  const note = soumission?.note ?? null
  const noteMax = devoir.noteMax
  const percent = note !== null ? Math.min(100, (note / noteMax) * 100) : 0
  const noteAccent = percent >= 80 ? 'success' : percent >= 50 ? 'warning' : 'danger'
  const iaCfg = statutIaConfig(soumission?.statutIA)

  return (
    <GlassModal open={open} onClose={onClose} title={`Résultat : ${devoir.titre}`} size="lg">
      <div className="space-y-4">
        {/* Header note */}
        <div className="flex items-center gap-4 rounded-md border border-border bg-muted/30 p-4">
          <ProgressRing
            value={percent}
            size={80}
            accent={noteAccent}
            label={note !== null ? note.toFixed(1) : '—'}
            sublabel={`/${noteMax}`}
            showPercent={false}
          />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Votre note</p>
            <p className="font-display text-2xl font-bold">
              {note !== null ? `${note} / ${noteMax}` : 'Non notée'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {soumission?.statut === 'RETOURNE'
                ? `Rendue le ${formatDateTimeFR(soumission.renduAt)}`
                : `Corrigée le ${formatDateTimeFR(soumission?.updatedAt)}`}
            </p>
          </div>
          <Badge variant="outline" className={statutSoumissionBadge(soumission?.statut as StatutSoumission)}>
            {soumission?.statut}
          </Badge>
        </div>

        {/* Note IA */}
        {soumission?.statutIA && soumission.statutIA !== 'EN_ATTENTE' && (
          <div
            className={`rounded-md border p-3 ${
              soumission.statutIA === 'ERREUR'
                ? 'border-destructive/30 bg-destructive/5'
                : 'border-info/30 bg-info/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`gap-1 ${iaCfg.badge}`}>
                  {iaCfg.spinner && <Loader2 className="h-3 w-3 animate-spin" />}
                  <Sparkles className="h-3 w-3" />
                  {iaCfg.label}
                </Badge>
                {soumission.statutIA === 'TERMINE' && soumission.noteIA !== null && (
                  <span className="text-sm font-semibold text-info">
                    Note IA : {soumission.noteIA}/{noteMax}
                  </span>
                )}
              </div>
            </div>
            {soumission.statutIA === 'TERMINE' && soumission.justificationIA && (
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-info">
                  Justification de l'IA
                </p>
                <p className="mt-0.5 text-xs italic text-info/80 whitespace-pre-wrap">
                  {soumission.justificationIA}
                </p>
              </div>
            )}
            {soumission.statutIA === 'ERREUR' && soumission.erreurIA && (
              <p className="mt-2 text-xs text-destructive">{soumission.erreurIA}</p>
            )}
          </div>
        )}

        {/* Commentaire enseignant */}
        {soumission?.commentaireEnseignant && (
          <div className="space-y-1.5">
            <Label>Commentaire de l'enseignant</Label>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {soumission.commentaireEnseignant}
            </div>
          </div>
        )}

        {/* Votre rendu */}
        {soumission?.contenuTexte && (
          <div className="space-y-1.5">
            <Label>Votre travail</Label>
            <div className="max-h-60 overflow-y-auto rounded-md border border-border bg-card p-3 text-sm whitespace-pre-wrap">
              {soumission.contenuTexte}
            </div>
          </div>
        )}

        {/* Fichiers rendus */}
        {soumission?.fichiersSoumis && (
          <div className="space-y-1.5">
            <Label>Fichiers rendus</Label>
            <div className="space-y-1">
              {parseFichiersSoumis(soumission.fichiersSoumis).map((key, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-sm"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-[11px]">{prettyKey(key)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commentaire étudiant */}
        {soumission?.commentaireEtudiant && (
          <div className="space-y-1.5">
            <Label>Votre commentaire</Label>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm italic">
              {soumission.commentaireEtudiant}
            </div>
          </div>
        )}

        {/* Métadonnées */}
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
          <div>
            <p className="text-muted-foreground">Date de rendu</p>
            <p className="font-medium">{formatDateTimeFR(soumission?.renduAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Enseignant</p>
            <p className="font-medium">{devoir.User?.name}</p>
          </div>
        </div>
      </div>
    </GlassModal>
  )
}
