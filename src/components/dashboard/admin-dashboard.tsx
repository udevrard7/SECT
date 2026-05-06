'use client'

import {
  Users,
  Building2,
  ClipboardCheck,
  Library,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Shield,
  Server,
  Database,
  Brain,
  UserPlus,
  FileUp,
  CheckCircle2,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/stores/auth-store'

interface StatCardProps {
  title: string
  value: number | string
  icon: React.ReactNode
  change: number
  changeLabel: string
  accentColor: string
}

function StatCard({ title, value, icon, change, changeLabel, accentColor }: StatCardProps) {
  const isPositive = change >= 0

  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: accentColor }}
      />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-sm font-medium">{title}</CardDescription>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accentColor}18` }}
        >
          <div style={{ color: accentColor }}>{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-bold">{value}</div>
        <div className="mt-1 flex items-center gap-1 text-xs">
          {isPositive ? (
            <ArrowUpRight className="h-3 w-3 text-emerald-600" />
          ) : (
            <ArrowDownRight className="h-3 w-3 text-red-500" />
          )}
          <span className={isPositive ? 'text-emerald-600' : 'text-red-500'}>
            {Math.abs(change)}%
          </span>
          <span className="text-muted-foreground">{changeLabel}</span>
        </div>
      </CardContent>
    </Card>
  )
}

const recentActivities = [
  {
    id: '1',
    description: 'Nouvel utilisateur inscrit — Marie Dupont',
    time: 'Il y a 2h',
    icon: UserPlus,
    color: 'text-emerald-600',
  },
  {
    id: '2',
    description: 'Épreuve lancée — Algorithmique L2',
    time: 'Il y a 3h',
    icon: ClipboardCheck,
    color: 'text-teal-600',
  },
  {
    id: '3',
    description: 'Document uploadé — BD Avancées',
    time: 'Il y a 5h',
    icon: FileUp,
    color: 'text-amber-600',
  },
  {
    id: '4',
    description: 'Correction terminée — Réseaux L3',
    time: 'Il y a 1j',
    icon: CheckCircle2,
    color: 'text-sky-600',
  },
]

const systemServices = [
  { name: 'API', status: 'Opérationnel', color: '#10b981' },
  { name: 'Base de données', status: 'Opérationnel', color: '#10b981' },
  { name: 'Service IA', status: 'Opérationnel', color: '#10b981' },
]

export function AdminDashboard() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Bonjour, {user?.name ?? 'Administrateur'}
        </h1>
        <Badge className="w-fit bg-red-600 text-white hover:bg-red-700">
          Administrateur
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Utilisateurs"
          value={156}
          icon={<Users className="h-5 w-5" />}
          change={12}
          changeLabel="ce mois"
          accentColor="#10b981"
        />
        <StatCard
          title="Établissements"
          value={3}
          icon={<Building2 className="h-5 w-5" />}
          change={0}
          changeLabel="vs mois dernier"
          accentColor="#f59e0b"
        />
        <StatCard
          title="Évaluations actives"
          value={12}
          icon={<ClipboardCheck className="h-5 w-5" />}
          change={25}
          changeLabel="ce mois"
          accentColor="#14b8a6"
        />
        <StatCard
          title="Questions en banque"
          value={847}
          icon={<Library className="h-5 w-5" />}
          change={35}
          changeLabel="ce mois"
          accentColor="#0d9488"
        />
      </div>

      {/* Activity + System Health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              Activité récente
            </CardTitle>
            <CardDescription>Derniers événements sur la plateforme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {recentActivities.map((activity, index) => (
                <div key={activity.id}>
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
                      <activity.icon className={`h-4 w-4 ${activity.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                  {index < recentActivities.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-teal-600" />
              Santé du système
            </CardTitle>
            <CardDescription>État des services en temps réel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {systemServices.map((service) => (
                <div key={service.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: service.color }}
                    />
                    <div className="flex items-center gap-2">
                      {service.name === 'API' && <Server className="h-4 w-4 text-muted-foreground" />}
                      {service.name === 'Base de données' && <Database className="h-4 w-4 text-muted-foreground" />}
                      {service.name === 'Service IA' && <Brain className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-sm font-medium">{service.name}</span>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                  >
                    {service.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
