'use client'

import { useState } from 'react'
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
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CalendarDays,
  Eye,
  UserX,
  BookOpen,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
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
import { Separator } from '@/components/ui/separator'
import { PulseSkeleton } from '@/components/ds'
import { Progress } from '@/components/ui/progress'
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
} from 'recharts'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Types (aligned with API response) ───

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

// ─── Chart colors (emerald/teal scheme, no indigo/blue) ───

const CHART_COLORS = [
  '#10b981', // emerald-500
  '#14b8a6', // teal-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#059669', // emerald-600
  '#0d9488', // teal-600
  '#d97706', // amber-600
  '#dc2626', // red-600
]

const GRADE_COLORS: Record<string, string> = {
  '0-4': '#ef4444',
  '4-8': '#f97316',
  '8-10': '#f59e0b',
  '10-12': '#10b981',
  '12-14': '#059669',
  '14-16': '#0d9488',
  '16-20': '#047857',
}

// ─── Custom tooltip ───

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      <p className="text-sm font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-semibold text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Month formatter ───

function formatMonth(mois: string): string {
  const [year, month] = mois.split('-')
  const months: Record<string, string> = {
    '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr',
    '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Aoû',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc',
  }
  return `${months[month] || month} ${year.slice(2)}`
}

// ─── Score color ───

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

// ─── KPI Card ───

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  iconBg: string
  borderColor: string
}

