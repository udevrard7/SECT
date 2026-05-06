'use client'

import {
  FileText,
  Sparkles,
  ClipboardPen,
  Library,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Users,
  CheckCircle2,
  Eye,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

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

interface Evaluation {
  id: string
  name: string
  date: string
  status: 'active' | 'terminée' | 'planifiée'
  participants: number
  tauxReussite: number
}

const recentEvaluations: Evaluation[] = [
  {
    id: '1',
    name: 'Algorithmique L2 - Contrôle 1',
    date: '02/06/2026',
    status: 'active',
    participants: 45,
    tauxReussite: 68,
  },
  {
    id: '2',
    name: 'BD Avancées - Examen final',
    date: '28/05/2026',
    status: 'terminée',
    participants: 32,
    tauxReussite: 75,
  },
  {
    id: '3',
    name: 'Réseaux - TD3',
    date: '25/05/2026',
    status: 'terminée',
    participants: 38,
    tauxReussite: 82,
  },
]

function getStatusBadgeVariant(status: Evaluation['status']) {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300 hover:bg-emerald-100'
    case 'terminée':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-100'
    case 'planifiée':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 hover:bg-amber-100'
    default:
      return ''
  }
}

function getStatusLabel(status: Evaluation['status']) {
  switch (status) {
    case 'active':
      return 'Active'
    case 'terminée':
      return 'Terminée'
    case 'planifiée':
      return 'Planifiée'
    default:
      return status
  }
}

interface PendingCorrection {
  id: string
  studentName: string
  questionPreview: string
  subject: string
}

const pendingCorrections: PendingCorrection[] = [
  {
    id: '1',
    studentName: 'Jean Martin',
    questionPreview: 'Expliquez le principe de la programmation dynamique...',
    subject: 'Algorithmique L2',
  },
  {
    id: '2',
    studentName: 'Sophie Bernard',
    questionPreview: 'Comparez les modèles relationnel et NoSQL...',
    subject: 'BD Avancées',
  },
  {
    id: '3',
    studentName: 'Lucas Petit',
    questionPreview: 'Décrivez le protocole TCP/IP en détail...',
    subject: 'Réseaux L3',
  },
  {
    id: '4',
    studentName: 'Emma Leroy',
    questionPreview: 'Analysez la complexité de l\'algorithme de Dijkstra...',
    subject: 'Algorithmique L2',
  },
]

export function EnseignantDashboard() {
  const user = useAuthStore((s) => s.user)
  const name = user?.name ?? 'Enseignant'
  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Bonjour, {name}
        </h1>
        <Badge className="w-fit bg-emerald-600 text-white hover:bg-emerald-700">
          Enseignant
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Mes documents"
          value={5}
          icon={<FileText className="h-5 w-5" />}
          change={20}
          changeLabel="ce mois"
          accentColor="#10b981"
        />
        <StatCard
          title="Questions générées"
          value={124}
          icon={<Sparkles className="h-5 w-5" />}
          change={35}
          changeLabel="ce mois"
          accentColor="#14b8a6"
        />
        <StatCard
          title="Épreuves actives"
          value={3}
          icon={<ClipboardPen className="h-5 w-5" />}
          change={0}
          changeLabel="vs mois dernier"
          accentColor="#059669"
        />
        <StatCard
          title="En attente correction"
          value={2}
          icon={<Clock className="h-5 w-5" />}
          change={-15}
          changeLabel="vs semaine dernière"
          accentColor="#0d9488"
        />
      </div>

      {/* Quick Actions + Recent Evaluations */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600" />
              Actions rapides
            </CardTitle>
            <CardDescription>Créer du contenu rapidement</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700" size="lg">
              <FileText className="h-4 w-4" />
              Nouveau document
            </Button>
            <Button
              className="w-full justify-start gap-2 bg-teal-600 hover:bg-teal-700"
              size="lg"
            >
              <Sparkles className="h-4 w-4" />
              Générer des questions
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              size="lg"
            >
              <ClipboardPen className="h-4 w-4" />
              Créer une épreuve
            </Button>
          </CardContent>
        </Card>

        {/* Recent Evaluations */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Library className="h-5 w-5 text-teal-600" />
              Évaluations récentes
            </CardTitle>
            <CardDescription>Vos dernières épreuves créées</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Table Header */}
            <div className="mb-3 grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
              <div className="col-span-4">Épreuve</div>
              <div className="col-span-2">Date</div>
              <div className="col-span-2">Statut</div>
              <div className="col-span-2 text-center">Participants</div>
              <div className="col-span-2 text-right">Réussite</div>
            </div>
            <div className="space-y-1">
              {recentEvaluations.map((evaluation, index) => (
                <div key={evaluation.id}>
                  <div className="grid grid-cols-12 items-center gap-2 py-3">
                    <div className="col-span-4 truncate text-sm font-medium">
                      {evaluation.name}
                    </div>
                    <div className="col-span-2 text-sm text-muted-foreground">
                      {evaluation.date}
                    </div>
                    <div className="col-span-2">
                      <Badge
                        variant="outline"
                        className={getStatusBadgeVariant(evaluation.status)}
                      >
                        {getStatusLabel(evaluation.status)}
                      </Badge>
                    </div>
                    <div className="col-span-2 text-center text-sm">
                      {evaluation.participants}
                    </div>
                    <div className="col-span-2 text-right text-sm font-medium">
                      {evaluation.tauxReussite}%
                    </div>
                  </div>
                  {index < recentEvaluations.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Corrections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Corrections en attente
          </CardTitle>
          <CardDescription>
            Réponses QRC nécessitant votre relecture
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {pendingCorrections.map((correction, index) => (
              <div key={correction.id}>
                <div className="flex items-start gap-3 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{correction.studentName}</p>
                      <Badge variant="outline" className="text-xs">
                        {correction.subject}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {correction.questionPreview}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="shrink-0 text-emerald-600 hover:text-emerald-700">
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    Corriger
                  </Button>
                </div>
                {index < pendingCorrections.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
