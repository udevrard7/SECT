// ─────────────────────────────────────────────────────────────
// Page principale "Mes Résultats" (étudiant) — refonte complète
// 3 onglets : Vue d'ensemble | Mes épreuves | Évolution
// ─────────────────────────────────────────────────────────────

'use client'

import { useMemo, useState } from 'react'
import {
  Trophy,
  LayoutDashboard,
  BookOpen,
  TrendingUp,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useMesResultats, useEtudiantOverview, useRefreshResultats } from '@/hooks/use-resultats'
import { GradeTable, PulseSkeleton, type GradeEntry } from '@/components/ds'
import { MesResultatsSkeleton, MesEpreuvesSkeleton } from '../mes-resultats/mes-resultats-skeletons'
import { EtudiantOverviewTab } from '../mes-resultats/etudiant-overview-tab'
import { MonResultatDialog } from '../mes-resultats/mon-resultat-dialog'
import type { StudentSession } from '@/types/resultats'

// ─────────────────────────────────────────────────────────────
// Mapping StudentSession → GradeEntry (pour le GradeTable DS)
//
// Le modèle de données étudiant est centré sur la "session de passation"
// (StudentSession) qui contient l'épreuve, les réponses et le résultat.
// On projette ces données vers le format GradeEntry attendu par le DS :
//
//   GradeEntry.subject     ← session.epreuve.enseignant.name
//                            (l'enseignant est le meilleur proxy de la
//                             "matière" — la filière n'est pas exposée
//                             dans le type StudentSession.epreuve)
//   GradeEntry.examTitle   ← session.epreuve.titre
//   GradeEntry.score       ← session.resultat?.scoreFinal ?? session.score ?? 0
//   GradeEntry.maxScore    ← session.epreuve.noteTotal ?? 20
//   GradeEntry.date        ← session.resultat?.dateCorrection
//                            ?? session.dateFin
//                            ?? session.dateDebut
//                            (fallback now() si toutes null)
//   GradeEntry.coefficient ← non disponible dans le modèle (omis)
//   GradeEntry.comment     ← session.resultat?.commentaires (si non vide)
//
// On ne retient que les sessions ayant un score exploitable
// (RETOURNEE ou CORRIGEE avec scoreFinal/score non null). Les
// sessions SOUMISE (en attente de correction) sont exclues car
// leur score n'est pas encore connu.
// ─────────────────────────────────────────────────────────────

function mapSessionToGrade(session: StudentSession): GradeEntry | null {
  const scoreFinal = session.resultat?.scoreFinal
  const rawScore = session.score
  const score = scoreFinal ?? rawScore
  // Skip sessions without a computable score (e.g. SOUMISE)
  if (score === null || score === undefined) return null

  const date =
    session.resultat?.dateCorrection ??
    session.dateFin ??
    session.dateDebut ??
    new Date().toISOString()

  const comment = session.resultat?.commentaires?.trim() || undefined

  return {
    id: session.id,
    subject: session.epreuve.enseignant.name,
    examTitle: session.epreuve.titre,
    score,
    maxScore: session.epreuve.noteTotal ?? 20,
    date,
    // coefficient: non disponible dans StudentSession
    comment,
  }
}

function mapSessionsToGrades(sessions: StudentSession[]): GradeEntry[] {
  const grades: GradeEntry[] = []
  for (const s of sessions) {
    const g = mapSessionToGrade(s)
    if (g) grades.push(g)
  }
  return grades
}

