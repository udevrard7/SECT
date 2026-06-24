'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Layers,
  Plus,
  BookMarked,
  Users,
  GraduationCap,
  Loader2,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Separator } from '@/components/ui/separator'
import { PulseSkeleton } from '@/components/ds'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

// ─── Types ───

interface FiliereItem {
  id: string
  nom: string
  code: string | null
}

interface UEItem {
  id: string
  code: string
  nom: string
  niveau: string
  filiereId: string
  semestre: number | null
  actif: boolean
  filiere: {
    id: string
    nom: string
    code: string | null
  }
  _count: { affectations: number }
}

interface AffectationItem {
  id: string
  enseignantId: string
  uniteEnseignementId: string
  typeSeance: string
  volumeHeures: number
  statut: string
  enseignant: {
    id: string
    name: string
    email: string
  }
  uniteEnseignement: {
    id: string
    code: string
    nom: string
    nivel: string
    filiereId: string
    filiere: {
      id: string
      nom: string
      code: string | null
    }
  }
}

interface NiveauStats {
  key: string
  label: string
  shortLabel: string
  color: string
  bgColor: string
  borderColor: string
  textColor: string
  darkBgColor: string
  darkBorderColor: string
  darkTextColor: string
  iconBg: string
  darkIconBg: string
  nbFilieres: number
  nbUEs: number
  nbEnseignants: number
  tauxCouverture: number
}

// ─── Niveau configuration ───

const NIVEAU_CONFIG = [
  {
    key: 'L1',
    label: 'L1 - Licence 1ère année',
    shortLabel: 'L1',
    color: 'emerald',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
    textColor: 'text-success',
    darkBgColor: 'dark:bg-success/20',
    darkBorderColor: 'dark:border-success/70',
    darkTextColor: 'dark:text-success/80',
    iconBg: 'bg-success/10',
    darkIconBg: 'dark:bg-success/40',
  },
  {
    key: 'L2',
    label: 'L2 - Licence 2ème année',
    shortLabel: 'L2',
    color: 'teal',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
    textColor: 'text-success',
    darkBgColor: 'dark:bg-success/20',
    darkBorderColor: 'dark:border-success/70',
    darkTextColor: 'dark:text-success/80',
    iconBg: 'bg-success/10',
    darkIconBg: 'dark:bg-success/40',
  },
  {
    key: 'L3',
    label: 'L3 - Licence 3ème année',
    shortLabel: 'L3',
    color: 'cyan',
    bgColor: 'bg-info/10',
    borderColor: 'border-info/30',
    textColor: 'text-info',
    darkBgColor: 'dark:bg-info/20',
    darkBorderColor: 'dark:border-info/70',
    darkTextColor: 'dark:text-info/80',
    iconBg: 'bg-info/10',
    darkIconBg: 'dark:bg-info/40',
  },
  {
    key: 'M1',
    label: 'M1 - Master 1ère année',
    shortLabel: 'M1',
    color: 'amber',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    textColor: 'text-warning',
    darkBgColor: 'dark:bg-warning/20',
    darkBorderColor: 'dark:border-warning/70',
    darkTextColor: 'dark:text-warning/80',
    iconBg: 'bg-warning/10',
    darkIconBg: 'dark:bg-warning/40',
  },
  {
    key: 'M2',
    label: 'M2 - Master 2ème année',
    shortLabel: 'M2',
    color: 'orange',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    textColor: 'text-warning',
    darkBgColor: 'dark:bg-warning/20',
    darkBorderColor: 'dark:border-warning/70',
    darkTextColor: 'dark:text-warning/80',
    iconBg: 'bg-warning/10',
    darkIconBg: 'dark:bg-warning/40',
  },
  {
    key: 'DOCTORAT',
    label: 'Doctorat',
    shortLabel: 'Doctorat',
    color: 'violet',
    bgColor: 'bg-secondary/10',
    borderColor: 'border-secondary/30',
    textColor: 'text-secondary',
    darkBgColor: 'dark:bg-secondary/20',
    darkBorderColor: 'dark:border-secondary/70',
    darkTextColor: 'dark:text-secondary/80',
    iconBg: 'bg-secondary/10',
    darkIconBg: 'dark:bg-secondary/40',
  },
]

// ─── Utility functions ───

