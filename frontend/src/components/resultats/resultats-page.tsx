// ═══════════════════════════════════════════════════════════════════════════════
// Page principale "Résultats & Analyses" (refonte Savane EdTech).
// Onglets : Vue d'ensemble | Par épreuve | Étudiants en difficulté.
// Design System : palette africaine (vert lime + terre cuite + bleu nuit + or)
// + motifs Kente + composants DS unifiés (StatCard, Badge, PulseSkeleton).
// ═══════════════════════════════════════════════════════════════════════════════

'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  LayoutDashboard,
  FileBarChart,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  GraduationCap,
  BarChart3,
  ArrowRight,
  Compass,
  BookOpen,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge, StatCard } from '@/components/ds'
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
import { SavaneIllustration } from './savane-illustration'

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
      {/* Header avec motif Kente et identité africaine (B3 : composant factorisé) */}
      <ResultatsHeader
        icon={TrendingUp}
        title="Résultats & Analyses"
        subtitle="Consultez et analysez les résultats de vos épreuves avec une vue d'ensemble inspirée des savanes africaines."
        accentFrom="from-primary"
        accentTo="to-secondary"
        actions={
          <>
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
          </>
        }
      />

      {/* Onglets avec accents Kente (vert/terre/orange) */}
      {/* B5 : aria-label pour accessibilité */}
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="w-full"
        aria-label="Sections des résultats et analyses"
      >
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

// ─── Header factorisé (B3 : plus de duplication page/gates) ───

interface ResultatsHeaderProps {
  icon: LucideIcon
  title: string
  subtitle?: string
  /** Classes Tailwind de dégradé pour l'icône (ex : "from-primary to-secondary") */
  accentFrom?: string
  accentTo?: string
  /** Slot actions (boutons PDF/refresh) — optionnel */
  actions?: ReactNode
}