function KPICard({ title, value, subtitle, icon, iconBg, borderColor }: KPICardProps) {
  return (
    <Card className={`border-l-4 ${borderColor} ds-lift`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{title}</p>
          <p className="text-xl font-bold font-mono tabular-nums">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Empty chart placeholder ───

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[260px] text-sm text-muted-foreground gap-2">
      <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
      {message}
    </div>
  )
}

// ─── Main Component ───

export function RapportsPage() {
  const user = useAuthStore((s) => s.user)

  // ─── Filter state ───
  const [selectedFiliere, setSelectedFiliere] = useState('all')
  const [dateDebut, setDateDebut] = useState<string>('')
  const [dateFin, setDateFin] = useState<string>('')

  // ─── Fetch stats (TanStack Query) ───
  // BUGFIX (QUERY-CACHE-2) : migration de useEffect+fetch vers TanStack Query.
  // Le queryKey inclut les filtres car l'API les prend en query params.
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
  const filieres = filieresQuery.data?.filieres ?? []

  // ─── Derived data ───
  const hasData = stats && (
    stats.nbEvaluations > 0 ||
    stats.nbEtudiants > 0 ||
    stats.moyenneGenerale > 0
  )

  // ─── Helper: download blob via hidden link (works on all browsers) ───
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    // Cleanup after a short delay to ensure download starts
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

  // ─── Export CSV ───
  const handleExportCSV = () => {
    if (!stats) return
    try {
      const rows: string[][] = []

      // Section 1: KPIs globaux
      rows.push(['INDICATEURS CLES'])
      rows.push(['Indicateur', 'Valeur'])
      rows.push(['Moyenne generale', `${stats.moyenneGenerale}/20`])
      rows.push(['Taux de reussite global', `${stats.tauxReussiteGlobal}%`])
      rows.push(["Nombre d'evaluations", stats.nbEvaluations.toString()])
      rows.push(["Nombre d'etudiants", stats.nbEtudiants.toString()])
      rows.push(["Nombre d'enseignants", stats.nbEnseignants.toString()])
      rows.push(["Etudiants en difficulte", stats.etudiantsEnDifficulte.length.toString()])

      // Section 2: Par filiere
      if (stats.etudiantsParFiliere.length > 0) {
        rows.push([])
        rows.push(['ETUDIANTS PAR FILIERE'])
        rows.push(['Filiere', "Nombre d'etudiants"])
        stats.etudiantsParFiliere.forEach((f) => {
          rows.push([f.filiere, f.count.toString()])
        })
      }

      // Section 3: Resultats par matiere
      if (stats.resultatsParMatiere.length > 0) {
        rows.push([])
        rows.push(['RESULTATS PAR MATIERE'])
        rows.push(['Matiere', 'Enseignant', 'Moyenne', 'Taux de reussite', 'Participants'])
        stats.resultatsParMatiere.forEach((r) => {
          rows.push([r.titre, r.enseignant, `${r.moyenne}/20`, `${r.tauxReussite}%`, r.nbParticipants.toString()])
        })
      }

      // Section 4: Repartition des notes
      if (stats.repartitionNotes.some(r => r.count > 0)) {
        rows.push([])
        rows.push(['REPARTITION DES NOTES'])
        rows.push(['Tranche', "Nombre d'etudiants"])
        stats.repartitionNotes.forEach((r) => {
          rows.push([r.label, r.count.toString()])
        })
      }

      // Section 5: Top enseignants
      if (stats.topEnseignants.length > 0) {
        rows.push([])
        rows.push(['TOP ENSEIGNANTS'])
        rows.push(['Enseignant', 'Nb epreuves', 'Moyenne', 'Taux reussite'])
        stats.topEnseignants.forEach((e) => {
          rows.push([e.nom, e.nbEpreuves.toString(), `${e.moyenne}/20`, `${e.tauxReussite}%`])
        })
      }

      // Section 6: Top etudiants
      if (stats.topEtudiants.length > 0) {
        rows.push([])
        rows.push(['TOP 5 ETUDIANTS'])
        rows.push(['Nom', 'Email', 'Filiere', 'Moyenne'])
        stats.topEtudiants.forEach((e) => {
          rows.push([e.nom, e.email, e.filiere, `${e.moyenne}/20`])
        })
      }

      // Section 7: Etudiants en difficulte
      if (stats.etudiantsEnDifficulte.length > 0) {
        rows.push([])
        rows.push(['ETUDIANTS EN DIFFICULTE (< 10/20)'])
        rows.push(['Nom', 'Email', 'Filiere', 'Moyenne'])
        stats.etudiantsEnDifficulte.forEach((e) => {
          rows.push([e.nom, e.email, e.filiere, `${e.moyenne}/20`])
        })
      }

      // Build CSV with BOM for Excel UTF-8 compatibility
      const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n')
      const bom = '\uFEFF'
      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
      downloadBlob(blob, `rapport-sect-${getDateSuffix()}.csv`)
      toast.success('Rapport exporte en CSV')
    } catch (err) {
      console.error('CSV export error:', err)
      toast.error('Erreur', { description: "Impossible d'exporter le rapport CSV." })
    }
  }

  // ─── Export PDF ───
  const handleExportPDF = () => {
    if (!stats) return
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      const contentWidth = pageWidth - margin * 2
      let yPos = margin

      // ─── Color palette (matching app theme) ───
      // Typés en tuples [r, g, b] car jspdf setTextColor(r,g,b) et jspdf-autotable
      // fillColor attendent un Color = string | [number, number, number] (pas number[]).
      const emerald: [number, number, number] = [16, 185, 129]  // #10b981
      const teal: [number, number, number] = [20, 184, 166]     // #14b8a6
      const dark: [number, number, number] = [30, 41, 59]       // slate-800
      const muted: [number, number, number] = [100, 116, 139]   // slate-500
      const light: [number, number, number] = [241, 245, 249]   // slate-100

      // ─── Helper: add page footer ───
      const addFooter = () => {
        doc.setFontSize(8)
        doc.setTextColor(...muted)
        doc.text('SECT - Systeme d\'Evaluation Casse-Tete', margin, pageHeight - 8)
        doc.text(`Genere le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
      }

      // ─── Helper: check page overflow ───
      const checkPage = (needed: number) => {
        if (yPos + needed > pageHeight - 15) {
          addFooter()
          doc.addPage()
          yPos = margin
        }
      }

      // ─── Helper: section title ───
      const addSectionTitle = (title: string) => {
        checkPage(12)
        doc.setFontSize(12)
        doc.setTextColor(...emerald)
        doc.setFont('helvetica', 'bold')
        doc.text(title, margin, yPos)
        // Underline
        doc.setDrawColor(...emerald)
        doc.setLineWidth(0.5)
        doc.line(margin, yPos + 1, margin + doc.getTextWidth(title), yPos + 1)
        yPos += 8
      }

      // ═══════════════════════════════════════
      // PAGE 1: HEADER + KPIs
      // ═══════════════════════════════════════

      // Header bar
      doc.setFillColor(...emerald)
      doc.rect(0, 0, pageWidth, 32, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('Rapport de Performance', margin, 14)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      const filiereLabel = selectedFiliere && selectedFiliere !== 'all'
        ? filieres.find(f => f.id === selectedFiliere)?.nom || 'Toutes filieres'
        : 'Toutes filieres'
      doc.text(filiereLabel, margin, 22)
      // Date range
      const dateLabel = (dateDebut || dateFin)
        ? `Periode: ${dateDebut || '...'} au ${dateFin || '...'}`
        : `Date: ${new Date().toLocaleDateString('fr-FR')}`
      doc.text(dateLabel, pageWidth - margin, 22, { align: 'right' })

      yPos = 40

      // KPI Cards row
      const kpis: { label: string; value: string; color: [number, number, number] }[] = [
        { label: 'Moyenne Generale', value: `${stats.moyenneGenerale}/20`, color: emerald },
        { label: 'Taux de Reussite', value: `${stats.tauxReussiteGlobal}%`, color: teal },
        { label: 'Evaluations', value: `${stats.nbEvaluations}`, color: [245, 158, 11] },
        { label: 'Etudiants', value: `${stats.nbEtudiants}`, color: [239, 68, 68] },
      ]

      const cardWidth = (contentWidth - 9) / 4 // 3mm gap between cards
      kpis.forEach((kpi, i) => {
        const x = margin + i * (cardWidth + 3)
        // Card background
        doc.setFillColor(...light)
        doc.roundedRect(x, yPos, cardWidth, 20, 2, 2, 'F')
        // Left accent bar
        doc.setFillColor(...kpi.color)
        doc.rect(x, yPos, 2, 20, 'F')
        // Value
        doc.setFontSize(14)
        doc.setTextColor(...dark)
        doc.setFont('helvetica', 'bold')
        doc.text(kpi.value, x + 5, yPos + 9)
        // Label
        doc.setFontSize(7)
        doc.setTextColor(...muted)
        doc.setFont('helvetica', 'normal')
        doc.text(kpi.label, x + 5, yPos + 15)
      })

      yPos += 28

      // Secondary KPIs
      doc.setFontSize(8)
      doc.setTextColor(...muted)
      doc.text(`Enseignants actifs: ${stats.nbEnseignants}  |  Participants aux epreuves: ${stats.resultatsParMatiere.reduce((a, r) => a + r.nbParticipants, 0)}  |  Etudiants en difficulte: ${stats.etudiantsEnDifficulte.length}`, margin, yPos)
      yPos += 8

      // ═══════════════════════════════════════
      // SECTION: Resultats par matiere
      // ═══════════════════════════════════════
      if (stats.resultatsParMatiere.length > 0) {
        addSectionTitle('Resultats par matiere')

        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Epreuve', 'Enseignant', 'Moyenne', 'Reussite', 'Participants']],
          body: stats.resultatsParMatiere.map(r => [
            r.titre,
            r.enseignant,
            `${r.moyenne}/20`,
            `${r.tauxReussite}%`,
            r.nbParticipants.toString(),
          ]),
          headStyles: {
            fillColor: emerald,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
          },
          bodyStyles: {
            fontSize: 8,
            textColor: dark,
          },
          alternateRowStyles: {
            fillColor: light,
          },
          columnStyles: {
            2: { halign: 'center', cellWidth: 22 },
            3: { halign: 'center', cellWidth: 22 },
            4: { halign: 'center', cellWidth: 22 },
          },
          didDrawPage: () => {
            addFooter()
          },
        })

        // @ts-ignore - autoTable adds lastAutoTable to doc
        yPos = doc.lastAutoTable.finalY + 8
      }

      // ═══════════════════════════════════════
      // SECTION: Repartition des notes
      // ═══════════════════════════════════════
      if (stats.repartitionNotes.some(r => r.count > 0)) {
        addSectionTitle('Repartition des notes')

        const noteData = stats.repartitionNotes.map(r => [r.label, r.count.toString()])

        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Tranche', "Nombre d'etudiants"]],
          body: noteData,
          headStyles: {
            fillColor: teal,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
          },
          bodyStyles: {
            fontSize: 9,
            textColor: dark,
          },
          alternateRowStyles: {
            fillColor: light,
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 40 },
            1: { halign: 'center', cellWidth: 40 },
          },
          didDrawPage: () => {
            addFooter()
          },
        })

        // @ts-ignore
        yPos = doc.lastAutoTable.finalY + 8
      }

      // ═══════════════════════════════════════
      // SECTION: Etudiants par filiere
      // ═══════════════════════════════════════
      if (stats.etudiantsParFiliere.length > 0) {
        addSectionTitle('Etudiants par filiere')

        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Filiere', "Nombre d'etudiants"]],
          body: stats.etudiantsParFiliere.map(f => [f.filiere, f.count.toString()]),
          headStyles: {
            fillColor: emerald,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
          },
          bodyStyles: {
            fontSize: 9,
            textColor: dark,
          },
          alternateRowStyles: {
            fillColor: light,
          },
          columnStyles: {
            1: { halign: 'center', cellWidth: 40 },
          },
          didDrawPage: () => {
            addFooter()
          },
        })

        // @ts-ignore
        yPos = doc.lastAutoTable.finalY + 8
      }

      // ═══════════════════════════════════════
      // SECTION: Top enseignants
      // ═══════════════════════════════════════
      if (stats.topEnseignants.length > 0) {
        addSectionTitle('Performance des enseignants')

        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Enseignant', 'Nb epreuves', 'Moyenne', 'Taux reussite']],
          body: stats.topEnseignants.map(e => [
            e.nom,
            e.nbEpreuves.toString(),
            `${e.moyenne}/20`,
            `${e.tauxReussite}%`,
          ]),
          headStyles: {
            fillColor: teal,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
          },
          bodyStyles: {
            fontSize: 9,
            textColor: dark,
          },
          alternateRowStyles: {
            fillColor: light,
          },
          columnStyles: {
            1: { halign: 'center', cellWidth: 25 },
            2: { halign: 'center', cellWidth: 22 },
            3: { halign: 'center', cellWidth: 25 },
          },
          didDrawPage: () => {
            addFooter()
          },
        })

        // @ts-ignore
        yPos = doc.lastAutoTable.finalY + 8
      }

      // ═══════════════════════════════════════
      // SECTION: Top etudiants
      // ═══════════════════════════════════════
      if (stats.topEtudiants.length > 0) {
        addSectionTitle('Top 5 etudiants')

        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Nom', 'Email', 'Filiere', 'Moyenne']],
          body: stats.topEtudiants.map(e => [
            e.nom,
            e.email,
            e.filiere,
            `${e.moyenne}/20`,
          ]),
          headStyles: {
            fillColor: emerald,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
          },
          bodyStyles: {
            fontSize: 8,
            textColor: dark,
          },
          alternateRowStyles: {
            fillColor: light,
          },
          columnStyles: {
            3: { halign: 'center', cellWidth: 22 },
          },
          didDrawPage: () => {
            addFooter()
          },
        })

        // @ts-ignore
        yPos = doc.lastAutoTable.finalY + 8
      }

      // ═══════════════════════════════════════
      // SECTION: Etudiants en difficulte
      // ═══════════════════════════════════════
      if (stats.etudiantsEnDifficulte.length > 0) {
        addSectionTitle('Etudiants en difficulte (< 10/20)')

        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Nom', 'Email', 'Filiere', 'Moyenne']],
          body: stats.etudiantsEnDifficulte.map(e => [
            e.nom,
            e.email,
            e.filiere,
            `${e.moyenne}/20`,
          ]),
          headStyles: {
            fillColor: [239, 68, 68], // red
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
          },
          bodyStyles: {
            fontSize: 8,
            textColor: dark,
          },
          alternateRowStyles: {
            fillColor: light,
          },
          columnStyles: {
            3: { halign: 'center', cellWidth: 22 },
          },
          didDrawPage: () => {
            addFooter()
          },
        })

        // @ts-ignore
        yPos = doc.lastAutoTable.finalY + 8
      }

      // ═══════════════════════════════════════
      // SECTION: Alertes
      // ═══════════════════════════════════════
      if (stats.alertes.length > 0) {
        addSectionTitle('Alertes detectees')

        autoTable(doc, {
          startY: yPos,
          margin: { left: margin, right: margin },
          head: [['Type', 'Titre', 'Description']],
          body: stats.alertes.map(a => [a.type, a.titre, a.description]),
          headStyles: {
            fillColor: [245, 158, 11], // amber
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
          },
          bodyStyles: {
            fontSize: 8,
            textColor: dark,
          },
          alternateRowStyles: {
            fillColor: light,
          },
          columnStyles: {
            0: { cellWidth: 25 },
          },
          didDrawPage: () => {
            addFooter()
          },
        })
      }

      // Add footer to last page
      addFooter()

      // Set PDF metadata
      doc.setProperties({
        title: 'Rapport de Performance SECT',
        subject: filiereLabel,
        author: 'SECT - Systeme d\'Evaluation Casse-Tete',
        creator: 'SECT',
      })

      // Save
      doc.save(`rapport-sect-${getDateSuffix()}.pdf`)
      toast.success('Rapport exporte en PDF')
    } catch (err) {
      console.error('PDF export error:', err)
      toast.error('Erreur', { description: "Impossible de generer le PDF. Reessayez." })
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-success-text" />
            Rapports et Statistiques
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analysez les performances de vos filières et le suivi pédagogique
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!hasData}
            className="border-success/40 text-success-text hover:bg-success/10"
          >
            <Download className="h-4 w-4 mr-1" />
            Exporter CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            disabled={!hasData}
            className="border-info/40 text-info hover:bg-info/10"
          >
            <FileText className="h-4 w-4 mr-1" />
            Exporter PDF
          </Button>
        </div>
      </div>

      {/* ─── Filière selector + Date range filter ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedFiliere} onValueChange={setSelectedFiliere}>
            <SelectTrigger className="w-[250px]">
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
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="dateDebut" className="text-xs text-muted-foreground whitespace-nowrap">Du</Label>
              <Input
                id="dateDebut"
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="h-8 w-[140px] text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="dateFin" className="text-xs text-muted-foreground whitespace-nowrap">Au</Label>
              <Input
                id="dateFin"
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="h-8 w-[140px] text-xs"
              />
            </div>
            {(dateDebut || dateFin) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => { setDateDebut(''); setDateFin('') }}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Loading skeleton ─── */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <PulseSkeleton className="h-4 w-20 mb-2" />
                  <PulseSkeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <PulseSkeleton className="h-5 w-40 mb-4" />
                  <PulseSkeleton className="h-48 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && !hasData && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
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
        </div>
      )}

      {/* ─── Stats content ─── */}
      {!isLoading && hasData && stats && (
        <>
          {/* ─── Overview stats (4 KPI cards) ─── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KPICard
              title="Moyenne générale"
              value={`${stats.moyenneGenerale}/20`}
              subtitle="Toutes évaluations confondues"
              icon={<TrendingUp className="h-5 w-5 text-success-text" />}
              iconBg="bg-success/15"
              borderColor="border-l-primary"
            />
            <KPICard
              title="Taux de réussite"
              value={`${stats.tauxReussiteGlobal}%`}
              subtitle="Notes ≥ 10/20"
              icon={<Trophy className="h-5 w-5 text-info" />}
              iconBg="bg-info/15"
              borderColor="border-l-primary"
            />
            <KPICard
              title="Évaluations"
              value={stats.nbEvaluations}
              subtitle="Épreuves terminées"
              icon={<ClipboardList className="h-5 w-5 text-warning" />}
              iconBg="bg-warning/15"
              borderColor="border-l-primary"
            />
            <KPICard
              title="Étudiants"
              value={stats.nbEtudiants}
              subtitle={`${stats.etudiantsEnDifficulte.length} en difficulté`}
              icon={<Users className="h-5 w-5 text-destructive" />}
              iconBg="bg-destructive/15"
              borderColor="border-l-primary"
            />
          </div>

          {/* ─── Secondary KPIs (3 mini cards) ─── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="border-l-4 border-l-primary">
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-success-text" />
                  <span className="text-sm text-muted-foreground">Enseignants actifs</span>
                </div>
                <span className="text-lg font-bold font-mono tabular-nums">{stats.nbEnseignants}</span>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-primary">
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-info" />
                  <span className="text-sm text-muted-foreground">Participants aux épreuves</span>
                </div>
                <span className="text-lg font-bold font-mono tabular-nums">
                  {stats.resultatsParMatiere.reduce((acc, r) => acc + r.nbParticipants, 0)}
                </span>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-primary">
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <UserX className="h-4 w-4 text-warning" />
                  <span className="text-sm text-muted-foreground">Étudiants en difficulté</span>
                </div>
                <span className="text-lg font-bold text-destructive font-mono tabular-nums">
                  {stats.etudiantsEnDifficulte.length}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* ─── Charts section (2x2 grid) ─── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* ─── 1. Évolution des moyennes (Area chart) ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                  <TrendingUp className="h-4 w-4 text-success-text" />
                  Évolution des moyennes
                </CardTitle>
                <CardDescription className="text-xs">
                  Tendance mensuelle des scores moyens
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.evolutionMoyennes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={stats.evolutionMoyennes.map((e) => ({
                      ...e,
                      mois: formatMonth(e.mois),
                    }))}>
                      <defs>
                        <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="mois" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="moyenne"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#emeraldGradient)"
                        name="Moyenne"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="Aucune donnée mensuelle disponible" />
                )}
              </CardContent>
            </Card>

            {/* ─── 2. Répartition des notes (Bar chart) ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                  <BarChart3 className="h-4 w-4 text-info" />
                  Répartition des notes
                </CardTitle>
                <CardDescription className="text-xs">
                  Distribution par tranches de notes
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.repartitionNotes.some((r) => r.count > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={stats.repartitionNotes}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Étudiants" radius={[4, 4, 0, 0]}>
                        {stats.repartitionNotes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={GRADE_COLORS[entry.label] || '#10b981'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="Aucune note enregistrée" />
                )}
              </CardContent>
            </Card>

            {/* ─── 3. Résultats par matière (Horizontal Bar chart) ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                  <ClipboardList className="h-4 w-4 text-warning" />
                  Résultats par matière
                </CardTitle>
                <CardDescription className="text-xs">
                  Moyenne et taux de réussite par épreuve
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.resultatsParMatiere.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(260, stats.resultatsParMatiere.length * 45)}>
                    <BarChart
                      data={stats.resultatsParMatiere}
                      layout="vertical"
                      margin={{ left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis
                        type="category"
                        dataKey="titre"
                        width={120}
                        tick={{ fontSize: 10 }}
                        stroke="#9ca3af"
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="moyenne" name="Moyenne" radius={[0, 4, 4, 0]}>
                        {stats.resultatsParMatiere.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.moyenne >= 10 ? '#10b981' : entry.moyenne >= 8 ? '#f59e0b' : '#ef4444'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="Aucune évaluation terminée" />
                )}
              </CardContent>
            </Card>

            {/* ─── 4. Étudiants par filière (Pie/Donut chart) ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                  <GraduationCap className="h-4 w-4 text-success-text" />
                  Étudiants par filière
                </CardTitle>
                <CardDescription className="text-xs">
                  Répartition des effectifs
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.etudiantsParFiliere.length > 0 && stats.etudiantsParFiliere.some(f => f.count > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={stats.etudiantsParFiliere.filter(f => f.count > 0)}
                        dataKey="count"
                        nameKey="filiere"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={3}
                        label={({ filiere, percent }) =>
                          `${filiere} (${(percent * 100).toFixed(0)}%)`
                        }
                        labelLine={{ stroke: '#9ca3af' }}
                      >
                        {stats.etudiantsParFiliere.filter(f => f.count > 0).map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="Aucune filière avec des étudiants" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Top/Bottom students section (REAL DATA) ─── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* ─── Top 5 performers ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                  <Trophy className="h-4 w-4 text-success-text" />
                  Top 5 — Meilleurs étudiants
                </CardTitle>
                <CardDescription className="text-xs">
                  Classement par moyenne aux évaluations
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.topEtudiants.length > 0 ? (
                  <div className="space-y-3">
                    {stats.topEtudiants.map((student, index) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        {/* Rank badge */}
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold font-mono tabular-nums ${
                          index === 0 ? 'bg-success/15 text-success-text' :
                          index === 1 ? 'bg-info/15 text-info' :
                          index === 2 ? 'bg-warning/15 text-warning' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {index + 1}
                        </div>

                        {/* Student info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{student.nom}</p>
                          <p className="text-xs text-muted-foreground">{student.filiere}</p>
                        </div>

                        {/* Score */}
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <Progress
                              value={(student.moyenne / 20) * 100}
                              className="h-2"
                            />
                          </div>
                          <Badge className={`${getScoreBg(student.moyenne)} text-xs min-w-[52px] justify-center font-mono tabular-nums`}>
                            {student.moyenne}/20
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                    Aucun résultat d&apos;étudiant disponible
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ─── Students needing attention (REAL DATA) ─── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Étudiants en difficulté
                </CardTitle>
                <CardDescription className="text-xs">
                  Étudiants avec une moyenne inférieure à 10/20
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.etudiantsEnDifficulte.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {stats.etudiantsEnDifficulte.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/15">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{student.nom}</p>
                          <p className="text-xs text-muted-foreground">{student.filiere}</p>
                        </div>
                        <Badge className={`${getScoreBg(student.moyenne)} text-xs min-w-[52px] justify-center font-mono tabular-nums`}>
                          {student.moyenne}/20
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                    <Trophy className="h-6 w-6 mr-2 text-success-text" />
                    {stats.topEtudiants.length > 0
                      ? 'Tous les participants ont la moyenne !'
                      : 'Aucun résultat d\'étudiant disponible'
                    }
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Top Enseignants ─── */}
          {stats.topEnseignants.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                  <Users className="h-4 w-4 text-info" />
                  Performance des enseignants
                </CardTitle>
                <CardDescription className="text-xs">
                  Classement par taux de réussite de leurs épreuves
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {stats.topEnseignants.map((ens, index) => (
                    <div
                      key={index}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-sm font-bold text-success-text font-mono tabular-nums">
                        {ens.nom.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <p className="text-sm font-medium text-center">{ens.nom}</p>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(ens.tauxReussite >= 50 ? 'up' : 'down')}
                        <span className={`text-lg font-bold font-mono tabular-nums ${ens.tauxReussite >= 50 ? 'text-success-text' : 'text-destructive'}`}>
                          {ens.tauxReussite}%
                        </span>
                      </div>
                      <div className="flex flex-col items-center text-xs text-muted-foreground font-mono tabular-nums">
                        <span>{ens.nbEpreuves} épreuve{ens.nbEpreuves > 1 ? 's' : ''}</span>
                        <span>Moy: {ens.moyenne}/20</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Résultats détaillés par matière (table) ─── */}
          {stats.resultatsParMatiere.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                  <ClipboardList className="h-4 w-4 text-warning" />
                  Détail des résultats par épreuve
                </CardTitle>
                <CardDescription className="text-xs">
                  Vue tabulaire complète des performances
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-display font-medium text-muted-foreground">Épreuve</th>
                        <th className="pb-2 font-display font-medium text-muted-foreground">Enseignant</th>
                        <th className="pb-2 font-display font-medium text-muted-foreground text-center">Participants</th>
                        <th className="pb-2 font-display font-medium text-muted-foreground text-center">Moyenne</th>
                        <th className="pb-2 font-display font-medium text-muted-foreground text-center">Taux réussite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.resultatsParMatiere.map((r, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 font-medium">{r.titre}</td>
                          <td className="py-2 text-muted-foreground">{r.enseignant}</td>
                          <td className="py-2 text-center font-mono tabular-nums">{r.nbParticipants}</td>
                          <td className="py-2 text-center">
                            <Badge className={`${getScoreBg(r.moyenne)} text-xs font-mono tabular-nums`}>
                              {r.moyenne}/20
                            </Badge>
                          </td>
                          <td className="py-2 text-center">
                            <span className={`font-mono tabular-nums ${r.tauxReussite >= 50 ? 'text-success-text font-semibold' : 'text-destructive font-semibold'}`}>
                              {r.tauxReussite}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Alertes summary ─── */}
          {stats.alertes.length > 0 && (
            <Card className="border-l-4 border-l-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-display tracking-tight">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Alertes détectées (<span className="font-mono tabular-nums">{stats.alertes.length}</span>)
                </CardTitle>
                <CardDescription className="text-xs">
                  Problèmes identifiés nécessitant votre attention
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {stats.alertes.map((alerte, index) => (
                    <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                      <AlertTriangle className={`h-4 w-4 mt-0.5 ${
                        alerte.severity === 'critical' ? 'text-destructive' :
                        alerte.severity === 'warning' ? 'text-warning' :
                        'text-info'
                      }`} />
                      <div>
                        <p className="text-sm font-medium">{alerte.titre}</p>
                        <p className="text-xs text-muted-foreground">{alerte.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
