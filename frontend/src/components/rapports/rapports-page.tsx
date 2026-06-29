'use client'

// ═══════════════════════════════════════════════════════════════════════════
//  Module /rapports — Refonte UX "Savane EdTech"
//  Composants DS unifiés (StatCard, ProgressBar, ProgressRing, PulseSkeleton…)
//  Palette africaine : vert lime + terre cuite + bleu nuit + or + motif kente.
//  Logique métier (fetch TanStack, exports CSV/PDF, filtres) conservée intacte.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  TrendingUp,
  Users,
  ClipboardList,
  GraduationCap,
  Trophy,
  AlertTriangle,
  Download,
  FileText,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CalendarDays,
  Eye,
  UserX,
  BookOpen,
  Medal,
  Award,
  Sparkles,
  RotateCcw,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  type TooltipProps,
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Composants DS unifiés
import {
  StatCard,
  ProgressBar,
  ProgressRing,
  PulseSkeleton,
  StatCardSkeletonGrid,
} from '@/components/ds'

// ─── Types (aligned with API response — conservés intacts) ───

interface StatsData {
  nbEtudiants: number
  nbEnseignants: number
  nbEvaluations: number
  tauxReussiteGlobal: number
  moyenneGenerale: number
  repartitionNotes: Array<{ label: string; count: number }>
  resultatsParMatiere: Array<{
    titre: string
    enseignant: string
    moyenne: number
    tauxReussite: number
    nbParticipants: number
  }>
  etudiantsParFiliere: Array<{ filiere: string; count: number }>
  evolutionMoyennes: Array<{ mois: string; moyenne: number; nbEvaluations: number }>
  topEnseignants: Array<{
    nom: string
    nbEpreuves: number
    moyenne: number
    tauxReussite: number
  }>
  alertes: Array<{ type: string; titre: string; description: string; severity: string }>
  topEtudiants: Array<{
    id: string
    nom: string
    email: string
    moyenne: number
    filiere: string
  }>
  etudiantsEnDifficulte: Array<{
    id: string
    nom: string
    email: string
    moyenne: number
    filiere: string
  }>
}

interface FiliereOption {
  id: string
  nom: string
}

// ─── Chart colors — palette "Savane EdTech" ───
// Recharts n'accède pas aux variables CSS : on utilise les hex bruts alignés
// sur les tokens sémantiques (--primary, --secondary, --gold, --warning…).

const CHART_COLORS = [
  '#84CC16', // primary — vert lime
  '#C2410C', // secondary — terre cuite
  '#D4A017', // gold — or africain
  '#F5A623', // warning — orange soleil
  '#1E1B4B', // info — bleu nuit
  '#06B6D4', // tech — cyan
  '#CD7F32', // bronze
  '#C0C0C0', // silver
] as const

const GRADE_COLORS: Record<string, string> = {
  '0-4': '#D0021B',   // destructive
  '4-8': '#C2410C',   // secondary / terre cuite
  '8-10': '#F5A623',  // warning
  '10-12': '#84CC16', // primary / lime
  '12-14': '#3F6212', // primary-text / vert foncé
  '14-16': '#06B6D4', // tech
  '16-20': '#D4A017', // gold
}

// Couleur d'une cellule de barre (résultats par matière) selon la moyenne.
function barColorForScore(score: number): string {
  if (score >= 14) return '#84CC16'
  if (score >= 10) return '#3F6212'
  if (score >= 8) return '#F5A623'
  return '#D0021B'
}

// ─── Type extension pour jsPDF + autoTable (évite @ts-ignore / any) ───

interface AutoTableDoc extends jsPDF {
  lastAutoTable?: { finalY: number }
}

// ─── Month formatter (conservé) ───

function formatMonth(mois: string): string {
  const [year, month] = mois.split('-')
  const months: Record<string, string> = {
    '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr',
    '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Aoû',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc',
  }
  return `${months[month] || month} ${year.slice(2)}`
}

// ─── Score color helpers (conservés) ───

function getScoreColor(score: number): string {
  if (score >= 14) return 'text-success-text'
  if (score >= 10) return 'text-info'
  if (score >= 8) return 'text-warning'
  return 'text-destructive'
}

function getScoreBg(score: number): string {
  if (score >= 14) return 'bg-success/15 text-success-text border-success/30'
  if (score >= 10) return 'bg-info/15 text-info border-info/30'
  if (score >= 8) return 'bg-warning/15 text-warning border-warning/30'
  return 'bg-destructive/15 text-destructive border-destructive/30'
}

function getTrendIcon(trend: 'up' | 'down' | 'stable') {
  if (trend === 'up') return <ArrowUpRight className="h-4 w-4 text-success-text" />
  if (trend === 'down') return <ArrowDownRight className="h-4 w-4 text-destructive" />
  return <Minus className="h-4 w-4 text-warning" />
}

// ─── Medal metadata pour le podium (top 3 étudiants) ───

interface MedalMeta {
  bg: string
  text: string
  glow: string
  icon: LucideIcon
  label: string
}

function getMedalMeta(rank: number): MedalMeta {
  if (rank === 0) return { bg: 'bg-gold', text: 'text-white', glow: 'ds-glow-gold', icon: Trophy, label: 'Or' }
  if (rank === 1) return { bg: 'bg-silver', text: 'text-black', glow: 'ds-glow-silver', icon: Medal, label: 'Argent' }
  if (rank === 2) return { bg: 'bg-bronze', text: 'text-white', glow: 'ds-glow-bronze', icon: Award, label: 'Bronze' }
  return { bg: 'bg-muted', text: 'text-muted-foreground', glow: '', icon: ChevronRight, label: '' }
}

// ─── Severity metadata pour les alertes ───

type AlertSeverity = 'critical' | 'warning' | 'info'

interface SeverityMeta {
  border: string
  bg: string
  iconBg: string
  iconText: string
  label: string
}

const SEVERITY_META: Record<AlertSeverity, SeverityMeta> = {
  critical: {
    border: 'border-l-destructive',
    bg: 'bg-destructive/5',
    iconBg: 'bg-destructive/15',
    iconText: 'text-destructive',
    label: 'Critique',
  },
  warning: {
    border: 'border-l-warning',
    bg: 'bg-warning/5',
    iconBg: 'bg-warning/15',
    iconText: 'text-warning',
    label: 'Attention',
  },
  info: {
    border: 'border-l-info',
    bg: 'bg-info/5',
    iconBg: 'bg-info/15',
    iconText: 'text-info',
    label: 'Info',
  },
}