function ResultatsHeader({
  icon: Icon,
  title,
  subtitle,
  accentFrom = 'from-primary',
  accentTo = 'to-secondary',
  actions,
}: ResultatsHeaderProps) {
  return (
    <div className="ds-kente-pattern-strong -mx-4 -mt-4 rounded-xl px-4 py-6 sm:mx-0 sm:rounded-2xl sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 font-display text-2xl font-bold tracking-tight md:text-3xl">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accentFrom} ${accentTo} shadow-lg`}
            >
              <Icon className="h-6 w-6 text-white" />
            </div>
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground/80">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  )
}

// ─── Sous-composant : contenu de l'onglet Étudiants ───

function StudentsTabContent({ overview }: { overview: NonNullable<ReturnType<typeof useResultatsOverview>['data']> }) {
  const atRiskCount = overview.studentsAtRisk.length
  const totalSessions = overview.totalSessions
  const totalCorrigees = overview.totalCorrigees
  const tauxReussite = overview.globalTauxReussite

  // B2 : on utilise StatCard du DS (au lieu de StatCardLite custom).
  // B8 : on a remplacé le KPI "Étudiants évalués / sur X copies" (redondant)
  //      par un KPI "Copies évaluées" avec hint différencié (corrigées vs total).
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={BookOpen}
          label="Copies évaluées"
          value={totalSessions}
          hint={`${totalCorrigees} corrigée${totalCorrigees > 1 ? 's' : ''}`}
          accent="primary"
          index={0}
        />
        <StatCard
          icon={AlertTriangle}
          label="Étudiants en difficulté"
          value={atRiskCount}
          hint="moyenne < 8/20"
          accent="warning"
          index={1}
        />
        <StatCard
          icon={Trophy}
          label="Taux de réussite global"
          value={`${tauxReussite.toFixed(1)}%`}
          hint="moyenne ≥ 50% du barème"
          accent="success"
          index={2}
        />
      </div>

      <StudentsAtRiskList students={overview.studentsAtRisk} />
    </div>
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

// ─── Carte de suggestion de navigation (pour gates enrichis, B11) ───

interface NavSuggestionCardProps {
  icon: LucideIcon
  title: string
  description: string
  href: string
  ctaLabel: string
  accent: 'primary' | 'secondary' | 'info'
}

function NavSuggestionCard({
  icon: Icon,
  title,
  description,
  href,
  ctaLabel,
  accent,
}: NavSuggestionCardProps) {
  const accentMap = {
    primary: 'border-l-primary bg-primary/5',
    secondary: 'border-l-secondary bg-secondary/5',
    info: 'border-l-info bg-info/5',
  } as const
  const iconMap = {
    primary: 'bg-primary/15 text-primary-text',
    secondary: 'bg-secondary/15 text-secondary',
    info: 'bg-info/15 text-info',
  } as const
  return (
    <Card className={`ds-kente-top border-l-4 ${accentMap[accent]}`}>
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconMap[accent]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <p className="font-display text-sm font-semibold tracking-tight">{title}</p>
        </div>
        <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-9 w-fit justify-start px-2 text-xs text-primary-text hover:bg-primary/10"
        >
          <Link href={href}>
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Gates role-aware (RESPONSABLE / ETUDIANT) — B11 : enrichis ───

function ResponsableGate() {
  return (
    <div className="space-y-6">
      <ResultatsHeader
        icon={BarChart3}
        title="Résultats & Analyses"
        subtitle="Espace réservé aux enseignants — vos statistiques agrégées sont ailleurs."
        accentFrom="from-info"
        accentTo="to-secondary"
      />

      <Card className="ds-kente-watermark relative overflow-hidden border-l-4 border-l-info">
        {/* Illustration adinkra subtile en watermark (B10) */}
        <SavaneIllustration
          variant="adinkra"
          size={180}
          className="pointer-events-none absolute -right-6 -top-6 text-info"
        />
        <CardContent className="relative z-10 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
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

      {/* B11 : 3 cartes de suggestion de navigation pour guider le responsable */}
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Autres modules utiles
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NavSuggestionCard
            icon={BarChart3}
            title="Rapports & Statistiques"
            description="Indicateurs agrégés de l'établissement : filières, enseignants, taux de réussite."
            href="/rapports"
            ctaLabel="Consulter"
            accent="info"
          />
          <NavSuggestionCard
            icon={BookOpen}
            title="Épreuves"
            description="Liste des épreuves créées par les enseignants de votre établissement."
            href="/epreuves"
            ctaLabel="Voir"
            accent="primary"
          />
          <NavSuggestionCard
            icon={GraduationCap}
            title="Étudiants"
            description="Annuaire des étudiants et leurs inscriptions par filière."
            href="/etudiants"
            ctaLabel="Parcourir"
            accent="secondary"
          />
        </div>
      </div>
    </div>
  )
}

function EtudiantGate() {
  return (
    <div className="space-y-6">
      <ResultatsHeader
        icon={TrendingUp}
        title="Résultats & Analyses"
        subtitle="Espace enseignant — vos notes personnelles sont dans Mes résultats."
        accentFrom="from-primary"
        accentTo="to-secondary"
      />

      <Card className="ds-kente-watermark relative overflow-hidden border-l-4 border-l-primary">
        {/* Illustration baobab subtile en watermark (B10) */}
        <SavaneIllustration
          variant="baobab"
          size={170}
          className="pointer-events-none absolute -right-4 -bottom-4 text-primary"
        />
        <CardContent className="relative z-10 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
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

      {/* B11 : 3 cartes de suggestion de navigation pour guider l'étudiant */}
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Continuez votre parcours
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NavSuggestionCard
            icon={Trophy}
            title="Mes résultats"
            description="Vos notes par épreuve, votre moyenne générale et votre progression."
            href="/mes-resultats"
            ctaLabel="Consulter"
            accent="primary"
          />
          <NavSuggestionCard
            icon={BookOpen}
            title="Mes épreuves"
            description="Épreuves à venir, en cours et terminées vous concernant directement."
            href="/mes-epreuves"
            ctaLabel="Voir"
            accent="secondary"
          />
          <NavSuggestionCard
            icon={Compass}
            title="Tableau de bord"
            description="Vue d'ensemble de votre activité et prochaines échéances."
            href="/dashboard"
            ctaLabel="Aller"
            accent="info"
          />
        </div>
      </div>
    </div>
  )
}
