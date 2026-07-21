'use client'

// ═══════════════════════════════════════════════════════════════════════════
// SECT-PROMOTION-FRONTEND-1 : ClotureAnneePage — page "Clôture de l'année"
// pour RESPONSABLE (et ADMIN en mode assistance).
//
// Workflow 5 étapes (state machine `step: 1|2|3|4|5`) :
//   1. Configuration    — sélection année source + année cible + affichage
//                         règles de passage (read-only MVP).
//   2. Prévisualisation — POST /cloture-annee/preview → tableau des étudiants
//                         avec décision suggérée + KPIs + overrides manuels.
//   3. Confirmation     — GlassModal : checkbox "irréversible" + motif optionnel.
//   4. Progression      — polling GET /cloture-annee/status?batchId=X (5s) +
//                         ProgressRing + ProgressBar + counts live.
//   5. Bilan            — KPIs finaux + liste erreurs + CSV + retour config +
//                         historique des batches.
//
// Endpoints backend consommés (déployés par SECT-PROMOTION-BACKEND-1) :
//   GET    /api/annees-academiques?etablissementId=X           (existant)
//   GET    /api/etablissements/{id}/regles-passage
//   POST   /api/etablissements/{id}/cloture-annee/preview       body {anneeSourceId}
//   POST   /api/etablissements/{id}/cloture-annee               body {anneeSourceId, anneeCibleId?, overrides?}
//   GET    /api/etablissements/{id}/cloture-annee/status?batchId=X
//   GET    /api/etablissements/{id}/cloture-annee/batches
//
// Patterns suivis :
//   - TanStack Query (clés ['cloture-annee-preview', etabId, anneeSourceId]
//     etc.) — refetchInterval pour le polling de statut, désactivé quand
//     statut === 'COMPLETED' ou 'FAILED'.
//   - useAuthStore() pour récupérer user.etablissementId (ADMIN assistance :
//     l'ID de l'établissement actif est dans user.etablissementId).
//   - DS components : StatCard, ProgressRing, ProgressBar, GlassModal,
//     PulseSkeleton.
//   - shadcn/ui : Card, Table, Badge, Button, AlertDialog, DropdownMenu,
//     Checkbox, Textarea, Select, Collapsible.
//   - Framer Motion AnimatePresence pour les transitions entre étapes.
//   - sonner pour les toasts succès/erreur.
//   - Responsive mobile-first : table → cards sur petit écran (pattern
//     audit-tab.tsx).
//
// Palette Savane EdTech : success / warning / info / destructive / muted.
// Aucune couleur indigo/bleu hors des tokens sémantiques.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarClock,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Users,
  TrendingUp,
  Award,
  XCircle,
  ChevronDown,
  History,
  Download,
  Settings2,
  Lock,
  Info,
  MoreVertical,
  Clock3,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