function getSeverityMeta(severity: string): SeverityMeta {
  return SEVERITY_META[severity as AlertSeverity] ?? SEVERITY_META.info
}

// ─── Premium Chart Tooltip ───

interface ChartTooltipProps {
  unit?: string
  valueFormatter?: (value: number) => string
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  valueFormatter,
}: TooltipProps<number, string> & ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm p-3 shadow-lg ds-kente-top overflow-hidden min-w-[140px]">
      {label && (
        <p className="text-xs font-display font-semibold tracking-tight mb-1.5 text-foreground">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => {
          const raw = entry.value
          const num = typeof raw === 'number'
            ? raw
            : Array.isArray(raw)
              ? Number(raw[0]) || 0
              : Number(raw) || 0
          const display = valueFormatter ? valueFormatter(num) : `${num}${unit ?? ''}`
          return (
            <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
                aria-hidden="true"
              />
              <span className="truncate">{entry.name}</span>
              <span className="font-semibold text-foreground ml-auto font-mono tabular-nums">
                {display}
              </span>
            </p>
          )
        })}
      </div>
    </div>
  )
}

// ─── Empty chart placeholder (riche, avec watermark kente) ───

function EmptyChart({ message, icon: Icon = BarChart3 }: { message: string; icon?: LucideIcon }) {
  return (
    <div
      className="ds-kente-watermark flex flex-col items-center justify-center h-[260px] text-sm text-muted-foreground gap-3 rounded-lg"
      role="img"
      aria-label={message}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/60">
        <Icon className="h-7 w-7 text-muted-foreground/40" />
      </div>
      <p className="text-center max-w-[220px]">{message}</p>
    </div>
  )
}

// ─── FadeIn : wrapper d'animation whileInView (Framer Motion) ───

function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ─── Premium Chart Card (DRY wrapper) ───

