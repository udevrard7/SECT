// ═══════════════════════════════════════════════════════════════════════════════
// Page principale "Résultats & Analyses" (refonte Savane EdTech).
// Onglets : Vue d'ensemble | Par épreuve | Étudiants en difficulté.
// Design System : palette africaine (vert lime + terre cuite + bleu nuit + or)
// + motifs Kente + composants DS unifiés (StatCard, Badge, PulseSkeleton).
// ═══════════════════════════════════════════════════════════════════════════════

'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  LayoutDashboard,
  FileBarChart,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  BookOpen,
  GraduationCap,
  BarChart3,
  ArrowRight,
  Compass,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ds/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useResultatsOverview, useRefreshResultats } from '@/hooks/use-resultats'
import { PageSkeleton } from './resultats-skeletons'
import { OverviewTab } from './overview-tab'
import { ExamTab } from './exam-tab'
import { StudentsAtRiskList } from './students-at-risk'
import { ResultatsPDFExport } from './resultats-pdf-export'

type RoleState = 'allowed' | 'responsable' | 'etudiant'

export function ResultatsPage() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState('overview')

  const overviewQuery = useResultatsOverview(user?.id)
  const refresh = useRefreshResultats()

  // ─── Role gating (CRITICAL) ───
  // /api/resultats/overview renvoie 403 pour RESPONSABLE et ETUDIANT.
  // On affiche donc un message contextuel au lieu de laisser l'API échouer.
  const roleState: RoleState =
    user?.role === 'RESPONSABLE'
      ? 'responsable'
      : user?.role === 'ETUDIANT'
        ? 'etudiant'
        : 'allowed'

  if (roleState === 'responsable') {
    return <ResponsableGate />
  }
  if (roleState === 'etudiant') {
    return <EtudiantGate />
  }

  // Page skeleton tant que l'overview n'est pas chargé
  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <PageSkeleton />
  }

  const overview = overviewQuery.data
  const atRiskCount = overview?.studentsAtRisk.length ?? 0

  return (
    <div className="space-y-6">
      {/* Header avec motif Kente et identité africaine */}
      <div className="ds-kente-pattern-strong -mx-4 -mt-4 rounded-xl px-4 py-6 sm:mx-0 sm:rounded-2xl sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight md:text-3xl">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              Résultats &amp; Analyses
            </h1>
            <p className="mt-1 text-sm text-muted-foreground/80">
              Consultez et analysez les résultats de vos épreuves avec une vue d&apos;ensemble inspirée des savanes africaines.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ResultatsPDFExport data={overview} />
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={overviewQuery.isFetching}
              className="border-primary/30 bg-primary/5 text-primary-text hover:bg-primary/10 hover:text-primary-text"
              aria-label="Rafraîchir les données"
            >
              <RefreshCw className={`h-4 w-4 ${overviewQuery.isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Rafraîchir</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Onglets avec accents Kente (vert/terre/orange) */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted/50 backdrop-blur-sm sm:inline-flex sm:w-auto">
          <TabsTrigger
            value="overview"
            className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary-text data-[state=active]:shadow-sm"
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Vue d&apos;ensemble</span>
            <span className="sm:hidden">Overview</span>
          </TabsTrigger>
          <TabsTrigger
            value="exam"
            className="gap-1.5 data-[state=active]:bg-secondary/10 data-[state=active]:text-secondary-foreground data-[state=active]:shadow-sm"
          >
            <FileBarChart className="h-4 w-4" />
            <span className="hidden sm:inline">Par épreuve</span>
            <span className="sm:hidden">Épreuve</span>
          </TabsTrigger>
          <TabsTrigger
            value="students"
            className="gap-1.5 data-[state=active]:bg-warning/10 data-[state=active]:text-warning-foreground data-[state=active]:shadow-sm"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Étudiants</span>
            <span className="sm:hidden">Étud.</span>
            {atRiskCount > 0 && (
              <Badge variant="danger" size="sm" className="ml-1 h-5 min-w-5 justify-center px-1 text-xs">
                {atRiskCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Vue d'ensemble */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {overviewQuery.isError ? (
            <ErrorCard
              message="Impossible de charger les analyses globales."
              onRetry={() => overviewQuery.refetch()}
            />
          ) : overview ? (
            <OverviewTab data={overview} />
          ) : null}
        </TabsContent>

        {/* Par épreuve */}
        <TabsContent value="exam" className="mt-6">
          {user?.id ? <ExamTab enseignantId={user.id} /> : null}
        </TabsContent>

        {/* Étudiants en difficulté */}
        <TabsContent value="students" className="mt-6 space-y-6">
          {overviewQuery.isError ? (
            <ErrorCard
              message="Impossible de charger les données étudiants."
              onRetry={() => refresh()}
              accent="danger"
            />
          ) : overview ? (
            <StudentsTabContent overview={overview} />
          ) : (
            <PageSkeleton />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Sous-composant : contenu de l'onglet Étudiants ───

function StudentsTabContent({ overview }: { overview: NonNullable<ReturnType<typeof useResultatsOverview>['data']> }) {
  const atRiskCount = overview.studentsAtRisk.length
  const totalSessions = overview.totalSessions
  const tauxReussite = overview.globalTauxReussite

  return (
    <div className="space-y-6">
      {/* 3 StatCards dédiées à l'onglet étudiants */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCardLite
          icon={<BookOpen className="h-5 w-5" />}
          accent="primary"
          label="Étudiants évalués"
          value={totalSessions}
          hint={`sur ${totalSessions} copies`}
        />
        <StatCardLite
          icon={<AlertTriangle className="h-5 w-5" />}
          accent="warning"
          label="Étudiants en difficulté"
          value={atRiskCount}
          hint="moyenne < 8/20"
        />
        <StatCardLite
          icon={<TrendingUp className="h-5 w-5" />}
          accent="success"
          label="Taux de réussite global"
          value={`${tauxReussite.toFixed(1)}%`}
          hint="moyenne ≥ 50% du barème"
        />
      </div>

      <StudentsAtRiskList students={overview.studentsAtRisk} />
    </div>
  )
}

// ─── Carte KPI simple (sans dépendance à StatCard pour variante locale) ───

function StatCardLite({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
  accent: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info'
}) {
  const accentMap: Record<typeof accent, string> = {
    primary: 'border-l-primary',
    secondary: 'border-l-secondary',
    success: 'border-l-success',
    warning: 'border-l-warning',
    danger: 'border-l-destructive',
    info: 'border-l-info',
  }
  const iconBgMap: Record<typeof accent, string> = {
    primary: 'bg-primary/10 text-primary-text',
    secondary: 'bg-secondary/10 text-secondary',
    success: 'bg-success/10 text-success-text',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-destructive/10 text-destructive',
    info: 'bg-info/10 text-info',
  }
  return (
    <Card className={`ds-kente-top border-l-4 ${accentMap[accent]}`}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBgMap[accent]}`}>
            {icon}
          </div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
        </div>
        <p className="font-mono text-2xl font-bold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Carte d'erreur unifiée ───

function ErrorCard({
  message,
  onRetry,
  accent = 'primary',
}: {
  message: string
  onRetry: () => void
  accent?: 'primary' | 'danger'
}) {
  const borderClass = accent === 'danger' ? 'border-l-destructive' : 'border-l-primary'
  return (
    <Card className={`ds-kente-top border-l-4 ${borderClass}`}>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <p className="text-sm font-medium">Erreur de chargement</p>
        <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="border-primary/30 text-primary-text hover:bg-primary/5"
        >
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Gates role-aware (RESPONSABLE / ETUDIANT) ───

function ResponsableGate() {
  return (
    <div className="space-y-6">
      <div className="ds-kente-pattern-strong -mx-4 -mt-4 rounded-xl px-4 py-6 sm:mx-0 sm:rounded-2xl sm:px-6">
        <h1 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight md:text-3xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-info to-secondary shadow-lg">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          Résultats &amp; Analyses
        </h1>
      </div>

      <Card className="ds-kente-watermark border-l-4 border-l-info">
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-info/10">
            <Compass className="h-8 w-8 text-info" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Cet espace est réservé aux enseignants
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              En tant que <Badge variant="info" size="sm">Responsable</Badge>,
              vous n&apos;avez pas accès aux analyses par enseignant. Vos statistiques agrégées
              d&apos;établissement (filiale, formations, enseignants, étudiants) sont disponibles
              dans le module <strong>Rapports &amp; Statistiques</strong>.
            </p>
          </div>
          <Button asChild className="bg-info text-info-foreground hover:bg-info/90">
            <Link href="/rapports">
              <BarChart3 className="h-4 w-4" />
              Accéder aux rapports
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function EtudiantGate() {
  return (
    <div className="space-y-6">
      <div className="ds-kente-pattern-strong -mx-4 -mt-4 rounded-xl px-4 py-6 sm:mx-0 sm:rounded-2xl sm:px-6">
        <h1 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight md:text-3xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg">
            <TrendingUp className="h-6 w-6 text-white" />
          </div>
          Résultats &amp; Analyses
        </h1>
      </div>

      <Card className="ds-kente-watermark border-l-4 border-l-primary">
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <GraduationCap className="h-8 w-8 text-primary-text" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Cet espace est réservé aux enseignants
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              En tant qu&apos;<Badge variant="success" size="sm">Étudiant</Badge>,
              vous ne pouvez pas consulter les analyses globales de vos enseignants.
              Vos notes, évaluations et progressions personnelles sont disponibles dans
              <strong> Mes résultats</strong>.
            </p>
          </div>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/mes-resultats">
              <GraduationCap className="h-4 w-4" />
              Voir mes résultats
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