import { StatCard, ProgressRing, ProgressBar, GlassModal, PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import {
  isTerminalNiveau,
  canPromote,
  getDecisionLabel,
  getDecisionColorClasses,
  formatMoyenne,
  formatCredits,
} from '@/lib/academic-progress'

// ─── Types (miroir des structs Go côté backend) ───

interface AnneeAcademique {
  id: string
  libelle: string
  dateDebut: string
  dateFin: string
  etablissementId: string
  actif: boolean
  createdAt: string
  updatedAt: string
}

interface ReglesPassage {
  id: string
  etablissementId: string
  seuilMoyennePassage: number
  seuilMoyenneRattrapage: number
  creditsMinPourcent: number
  regime: string
  limiteRedoublements: number
}

interface EtudiantProgression {
  etudiantId: string
  nom: string
  email: string
  niveau: string
  filiereId: string | null
  filiereNom: string | null
  moyenneAnnuelle: number
  creditsValides: number
  creditsTotaux: number
  decisionSuggeree: string
  inscriptionExiste: boolean
}

type DecisionStatut =
  | 'EN_COURS'
  | 'PROMU'
  | 'REDOUBLANT'
  | 'DIPLOME'
  | 'EXCLU'
  | 'REORIENTE'
  | 'QUITTE'

interface OverrideDecision {
  etudiantId: string
  decision: DecisionStatut
  motif?: string
}

interface PreviewResponse {
  etudiants: EtudiantProgression[]
  total?: number
}

interface BatchStatus {
  batchId: string
  statut: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  totalEtudiants: number
  promuCount: number
  redoublantCount: number
  diplomeCount: number
  excluCount: number
  erreurCount: number
  progression: number
  details?: string | null
  errorMessage?: string | null
}

interface BatchListItem {
  id: string
  etablissementId: string
  anneeSourceId: string
  anneeCibleId: string | null
  statut: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  runById: string | null
  seuilMoyenne: number
  totalEtudiants: number
  promuCount: number
  redoublantCount: number
  diplomeCount: number
  excluCount: number
  erreurCount: number
  progression: number
  details?: string | null
  errorMessage?: string | null
  createdAt: string
  termineAt: string | null
}

interface BatchesResponse {
  batches: BatchListItem[]
}

interface EtudiantErreur {
  etudiantId: string
  nom?: string
  erreur: string
}

// ─── Décisions surchargeables par le RESPONSABLE ───
// On expose 4 choix dans le dropdown (PROMU / REDOUBLANT / DIPLOME / EXCLU) —
// REORIENTE et QUITTE sont des décisions purement manuelles gérées hors
// clôture (réorientation de filière / sortie d'établissement). Le backend
// accepte néanmoins toutes les valeurs valides côté OverrideDecision.
const OVERRIDE_OPTIONS: DecisionStatut[] = ['PROMU', 'REDOUBLANT', 'DIPLOME', 'EXCLU']

// ─── Étapes du workflow ───
type Step = 1 | 2 | 3 | 4 | 5

const STEP_LABELS: Record<Step, string> = {
  1: 'Configuration',
  2: 'Prévisualisation',
  3: 'Confirmation',
  4: 'Progression',
  5: 'Bilan',
}

// ─── Helper : détection responsive (mobile < 640px) ───
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

// ─── Helper : formatage date ISO → FR lisible ───
function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ─── Helper : parse JSON safe (pour details des batches) ───
function parseDetailsSafe(raw: string | null | undefined): {
  erreurs?: EtudiantErreur[]
  overrides?: OverrideDecision[]
  [k: string]: unknown
} | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as {
      erreurs?: EtudiantErreur[]
      overrides?: OverrideDecision[]
      [k: string]: unknown
    }
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// StepIndicator — indicateurs d'étapes (1 → 5) avec connecteurs.
// Mobile : libellés masqués sur très petits écrans, uniquement les cercles.
// ═══════════════════════════════════════════════════════════════════════════
function StepIndicator({ current, completed }: { current: Step; completed: Set<Step> }) {
  const steps: Step[] = [1, 2, 3, 4, 5]
  return (
    <div className="flex items-center justify-between gap-1 sm:gap-2">
      {steps.map((s, i) => {
        const isCurrent = s === current
        const isCompleted = completed.has(s)
        const isPast = s < current
        return (
          <div key={s} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div
                className={`flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-full text-xs sm:text-sm font-bold font-mono transition-colors ${
                  isCurrent
                    ? 'bg-success text-success-foreground ring-2 ring-success/40 ring-offset-2 ring-offset-background'
                    : isCompleted || isPast
                      ? 'bg-success/15 text-success-text'
                      : 'bg-muted text-muted-foreground'
                }`}
                aria-label={`Étape ${s} : ${STEP_LABELS[s]}${
                  isCurrent ? ' (en cours)' : isCompleted || isPast ? ' (terminée)' : ''
                }`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isCompleted || isPast ? (
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  s
                )}
              </div>
              <span
                className={`hidden sm:inline text-[10px] sm:text-xs truncate max-w-[80px] text-center ${
                  isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 sm:mx-2 rounded transition-colors ${
                  s < current ? 'bg-success/40' : 'bg-muted-foreground/20'
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DecisionBadge — badge coloré par décision (réutilise academic-progress).
// ═══════════════════════════════════════════════════════════════════════════
function DecisionBadge({ decision, override }: { decision: string; override?: boolean }) {
  return (
    <Badge
      className={`${getDecisionColorClasses(decision)} text-[10px] gap-1 shrink-0`}
      title={override ? 'Décision forcée manuellement' : 'Décision suggérée (auto)'}
    >
      {override && <Lock className="h-3 w-3" aria-hidden="true" />}
      {getDecisionLabel(decision)}
    </Badge>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// OverrideDialog — sous-dialogue (AlertDialog) pour forcer une décision sur
// un étudiant, avec motif optionnel (max 500 chars).
// Pattern identique au revoke-signup-link AlertDialog de etudiants-page.tsx.
// ═══════════════════════════════════════════════════════════════════════════
function OverrideDialog({
  open,
  onOpenChange,
  etudiant,
  currentDecision,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  etudiant: EtudiantProgression | null
  currentDecision: DecisionStatut | null
  onConfirm: (decision: DecisionStatut, motif: string) => void
}) {
  const [selectedDecision, setSelectedDecision] = useState<DecisionStatut | null>(null)
  const [motif, setMotif] = useState('')

  // Reset à l'ouverture du dialogue. Pattern identique à audit-tab.tsx
  // (eslint-disable ciblé sur react-hooks/set-state-in-effect : la logique de
  // reset est correcte et non cyclique — déclenchée uniquement sur ouverture).
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form state on dialog open, pattern standard (audit-tab.tsx)
      setSelectedDecision(currentDecision)
      setMotif('')
    }
  }, [open, currentDecision])

  if (!etudiant) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-info" />
            Forcer la décision — {etudiant.nom}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Override manuel de la décision de clôture pour cet étudiant.
                La décision sera appliquée telle quelle (la logique automatique
                basée sur la moyenne et les crédits sera ignorée).
              </p>
              <div className="rounded-lg border border-info/30 bg-info/5 p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Niveau actuel :</span>
                  <span className="font-mono font-semibold">{etudiant.niveau || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Moyenne annuelle :</span>
                  <span className="font-mono font-semibold">{formatMoyenne(etudiant.moyenneAnnuelle)} / 20</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Crédits validés :</span>
                  <span className="font-mono font-semibold">
                    {formatCredits(etudiant.creditsValides, etudiant.creditsTotaux)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Décision suggérée :</span>
                  <DecisionBadge decision={etudiant.decisionSuggeree} />
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Sélecteur de décision forcée */}
        <div className="space-y-2 py-1">
          <Label htmlFor="override-decision" className="text-sm font-medium">
            Nouvelle décision <span className="text-destructive">*</span>
          </Label>
          <Select
            value={selectedDecision ?? undefined}
            onValueChange={(v) => setSelectedDecision(v as DecisionStatut)}
          >
            <SelectTrigger id="override-decision" className="w-full">
              <SelectValue placeholder="Choisir une décision" />
            </SelectTrigger>
            <SelectContent>
              {OVERRIDE_OPTIONS.map((d) => {
                // Désactiver PROMU pour un niveau terminal (DOCTORAT) —
                // l'étudiant ne peut pas être promu au-delà.
                const disabled = d === 'PROMU' && !canPromote(etudiant.niveau)
                return (
                  <SelectItem key={d} value={d} disabled={disabled}>
                    <span className="flex items-center gap-2">
                      {getDecisionLabel(d)}
                      {disabled && (
                        <span className="text-[10px] text-muted-foreground">
                          (niveau terminal)
                        </span>
                      )}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Motif optionnel */}
        <div className="space-y-2 py-1">
          <Label htmlFor="override-motif" className="text-sm font-medium">
            Motif <span className="text-muted-foreground">(optionnel, journalisé dans l&apos;audit)</span>
          </Label>
          <Textarea
            id="override-motif"
            placeholder="Ex: Dérogation exceptionnelle, jury pédagogique, etc."
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            maxLength={500}
            rows={3}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {motif.length}/500 caractères. Ce motif sera conservé dans
            l&apos;historique du batch.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={!selectedDecision}
            onClick={() => {
              if (selectedDecision) {
                onConfirm(selectedDecision, motif.trim() || '')
              }
            }}
          >
            Appliquer l&apos;override
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// HistorySection — section collapsible affichant l'historique des batches
// de clôture passés (GET /cloture-annee/batches).
// ═══════════════════════════════════════════════════════════════════════════
function HistorySection({
  etablissementId,
  anneesMap,
}: {
  etablissementId: string
  anneesMap: Map<string, AnneeAcademique>
}) {
  const [isOpen, setIsOpen] = useState(false)
  const isMobile = useIsMobile()

  const batchesQuery = useQuery<BatchesResponse>({
    queryKey: ['cloture-annee-batches', etablissementId],
    queryFn: async () => {
      const res = await fetch(
        `/api/etablissements/${etablissementId}/cloture-annee/batches`,
        { credentials: 'same-origin' },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur lors du chargement de l\'historique')
      }
      return (await res.json()) as BatchesResponse
    },
    enabled: !!etablissementId && isOpen,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })

  const batches = batchesQuery.data?.batches ?? []
  const isLoading = batchesQuery.isLoading
  const isError = batchesQuery.isError

  const libelleAnnee = (id: string | null) => (id ? anneesMap.get(id)?.libelle ?? '—' : '—')

  const renderBatchRow = (b: BatchListItem) => {
    if (isMobile) {
      return (
        <Card key={b.id} className="transition-all">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">
                {libelleAnnee(b.anneeSourceId)} → {libelleAnnee(b.anneeCibleId)}
              </span>
              <DecisionBadge decision={b.statut === 'COMPLETED' ? 'DIPLOME' : b.statut === 'FAILED' ? 'EXCLU' : 'EN_COURS'} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              {formatDateFr(b.createdAt)}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded bg-success/10 p-1.5">
                <div className="font-mono font-bold text-success-text">{b.promuCount}</div>
                <div className="text-[10px] text-muted-foreground">Promus</div>
              </div>
              <div className="rounded bg-warning/10 p-1.5">
                <div className="font-mono font-bold text-warning">{b.redoublantCount}</div>
                <div className="text-[10px] text-muted-foreground">Redoublants</div>
              </div>
              <div className="rounded bg-info/10 p-1.5">
                <div className="font-mono font-bold text-info">{b.diplomeCount}</div>
                <div className="text-[10px] text-muted-foreground">Diplômés</div>
              </div>
              <div className="rounded bg-destructive/10 p-1.5">
                <div className="font-mono font-bold text-destructive">{b.erreurCount}</div>
                <div className="text-[10px] text-muted-foreground">Erreurs</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Seuil de passage : <span className="font-mono">{b.seuilMoyenne.toFixed(2)}/20</span> ·{' '}
              Total étudiants : <span className="font-mono">{b.totalEtudiants}</span>
            </div>
          </CardContent>
        </Card>
      )
    }

    return (
      <TableRow key={b.id}>
        <TableCell className="text-sm whitespace-nowrap">{formatDateFr(b.createdAt)}</TableCell>
        <TableCell className="text-sm">{libelleAnnee(b.anneeSourceId)}</TableCell>
        <TableCell className="text-sm">{libelleAnnee(b.anneeCibleId)}</TableCell>
        <TableCell>
          {b.statut === 'COMPLETED' && (
            <Badge className="bg-success/15 text-success-text border-success/30 text-[10px]">Terminé</Badge>
          )}
          {b.statut === 'FAILED' && (
            <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">Échec</Badge>
          )}
          {b.statut === 'RUNNING' && (
            <Badge className="bg-info/15 text-info border-info/30 text-[10px] gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> En cours
            </Badge>
          )}
          {b.statut === 'PENDING' && (
            <Badge className="bg-muted text-muted-foreground text-[10px]">En attente</Badge>
          )}
        </TableCell>
        <TableCell className="text-sm font-mono tabular-nums">{b.totalEtudiants}</TableCell>
        <TableCell className="text-sm font-mono tabular-nums text-success-text">{b.promuCount}</TableCell>
        <TableCell className="text-sm font-mono tabular-nums text-warning">{b.redoublantCount}</TableCell>
        <TableCell className="text-sm font-mono tabular-nums text-info">{b.diplomeCount}</TableCell>
        <TableCell className="text-sm font-mono tabular-nums text-destructive">{b.erreurCount}</TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {b.termineAt ? formatDateFr(b.termineAt) : '—'}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left"
            aria-expanded={isOpen}
            aria-controls="history-section-content"
          >
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-info" />
              <div>
                <h3 className="font-display text-base font-semibold">Historique des clôtures</h3>
                <p className="text-xs text-muted-foreground">
                  Batches de clôture précédents pour cet établissement.
                </p>
              </div>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent id="history-section-content">
          <CardContent className="pt-0 border-t">
            {isLoading ? (
              <div className="space-y-2 py-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <PulseSkeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center py-8 text-center">
                <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                <p className="text-sm text-muted-foreground">
                  {batchesQuery.error instanceof Error
                    ? batchesQuery.error.message
                    : 'Impossible de charger l\'historique.'}
                </p>
              </div>
            ) : batches.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <History className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Aucune clôture n&apos;a encore été effectuée pour cet établissement.
                </p>
              </div>
            ) : isMobile ? (
              <div className="space-y-2 py-4">{batches.map(renderBatchRow)}</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-md border mt-4">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="font-display whitespace-nowrap">Date</TableHead>
                      <TableHead className="font-display whitespace-nowrap">Année source</TableHead>
                      <TableHead className="font-display whitespace-nowrap">Année cible</TableHead>
                      <TableHead className="font-display whitespace-nowrap">Statut</TableHead>
                      <TableHead className="font-display whitespace-nowrap">Total</TableHead>
                      <TableHead className="font-display whitespace-nowrap text-success-text">Promus</TableHead>
                      <TableHead className="font-display whitespace-nowrap text-warning">Redoublants</TableHead>
                      <TableHead className="font-display whitespace-nowrap text-info">Diplômés</TableHead>
                      <TableHead className="font-display whitespace-nowrap text-destructive">Erreurs</TableHead>
                      <TableHead className="font-display whitespace-nowrap">Terminé le</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{batches.map(renderBatchRow)}</TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ClotureAnneePage — composant principal.
// ═══════════════════════════════════════════════════════════════════════════
export function ClotureAnneePage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()

  // ASSISTANCE-MODE-FRONTEND : user.etablissementId contient l'ID de
  // l'établissement actif pour le RESPONSABLE ET pour l'ADMIN en mode
  // assistance (cf. lib/routes.ts → getEffectiveRole).
  const etabId = user?.etablissementId ?? null

  // ─── Workflow state ───
  const [step, setStep] = useState<Step>(1)
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set())

  // ─── Step 1 : Configuration state ───
  const [anneeSourceId, setAnneeSourceId] = useState<string>('')
  const [anneeCibleId, setAnneeCibleId] = useState<string>('')

  // ─── Step 2 : Prévisualisation state ───
  // overrides : map[etudiantId] → OverrideDecision
  const [overrides, setOverrides] = useState<Map<string, OverrideDecision>>(new Map())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [overrideTarget, setOverrideTarget] = useState<EtudiantProgression | null>(null)
  const [overrideCurrentDecision, setOverrideCurrentDecision] = useState<DecisionStatut | null>(null)

  // ─── Step 3 : Confirmation state ───
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [confirmMotif, setConfirmMotif] = useState('')

  // ─── Step 4 : Progression state ───
  const [batchId, setBatchId] = useState<string | null>(null)

  // ─── Step 5 : Bilan state ───
  const [finalStatus, setFinalStatus] = useState<BatchStatus | null>(null)

  // ═══════════════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Années académiques (réutilise le cache existant) ───
  const anneesQuery = useQuery<AnneeAcademique[]>({
    queryKey: ['annees-academiques', etabId],
    queryFn: async () => {
      const res = await fetch(
        `/api/annees-academiques?etablissementId=${encodeURIComponent(etabId ?? '')}`,
        { credentials: 'same-origin' },
      )
      if (!res.ok) throw new Error('Erreur lors du chargement des années académiques')
      return (await res.json()) as AnneeAcademique[]
    },
    enabled: !!etabId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const annees = anneesQuery.data ?? []
  const anneesMap = useMemo(() => {
    const m = new Map<string, AnneeAcademique>()
    annees.forEach((a) => m.set(a.id, a))
    return m
  }, [annees])

  const anneesActives = useMemo(() => annees.filter((a) => a.actif), [annees])

  // ─── Règles de passage ───
  const reglesQuery = useQuery<ReglesPassage>({
    queryKey: ['regles-passage', etabId],
    queryFn: async () => {
      const res = await fetch(`/api/etablissements/${etabId}/regles-passage`, {
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur lors du chargement des règles de passage')
      }
      return (await res.json()) as ReglesPassage
    },
    enabled: !!etabId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const regles = reglesQuery.data ?? null

  // ─── Preview (étape 2) ───
  // enabled uniquement quand on est à l'étape 2 (ou qu'on revient de 3) ET
  // qu'une année source est sélectionnée. Le cache TanStack permet de
  // revenir en arrière sans refetch.
  const previewQuery = useQuery<PreviewResponse>({
    queryKey: ['cloture-annee-preview', etabId, anneeSourceId],
    queryFn: async () => {
      const res = await fetch(
        `/api/etablissements/${etabId}/cloture-annee/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anneeSourceId }),
          credentials: 'same-origin',
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur lors de la prévisualisation')
      }
      return (await res.json()) as PreviewResponse
    },
    enabled: !!etabId && !!anneeSourceId && (step === 2 || step === 3),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const etudiants = previewQuery.data?.etudiants ?? []

  // ─── Statut batch (étape 4) — polling 5s ───
  const statusQuery = useQuery<BatchStatus>({
    queryKey: ['cloture-annee-status', etabId, batchId],
    queryFn: async () => {
      const res = await fetch(
        `/api/etablissements/${etabId}/cloture-annee/status?batchId=${encodeURIComponent(batchId ?? '')}`,
        { credentials: 'same-origin' },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur lors du polling du statut')
      }
      return (await res.json()) as BatchStatus
    },
    enabled: !!etabId && !!batchId && step === 4,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const s = query.state.data?.statut
      // Arrêter le polling si le batch est terminé (COMPLETED) ou en échec
      // (FAILED). Sinon poller toutes les 5 secondes.
      if (s === 'COMPLETED' || s === 'FAILED') return false
      return 5000
    },
    refetchIntervalInBackground: false,
  })

  // ─── Détection de fin de batch → transition vers bilan ───
  // Le batch est une ressource externe (TanStack Query + worker async backend).
  // Cet effet synchronise l'état local du workflow (step 4 → 5) avec les
  // transitions de statut observées via polling. Pattern équivalent au
  // auto-refresh de audit-tab.tsx + disable ciblé react-hooks/set-state-in-effect.
  useEffect(() => {
    if (step !== 4) return
    const s = statusQuery.data?.statut
    if (s === 'COMPLETED' || s === 'FAILED') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync workflow state with external batch status, pattern standard (audit-tab.tsx)
      setFinalStatus(statusQuery.data ?? null)
      setCompletedSteps((prev) => new Set(prev).add(4))
      setStep(5)
      if (s === 'COMPLETED') {
        toast.success('Clôture terminée', {
          description: `${statusQuery.data?.promuCount ?? 0} promu(s), ${statusQuery.data?.redoublantCount ?? 0} redoublant(s), ${statusQuery.data?.diplomeCount ?? 0} diplômé(s).`,
        })
      } else {
        toast.error('Clôture en échec', {
          description: statusQuery.data?.errorMessage ?? 'Erreur inconnue',
        })
      }
      // Invalider l'historique pour qu'il se recharge à l'étape 5
      queryClient.invalidateQueries({ queryKey: ['cloture-annee-batches', etabId] })
    }
  }, [step, statusQuery.data, queryClient, etabId])

  // ═══════════════════════════════════════════════════════════════════════════
  // Mutations
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Lancer la clôture (POST /cloture-annee) ───
  const runMutation = useMutation<
    { batchId: string; statut: string },
    Error,
    { anneeSourceId: string; anneeCibleId?: string; overrides: OverrideDecision[] }
  >({
    mutationFn: async (input) => {
      const res = await fetch(`/api/etablissements/${etabId}/cloture-annee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anneeSourceId: input.anneeSourceId,
          anneeCibleId: input.anneeCibleId || undefined,
          overrides: input.overrides.length > 0 ? input.overrides : undefined,
        }),
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur lors du lancement de la clôture')
      }
      return (await res.json()) as { batchId: string; statut: string }
    },
    onSuccess: (data) => {
      setBatchId(data.batchId)
      setConfirmOpen(false)
      setCompletedSteps((prev) => new Set(prev).add(3))
      setStep(4)
      toast.success('Clôture lancée', {
        description: `Batch ${data.batchId.slice(0, 8)}… — traitement en cours.`,
      })
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setConfirmOpen(false)
    },
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Handlers
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Step 1 → 2 : Prévisualiser ───
  const handlePreview = () => {
    if (!anneeSourceId) {
      toast.error('Veuillez sélectionner une année à clôturer')
      return
    }
    setCompletedSteps((prev) => new Set(prev).add(1))
    setStep(2)
  }

  // ─── Step 2 → 1 : Retour config ───
  const handleBackToConfig = () => {
    setStep(1)
  }

  // ─── Step 2 → 3 : Lancer la clôture (ouvre la modale de confirmation) ───
  const handleLaunch = () => {
    if (etudiants.length === 0) {
      toast.error('Aucun étudiant à clôturer')
      return
    }
    setConfirmOpen(true)
    setConfirmChecked(false)
    setConfirmMotif('')
  }

  // ─── Step 3 : Confirmer ───
  const handleConfirm = () => {
    if (!confirmChecked) {
      toast.error('Veuillez confirmer que l\'action est irréversible')
      return
    }
    const overridesList = Array.from(overrides.values())
    runMutation.mutate({
      anneeSourceId,
      anneeCibleId: anneeCibleId || undefined,
      overrides: overridesList,
    })
  }

  // ─── Override management (step 2) ───
  const openOverrideDialog = (etu: EtudiantProgression) => {
    setOverrideTarget(etu)
    setOverrideCurrentDecision(overrides.get(etu.etudiantId)?.decision ?? null)
  }

  const handleConfirmOverride = (decision: DecisionStatut, motif: string) => {
    if (!overrideTarget) return
    setOverrides((prev) => {
      const next = new Map(prev)
      next.set(overrideTarget.etudiantId, {
        etudiantId: overrideTarget.etudiantId,
        decision,
        motif: motif || undefined,
      })
      return next
    })
    toast.success(`Override appliqué : ${getDecisionLabel(decision)}`, {
      description: overrideTarget.nom,
    })
    setOverrideTarget(null)
  }

  const handleRemoveOverride = (etuId: string) => {
    setOverrides((prev) => {
      const next = new Map(prev)
      next.delete(etuId)
      return next
    })
  }

  // ─── Sélection / désélection des étudiants (step 2) ───
  const toggleSelectAll = () => {
    if (selectedIds.size === etudiants.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(etudiants.map((e) => e.etudiantId)))
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Step 5 : Retour à la configuration ───
  const handleResetToConfig = useCallback(() => {
    setStep(1)
    setCompletedSteps(new Set())
    setAnneeSourceId('')
    setAnneeCibleId('')
    setOverrides(new Map())
    setSelectedIds(new Set())
    setBatchId(null)
    setFinalStatus(null)
    setConfirmMotif('')
    setConfirmChecked(false)
    // Invalider le cache preview pour forcer un refetch frais au prochain lancement
    queryClient.invalidateQueries({ queryKey: ['cloture-annee-preview', etabId] })
  }, [etabId, queryClient])

  // ─── Step 5 : Télécharger le rapport CSV ───
  const handleDownloadCsv = () => {
    if (!finalStatus) return
    const details = parseDetailsSafe(finalStatus.details)
    const erreurs = details?.erreurs ?? []

    // Construit les lignes CSV : on combine la preview (cache TanStack) avec
    // le statut final. Si la preview a expiré du cache, on génère juste le
    // bilan agrégé (sans détail par étudiant).
    const rows: string[][] = []
    rows.push(['# Bilan de la clôture d\'année'])
    rows.push(['Batch ID', finalStatus.batchId])
    rows.push(['Statut', finalStatus.statut])
    rows.push(['Date du bilan', new Date().toISOString()])
    rows.push(['Total étudiants', String(finalStatus.totalEtudiants)])
    rows.push(['Promus', String(finalStatus.promuCount)])
    rows.push(['Redoublants', String(finalStatus.redoublantCount)])
    rows.push(['Diplômés', String(finalStatus.diplomeCount)])
    rows.push(['Exclus', String(finalStatus.excluCount)])
    rows.push(['Erreurs', String(finalStatus.erreurCount)])
    rows.push([])

    // Détail par étudiant (depuis la preview en cache, si disponible)
    if (etudiants.length > 0) {
      rows.push(['# Détail par étudiant'])
      rows.push([
        'Étudiant ID',
        'Nom',
        'Email',
        'Niveau',
        'Filière',
        'Moyenne /20',
        'Crédits validés',
        'Crédits totaux',
        'Décision suggérée',
        'Décision finale (override)',
        'Motif override',
      ])
      etudiants.forEach((e) => {
        const ov = overrides.get(e.etudiantId)
        rows.push([
          e.etudiantId,
          e.nom,
          e.email,
          e.niveau || '',
          e.filiereNom ?? '',
          String(e.moyenneAnnuelle ?? 0),
          String(e.creditsValides ?? 0),
          String(e.creditsTotaux ?? 0),
          e.decisionSuggeree,
          ov?.decision ?? '',
          ov?.motif ?? '',
        ])
      })
      rows.push([])
    }

    // Erreurs par étudiant (depuis details.erreurs)
    if (erreurs.length > 0) {
      rows.push(['# Erreurs par étudiant'])
      rows.push(['Étudiant ID', 'Nom', 'Erreur'])
      erreurs.forEach((err) => {
        rows.push([err.etudiantId, err.nom ?? '', err.erreur])
      })
    }

    // Conversion CSV (RFC 4180 — double-quote escaping)
    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? '')
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
              return `"${s.replace(/"/g, '""')}"`
            }
            return s
          })
          .join(','),
      )
      .join('\n')

    // Téléchargement client-side
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cloture-annee-${finalStatus.batchId.slice(0, 8)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Rapport CSV téléchargé')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Garde de sécurité : si l'utilisateur n'a pas d'établissement actif
  // (ADMIN hors mode assistance), on affiche un message d'information.
  // ═══════════════════════════════════════════════════════════════════════════
  if (!etabId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 mb-2">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <CardTitle className="text-xl">Aucun établissement actif</CardTitle>
            <CardDescription>
              La clôture de l&apos;année nécessite un établissement rattaché.
              {user?.role === 'ADMIN' && (
                <> Activez le mode assistance sur un établissement pour accéder à cette page.</>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2 font-display">
            <CalendarClock className="h-7 w-7 text-info" />
            Clôture de l&apos;année académique
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Promouvoir les étudiants au niveau supérieur, diplômer les
            terminaux et générer les inscriptions pour l&apos;année cible.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['annees-academiques', etabId] })
            queryClient.invalidateQueries({ queryKey: ['regles-passage', etabId] })
            queryClient.invalidateQueries({ queryKey: ['cloture-annee-preview', etabId] })
          }}
          aria-label="Rafraîchir les données"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Rafraîchir
        </Button>
      </div>

      {/* ─── Step indicator ─── */}
      <Card>
        <CardContent className="p-4">
          <StepIndicator current={step} completed={completedSteps} />
        </CardContent>
      </Card>

      {/* ─── Step content (animated transitions) ─── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          {/* ═════════════════════════════════════════════════════════════════
              STEP 1 — Configuration
              ═════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-display">
                    <Settings2 className="h-5 w-5 text-info" />
                    Configuration de la clôture
                  </CardTitle>
                  <CardDescription>
                    Sélectionnez l&apos;année à clôturer et l&apos;année cible
                    (facultative) pour la création des nouvelles inscriptions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Année source (obligatoire) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="annee-source" className="text-sm font-medium">
                      Année à clôturer <span className="text-destructive">*</span>
                    </Label>
                    <Select value={anneeSourceId} onValueChange={setAnneeSourceId}>
                      <SelectTrigger id="annee-source" className="w-full">
                        <SelectValue placeholder="Sélectionner une année académique" />
                      </SelectTrigger>
                      <SelectContent>
                        {anneesActives.length === 0 ? (
                          <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                            Aucune année active. Créez-en une dans Programme
                            académique → Années académiques.
                          </div>
                        ) : (
                          anneesActives.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.libelle}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {anneeSourceId && (
                      <p className="text-xs text-muted-foreground">
                        Période :{' '}
                        {new Date(anneesMap.get(anneeSourceId)?.dateDebut ?? '').toLocaleDateString('fr-FR')}
                        {' → '}
                        {new Date(anneesMap.get(anneeSourceId)?.dateFin ?? '').toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>

                  {/* Année cible (optionnelle) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="annee-cible" className="text-sm font-medium">
                      Année cible{' '}
                      <span className="text-muted-foreground">
                        (optionnel — pour les nouvelles inscriptions)
                      </span>
                    </Label>
                    <Select value={anneeCibleId} onValueChange={setAnneeCibleId}>
                      <SelectTrigger id="annee-cible" className="w-full">
                        <SelectValue placeholder="Aucune (archive pure)" />
                      </SelectTrigger>
                      <SelectContent>
                        {anneesActives
                          .filter((a) => a.id !== anneeSourceId)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.libelle}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Si aucune année cible n&apos;est sélectionnée, les
                      promotions/redoublements ne créeront pas de nouvelle
                      inscription (cas d&apos;archive pure, ex. fermeture
                      d&apos;établissement).
                    </p>
                  </div>

                  {/* Règles de passage (read-only MVP) */}
                  <div className="rounded-lg border border-info/30 bg-info/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-info" />
                      <h4 className="text-sm font-semibold text-info">
                        Règles de passage en vigueur
                      </h4>
                    </div>
                    {reglesQuery.isLoading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <PulseSkeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : reglesQuery.isError ? (
                      <p className="text-sm text-destructive">
                        {reglesQuery.error instanceof Error
                          ? reglesQuery.error.message
                          : 'Impossible de charger les règles.'}
                      </p>
                    ) : regles ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="rounded-lg bg-card p-3 border">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Seuil passage
                            </p>
                            <p className="font-mono font-bold text-success-text">
                              {regles.seuilMoyennePassage.toFixed(2)}/20
                            </p>
                          </div>
                          <div className="rounded-lg bg-card p-3 border">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Seuil rattrapage
                            </p>
                            <p className="font-mono font-bold text-warning">
                              {regles.seuilMoyenneRattrapage.toFixed(2)}/20
                            </p>
                          </div>
                          <div className="rounded-lg bg-card p-3 border">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Crédits min.
                            </p>
                            <p className="font-mono font-bold text-info">
                              {regles.creditsMinPourcent}%
                            </p>
                          </div>
                          <div className="rounded-lg bg-card p-3 border">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Limite redoub.
                            </p>
                            <p className="font-mono font-bold text-destructive">
                              {regles.limiteRedoublements}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground italic">
                          Les règles de passage sont modifiables via
                          l&apos;administration (page Paramètres → Règles de
                          passage). Lecture seule dans cet écran.
                        </p>
                      </>
                    ) : null}
                  </div>

                  {/* Action : Prévisualiser */}
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handlePreview}
                      disabled={!anneeSourceId}
                      className="gap-2"
                    >
                      Prévisualiser la clôture
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════
              STEP 2 — Prévisualisation
              ═════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-4">
              {/* KPIs — 4 cartes (total / promus / redoublants / diplômés) */}
              {(() => {
                const stats = etudiants.reduce(
                  (acc, e) => {
                    const decisionFinale = overrides.get(e.etudiantId)?.decision ?? e.decisionSuggeree
                    acc.total++
                    if (decisionFinale === 'PROMU') acc.promus++
                    else if (decisionFinale === 'REDOUBLANT') acc.redoublants++
                    else if (decisionFinale === 'DIPLOME') acc.diplomes++
                    else if (decisionFinale === 'EXCLU') acc.exclus++
                    return acc
                  },
                  { total: 0, promus: 0, redoublants: 0, diplomes: 0, exclus: 0 },
                )
                return (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Total étudiants"
                      value={stats.total}
                      icon={Users}
                      accent="primary"
                      index={0}
                    />
                    <StatCard
                      label="Promus suggérés"
                      value={stats.promus}
                      icon={TrendingUp}
                      accent="success"
                      index={1}
                    />
                    <StatCard
                      label="Redoublants suggérés"
                      value={stats.redoublants}
                      icon={RefreshCw}
                      accent="warning"
                      index={2}
                    />
                    <StatCard
                      label="Diplômés suggérés"
                      value={stats.diplomes}
                      icon={Award}
                      accent="info"
                      index={3}
                    />
                  </div>
                )
              })()}

              {/* Toolbar : sélection + overrides count */}
              <Card>
                <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <Checkbox
                      checked={
                        etudiants.length === 0
                          ? false
                          : selectedIds.size === etudiants.length
                            ? true
                            : selectedIds.size > 0
                              ? 'indeterminate'
                              : false
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Sélectionner tous les étudiants"
                      disabled={etudiants.length === 0}
                    />
                    <span className="text-sm text-muted-foreground">
                      {selectedIds.size > 0
                        ? `${selectedIds.size} étudiant(s) sélectionné(s)`
                        : 'Aucune sélection'}
                    </span>
                    {overrides.size > 0 && (
                      <Badge className="bg-info/15 text-info border-info/30 text-[10px] gap-1">
                        <Lock className="h-3 w-3" />
                        {overrides.size} override(s) manuel(s)
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleBackToConfig}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Configuration
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleLaunch}
                      disabled={etudiants.length === 0}
                      className="gap-1.5"
                    >
                      <CalendarClock className="h-4 w-4" />
                      Lancer la clôture
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Tableau des étudiants */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-display">
                    <Users className="h-5 w-5 text-info" />
                    Étudiants à clôturer
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-info/15 text-info text-xs font-medium px-2 py-0.5">
                      {etudiants.length}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    Décision suggérée calculée automatiquement selon les règles
                    de passage. Vous pouvez forcer une décision via le menu
                    actions de chaque étudiant.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {previewQuery.isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <PulseSkeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : previewQuery.isError ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {previewQuery.error instanceof Error
                          ? previewQuery.error.message
                          : 'Erreur lors de la prévisualisation.'}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() =>
                          queryClient.invalidateQueries({
                            queryKey: ['cloture-annee-preview', etabId, anneeSourceId],
                          })
                        }
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Réessayer
                      </Button>
                    </div>
                  ) : etudiants.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <Users className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Aucun étudiant actif pour cette année source.
                      </p>
                    </div>
                  ) : isMobile ? (
                    // ─── Mobile : cards ───
                    <div className="space-y-2 max-h-[36rem] overflow-y-auto">
                      {etudiants.map((e) => {
                        const ov = overrides.get(e.etudiantId)
                        const decisionFinale = ov?.decision ?? e.decisionSuggeree
                        return (
                          <Card key={e.etudiantId} className={ov ? 'ring-1 ring-info/40' : ''}>
                            <CardContent className="p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{e.nom}</p>
                                  <p className="text-xs text-muted-foreground truncate">{e.email}</p>
                                </div>
                                <DecisionBadge decision={decisionFinale} override={!!ov} />
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Niveau : </span>
                                  <span className="font-mono font-semibold">{e.niveau || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Filière : </span>
                                  <span className="truncate">{e.filiereNom ?? '—'}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Moyenne : </span>
                                  <span className="font-mono font-semibold">
                                    {formatMoyenne(e.moyenneAnnuelle)}/20
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Crédits : </span>
                                  <span className="font-mono font-semibold">
                                    {formatCredits(e.creditsValides, e.creditsTotaux)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-end gap-1">
                                {ov && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => handleRemoveOverride(e.etudiantId)}
                                  >
                                    Retirer l&apos;override
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => openOverrideDialog(e)}
                                >
                                  <Settings2 className="h-3 w-3 mr-1" />
                                  Forcer la décision
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  ) : (
                    // ─── Desktop : tableau ───
                    <div className="overflow-x-auto max-h-[36rem] overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead className="w-[40px]">
                              <Checkbox
                                checked={
                                  etudiants.length === 0
                                    ? false
                                    : selectedIds.size === etudiants.length
                                      ? true
                                      : selectedIds.size > 0
                                        ? 'indeterminate'
                                        : false
                                }
                                onCheckedChange={toggleSelectAll}
                                aria-label="Sélectionner tous les étudiants"
                              />
                            </TableHead>
                            <TableHead className="font-display whitespace-nowrap">Nom</TableHead>
                            <TableHead className="font-display whitespace-nowrap">Niveau</TableHead>
                            <TableHead className="font-display whitespace-nowrap">Filière</TableHead>
                            <TableHead className="font-display whitespace-nowrap text-right">Moyenne /20</TableHead>
                            <TableHead className="font-display whitespace-nowrap text-right">Crédits</TableHead>
                            <TableHead className="font-display whitespace-nowrap">Décision</TableHead>
                            <TableHead className="font-display whitespace-nowrap text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {etudiants.map((e) => {
                            const ov = overrides.get(e.etudiantId)
                            const decisionFinale = ov?.decision ?? e.decisionSuggeree
                            return (
                              <TableRow
                                key={e.etudiantId}
                                className={ov ? 'bg-info/5' : ''}
                              >
                                <TableCell>
                                  <Checkbox
                                    checked={selectedIds.has(e.etudiantId)}
                                    onCheckedChange={() => toggleSelectOne(e.etudiantId)}
                                    aria-label={`Sélectionner ${e.nom}`}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium truncate max-w-[180px]">
                                      {e.nom}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                                      {e.email}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="font-mono text-sm font-semibold">{e.niveau || '—'}</span>
                                  {isTerminalNiveau(e.niveau) && (
                                    <Badge className="ml-1 bg-gold/15 text-gold border-gold/30 text-[9px]">
                                      Terminal
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {e.filiereNom ?? <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-sm text-right font-mono tabular-nums">
                                  {formatMoyenne(e.moyenneAnnuelle)}
                                </TableCell>
                                <TableCell className="text-sm text-right font-mono tabular-nums">
                                  {formatCredits(e.creditsValides, e.creditsTotaux)}
                                </TableCell>
                                <TableCell>
                                  <DecisionBadge decision={decisionFinale} override={!!ov} />
                                </TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        aria-label={`Actions pour ${e.nom}`}
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-52">
                                      <DropdownMenuLabel className="text-xs">
                                        Décision pour {e.nom}
                                      </DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => openOverrideDialog(e)}
                                      >
                                        <Settings2 className="h-4 w-4 mr-2" />
                                        Forcer une décision…
                                      </DropdownMenuItem>
                                      {ov && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={() => handleRemoveOverride(e.etudiantId)}
                                            className="text-destructive focus:text-destructive"
                                          >
                                            <XCircle className="h-4 w-4 mr-2" />
                                            Retirer l&apos;override
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => toggleSelectOne(e.etudiantId)}
                                      >
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        {selectedIds.has(e.etudiantId)
                                          ? 'Désélectionner'
                                          : 'Sélectionner'}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════
              STEP 3 — Confirmation (GlassModal)
              ═════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            // L'étape 3 ne contient qu'un placeholder minimal — la modale
            // s'ouvre automatiquement quand on arrive à cette étape (ouvert
            // depuis handleLaunch à l'étape 2). On garde un placeholder
            // pour le cas où l'utilisateur fermerait la modale.
            <Card>
              <CardContent className="p-6 text-center">
                <CalendarClock className="h-10 w-10 text-info mx-auto mb-3" />
                <h3 className="text-lg font-semibold font-display">
                  En attente de confirmation
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  La fenêtre de confirmation devrait s&apos;être ouverte.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setConfirmOpen(true)
                  }}
                >
                  Rouvrir la confirmation
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ═════════════════════════════════════════════════════════════════
              STEP 4 — Progression (polling)
              ═════════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-display">
                    <Loader2 className="h-5 w-5 text-info animate-spin" />
                    Traitement de la clôture en cours…
                  </CardTitle>
                  <CardDescription>
                    Ne pas fermer cette page. Le batch est traité de manière
                    asynchrone ; cette page s&apos;actualise automatiquement
                    toutes les 5 secondes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {statusQuery.isLoading && !statusQuery.data ? (
                    <div className="flex flex-col items-center py-8">
                      <PulseSkeleton className="h-32 w-32" variant="circle" />
                      <PulseSkeleton className="h-4 w-48 mt-4" />
                    </div>
                  ) : statusQuery.isError ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <AlertCircle className="h-10 w-10 text-destructive mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {statusQuery.error instanceof Error
                          ? statusQuery.error.message
                          : 'Erreur lors du polling du statut.'}
                      </p>
                    </div>
                  ) : statusQuery.data ? (
                    <>
                      {/* ProgressRing central */}
                      <div className="flex flex-col items-center gap-4">
                        <ProgressRing
                          value={statusQuery.data.progression}
                          size={140}
                          strokeWidth={12}
                          accent="info"
                          sublabel="Progression"
                        />
                        <p className="text-sm text-muted-foreground font-mono tabular-nums">
                          {statusQuery.data.progression}%
                        </p>
                      </div>

                      {/* Barre de progression linéaire */}
                      <ProgressBar
                        value={statusQuery.data.progression}
                        accent="info"
                        size="lg"
                        showLabel
                        label="Étudiants traités"
                        showValue
                      />

                      {/* Live counts — 4 KPI cards */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatCard
                          label="Promus"
                          value={statusQuery.data.promuCount}
                          icon={TrendingUp}
                          accent="success"
                          index={0}
                        />
                        <StatCard
                          label="Redoublants"
                          value={statusQuery.data.redoublantCount}
                          icon={RefreshCw}
                          accent="warning"
                          index={1}
                        />
                        <StatCard
                          label="Diplômés"
                          value={statusQuery.data.diplomeCount}
                          icon={Award}
                          accent="info"
                          index={2}
                        />
                        <StatCard
                          label="Erreurs"
                          value={statusQuery.data.erreurCount}
                          icon={AlertCircle}
                          accent="danger"
                          index={3}
                        />
                      </div>

                      {/* Détails : statut + total + batch ID */}
                      <div className="rounded-lg border border-info/30 bg-info/5 p-3 space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Statut batch :</span>
                          <span className="font-mono font-semibold">{statusQuery.data.statut}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total étudiants :</span>
                          <span className="font-mono font-semibold">
                            {statusQuery.data.totalEtudiants}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Batch ID :</span>
                          <span className="font-mono">{statusQuery.data.batchId.slice(0, 12)}…</span>
                        </div>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════
              STEP 5 — Bilan
              ═════════════════════════════════════════════════════════════════ */}
          {step === 5 && (
            <div className="space-y-4">
              {finalStatus ? (
                <>
                  {/* En-tête succès/échec */}
                  <Card className={finalStatus.statut === 'COMPLETED' ? 'border-success/30' : 'border-destructive/30'}>
                    <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                      {finalStatus.statut === 'COMPLETED' ? (
                        <>
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                            <CheckCircle2 className="h-8 w-8 text-success-text" />
                          </div>
                          <h2 className="text-xl font-display font-bold">
                            Clôture terminée avec succès
                          </h2>
                          <p className="text-sm text-muted-foreground max-w-md">
                            Toutes les décisions ont été appliquées et les
                            inscriptions créées pour l&apos;année cible.
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                            <AlertTriangle className="h-8 w-8 text-destructive" />
                          </div>
                          <h2 className="text-xl font-display font-bold text-destructive">
                            Clôture en échec
                          </h2>
                          <p className="text-sm text-destructive max-w-md">
                            {finalStatus.errorMessage ?? 'Erreur inconnue.'}
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* KPIs finaux */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Promus"
                      value={finalStatus.promuCount}
                      icon={TrendingUp}
                      accent="success"
                      index={0}
                    />
                    <StatCard
                      label="Redoublants"
                      value={finalStatus.redoublantCount}
                      icon={RefreshCw}
                      accent="warning"
                      index={1}
                    />
                    <StatCard
                      label="Diplômés"
                      value={finalStatus.diplomeCount}
                      icon={Award}
                      accent="info"
                      index={2}
                    />
                    <StatCard
                      label="Erreurs"
                      value={finalStatus.erreurCount}
                      icon={AlertCircle}
                      accent="danger"
                      index={3}
                    />
                  </div>

                  {/* Liste des erreurs (depuis details.erreurs) */}
                  {(() => {
                    const details = parseDetailsSafe(finalStatus.details)
                    const erreurs = details?.erreurs ?? []
                    if (erreurs.length === 0) return null
                    return (
                      <Card className="border-destructive/30">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 font-display text-base">
                            <AlertCircle className="h-5 w-5 text-destructive" />
                            Erreurs par étudiant ({erreurs.length})
                          </CardTitle>
                          <CardDescription>
                            Ces étudiants n&apos;ont pas pu être traités par le
                            worker (le batch a continué pour les autres). Vérifiez
                            les détails ci-dessous et relancez la clôture si
                            nécessaire.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {erreurs.map((err, i) => (
                              <div
                                key={`${err.etudiantId}-${i}`}
                                className="rounded-lg border border-destructive/20 bg-destructive/5 p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {err.nom ?? err.etudiantId}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-mono truncate">
                                      {err.etudiantId}
                                    </p>
                                  </div>
                                  <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] shrink-0">
                                    Erreur
                                  </Badge>
                                </div>
                                <p className="mt-2 text-xs text-destructive italic">
                                  « {err.erreur} »
                                </p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })()}

                  {/* Actions finales */}
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button variant="outline" onClick={handleDownloadCsv}>
                      <Download className="h-4 w-4 mr-2" />
                      Télécharger le rapport CSV
                    </Button>
                    <Button variant="outline" onClick={handleResetToConfig}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retour à la configuration
                    </Button>
                  </div>
                </>
              ) : (
                <Card>
                  <CardContent className="p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      Aucun bilan disponible.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={handleResetToConfig}
                    >
                      Retour à la configuration
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ─── Historique des clôtures (toujours visible, collapsible) ─── */}
      <HistorySection etablissementId={etabId} anneesMap={anneesMap} />

      {/* ═════════════════════════════════════════════════════════════════
          Modale de confirmation (étape 3) — GlassModal
          ═════════════════════════════════════════════════════════════════ */}
      <GlassModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Confirmer la clôture de l'année ${anneesMap.get(anneeSourceId)?.libelle ?? ''}`}
        description="Cette action est irréversible."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={runMutation.isPending}>
              Annuler
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!confirmChecked || runMutation.isPending}
              className="gap-2 bg-destructive hover:bg-destructive/90"
            >
              {runMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Lancer la clôture
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Récapitulatif */}
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-2">
            <p className="text-sm">
              <strong>{etudiants.length}</strong> inscription(s) seront
              {anneeCibleId ? (
                <>
                  {' '}créées pour{' '}
                  <strong>{anneesMap.get(anneeCibleId)?.libelle ?? 'l\'année cible'}</strong>.
                </>
              ) : (
                <> traitées sans création d&apos;inscription cible (archive pure).</>
              )}
            </p>
            {overrides.size > 0 && (
              <p className="text-sm">
                <strong>{overrides.size}</strong> override(s) manuel(s) seront
                appliqué(s) (priorité sur la logique automatique).
              </p>
            )}
            {anneeCibleId && (
              <p className="text-xs text-muted-foreground">
                Les étudiants promus ou redoublants recevront une nouvelle
                inscription <code className="font-mono">EN_COURS</code> pour
                l&apos;année cible.
              </p>
            )}
          </div>

          {/* Avertissement irréversibilité */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Action irréversible
            </p>
            <p className="mt-1 text-sm text-destructive">
              Une fois la clôture lancée, les décisions seront appliquées et
              ne pourront pas être annulées en masse. En cas d&apos;erreur,
              il faudra corriger chaque étudiant individuellement.
            </p>
          </div>

          {/* Checkbox de confirmation */}
          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm-irreversible"
              checked={confirmChecked}
              onCheckedChange={(c) => setConfirmChecked(c === true)}
              className="mt-1"
            />
            <Label htmlFor="confirm-irreversible" className="text-sm cursor-pointer">
              Je comprends que cette action est <strong>irréversible</strong> et
              que les décisions seront appliquées à tous les étudiants listés.
            </Label>
          </div>

          {/* Motif optionnel (global) */}
          <div className="space-y-2">
            <Label htmlFor="confirm-motif" className="text-sm font-medium">
              Motif <span className="text-muted-foreground">(optionnel, journalisé dans l&apos;audit)</span>
            </Label>
            <Textarea
              id="confirm-motif"
              placeholder="Ex: Clôture officielle de fin d'année, jury pédagogique du [date]…"
              value={confirmMotif}
              onChange={(e) => setConfirmMotif(e.target.value)}
              maxLength={500}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {confirmMotif.length}/500 caractères. Ce motif sera conservé dans
              l&apos;historique du batch.
            </p>
          </div>
        </div>
      </GlassModal>

      {/* ═════════════════════════════════════════════════════════════════
          OverrideDialog — sous-dialogue (étape 2)
          ═════════════════════════════════════════════════════════════════ */}
      <OverrideDialog
        open={!!overrideTarget}
        onOpenChange={(open) => {
          if (!open) setOverrideTarget(null)
        }}
        etudiant={overrideTarget}
        currentDecision={overrideCurrentDecision}
        onConfirm={handleConfirmOverride}
      />
    </div>
  )
}
