// ───────────────────────────────────────────────────────────
// Page principale "Mes Résultats" (étudiant) — refonte complète
// 3 onglets : Vue d'ensemble | Mes épreuves | Relevé par année
// (l'onglet "Évolution" a été fusionné dans "Vue d'ensemble" car il
//  rendait le même composant EtudiantOverviewTab — doublon ; le
//  « Relevé par année » arrive avec SECT-ANNEE-DETTES-5)
// ───────────────────────────────────────────────────────────

'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Trophy,
  LayoutDashboard,
  BookOpen,
  RefreshCw,
  AlertCircle,
  CalendarRange,
  ScrollText,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { ReleveParAnneeTab } from '../mes-resultats/releve-par-annee-tab'
// SECT-ANNEE-DETTES-5 : mappers StudentSession → GradeEntry extraits vers
// grade-mapping.ts (partagés avec le « Relevé par année »).
import { mapSessionsToGrades } from '../mes-resultats/grade-mapping'
import type { StudentSession } from '@/types/resultats'

// ───────────────────────────────────────────────────────────
// SECT-ANNEE-DETTES-4 : option du sélecteur d'année académique
// (GET /api/annees-academiques?etablissementId=… — réponse = array direct,
// même source que Mes Épreuves / Mes Devoirs).
interface AnneeAcademiqueOption {
  id: string
  libelle: string
  actif: boolean
  dateDebut?: string
}

export function MesResultatsPage() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState('overview')
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<StudentSession | null>(null)

  // SECT-ANNEE-DETTES-4 : filtre année académique. null = pas encore choisi
  // (le défaut est DÉRIVÉ de l'année courante, cf. anneeParDefaut ci-dessous) ;
  // « Toutes les années » = value 'all' pour l'historique. Même contrat que
  // Mes Épreuves (SECT-ANNEE-HISTOIRE-2) : défaut backend = année courante —
  // après l'activation d'une nouvelle année, les notes de l'ancienne ne
  // polluent plus la vue par défaut.
  const [anneeChoisie, setAnneeChoisie] = useState<string | null>(null)

  // ─── Années académiques (SECT-ANNEE-DETTES-4) ───
  // Liste des années de l'établissement de l'étudiant pour alimenter le
  // sélecteur d'année de l'en-tête (cache partagé clé ['annees-academiques']).
  const anneesAcademiquesQuery = useQuery<AnneeAcademiqueOption[]>({
    queryKey: ['annees-academiques', user?.etablissementId],
    queryFn: async () => {
      const res = await fetch(`/api/annees-academiques?etablissementId=${user!.etablissementId}`)
      if (!res.ok) throw new Error('Failed to fetch annees academiques')
      const data = await res.json()
      return Array.isArray(data) ? data : []
    },
    enabled: !!user?.etablissementId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const anneesAcademiques = anneesAcademiquesQuery.data ?? []

  // Fallback : si la liste n'a aucune année actif=true, on interroge
  // /annee-courante (l'ID retenu doit exister dans la liste pour que le
  // Select affiche une option valide).
  const anneeCouranteQuery = useQuery<{ anneeCourante: { id: string; libelle: string } | null }>({
    queryKey: ['annee-courante', user?.etablissementId],
    queryFn: async () => {
      const res = await fetch(`/api/etablissements/${user!.etablissementId}/annee-courante`)
      if (!res.ok) throw new Error('Failed to fetch annee courante')
      return res.json()
    },
    enabled:
      !!user?.etablissementId &&
      anneesAcademiques.length > 0 &&
      !anneesAcademiques.some((a) => a.actif),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Défaut du filtre : année COURANTE (actif) de la liste, sinon via
  // /annee-courante. Sans établissement ni années → '' (défaut backend).
  // Dérivation pendant le rendu (pas d'effet) : tant que l'utilisateur n'a
  // pas choisi, le sélecteur suit l'année courante de l'établissement.
  const anneeParDefaut =
    anneesAcademiques.find((a) => a.actif)?.id ??
    anneesAcademiques.find((a) => a.id === anneeCouranteQuery.data?.anneeCourante?.id)?.id ??
    ''
  const filterAnneeAcademiqueId = anneeChoisie ?? anneeParDefaut

  const overviewQuery = useEtudiantOverview(user?.id, filterAnneeAcademiqueId)
  const resultatsQuery = useMesResultats(user?.id, filterAnneeAcademiqueId)
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* SECT-ANNEE-DETTES-4 : sélecteur d'année académique (défaut =
              courante, « Toutes les années » pour l'historique). */}
          {anneesAcademiques.length > 0 && (
            <Select
              value={filterAnneeAcademiqueId || 'all'}
              onValueChange={(v) => setAnneeChoisie(v)}
            >
              <SelectTrigger className="h-9 w-full text-xs sm:w-[190px]">
                <span className="flex items-center gap-1.5 truncate">
                  <CalendarRange className="h-3.5 w-3.5 text-info" />
                  <SelectValue placeholder="Année académique" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les années</SelectItem>
                {anneesAcademiques.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.libelle}
                    {a.actif ? ' · courante' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
          {/* SECT-ANNEE-DETTES-5 : relevé de notes multi-années — la suite
              logique produit notée à la livraison de SECT-ANNEE-ARCHIVAGE-2. */}
          <TabsTrigger value="releve" className="gap-1.5">
            <ScrollText className="h-4 w-4" />
            <span className="hidden sm:inline">Relevé par année</span>
            <span className="sm:hidden">Relevé</span>
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

        {/* ─── Relevé par année (SECT-ANNEE-DETTES-5) ─── */}
        {/* Multi-années par design : ce relevé consulte TOUTES les années
            (?anneeAcademiqueId=all) et les regroupe — indépendant du
            sélecteur d'année de l'en-tête qui pilote les 2 autres onglets. */}
        <TabsContent value="releve" className="mt-6">
          <ReleveParAnneeTab
            userId={user?.id}
            annees={anneesAcademiques}
            onViewDetail={handleViewDetail}
          />
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