interface ChartCardProps {
  title: string
  description: string
  icon: LucideIcon
  iconColor: string
  badge?: { label: string; variant: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' }
  children: React.ReactNode
}

const CHART_BADGE_VARIANT: Record<NonNullable<ChartCardProps['badge']>['variant'], string> = {
  primary: 'bg-primary/10 text-primary-text border-primary/20',
  secondary: 'bg-secondary/10 text-secondary border-secondary/20',
  success: 'bg-success/10 text-success-text border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  danger: 'bg-destructive/10 text-destructive border-destructive/20',
  info: 'bg-info/10 text-info border-info/20',
}

function ChartCard({ title, description, icon: Icon, iconColor, badge, children }: ChartCardProps) {
  return (
    <Card className="ds-kente-top overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
              <Icon className={`h-4 w-4 ${iconColor} shrink-0`} />
              <span className="truncate">{title}</span>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
          </div>
          {badge && (
            <span
              className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${CHART_BADGE_VARIANT[badge.variant]}`}
            >
              {badge.label}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════════════════

export function RapportsPage() {
  // ─── Filter state ───
  const [selectedFiliere, setSelectedFiliere] = useState('all')
  const [dateDebut, setDateDebut] = useState<string>('')
  const [dateFin, setDateFin] = useState<string>('')

  // ─── Fetch stats (TanStack Query) — queryKey inclut les filtres ───
  const statsQuery = useQuery<StatsData>({
    queryKey: ['rapports-stats', selectedFiliere, dateDebut, dateFin],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedFiliere && selectedFiliere !== 'all') {
        params.set('filiereId', selectedFiliere)
      }
      if (dateDebut) params.set('dateDebut', dateDebut)
      if (dateFin) params.set('dateFin', dateFin)
      const qs = params.toString()
      const res = await fetch(`/api/stats/responsable${qs ? `?${qs}` : ''}`)
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('Stats API error:', errorData)
        throw new Error('Failed to fetch stats')
      }
      const data = await res.json()
      return data
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // ─── Fetch filieres (TanStack Query) ───
  const filieresQuery = useQuery<{ filieres: FiliereOption[] }>({
    queryKey: ['rapports-filieres'],
    queryFn: async () => {
      const res = await fetch('/api/filieres')
      if (!res.ok) throw new Error('Failed to fetch filieres')
      const data = await res.json()
      return { filieres: (data.filieres ?? []).map((f: { id: string; nom: string }) => ({ id: f.id, nom: f.nom })) }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const stats = statsQuery.data ?? null
  const isLoading = statsQuery.isLoading
  const isError = statsQuery.isError
  const filieres = filieresQuery.data?.filieres ?? []

  // ─── Derived data ───
  const hasData = stats && (
    stats.nbEvaluations > 0 ||
    stats.nbEtudiants > 0 ||
    stats.moyenneGenerale > 0
  )

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (selectedFiliere && selectedFiliere !== 'all') n++
    if (dateDebut) n++
    if (dateFin) n++
    return n
  }, [selectedFiliere, dateDebut, dateFin])

  const filiereLabel = selectedFiliere && selectedFiliere !== 'all'
    ? filieres.find((f) => f.id === selectedFiliere)?.nom || 'Toutes filières'
    : 'Toutes filières'

  const totalParticipants = useMemo(
    () => stats?.resultatsParMatiere.reduce((acc, r) => acc + r.nbParticipants, 0) ?? 0,
    [stats],
  )

  const resetFilters = () => {
    setSelectedFiliere('all')
    setDateDebut('')
    setDateFin('')
  }

  // ─── Helper: download blob via hidden link ───
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    setTimeout(() => {
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 100)
  }

  // ─── Helper: build date suffix for filenames ───
  const getDateSuffix = () =>
    dateDebut || dateFin
      ? `${dateDebut || 'debut'}_${dateFin || 'fin'}`
      : new Date().toISOString().slice(0, 10)

  // ─── Export CSV (conservé) ───
  const handleExportCSV = () => {
    if (!stats) return
    try {
      const rows: string[][] = []

      rows.push(['INDICATEURS CLES'])
      rows.push(['Indicateur', 'Valeur'])
      rows.push(['Moyenne generale', `${stats.moyenneGenerale}/20`])
      rows.push(['Taux de reussite global', `${stats.tauxReussiteGlobal}%`])
      rows.push(["Nombre d'evaluations", stats.nbEvaluations.toString()])
      rows.push(["Nombre d'etudiants", stats.nbEtudiants.toString()])
      rows.push(["Nombre d'enseignants", stats.nbEnseignants.toString()])
      rows.push(['Etudiants en difficulte', stats.etudiantsEnDifficulte.length.toString()])

      if (stats.etudiantsParFiliere.length > 0) {
        rows.push([])
        rows.push(['ETUDIANTS PAR FILIERE'])
        rows.push(['Filiere', "Nombre d'etudiants"])
        stats.etudiantsParFiliere.forEach((f) => {
          rows.push([f.filiere, f.count.toString()])
        })
      }

      if (stats.resultatsParMatiere.length > 0) {
        rows.push([])
        rows.push(['RESULTATS PAR MATIERE'])
        rows.push(['Matiere', 'Enseignant', 'Moyenne', 'Taux de reussite', 'Participants'])
        stats.resultatsParMatiere.forEach((r) => {
          rows.push([r.titre, r.enseignant, `${r.moyenne}/20`, `${r.tauxReussite}%`, r.nbParticipants.toString()])
        })
      }

      if (stats.repartitionNotes.some((r) => r.count > 0)) {
        rows.push([])
        rows.push(['REPARTITION DES NOTES'])
        rows.push(['Tranche', "Nombre d'etudiants"])
        stats.repartitionNotes.forEach((r) => {
          rows.push([r.label, r.count.toString()])
        })
      }

      if (stats.topEnseignants.length > 0) {
        rows.push([])
        rows.push(['TOP ENSEIGNANTS'])
        rows.push(['Enseignant', 'Nb epreuves', 'Moyenne', 'Taux reussite'])
        stats.topEnseignants.forEach((e) => {
          rows.push([e.nom, e.nbEpreuves.toString(), `${e.moyenne}/20`, `${e.tauxReussite}%`])
        })
      }

      if (stats.topEtudiants.length > 0) {
        rows.push([])
        rows.push(['TOP 5 ETUDIANTS'])
        rows.push(['Nom', 'Email', 'Filiere', 'Moyenne'])
        stats.topEtudiants.forEach((e) => {
          rows.push([e.nom, e.email, e.filiere, `${e.moyenne}/20`])
        })
      }

      if (stats.etudiantsEnDifficulte.length > 0) {
        rows.push([])
        rows.push(['ETUDIANTS EN DIFFICULTE (< 10/20)'])
        rows.push(['Nom', 'Email', 'Filiere', 'Moyenne'])
        stats.etudiantsEnDifficulte.forEach((e) => {
          rows.push([e.nom, e.email, e.filiere, `${e.moyenne}/20`])
        })
      }

      const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n')
      const bom = '\uFEFF'
      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
      downloadBlob(blob, `rapport-sect-${getDateSuffix()}.csv`)
      toast.success('Rapport exporté en CSV')
    } catch (err) {
      console.error('CSV export error:', err)
      toast.error('Erreur', { description: "Impossible d'exporter le rapport CSV." })
    }
  }

  // ─── Export PDF (couleurs mises à jour palette Savane EdTech) ───
  const handleExportPDF = () => {
    if (!stats) return
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as AutoTableDoc
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      const contentWidth = pageWidth - margin * 2
      let yPos = margin

      // ─── Palette Savane EdTech (tuples [r,g,b] pour jsPDF) ───
      const lime: [number, number, number] = [132, 204, 22]    // #84CC16 primary
      const terre: [number, number, number] = [194, 65, 12]    // #C2410C secondary
      const gold: [number, number, number] = [212, 160, 23]    // #D4A017 gold
      const nuit: [number, number, number] = [30, 27, 75]      // #1E1B4B info
      const red: [number, number, number] = [208, 2, 27]       // #D0021B destructive
      const amber: [number, number, number] = [245, 166, 35]   // #F5A623 warning
      const dark: [number, number, number] = [30, 41, 59]      // slate-800
      const muted: [number, number, number] = [100, 116, 139]  // slate-500
      const light: [number, number, number] = [241, 245, 249]  // slate-100

      const addFooter = () => {
        doc.setFontSize(8)
        doc.setTextColor(...muted)
        doc.text('SECT — Savane EdTech — Rapport de performance', margin, pageHeight - 8)
        doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
      }

      const checkPage = (needed: number) => {
        if (yPos + needed > pageHeight - 15) {
          addFooter()
          doc.addPage()
          yPos = margin
        }
      }

      const addSectionTitle = (title: string, color: [number, number, number] = lime) => {
        checkPage(12)
        doc.setFontSize(12)
        doc.setTextColor(...color)
        doc.setFont('helvetica', 'bold')
        doc.text(title, margin, yPos)
        doc.setDrawColor(...color)
        doc.setLineWidth(0.5)
        doc.line(margin, yPos + 1, margin + doc.getTextWidth(title), yPos + 1)
        yPos += 8
      }

      // ═══ PAGE 1: HEADER + KPIs ═══
      // Bandeau kente simulé : 3 bandes tricolores (lime / terre / gold)
      doc.setFillColor(...lime)
      doc.rect(0, 0, pageWidth, 4, 'F')
      doc.setFillColor(...terre)
      doc.rect(0, 4, pageWidth, 2, 'F')
      doc.setFillColor(...gold)
      doc.rect(0, 6, pageWidth, 2, 'F')
      // Fond header
      doc.setFillColor(...nuit)
      doc.rect(0, 8, pageWidth, 26, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('Rapport de Performance', margin, 20)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...lime)
      doc.text('Savane EdTech — SECT', margin, 27)
      doc.setTextColor(220, 220, 220)
      doc.text(filiereLabel, margin, 32)

      const dateLabel = (dateDebut || dateFin)
        ? `Période: ${dateDebut || '...'} au ${dateFin || '...'}`
        : `Date: ${new Date().toLocaleDateString('fr-FR')}`
      doc.text(dateLabel, pageWidth - margin, 32, { align: 'right' })

      yPos = 42

      // KPI Cards row — accents variés Savane
      const kpis: { label: string; value: string; color: [number, number, number] }[] = [
        { label: 'Moyenne Générale', value: `${stats.moyenneGenerale}/20`, color: lime },
        { label: 'Taux de Réussite', value: `${stats.tauxReussiteGlobal}%`, color: terre },
        { label: 'Évaluations', value: `${stats.nbEvaluations}`, color: gold },
        { label: 'Étudiants', value: `${stats.nbEtudiants}`, color: nuit },
      ]

      const cardWidth = (contentWidth - 9) / 4
      kpis.forEach((kpi, i) => {
        const x = margin + i * (cardWidth + 3)
        doc.setFillColor(...light)
        doc.roundedRect(x, yPos, cardWidth, 20, 2, 2, 'F')
        doc.setFillColor(...kpi.color)
        doc.rect(x, yPos, 2, 20, 'F')
        doc.setFontSize(14)
        doc.setTextColor(...dark)
        doc.setFont('helvetica', 'bold')
        doc.text(kpi.value, x + 5, yPos + 9)
        doc.setFontSize(7)
        doc.setTextColor(...muted)
        doc.setFont('helvetica', 'normal')
        doc.text(kpi.label, x + 5, yPos + 15)
      })

      yPos += 28

      doc.setFontSize(8)
      doc.setTextColor(...muted)
      doc.text(
        `Enseignants actifs: ${stats.nbEnseignants}  |  Participants aux épreuves: ${totalParticipants}  |  Étudiants en difficulté: ${stats.etudiantsEnDifficulte.length}`,
        margin,
        yPos,
      )
      yPos += 8

      // ═══ SECTION: Résultats par matière ═══
      if (stats.resultatsParMatiere.length > 0) {
        addSectionTitle('Résultats par matière')
        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Épreuve', 'Enseignant', 'Moyenne', 'Réussite', 'Participants']],
          body: stats.resultatsParMatiere.map((r) => [
            r.titre,
            r.enseignant,
            `${r.moyenne}/20`,
            `${r.tauxReussite}%`,
            r.nbParticipants.toString(),
          ]),
          headStyles: { fillColor: lime, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 8, textColor: dark },
          alternateRowStyles: { fillColor: light },
          columnStyles: {
            2: { halign: 'center', cellWidth: 22 },
            3: { halign: 'center', cellWidth: 22 },
            4: { halign: 'center', cellWidth: 22 },
          },
          didDrawPage: () => addFooter(),
        })
        yPos = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 8 : yPos + 8
      }

      // ═══ SECTION: Répartition des notes ═══
      if (stats.repartitionNotes.some((r) => r.count > 0)) {
        addSectionTitle('Répartition des notes', terre)
        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Tranche', "Nombre d'étudiants"]],
          body: stats.repartitionNotes.map((r) => [r.label, r.count.toString()]),
          headStyles: { fillColor: terre, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9, textColor: dark },
          alternateRowStyles: { fillColor: light },
          columnStyles: {
            0: { halign: 'center', cellWidth: 40 },
            1: { halign: 'center', cellWidth: 40 },
          },
          didDrawPage: () => addFooter(),
        })
        yPos = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 8 : yPos + 8
      }

      // ═══ SECTION: Étudiants par filière ═══
      if (stats.etudiantsParFiliere.length > 0) {
        addSectionTitle('Étudiants par filière')
        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Filière', "Nombre d'étudiants"]],
          body: stats.etudiantsParFiliere.map((f) => [f.filiere, f.count.toString()]),
          headStyles: { fillColor: lime, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9, textColor: dark },
          alternateRowStyles: { fillColor: light },
          columnStyles: { 1: { halign: 'center', cellWidth: 40 } },
          didDrawPage: () => addFooter(),
        })
        yPos = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 8 : yPos + 8
      }

      // ═══ SECTION: Top enseignants ═══
      if (stats.topEnseignants.length > 0) {
        addSectionTitle('Performance des enseignants', nuit)
        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Enseignant', 'Nb épreuves', 'Moyenne', 'Taux réussite']],
          body: stats.topEnseignants.map((e) => [
            e.nom,
            e.nbEpreuves.toString(),
            `${e.moyenne}/20`,
            `${e.tauxReussite}%`,
          ]),
          headStyles: { fillColor: nuit, textColor: lime, fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9, textColor: dark },
          alternateRowStyles: { fillColor: light },
          columnStyles: {
            1: { halign: 'center', cellWidth: 25 },
            2: { halign: 'center', cellWidth: 22 },
            3: { halign: 'center', cellWidth: 25 },
          },
          didDrawPage: () => addFooter(),
        })
        yPos = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 8 : yPos + 8
      }

      // ═══ SECTION: Top étudiants ═══
      if (stats.topEtudiants.length > 0) {
        addSectionTitle('Top 5 étudiants', gold)
        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Nom', 'Email', 'Filière', 'Moyenne']],
          body: stats.topEtudiants.map((e) => [e.nom, e.email, e.filiere, `${e.moyenne}/20`]),
          headStyles: { fillColor: gold, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 8, textColor: dark },
          alternateRowStyles: { fillColor: light },
          columnStyles: { 3: { halign: 'center', cellWidth: 22 } },
          didDrawPage: () => addFooter(),
        })
        yPos = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 8 : yPos + 8
      }

      // ═══ SECTION: Étudiants en difficulté ═══
      if (stats.etudiantsEnDifficulte.length > 0) {
        addSectionTitle('Étudiants en difficulté (< 10/20)', red)
        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Nom', 'Email', 'Filière', 'Moyenne']],
          body: stats.etudiantsEnDifficulte.map((e) => [e.nom, e.email, e.filiere, `${e.moyenne}/20`]),
          headStyles: { fillColor: red, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 8, textColor: dark },
          alternateRowStyles: { fillColor: light },
          columnStyles: { 3: { halign: 'center', cellWidth: 22 } },
          didDrawPage: () => addFooter(),
        })
        yPos = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 8 : yPos + 8
      }

      // ═══ SECTION: Alertes ═══
      if (stats.alertes.length > 0) {
        addSectionTitle('Alertes détectées', amber)
        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Type', 'Titre', 'Description']],
          body: stats.alertes.map((a) => [a.type, a.titre, a.description]),
          headStyles: { fillColor: amber, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 8, textColor: dark },
          alternateRowStyles: { fillColor: light },
          columnStyles: { 0: { cellWidth: 25 } },
          didDrawPage: () => addFooter(),
        })
      }

      addFooter()

      doc.setProperties({
        title: 'Rapport de Performance SECT',
        subject: filiereLabel,
        author: 'SECT — Savane EdTech',
        creator: 'SECT',
      })

      doc.save(`rapport-sect-${getDateSuffix()}.pdf`)
      toast.success('Rapport exporté en PDF')
    } catch (err) {
      console.error('PDF export error:', err)
      toast.error('Erreur', { description: 'Impossible de générer le PDF. Réessayez.' })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ─── Hero header (signature Savane EdTech) ─── */}
      <FadeIn>
        <div className="ds-kente-pattern-strong -mx-4 -mt-4 rounded-lg px-5 py-5 sm:-mx-6 sm:px-6 relative overflow-hidden">
          <div className="ds-kente-strip absolute top-0 left-0 right-0" aria-hidden="true" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-gold" />
                <span className="text-[11px] font-display font-semibold uppercase tracking-wider text-primary-text">
                  Savane EdTech
                </span>
              </div>
              <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-text shrink-0">
                  <BarChart3 className="h-5 w-5" />
                </span>
                Rapports et Statistiques
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground max-w-xl">
                Analysez les performances de vos filières et le suivi pédagogique de vos enseignants.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={!hasData}
                className="border-success/40 text-success-text hover:bg-success/10 hover:text-success-text"
                aria-label="Exporter le rapport en CSV"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Exporter CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={!hasData}
                className="border-info/40 text-info hover:bg-info/10 hover:text-info"
                aria-label="Exporter le rapport en PDF"
              >
                <FileText className="h-4 w-4 mr-1.5" />
                Exporter PDF
              </Button>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* ─── Toolbar filtres ─── */}
      <FadeIn delay={0.05}>
        <Card className="ds-kente-top overflow-hidden">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              {/* Filière */}
              <div className="flex flex-col gap-1.5 min-w-0 lg:min-w-[260px]">
                <Label className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Filter className="h-3 w-3" />
                  Filière
                </Label>
                <Select value={selectedFiliere} onValueChange={setSelectedFiliere}>
                  <SelectTrigger className="w-full lg:w-[260px]" aria-label="Filtrer par filière">
                    <SelectValue placeholder="Sélectionner une filière" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les filières</SelectItem>
                    {filieres.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Plage de dates */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3" />
                  Période
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Du</span>
                    <Input
                      id="dateDebut"
                      type="date"
                      value={dateDebut}
                      onChange={(e) => setDateDebut(e.target.value)}
                      className="h-9 w-[150px] text-xs"
                      aria-label="Date de début"
                    />
                  </div>
                  <span className="text-muted-foreground" aria-hidden="true">—</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Au</span>
                    <Input
                      id="dateFin"
                      type="date"
                      value={dateFin}
                      onChange={(e) => setDateFin(e.target.value)}
                      className="h-9 w-[150px] text-xs"
                      aria-label="Date de fin"
                    />
                  </div>
                </div>
              </div>

              {/* État filtre + reset */}
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 ? (
                  <Badge className="bg-primary/15 text-primary-text border border-primary/30 gap-1">
                    <Filter className="h-3 w-3" />
                    {activeFilterCount} filtre{activeFilterCount > 1 ? 's' : ''} actif{activeFilterCount > 1 ? 's' : ''}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Aucun filtre actif</span>
                )}
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-xs text-muted-foreground hover:text-foreground"
                    onClick={resetFilters}
                    aria-label="Réinitialiser les filtres"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Réinitialiser
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* ─── Loading skeleton (matche la forme du contenu final) ─── */}
      <AnimatePresence mode="wait">
        {isLoading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <StatCardSkeletonGrid count={4} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="space-y-2">
                      <PulseSkeleton className="h-3 w-24" />
                      <PulseSkeleton className="h-6 w-12" />
                    </div>
                    <PulseSkeleton className="h-10 w-10" variant="circle" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <PulseSkeleton className="h-5 w-40 mb-4" />
                    <PulseSkeleton className="h-48 w-full" variant="card" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {/* ─── Error state (RAPPORTS-FIX-R7) ─── */}
        {!isLoading && isError && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="ds-kente-watermark flex flex-col items-center justify-center rounded-xl border border-dashed border-destructive/40 py-16 relative overflow-hidden"
            role="alert"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
            <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">
              Impossible de charger les statistiques
            </h3>
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
              Une erreur est survenue lors de la récupération des données. Vérifiez votre connexion et réessayez.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => statsQuery.refetch()}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Réessayer
            </Button>
          </motion.div>
        )}

        {/* ─── Empty state ─── */}
        {!isLoading && !hasData && !isError && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="ds-kente-watermark flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 relative overflow-hidden"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
              <BarChart3 className="h-10 w-10 text-success-text" />
            </div>
            <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">Aucune donnée disponible</h3>
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
              Les statistiques apparaîtront une fois que des évaluations auront été réalisées par les enseignants de vos filières.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              <span>{stats?.nbEnseignants ?? 0} enseignant(s) actif(s) · {stats?.nbEtudiants ?? 0} étudiant(s) inscrit(s)</span>
            </div>
          </motion.div>
        )}

        {/* ─── Stats content ─── */}
        {!isLoading && hasData && stats && (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* ═══ KPIs primaires (4 StatCards DS) ═══ */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Moyenne générale"
                value={`${stats.moyenneGenerale}`}
                suffix="/20"
                icon={TrendingUp}
                accent="success"
                hint="Toutes évaluations confondues"
                scoreOn20={stats.moyenneGenerale}
                index={0}
              />
              <StatCard
                label="Taux de réussite"
                value={`${stats.tauxReussiteGlobal}`}
                suffix="%"
                icon={Trophy}
                accent="info"
                hint="Notes ≥ 10/20"
                index={1}
              />
              <StatCard
                label="Évaluations"
                value={stats.nbEvaluations}
                icon={ClipboardList}
                accent="warning"
                hint="Épreuves terminées"
                index={2}
              />
              <StatCard
                label="Étudiants"
                value={stats.nbEtudiants}
                icon={Users}
                accent="danger"
                hint={`${stats.etudiantsEnDifficulte.length} en difficulté`}
                index={3}
              />
            </div>

            {/* ═══ KPIs secondaires (bande compacte) ═══ */}
            <FadeIn delay={0.1}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Enseignants actifs */}
                <Card className="ds-kente-top overflow-hidden">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-success/10 text-success-text shrink-0">
                        <Users className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-display">Enseignants actifs</p>
                        <p className="text-xl font-bold font-mono tabular-nums">{stats.nbEnseignants}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {/* Participants */}
                <Card className="ds-kente-top overflow-hidden">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-info/10 text-info shrink-0">
                        <Eye className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-display">Participants</p>
                        <p className="text-xl font-bold font-mono tabular-nums">{totalParticipants}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {/* Étudiants en difficulté (avec ProgressRing) */}
                <Card className="ds-kente-top overflow-hidden">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive shrink-0">
                        <UserX className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-display">En difficulté</p>
                        <p className="text-xl font-bold font-mono tabular-nums text-destructive">{stats.etudiantsEnDifficulte.length}</p>
                      </div>
                    </div>
                    {stats.nbEtudiants > 0 && (
                      <ProgressRing
                        value={(stats.etudiantsEnDifficulte.length / stats.nbEtudiants) * 100}
                        size={42}
                        strokeWidth={5}
                        accent="danger"
                        showPercent={false}
                        label=""
                        sublabel=""
                        index={1}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </FadeIn>

            <div className="ds-african-divider" role="separator" aria-orientation="horizontal" aria-label="Séparateur" />

            {/* ═══ Section graphiques (2×2) ═══ */}
            <FadeIn delay={0.05}>
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-primary-text" />
                <h2 className="text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground">
                  Analyse graphique
                </h2>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* 1. Évolution des moyennes */}
              <FadeIn delay={0.05}>
                <ChartCard
                  title="Évolution des moyennes"
                  description="Tendance mensuelle des scores moyens"
                  icon={TrendingUp}
                  iconColor="text-success-text"
                  badge={stats.evolutionMoyennes.length > 0 ? { label: `${stats.evolutionMoyennes.length} mois`, variant: 'success' } : undefined}
                >
                  {stats.evolutionMoyennes.length > 0 ? (
                    <div role="img" aria-label="Évolution mensuelle des moyennes">
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={stats.evolutionMoyennes.map((e) => ({ ...e, mois: formatMonth(e.mois) }))}>
                        <defs>
                          <linearGradient id="limeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#84CC16" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#84CC16" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.929 0.013 255.5)" />
                        <XAxis dataKey="mois" tick={{ fontSize: 11, fill: 'oklch(0.551 0.027 264.4)' }} stroke="oklch(0.929 0.013 255.5)" />
                        <YAxis domain={[0, 20]} tick={{ fontSize: 11, fill: 'oklch(0.551 0.027 264.4)' }} stroke="oklch(0.929 0.013 255.5)" />
                        <Tooltip content={<ChartTooltip unit="/20" />} />
                        <Area
                          type="monotone"
                          dataKey="moyenne"
                          stroke="#84CC16"
                          strokeWidth={2.5}
                          fill="url(#limeGradient)"
                          name="Moyenne"
                          dot={{ fill: '#84CC16', r: 3, strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: '#3F6212', stroke: '#84CC16', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyChart message="Aucune donnée mensuelle disponible" icon={TrendingUp} />
                  )}
                </ChartCard>
              </FadeIn>

              {/* 2. Répartition des notes */}
              <FadeIn delay={0.1}>
                <ChartCard
                  title="Répartition des notes"
                  description="Distribution par tranches de notes"
                  icon={BarChart3}
                  iconColor="text-info"
                  badge={stats.repartitionNotes.some((r) => r.count > 0) ? { label: '7 tranches', variant: 'info' } : undefined}
                >
                  {stats.repartitionNotes.some((r) => r.count > 0) ? (
                    <div role="img" aria-label="Répartition des notes par tranche">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={stats.repartitionNotes}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.929 0.013 255.5)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'oklch(0.551 0.027 264.4)' }} stroke="oklch(0.929 0.013 255.5)" />
                        <YAxis tick={{ fontSize: 11, fill: 'oklch(0.551 0.027 264.4)' }} stroke="oklch(0.929 0.013 255.5)" allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'oklch(0.967 0.001 286.4 / 0.5)' }} />
                        <Bar dataKey="count" name="Étudiants" radius={[6, 6, 0, 0]} maxBarSize={48}>
                          {stats.repartitionNotes.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={GRADE_COLORS[entry.label] || '#84CC16'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyChart message="Aucune note enregistrée" icon={BarChart3} />
                  )}
                </ChartCard>
              </FadeIn>

              {/* 3. Résultats par matière */}
              <FadeIn delay={0.15}>
                <ChartCard
                  title="Résultats par matière"
                  description="Moyenne par épreuve (sur 20)"
                  icon={ClipboardList}
                  iconColor="text-warning"
                  badge={stats.resultatsParMatiere.length > 0 ? { label: `${stats.resultatsParMatiere.length} épreuves`, variant: 'warning' } : undefined}
                >
                  {stats.resultatsParMatiere.length > 0 ? (
                    <div role="img" aria-label="Moyenne par matière">
                    <ResponsiveContainer width="100%" height={Math.max(260, stats.resultatsParMatiere.length * 45)}>
                      <BarChart data={stats.resultatsParMatiere} layout="vertical" margin={{ left: 10, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.929 0.013 255.5)" />
                        <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 11, fill: 'oklch(0.551 0.027 264.4)' }} stroke="oklch(0.929 0.013 255.5)" />
                        <YAxis
                          type="category"
                          dataKey="titre"
                          width={120}
                          tick={{ fontSize: 10, fill: 'oklch(0.551 0.027 264.4)' }}
                          stroke="oklch(0.929 0.013 255.5)"
                        />
                        <Tooltip content={<ChartTooltip unit="/20" />} cursor={{ fill: 'oklch(0.967 0.001 286.4 / 0.5)' }} />
                        <Bar dataKey="moyenne" name="Moyenne" radius={[0, 6, 6, 0]} maxBarSize={28}>
                          {stats.resultatsParMatiere.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={barColorForScore(entry.moyenne)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyChart message="Aucune évaluation terminée" icon={ClipboardList} />
                  )}
                </ChartCard>
              </FadeIn>

              {/* 4. Étudiants par filière (Donut) */}
              <FadeIn delay={0.2}>
                <ChartCard
                  title="Étudiants par filière"
                  description="Répartition des effectifs"
                  icon={GraduationCap}
                  iconColor="text-primary-text"
                  badge={stats.etudiantsParFiliere.length > 0 ? { label: `${stats.etudiantsParFiliere.length} filières`, variant: 'primary' } : undefined}
                >
                  {stats.etudiantsParFiliere.length > 0 && stats.etudiantsParFiliere.some((f) => f.count > 0) ? (
                    <div role="img" aria-label="Répartition des étudiants par filière">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={stats.etudiantsParFiliere.filter((f) => f.count > 0)}
                          dataKey="count"
                          nameKey="filiere"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                          stroke="oklch(1 0 0)"
                          strokeWidth={2}
                          label={({ filiere, percent }) =>
                            `${filiere} (${(percent * 100).toFixed(0)}%)`
                          }
                          labelLine={{ stroke: 'oklch(0.551 0.027 264.4)' }}
                        >
                          {stats.etudiantsParFiliere.filter((f) => f.count > 0).map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyChart message="Aucune filière avec des étudiants" icon={GraduationCap} />
                  )}
                </ChartCard>
              </FadeIn>
            </div>

            {/* ═══ Section classements (2 colonnes) ═══ */}
            <FadeIn delay={0.05}>
              <div className="flex items-center gap-2 mb-1 mt-2">
                <Trophy className="h-4 w-4 text-gold" />
                <h2 className="text-sm font-display font-semibold uppercase tracking-wider text-muted-foreground">
                  Classements
                </h2>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Top 5 — Meilleurs étudiants (médailles) */}
              <FadeIn delay={0.05}>
                <Card className="ds-kente-top overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                      <Trophy className="h-4 w-4 text-gold" />
                      Top 5 — Meilleurs étudiants
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Classement par moyenne aux évaluations
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {stats.topEtudiants.length > 0 ? (
                      <div className="space-y-2">
                        {stats.topEtudiants.map((student, index) => {
                          const medal = getMedalMeta(index)
                          const MedalIcon = medal.icon
                          return (
                            <motion.div
                              key={student.id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.25, delay: index * 0.06, ease: 'easeOut' }}
                              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                            >
                              {/* Médaille / rang */}
                              <div
                                className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold font-mono tabular-nums shrink-0 ${medal.bg} ${medal.text} ${medal.glow} relative`}
                                aria-label={`Rang ${index + 1}${medal.label ? ` — ${medal.label}` : ''}`}
                              >
                                <MedalIcon className="h-4 w-4" />
                                {index >= 3 && (
                                  <span className="absolute inset-0 flex items-center justify-center font-bold">
                                    {index + 1}
                                  </span>
                                )}
                              </div>

                              {/* Info étudiant */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate group-hover:text-primary-text transition-colors">{student.nom}</p>
                                <p className="text-xs text-muted-foreground truncate">{student.filiere}</p>
                              </div>

                              {/* Score */}
                              <div className="flex items-center gap-2.5 shrink-0">
                                <div className="w-20 hidden sm:block">
                                  <ProgressBar
                                    value={(student.moyenne / 20) * 100}
                                    accent={student.moyenne >= 14 ? 'success' : student.moyenne >= 10 ? 'info' : 'warning'}
                                    size="sm"
                                    showLabel={false}
                                    showValue={false}
                                    index={index}
                                  />
                                </div>
                                <Badge className={`${getScoreBg(student.moyenne)} text-xs min-w-[56px] justify-center font-mono tabular-nums border`}>
                                  {student.moyenne}/20
                                </Badge>
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    ) : (
                      <EmptyChart message="Aucun résultat d'étudiant disponible" icon={UserX} />
                    )}
                  </CardContent>
                </Card>
              </FadeIn>

              {/* Étudiants en difficulté */}
              <FadeIn delay={0.1}>
                <Card className="ds-kente-top overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Étudiants en difficulté
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Étudiants avec une moyenne inférieure à 10/20
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {stats.etudiantsEnDifficulte.length > 0 ? (
                      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                        {stats.etudiantsEnDifficulte.map((student, index) => (
                          <motion.div
                            key={student.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25, delay: index * 0.05, ease: 'easeOut' }}
                            className="flex items-center gap-3 p-2.5 rounded-lg border-l-2 border-l-destructive/60 bg-destructive/5 hover:bg-destructive/10 transition-colors"
                          >
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/15 text-destructive shrink-0">
                              <AlertTriangle className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{student.nom}</p>
                              <p className="text-xs text-muted-foreground truncate">{student.filiere}</p>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className="w-16 hidden sm:block">
                                <ProgressBar
                                  value={(student.moyenne / 20) * 100}
                                  accent="destructive"
                                  size="sm"
                                  showLabel={false}
                                  showValue={false}
                                  index={index}
                                />
                              </div>
                              <Badge className={`${getScoreBg(student.moyenne)} text-xs min-w-[56px] justify-center font-mono tabular-nums border`}>
                                {student.moyenne}/20
                              </Badge>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="ds-kente-watermark flex flex-col items-center justify-center h-32 text-sm text-muted-foreground gap-2 relative overflow-hidden rounded-lg">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                          <Trophy className="h-6 w-6 text-success-text" />
                        </div>
                        {stats.topEtudiants.length > 0
                          ? 'Tous les participants ont la moyenne !'
                          : 'Aucun résultat d\'étudiant disponible'}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </FadeIn>
            </div>

            {/* ═══ Section enseignants ═══ */}
            {stats.topEnseignants.length > 0 && (
              <FadeIn delay={0.05}>
                <Card className="ds-kente-top overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                          <Users className="h-4 w-4 text-info" />
                          Performance des enseignants
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          Classement par taux de réussite de leurs épreuves
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs border-info/30 text-info">
                        {stats.topEnseignants.length} enseignant{stats.topEnseignants.length > 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {stats.topEnseignants.map((ens, index) => {
                        const trend = ens.tauxReussite >= 50 ? 'up' : 'down'
                        const initials = ens.nom.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                        return (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 8 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.25, delay: index * 0.05, ease: 'easeOut' }}
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border bg-muted/30 ds-lift text-center"
                          >
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-info/10 text-sm font-bold text-info font-mono tabular-nums">
                              {initials}
                            </div>
                            <p className="text-sm font-medium leading-tight line-clamp-2">{ens.nom}</p>
                            <div className="flex items-center gap-1">
                              {getTrendIcon(trend)}
                              <span className={`text-lg font-bold font-mono tabular-nums ${ens.tauxReussite >= 50 ? 'text-success-text' : 'text-destructive'}`}>
                                {ens.tauxReussite}%
                              </span>
                            </div>
                            <div className="flex flex-col items-center text-[11px] text-muted-foreground font-mono tabular-nums leading-tight">
                              <span>{ens.nbEpreuves} épreuve{ens.nbEpreuves > 1 ? 's' : ''}</span>
                              <span>Moy: {ens.moyenne}/20</span>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </FadeIn>
            )}

            {/* ═══ Table détaillée (premium) ═══ */}
            {stats.resultatsParMatiere.length > 0 && (
              <FadeIn delay={0.05}>
                <Card className="ds-kente-top overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                          <ClipboardList className="h-4 w-4 text-warning" />
                          Détail des résultats par épreuve
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          Vue tabulaire complète des performances
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs border-warning/30 text-warning">
                        {stats.resultatsParMatiere.length} ligne{stats.resultatsParMatiere.length > 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {/* Desktop : table premium */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-border">
                            <TableHead scope="col" className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                              Épreuve
                            </TableHead>
                            <TableHead scope="col" className="font-display text-xs uppercase tracking-wider text-muted-foreground">
                              Enseignant
                            </TableHead>
                            <TableHead scope="col" className="font-display text-xs uppercase tracking-wider text-muted-foreground text-center">
                              Participants
                            </TableHead>
                            <TableHead scope="col" className="font-display text-xs uppercase tracking-wider text-muted-foreground text-center">
                              Moyenne
                            </TableHead>
                            <TableHead scope="col" className="font-display text-xs uppercase tracking-wider text-muted-foreground text-center">
                              Taux réussite
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stats.resultatsParMatiere.map((r, i) => {
                            const ringAccent = r.moyenne >= 14 ? 'success' : r.moyenne >= 10 ? 'info' : r.moyenne >= 8 ? 'warning' : 'danger'
                            return (
                              <motion.tr
                                key={i}
                                initial={{ opacity: 0, y: 6 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.4), ease: 'easeOut' }}
                                className="border-border hover:bg-muted/40 transition-colors"
                              >
                                <TableCell className="font-medium py-3">{r.titre}</TableCell>
                                <TableCell className="text-muted-foreground py-3">{r.enseignant}</TableCell>
                                <TableCell className="text-center font-mono tabular-nums py-3 text-muted-foreground">{r.nbParticipants}</TableCell>
                                <TableCell className="text-center py-3">
                                  <div className="inline-flex items-center gap-2">
                                    <ProgressRing
                                      value={(r.moyenne / 20) * 100}
                                      size={36}
                                      strokeWidth={4}
                                      accent={ringAccent}
                                      showPercent={false}
                                      label=""
                                      sublabel=""
                                      index={i}
                                    />
                                    <span className={`font-mono tabular-nums font-semibold ${getScoreColor(r.moyenne)}`}>
                                      {r.moyenne}/20
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center py-3">
                                  <span className={`font-mono tabular-nums font-semibold ${r.tauxReussite >= 50 ? 'text-success-text' : 'text-destructive'}`}>
                                    {r.tauxReussite}%
                                  </span>
                                </TableCell>
                              </motion.tr>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile : cartes */}
                    <div className="flex flex-col gap-3 md:hidden">
                      {stats.resultatsParMatiere.map((r, i) => {
                        const ringAccent = r.moyenne >= 14 ? 'success' : r.moyenne >= 10 ? 'info' : r.moyenne >= 8 ? 'warning' : 'danger'
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.4), ease: 'easeOut' }}
                            className="rounded-lg border border-border bg-card p-3 ds-kente-top flex items-center gap-3"
                          >
                            <ProgressRing
                              value={(r.moyenne / 20) * 100}
                              size={44}
                              strokeWidth={5}
                              accent={ringAccent}
                              showPercent={false}
                              label={`${r.moyenne}`}
                              sublabel="/20"
                              index={i}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-display font-semibold text-sm leading-tight truncate">{r.titre}</p>
                              <p className="text-xs text-muted-foreground truncate">{r.enseignant}</p>
                              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground font-mono tabular-nums">
                                <span>{r.nbParticipants} part.</span>
                                <span className={r.tauxReussite >= 50 ? 'text-success-text font-semibold' : 'text-destructive font-semibold'}>
                                  {r.tauxReussite}% réussite
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </FadeIn>
            )}

            {/* ═══ Section alertes ═══ */}
            {stats.alertes.length > 0 && (
              <FadeIn delay={0.05}>
                <Card className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                          <AlertTriangle className="h-4 w-4 text-warning" />
                          Alertes détectées (<span className="font-mono tabular-nums">{stats.alertes.length}</span>)
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          Problèmes identifiés nécessitant votre attention
                        </CardDescription>
                      </div>
                      <div className="flex gap-1.5">
                        {stats.alertes.some((a) => a.severity === 'critical') && (
                          <Badge className="bg-destructive/10 text-destructive border border-destructive/20 text-[10px]">Critique</Badge>
                        )}
                        {stats.alertes.some((a) => a.severity === 'warning') && (
                          <Badge className="bg-warning/10 text-warning border border-warning/20 text-[10px]">Attention</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {stats.alertes.map((alerte, index) => {
                        const meta = getSeverityMeta(alerte.severity)
                        return (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -8 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.25, delay: index * 0.05, ease: 'easeOut' }}
                            className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${meta.border} ${meta.bg}`}
                          >
                            <div className={`flex h-8 w-8 items-center justify-center rounded-md shrink-0 ${meta.iconBg} ${meta.iconText}`}>
                              <AlertTriangle className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium">{alerte.titre}</p>
                                <Badge variant="outline" className={`text-[10px] ${meta.iconText} border-current/30`}>
                                  {meta.label}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{alerte.description}</p>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </FadeIn>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