function getCoverageColor(rate: number): { bar: string; bg: string; text: string; darkText: string } {
  if (rate >= 80) {
    return {
      bar: 'bg-success',
      bg: 'bg-success/10',
      text: 'text-success',
      darkText: 'dark:text-success/80',
    }
  }
  if (rate >= 50) {
    return {
      bar: 'bg-warning',
      bg: 'bg-warning/10',
      text: 'text-warning',
      darkText: 'dark:text-warning/80',
    }
  }
  return {
    bar: 'bg-destructive',
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    darkText: 'dark:text-destructive/80',
  }
}

function getCoverageBadge(rate: number) {
  if (rate >= 80) {
    return (
      <Badge className="bg-success/10 text-success border-success/30 text-xs">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Bien couvert
      </Badge>
    )
  }
  if (rate >= 50) {
    return (
      <Badge className="bg-warning/10 text-warning border-warning/30 text-xs">
        <Info className="h-3 w-3 mr-1" />
        Partiel
      </Badge>
    )
  }
  return (
    <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
      <AlertTriangle className="h-3 w-3 mr-1" />
      Insuffisant
    </Badge>
  )
}

// ─── Main Component ───

export function NiveauxPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Data state ───
  const [filieres, setFilieres] = useState<FiliereItem[]>([])
  const [ues, setUEs] = useState<UEItem[]>([])
  const [affectations, setAffectations] = useState<AffectationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ─── Dialog state ───
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Detail dialog state ───
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [detailNiveau, setDetailNiveau] = useState<string | null>(null)

  // ─── Add form state ───
  const [addFiliereId, setAddFiliereId] = useState('')
  const [addNiveau, setAddNiveau] = useState('')
  const [addUECode, setAddUECode] = useState('')
  const [addUENom, setAddUENom] = useState('')
  const [addUESemestre, setAddUESemestre] = useState('')
  const [addUEDescription, setAddUEDescription] = useState('')
  const [addUECredits, setAddUECredits] = useState('')
  const [addUEVolumeCM, setAddUEVolumeCM] = useState('0')
  const [addUEVolumeTD, setAddUEVolumeTD] = useState('0')
  const [addUEVolumeTP, setAddUEVolumeTP] = useState('0')

  // ─── Fetch filieres ───
  const fetchFilieres = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      const etabId = user?.etablissementId || user?.etablissement?.id
      if (etabId) params.set('etablissementId', etabId)
      const res = await fetch(`/api/filieres?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setFilieres(
          (data.filieres ?? []).map((f: FiliereItem) => ({
            id: f.id,
            nom: f.nom,
            code: f.code ?? null,
          }))
        )
      }
    } catch {
      // Silent
    }
  }, [user?.etablissementId, user?.etablissement?.id])

  // ─── Fetch UEs ───
  const fetchUEs = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      const etabId = user?.etablissementId || user?.etablissement?.id
      if (etabId) params.set('etablissementId', etabId)
      const res = await fetch(`/api/unites-enseignement?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setUEs(data.unitesEnseignement ?? [])
      }
    } catch {
      // Silent
    }
  }, [user?.etablissementId, user?.etablissement?.id])

  // ─── Fetch affectations ───
  const fetchAffectations = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      const etabId = user?.etablissementId || user?.etablissement?.id
      if (etabId) params.set('etablissementId', etabId)
      const res = await fetch(`/api/affectations?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setAffectations(data.affectations ?? [])
      }
    } catch {
      // Silent
    }
  }, [user?.etablissementId, user?.etablissement?.id])

  // ─── Fetch all data ───
  const fetchAllData = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([fetchFilieres(), fetchUEs(), fetchAffectations()])
    setIsLoading(false)
  }, [fetchFilieres, fetchUEs, fetchAffectations])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // ─── Compute niveau statistics ───
  const niveauStats = useMemo((): NiveauStats[] => {
    return NIVEAU_CONFIG.map((config) => {
      const uesAtNiveau = ues.filter((ue) => ue.niveau === config.key)
      const filiereIdsWithUEs = new Set(uesAtNiveau.map((ue) => ue.filiereId))
      const filieresAtNiveau = filieres.filter(
        (f) => filiereIdsWithUEs.has(f.id)
      )

      // Get UE IDs at this niveau for affectation counting
      const ueIdsAtNiveau = new Set(uesAtNiveau.map((ue) => ue.id))
      const affectationsAtNiveau = affectations.filter((a) =>
        ueIdsAtNiveau.has(a.uniteEnseignementId)
      )

      // Count unique enseignants
      const enseignantIds = new Set(affectationsAtNiveau.map((a) => a.enseignantId))

      // Compute coverage: % of UEs with at least 1 affectation
      const uesWithAffectation = uesAtNiveau.filter(
        (ue) => ue._count?.affectations > 0 || affectationsAtNiveau.some((a) => a.uniteEnseignementId === ue.id)
      )
      const tauxCouverture = uesAtNiveau.length > 0
        ? Math.round((uesWithAffectation.length / uesAtNiveau.length) * 100)
        : 0

      return {
        key: config.key,
        label: config.label,
        shortLabel: config.shortLabel,
        color: config.color,
        bgColor: config.bgColor,
        borderColor: config.borderColor,
        textColor: config.textColor,
        darkBgColor: config.darkBgColor,
        darkBorderColor: config.darkBorderColor,
        darkTextColor: config.darkTextColor,
        iconBg: config.iconBg,
        darkIconBg: config.darkIconBg,
        nbFilieres: filieresAtNiveau.length,
        nbUEs: uesAtNiveau.length,
        nbEnseignants: enseignantIds.size,
        tauxCouverture,
      }
    })
  }, [filieres, ues, affectations])

  // ─── Compute Filière-Niveau matrix ───
  const matrixData = useMemo(() => {
    const niveauKeys = ['L1', 'L2', 'L3', 'M1', 'M2']
    return filieres.map((filiere) => {
      const row: {
        filiere: FiliereItem
        niveaux: Record<string, { nbUEs: number; tauxCouverture: number; ueIds: string[] }>
      } = {
        filiere,
        niveaux: {},
      }
      niveauKeys.forEach((niveau) => {
        const uesAtFN = ues.filter(
          (ue) => ue.filiereId === filiere.id && ue.niveau === niveau
        )
        const ueIds = uesAtFN.map((ue) => ue.id)
        const uesWithAff = uesAtFN.filter(
          (ue) => ue._count?.affectations > 0 || affectations.some((a) => a.uniteEnseignementId === ue.id)
        )
        const taux =
          uesAtFN.length > 0
            ? Math.round((uesWithAff.length / uesAtFN.length) * 100)
            : -1 // -1 means no UEs

        row.niveaux[niveau] = {
          nbUEs: uesAtFN.length,
          tauxCouverture: taux,
          ueIds,
        }
      })
      return row
    })
  }, [filieres, ues, affectations])

  // ─── Open add dialog ───
  const handleOpenAdd = (prefillNiveau?: string, prefillFiliereId?: string) => {
    setAddFiliereId(prefillFiliereId ?? '')
    setAddNiveau(prefillNiveau ?? '')
    setAddUECode('')
    setAddUENom('')
    setAddUESemestre('')
    setAddUEDescription('')
    setAddUECredits('')
    setAddUEVolumeCM('0')
    setAddUEVolumeTD('0')
    setAddUEVolumeTP('0')
    setAddDialogOpen(true)
  }

  // ─── Submit add UE ───
  const handleAddSubmit = async () => {
    if (!addFiliereId) {
      toast.error('Filière manquante', { description: 'Sélectionnez une filière.' })
      return
    }
    if (!addNiveau) {
      toast.error('Niveau manquant', { description: 'Sélectionnez un niveau.' })
      return
    }
    if (!addUECode) {
      toast.error('Code manquant', { description: 'Le code de l\'UE est obligatoire.' })
      return
    }
    if (!addUENom) {
      toast.error('Nom manquant', { description: 'Le nom de l\'UE est obligatoire.' })
      return
    }

    setIsSubmitting(true)
    try {
      const body = {
        code: addUECode,
        nom: addUENom,
        filiereId: addFiliereId,
        niveau: addNiveau,
        semestre: addUESemestre ? parseInt(addUESemestre, 10) : null,
        description: addUEDescription || null,
        creditsECTS: addUECredits ? parseInt(addUECredits, 10) : null,
        volumeHeuresCM: parseInt(addUEVolumeCM, 10) || 0,
        volumeHeuresTD: parseInt(addUEVolumeTD, 10) || 0,
        volumeHeuresTP: parseInt(addUEVolumeTP, 10) || 0,
        actif: true,
      }

      const res = await fetch('/api/unites-enseignement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création')
      }

      toast.success('UE créée', {
        description: `${addUENom} a été ajoutée au niveau ${addNiveau}.`,
      })
      setAddDialogOpen(false)
      await fetchAllData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── View niveau details ───
  const handleViewNiveauDetail = (niveauKey: string) => {
    setDetailNiveau(niveauKey)
    setDetailDialogOpen(true)
  }

  // ─── Compute detail dialog data ───
  const detailData = useMemo(() => {
    if (!detailNiveau) return null
    const uesAtNiveau = ues.filter((ue) => ue.niveau === detailNiveau)
    const ueIds = new Set(uesAtNiveau.map((ue) => ue.id))
    const affectationsAtNiveau = affectations.filter((a) => ueIds.has(a.uniteEnseignementId))

    // Group UEs by filiere
    const byFiliere: Record<string, { filiere: FiliereItem; ues: UEItem[]; affectations: AffectationItem[] }> = {}
    uesAtNiveau.forEach((ue) => {
      if (!byFiliere[ue.filiereId]) {
        byFiliere[ue.filiereId] = {
          filiere: {
            id: ue.filiere.id,
            nom: ue.filiere.nom,
            code: ue.filiere.code,
          },
          ues: [],
          affectations: [],
        }
      }
      byFiliere[ue.filiereId].ues.push(ue)
    })
    affectationsAtNiveau.forEach((a) => {
      const filiereId = a.uniteEnseignement.filiereId
      if (byFiliere[filiereId]) {
        byFiliere[filiereId].affectations.push(a)
      }
    })

    return {
      niveauKey: detailNiveau,
      config: NIVEAU_CONFIG.find((c) => c.key === detailNiveau),
      totalUEs: uesAtNiveau.length,
      totalAffectations: affectationsAtNiveau.length,
      byFiliere: Object.values(byFiliere),
    }
  }, [detailNiveau, ues, affectations])

  // ─── Auto-generate UE code suggestion ───
  const suggestedCode = useMemo(() => {
    if (!addFiliereId || !addNiveau) return ''
    const filiere = filieres.find((f) => f.id === addFiliereId)
    if (!filiere) return ''
    const code = filiere.code || filiere.nom.substring(0, 3).toUpperCase()
    const existingCount = ues.filter(
      (ue) => ue.filiereId === addFiliereId && ue.niveau === addNiveau
    ).length
    return `UE-${code}-${addNiveau}${String(existingCount + 1).padStart(2, '0')}`
  }, [addFiliereId, addNiveau, filieres, ues])

  // ─── Global coverage rate ───
  const globalCoverage = useMemo(() => {
    if (ues.length === 0) return 0
    const uesWithAff = ues.filter(
      (ue) => ue._count?.affectations > 0 || affectations.some((a) => a.uniteEnseignementId === ue.id)
    )
    return Math.round((uesWithAff.length / ues.length) * 100)
  }, [ues, affectations])

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2 font-display">
            <Layers className="h-7 w-7 text-success" />
            Niveaux d&apos;étude
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les niveaux LMD et les unités d&apos;enseignement associées
          </p>
        </div>
        <Button
          className="bg-success hover:bg-success/90"
          onClick={() => handleOpenAdd()}
        >
          <Plus className="h-4 w-4" />
          Ajouter un niveau
        </Button>
      </div>

      {/* ─── Overview: Niveau Cards Grid ─── */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 font-display">
          <GraduationCap className="h-5 w-5 text-success" />
          Vue d&apos;ensemble par niveau
        </h2>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4 space-y-3">
                  <PulseSkeleton className="h-5 w-16" />
                  <PulseSkeleton className="h-4 w-24" />
                  <PulseSkeleton className="h-4 w-20" />
                  <PulseSkeleton className="h-4 w-20" />
                  <PulseSkeleton className="h-2 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {niveauStats.map((stat) => {
              const coverage = getCoverageColor(stat.tauxCouverture)
              return (
                <Card
                  key={stat.key}
                  className={`group cursor-pointer transition-all hover:shadow-md border-l-4 ${stat.borderColor} ${stat.darkBorderColor}`}
                  onClick={() => handleViewNiveauDetail(stat.key)}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Niveau label */}
                    <div className="flex items-center justify-between">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.iconBg} ${stat.darkIconBg}`}
                      >
                        <Layers className={`h-4 w-4 ${stat.textColor} ${stat.darkTextColor}`} />
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <h3 className={`text-sm font-bold ${stat.textColor} ${stat.darkTextColor}`}>
                      {stat.shortLabel}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-tight line-clamp-2">
                      {stat.label}
                    </p>

                    {/* Stats */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <GraduationCap className="h-3 w-3" />
                          Filières
                        </span>
                        <span className="font-semibold">{stat.nbFilieres}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <BookMarked className="h-3 w-3" />
                          UEs
                        </span>
                        <span className="font-semibold">{stat.nbUEs}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Enseignants
                        </span>
                        <span className="font-semibold">{stat.nbEnseignants}</span>
                      </div>
                    </div>

                    {/* Coverage progress bar */}
                    {stat.nbUEs > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Couverture</span>
                          <span className={`font-semibold ${coverage.text} ${coverage.darkText}`}>
                            {stat.tauxCouverture}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${coverage.bar}`}
                            style={{ width: `${stat.tauxCouverture}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {stat.nbUEs === 0 && (
                      <p className="text-xs text-muted-foreground italic">Aucune UE</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Filière-Niveau Matrix ─── */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 font-display">
          <BookMarked className="h-5 w-5 text-success" />
          Matrice Filière × Niveau
        </h2>

        {isLoading ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <PulseSkeleton className="h-10 w-full" />
              <PulseSkeleton className="h-10 w-full" />
              <PulseSkeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ) : filieres.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Layers className="h-8 w-8 text-success" />
            </div>
            <h3 className="mt-4 text-base font-semibold">Aucune filière trouvée</h3>
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
              Vous n&apos;avez aucune filière assignée. La matrice sera disponible une fois vos filières configurées.
            </p>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 min-w-[200px] font-display">
                        Filière
                      </TableHead>
                      {['L1', 'L2', 'L3', 'M1', 'M2'].map((niveau) => (
                        <TableHead key={niveau} className="text-center min-w-[120px]">
                          {niveau}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrixData.map((row) => (
                      <TableRow key={row.filiere.id}>
                        <TableCell className="sticky left-0 bg-background z-10 font-medium">
                          <div className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 text-success" />
                            <div>
                              <p className="text-sm font-medium">{row.filiere.nom}</p>
                              {row.filiere.code && (
                                <p className="text-xs text-muted-foreground font-mono tabular-nums">
                                  {row.filiere.code}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        {['L1', 'L2', 'L3', 'M1', 'M2'].map((niveau) => {
                          const cell = row.niveaux[niveau]
                          if (!cell || cell.nbUEs === 0) {
                            return (
                              <TableCell key={niveau} className="text-center">
                                <button
                                  className="inline-flex items-center justify-center w-full h-8 rounded-md text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                                  title={`Ajouter une UE en ${niveau} pour ${row.filiere.nom}`}
                                  onClick={() => handleOpenAdd(niveau, row.filiere.id)}
                                >
                                  —
                                </button>
                              </TableCell>
                            )
                          }

                          const coverage = getCoverageColor(cell.tauxCouverture)
                          return (
                            <TableCell key={niveau} className="text-center">
                              <button
                                className={`inline-flex flex-col items-center justify-center w-full h-12 rounded-md transition-colors cursor-pointer ${coverage.bg} hover:opacity-80`}
                                title={`${cell.nbUEs} UE${cell.nbUEs > 1 ? 's' : ''} en ${niveau} — Taux de couverture : ${cell.tauxCouverture}%`}
                                onClick={() => handleViewNiveauDetail(niveau)}
                              >
                                <span className={`text-sm font-bold ${coverage.text} ${coverage.darkText} font-mono tabular-nums`}>{cell.nbUEs} UE{cell.nbUEs > 1 ? 's' : ''}
                                </span>
                                <span className={`text-xs ${coverage.text} ${coverage.darkText}`}>
                                  {cell.tauxCouverture}% couvert
                                </span>
                              </button>
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ─── Summary Stats Row ─── */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="border-l-4 border-l-success">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                <Layers className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Niveaux actifs</p>
                <p className="text-xl font-bold font-mono tabular-nums">{niveauStats.filter((s) => s.nbUEs > 0).length}
                  <span className="text-sm text-muted-foreground font-normal"> / 6</span>
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-success">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                <BookMarked className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total UEs</p>
                <p className="text-xl font-bold font-mono tabular-nums">{ues.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-warning">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                <Users className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Enseignants affectés</p>
                <p className="text-xl font-bold font-mono tabular-nums">{new Set(affectations.map((a) => a.enseignantId)).size}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-info">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
                <GraduationCap className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Taux couverture global</p>
                <p className="text-xl font-bold font-mono tabular-nums">{globalCoverage}%</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Add Niveau (UE) Dialog ─── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) setAddDialogOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-success" />
              Ajouter un niveau
            </DialogTitle>
            <DialogDescription>
              Créez une unité d&apos;enseignement pour associer un niveau à une filière.
              Les niveaux LMD (L1 à M2, Doctorat) sont prédéfinis.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Filiere + Niveau selection */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="add-filiere">Filière *</Label>
                <Select value={addFiliereId} onValueChange={setAddFiliereId}>
                  <SelectTrigger id="add-filiere">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    {filieres.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nom}{f.code ? ` (${f.code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-niveau">Niveau *</Label>
                <Select value={addNiveau} onValueChange={setAddNiveau}>
                  <SelectTrigger id="add-niveau">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L1">L1 - Licence 1</SelectItem>
                    <SelectItem value="L2">L2 - Licence 2</SelectItem>
                    <SelectItem value="L3">L3 - Licence 3</SelectItem>
                    <SelectItem value="M1">M1 - Master 1</SelectItem>
                    <SelectItem value="M2">M2 - Master 2</SelectItem>
                    <SelectItem value="DOCTORAT">Doctorat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* UE details */}
            <div className="rounded-lg border border-success/30 bg-success/10 p-3">
              <p className="text-xs text-success font-medium mb-1">
                Unité d&apos;enseignement
              </p>
              <p className="text-xs text-muted-foreground">
                Un niveau est associé à une filière via ses unités d&apos;enseignement. Créez au moins une UE pour ce niveau.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="add-ue-code">Code UE *</Label>
                  {suggestedCode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-success hover:text-success"
                      onClick={() => setAddUECode(suggestedCode)}
                    >
                      Auto: {suggestedCode}
                    </Button>
                  )}
                </div>
                <Input
                  id="add-ue-code"
                  placeholder="Ex: UE-INF301"
                  value={addUECode}
                  onChange={(e) => setAddUECode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-ue-nom">Nom UE *</Label>
                <Input
                  id="add-ue-nom"
                  placeholder="Ex: Algorithmique avancée"
                  value={addUENom}
                  onChange={(e) => setAddUENom(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="add-ue-semestre">Semestre</Label>
                <Select value={addUESemestre} onValueChange={setAddUESemestre}>
                  <SelectTrigger id="add-ue-semestre">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Semestre 1</SelectItem>
                    <SelectItem value="2">Semestre 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-ue-credits">Crédits ECTS</Label>
                <Input
                  id="add-ue-credits"
                  type="number"
                  min="0"
                  placeholder="Ex: 6"
                  value={addUECredits}
                  onChange={(e) => setAddUECredits(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <div className="flex items-center h-9 text-xs text-muted-foreground">
                  {addFiliereId && addNiveau
                    ? `${filieres.find((f) => f.id === addFiliereId)?.nom ?? ''} — ${addNiveau}`
                    : 'Sélectionnez filière + niveau'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-ue-description">Description</Label>
              <Textarea
                id="add-ue-description"
                placeholder="Description de l'unité d'enseignement..."
                value={addUEDescription}
                onChange={(e) => setAddUEDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* Volume horaire */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Volume horaire</Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="add-vol-cm" className="text-xs text-muted-foreground">CM (h)</Label>
                  <Input
                    id="add-vol-cm"
                    type="number"
                    min="0"
                    value={addUEVolumeCM}
                    onChange={(e) => setAddUEVolumeCM(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-vol-td" className="text-xs text-muted-foreground">TD (h)</Label>
                  <Input
                    id="add-vol-td"
                    type="number"
                    min="0"
                    value={addUEVolumeTD}
                    onChange={(e) => setAddUEVolumeTD(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-vol-tp" className="text-xs text-muted-foreground">TP (h)</Label>
                  <Input
                    id="add-vol-tp"
                    type="number"
                    min="0"
                    value={addUEVolumeTP}
                    onChange={(e) => setAddUEVolumeTP(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-success hover:bg-success/90"
              onClick={handleAddSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer l&apos;UE
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Niveau Detail Dialog ─── */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => { if (!open) { setDetailDialogOpen(false); setDetailNiveau(null) } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-success" />
              Détail du niveau {detailData?.config?.label ?? detailNiveau}
            </DialogTitle>
            <DialogDescription>
              Unités d&apos;enseignement et affectations par filière
            </DialogDescription>
          </DialogHeader>

          {detailData && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Summary badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-success/10 text-success border-success/30">
                  <BookMarked className="h-3 w-3 mr-1" />
                  {detailData.totalUEs} UE{detailData.totalUEs > 1 ? 's' : ''}
                </Badge>
                <Badge className="bg-success/10 text-success border-success/30">
                  <Users className="h-3 w-3 mr-1" />
                  {detailData.totalAffectations} affectation{detailData.totalAffectations > 1 ? 's' : ''}
                </Badge>
                {getCoverageBadge(
                  detailData.totalUEs > 0
                    ? Math.round(
                        (detailData.byFiliere.reduce(
                          (acc, f) => acc + f.ues.filter((ue) => ue._count?.affectations > 0 || f.affectations.some((a) => a.uniteEnseignementId === ue.id)).length,
                          0
                        ) /
                          detailData.totalUEs) *
                          100
                      )
                    : 0
                )}
              </div>

              {detailData.byFiliere.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <BookMarked className="h-7 w-7 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Aucune UE à ce niveau
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-success/30 text-success hover:bg-success/10"
                    onClick={() => {
                      setDetailDialogOpen(false)
                      handleOpenAdd(detailNiveau ?? undefined)
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter une UE
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                  {detailData.byFiliere.map((group) => {
                    const uesWithAff = group.ues.filter(
                      (ue) => ue._count?.affectations > 0 || group.affectations.some((a) => a.uniteEnseignementId === ue.id)
                    )
                    const taux = group.ues.length > 0 ? Math.round((uesWithAff.length / group.ues.length) * 100) : 0
                    const coverage = getCoverageColor(taux)

                    return (
                      <Card key={group.filiere.id} className="overflow-hidden">
                        <CardHeader className="pb-2 px-4 pt-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2 font-display">
                              <GraduationCap className="h-4 w-4 text-success" />
                              {group.filiere.nom}
                              {group.filiere.code && (
                                <Badge variant="outline" className="font-mono tabular-nums text-xs">
                                  {group.filiere.code}
                                </Badge>
                              )}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${coverage.text} ${coverage.darkText}`}>
                                {taux}%
                              </span>
                              {getCoverageBadge(taux)}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <div className="max-h-60 overflow-y-auto space-y-1.5 custom-scrollbar">
                            {group.ues.map((ue) => {
                              const ueAffectations = group.affectations.filter(
                                (a) => a.uniteEnseignementId === ue.id
                              )
                              const hasAff = ue._count?.affectations > 0 || ueAffectations.length > 0

                              return (
                                <div
                                  key={ue.id}
                                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${hasAff ? 'bg-success/10' : 'bg-warning/10'}`}>
                                      <BookMarked className={`h-3.5 w-3.5 ${hasAff ? 'text-success' : 'text-warning'}`} />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{ue.nom}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {ue.code}
                                        {ue.semestre ? ` — S${ue.semestre}` : ''}
                                        {!ue.actif ? ' — Inactive' : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {ueAffectations.length > 0 ? (
                                      <Badge
                                        className="bg-success/10 text-success border-success/30 text-xs cursor-help"
                                        title={ueAffectations.map((a) => `${a.enseignant.name} — ${a.typeSeance} (${a.volumeHeures}h)`).join('\n')}
                                      >
                                        <Users className="h-3 w-3 mr-1" />
                                        {ueAffectations.length}
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-warning/10 text-warning border-warning/30 text-xs">
                                        Non affectée
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          <div className="mt-3 flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-success/30 text-success hover:bg-success/10"
                              onClick={() => {
                                setDetailDialogOpen(false)
                                handleOpenAdd(detailNiveau ?? undefined, group.filiere.id)
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Ajouter une UE
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => { setDetailDialogOpen(false); setDetailNiveau(null) }}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