export function MesResultatsPage() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState('overview')
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<StudentSession | null>(null)

  const overviewQuery = useEtudiantOverview(user?.id)
  const resultatsQuery = useMesResultats(user?.id)
  const refresh = useRefreshResultats()

  // Sessions disponibles (tableau vide tant que la requête charge).
  // Hoisté avant l'early return ci-dessous pour respecter la règle des
  // hooks (useMemo ne doit pas être appelé de façon conditionnelle).
  const sessions: StudentSession[] = resultatsQuery.data ?? []

  // Projection StudentSession[] → GradeEntry[] pour le GradeTable DS.
  // Les sessions sans score (SOUMISE) sont exclues par mapSessionsToGrades.
  const grades = useMemo(() => mapSessionsToGrades(sessions), [sessions])

  const handleViewDetail = (session: StudentSession) => {
    setSelectedSession(session)
    setDetailOpen(true)
  }

  // Au clic sur une ligne du GradeTable, on retrouve la StudentSession
  // correspondante pour ouvrir le dialog de détail existant.
  const handleGradeClick = (grade: GradeEntry) => {
    const session = sessions.find((s) => s.id === grade.id)
    if (session) handleViewDetail(session)
  }

  // ─── Skeleton global tant que l'overview charge ───
  if (overviewQuery.isLoading && !overviewQuery.data) {
    return (
      <div className="space-y-6">
        <PulseSkeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <PulseSkeleton key={i} variant="card" className="h-28" />
          ))}
        </div>
        <PulseSkeleton variant="card" className="h-64" />
      </div>
    )
  }

  const overview = overviewQuery.data
  const pendingCount = sessions.filter((s) => s.statut === 'SOUMISE').length

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display font-bold tracking-tight md:text-3xl">
            <Trophy className="h-7 w-7 text-success-text" />
            Mes Résultats
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consultez vos notes, suivez votre progression et analysez vos performances
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={overviewQuery.isFetching || resultatsQuery.isFetching}
          className="self-start sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${overviewQuery.isFetching || resultatsQuery.isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Rafraîchir</span>
        </Button>
      </div>

      {/* ─── Onglets ─── */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Vue d&apos;ensemble</span>
            <span className="sm:hidden">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="epreuves" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Mes épreuves</span>
            <span className="sm:hidden">Épreuves</span>
            {sessions.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center bg-success/15 px-1 text-xs text-success-text font-mono tabular-nums">
                {sessions.length}
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 justify-center bg-warning/15 px-1 text-xs text-warning font-mono tabular-nums" title="En attente de correction">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="evolution" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Évolution</span>
            <span className="sm:hidden">Évol.</span>
          </TabsTrigger>
        </TabsList>

        {/* ─── Vue d'ensemble ─── */}
        <TabsContent value="overview" className="mt-6">
          {overviewQuery.isError ? (
            <Card className="border-l-4 border-l-primary">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium">Erreur de chargement</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Impossible de charger vos analyses.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => overviewQuery.refetch()}
                  className="mt-4"
                >
                  <RefreshCw className="h-4 w-4" />
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : overview && overview.totalEpreuves === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                  <Trophy className="h-10 w-10 text-success-text" />
                </div>
                <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">Aucun résultat disponible</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Vous n&apos;avez pas encore passé d&apos;épreuve. Vos résultats apparaîtront ici après soumission.
                </p>
              </CardContent>
            </Card>
          ) : overview ? (
            <EtudiantOverviewTab data={overview} />
          ) : null}
        </TabsContent>

        {/* ─── Mes épreuves ─── */}
        <TabsContent value="epreuves" className="mt-6">
          {resultatsQuery.isLoading && !resultatsQuery.data ? (
            <MesEpreuvesSkeleton />
          ) : resultatsQuery.isError ? (
            <Card className="border-l-4 border-l-primary">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="mt-3 text-sm font-medium">Erreur de chargement</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Impossible de charger vos résultats.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resultatsQuery.refetch()}
                  className="mt-4"
                >
                  <RefreshCw className="h-4 w-4" />
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          ) : sessions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/50" />
                <h3 className="mt-3 text-lg font-display font-semibold tracking-tight">Aucune épreuve</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Vous n&apos;avez pas encore passé d&apos;épreuve.
                </p>
              </CardContent>
            </Card>
          ) : (
            <GradeTable
              grades={grades}
              showAverage
              onRowClick={handleGradeClick}
            />
          )}
        </TabsContent>

        {/* ─── Évolution ─── */}
        <TabsContent value="evolution" className="mt-6">
          {overview && overview.totalEpreuves > 0 ? (
            <EtudiantOverviewTab data={overview} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <TrendingUp className="h-10 w-10 text-muted-foreground/50" />
                <h3 className="mt-3 text-lg font-display font-semibold tracking-tight">Pas encore de données</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  L&apos;évolution de vos performances sera visible après vos premières épreuves corrigées.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Dialog de détail ─── */}
      <MonResultatDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        session={selectedSession}
      />
    </div>
  )
}
