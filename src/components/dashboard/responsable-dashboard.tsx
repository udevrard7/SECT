'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  GraduationCap,
  ClipboardCheck,
  Users,
  BookOpen,
  AlertTriangle,
  ArrowRight,
  BarChart3
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

// ─── Types ───

interface ResponsableStatsData {
  nbEnseignants: number;
  nbEpreuves: number;
  nbAlertes: number;
  nbEtudiants: number;
  nbUes: number;
}

// ─── StatCard (KPI) ───

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  accentColor: string;
}

function StatCard({ title, value, icon, accentColor }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden transition-transform duration-300 ease-out hover:scale-[1.03]">
      <div
        className="absolute left-0 top-0 h-full w-1.5 rounded-l-xl"
        style={{ backgroundColor: accentColor }}
      />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          <div style={{ color: accentColor }}>{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}

// ─── ActionCard (Navigation) ───

interface ActionCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    href: string;
  }
  
  function ActionCard({ title, description, icon, color, href }: ActionCardProps) {
    return (
    <Link href={href} passHref>
      <Card className="group relative flex h-full flex-col justify-between overflow-hidden transition-all duration-300 hover:shadow-lg hover:ring-2 hover:ring-offset-2" style={{ ringColor: color }}>
        <div className="p-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${color}20`}}>
            <div style={{ color: color }}>{icon}</div>
          </div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center justify-end bg-muted/40 p-3 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          Explorer <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </Card>
    </Link>
    )
  }

// ─── Loading Skeleton ───

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
        {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-6 w-44" />
      </div>
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      {/* Title */}
      <Skeleton className="h-8 w-80" />
      {/* Action Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───

export function ResponsableDashboard() {
  const user = useAuthStore((s) => s.user)
  const [data, setData] = useState<ResponsableStatsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (user?.id) params.set('responsableId', user.id)
      const url = `/api/stats/responsable?${params.toString()}`

      const res = await fetch(url)
      if (!res.ok) throw new Error('Erreur réseau')
      const json: ResponsableStatsData = await res.json()
      setData(json)
    } catch {
      toast.error('Impossible de charger les statistiques du tableau de bord.')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return <DashboardSkeleton />
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24">
        <BarChart3 className="mb-4 h-16 w-16 text-muted-foreground/30" />
        <h3 className="text-xl font-semibold">Données indisponibles</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Impossible de charger les statistiques. Veuillez réessayer plus tard.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ─── 1. Welcome Section ─── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Tableau de Bord Stratégique
        </h1>
        <Badge className="w-fit bg-amber-100 text-amber-800 hover:bg-amber-200/80 dark:bg-amber-900/30 dark:text-amber-300">
          Responsable Pédagogique
        </Badge>
      </div>

      {/* ─── 2. Main KPIs ─── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Étudiants Supervisés"
          value={data.nbEtudiants}
          icon={<GraduationCap className="h-5 w-5" />}
          accentColor="#3498db"
        />
        <StatCard
          title="Enseignants"
          value={data.nbEnseignants}
          icon={<Users className="h-5 w-5" />}
          accentColor="#2ecc71"
        />
         <StatCard
          title="Unités d'Enseignement"
          value={data.nbUes}
          icon={<BookOpen className="h-5 w-5" />}
          accentColor="#f1c40f"
        />
        <StatCard
          title="Épreuves Créées"
          value={data.nbEpreuves}
          icon={<ClipboardCheck className="h-5 w-5" />}
          accentColor="#e67e22"
        />
        <StatCard
          title="Alertes Actives"
          value={data.nbAlertes}
          icon={<AlertTriangle className="h-5 w-5" />}
          accentColor="#e74c3c"
        />
      </div>

      {/* ─── 3. Navigation / Action Hub ─── */}
      <div>
        <h2 className="mb-4 text-xl font-semibold tracking-tight">Modules de Pilotage</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
             <ActionCard 
                title="Gestion des Habilitations"
                description="Assigner les enseignants aux filières et unités d'enseignement."
                icon={<Users className="h-6 w-6"/>}
                color="#3498db"
                href="/responsable/habilitations"
             />
             <ActionCard 
                title="Centre d'Alertes"
                description="Analyser les points de friction et les performances atypiques."
                icon={<AlertTriangle className="h-6 w-6"/>}
                color="#e74c3c"
                href="/responsable/alertes"
             />
            <ActionCard 
                title="Rapports & Exports"
                description="Générer des synthèses de performance par filière ou enseignant."
                icon={<BarChart3 className="h-6 w-6"/>}
                color="#9b59b6"
                href="/responsable/rapports"
            />
        </div>
      </div>

    </div>
  )
}
