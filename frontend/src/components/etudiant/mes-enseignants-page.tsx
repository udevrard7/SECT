// ─────────────────────────────────────────────────────────────
// Page étudiante "Mes enseignants" / "Mes UE"
// SECT-ETUDIANT-MES-ENSEIGNANTS-1
//
// Consomme GET /api/affectations — la RLS Affectation_select (migration 000091,
// fonction affectation_visible_by_student) auto-filtre sur la filière de
// l'étudiant + statut PUBLIEE. Aucun paramètre de requête nécessaire.
//
// 2 onglets :
//   - "Mes enseignants" : groupement par enseignant (qui m'enseigne quoi ?)
//   - "Mes UE"          : groupement par UE (quels enseignants pour cette UE ?)
// ─────────────────────────────────────────────────────────────

'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  BookOpen,
  Mail,
  Clock,
  AlertCircle,
  RefreshCw,
  GraduationCap,
} from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PulseSkeleton } from '@/components/ds'
import { formatDateUTC } from '@/lib/date-utils'

// ─── Types (miroir de la réponse API /api/affectations) ───────────────────

interface AffectationEtudiant {
  id: string
  enseignantId: string
  uniteEnseignementId: string
  typeSeance: 'CM' | 'TD' | 'TP'
  groupe: string | null
  volumeHeures: number
  anneeUniversitaire: string
  statut: string
  publishedAt?: string
  publishedBy?: { id: string; name: string } | null
  enseignant?: { id: string; name: string; email: string } | null
  uniteEnseignement?: {
    id: string
    code: string
    nom: string
    niveau: string
    niveaux?: string | null
    filiere?: { id: string; nom: string; code?: string | null } | null
  } | null
}

interface AffectationsResponse {
  affectations: AffectationEtudiant[]
}

// ─── Helpers de badge type séance ─────────────────────────────────────────

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  CM: {
    label: 'CM',
    className: 'bg-primary/15 text-primary-text border-primary/30',
  },
  TD: {
    label: 'TD',
    className: 'bg-secondary/15 text-secondary-foreground border-secondary/30',
  },
  TP: {
    label: 'TP',
    className: 'bg-info/15 text-info-foreground border-info/30',
  },
}

// ─── Page principale ──────────────────────────────────────────────────────

export function MesEnseignantsPage() {
  const [activeTab, setActiveTab] = useState<'enseignants' | 'ues'>(
    'enseignants'
  )

  const { data, isLoading, error, refetch } = useQuery<AffectationsResponse>({
    queryKey: ['mes-affectations'],
    queryFn: async () => {
      const res = await fetch('/api/affectations', {
        credentials: 'same-origin',
      })
      if (!res.ok) {
        throw new Error('Erreur lors du chargement de vos affectations')
      }
      return res.json()
    },
  })

  const affectations = data?.affectations ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" aria-hidden="true" />
          Mes enseignants &amp; unités d&apos;enseignement
        </h1>
        <p className="text-sm text-muted-foreground">
          Les enseignants affectés aux unités d&apos;enseignement de votre
          filière, publiés par votre responsable.
        </p>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'enseignants' | 'ues')}
      >
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="enseignants" className="gap-1.5">
            <Users className="h-4 w-4" aria-hidden="true" />
            Mes enseignants
          </TabsTrigger>
          <TabsTrigger value="ues" className="gap-1.5">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Mes UE
          </TabsTrigger>
        </TabsList>

        <TabsContent value="enseignants" className="mt-6">
          <MesEnseignantsTab
            affectations={affectations}
            isLoading={isLoading}
            error={error as Error | null}
            onRetry={() => refetch()}
          />
        </TabsContent>

        <TabsContent value="ues" className="mt-6">
          <MesUESTab
            affectations={affectations}
            isLoading={isLoading}
            error={error as Error | null}
            onRetry={() => refetch()}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Onglet "Mes enseignants" (groupé par enseignant) ─────────────────────

function MesEnseignantsTab({
  affectations,
  isLoading,
  error,
  onRetry,
}: {
  affectations: AffectationEtudiant[]
  isLoading: boolean
  error: Error | null
  onRetry: () => void
}) {
  // Grouper par enseignant — useMemo AVANT les early returns (Rules of Hooks).
  const parEnseignant = useMemo(() => {
    const map = new Map<
      string,
      { name: string; email: string; affectations: AffectationEtudiant[] }
    >()
    for (const aff of affectations) {
      if (!aff.enseignant) continue
      const key = aff.enseignant.id
      if (!map.has(key)) {
        map.set(key, {
          name: aff.enseignant.name,
          email: aff.enseignant.email,
          affectations: [],
        })
      }
      map.get(key)!.affectations.push(aff)
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name)
    )
  }, [affectations])

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <PulseSkeleton key={i} className="h-40" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <AlertCircle className="h-10 w-10 text-destructive/50" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (affectations.length === 0) {
    return (
      <Card className="border-dashed border-2 border-border/60">
        <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
          <Users className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Aucune affectation publiée pour votre filière
            </p>
            <p className="text-xs text-muted-foreground">
              Vos enseignants apparaîtront ici une fois affectés et publiés par
              votre responsable.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {parEnseignant.map(([id, { name, email, affectations: affs }]) => (
        <Card key={id} className="overflow-hidden">
          <CardContent className="p-5 space-y-3">
            {/* Header enseignant */}
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-primary/15 text-primary-text flex items-center justify-center font-semibold">
                {name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground truncate">{name}</p>
                {email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{email}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Liste des UE de cet enseignant */}
            <div className="space-y-2 pt-1 border-t border-border/60">
              {affs.map((aff) => (
                <div
                  key={aff.id}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {aff.uniteEnseignement?.code} —{' '}
                      {aff.uniteEnseignement?.nom}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {aff.uniteEnseignement?.niveau}
                      </Badge>
                      {aff.groupe && (
                        <span className="text-xs text-muted-foreground">
                          Groupe {aff.groupe}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {aff.volumeHeures}h
                      </span>
                    </div>
                  </div>
                  <Badge
                    className={`text-[10px] px-1.5 py-0 border ${
                      TYPE_BADGE[aff.typeSeance]?.className ?? ''
                    }`}
                  >
                    {TYPE_BADGE[aff.typeSeance]?.label ?? aff.typeSeance}
                  </Badge>
                </div>
              ))}
            </div>

            {/* Date publication */}
            {affs[0]?.publishedAt && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Publiée le {formatDateUTC(affs[0].publishedAt)}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Onglet "Mes UE" (groupé par UE) ──────────────────────────────────────

function MesUESTab({
  affectations,
  isLoading,
  error,
  onRetry,
}: {
  affectations: AffectationEtudiant[]
  isLoading: boolean
  error: Error | null
  onRetry: () => void
}) {
  // Grouper par UE — useMemo AVANT les early returns (Rules of Hooks).
  const parUE = useMemo(() => {
    const map = new Map<
      string,
      { ue: AffectationEtudiant['uniteEnseignement']; affectations: AffectationEtudiant[] }
    >()
    for (const aff of affectations) {
      if (!aff.uniteEnseignement) continue
      const key = aff.uniteEnseignement.id
      if (!map.has(key)) {
        map.set(key, { ue: aff.uniteEnseignement, affectations: [] })
      }
      map.get(key)!.affectations.push(aff)
    }
    return Array.from(map.entries()).sort((a, b) =>
      (a[1].ue?.code ?? '').localeCompare(b[1].ue?.code ?? '')
    )
  }, [affectations])

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <PulseSkeleton key={i} className="h-40" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <AlertCircle className="h-10 w-10 text-destructive/50" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (affectations.length === 0) {
    return (
      <Card className="border-dashed border-2 border-border/60">
        <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
          <BookOpen className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Aucune UE avec affectation publiée
            </p>
            <p className="text-xs text-muted-foreground">
              Les unités d&apos;enseignement de votre filière apparaîtront ici
              une fois les affectations publiées.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {parUE.map(([id, { ue, affectations: affs }]) => (
        <Card key={id} className="overflow-hidden">
          <CardContent className="p-5 space-y-3">
            {/* Header UE */}
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-foreground truncate">
                  {ue?.code}
                </p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                  {ue?.niveau}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">{ue?.nom}</p>
              {ue?.filiere && (
                <Badge
                  className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary-text border-primary/20"
                >
                  {ue.filiere.nom}
                </Badge>
              )}
            </div>

            {/* Liste des enseignants de cette UE */}
            <div className="space-y-2 pt-1 border-t border-border/60">
              {affs.map((aff) => (
                <div
                  key={aff.id}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {aff.enseignant?.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {aff.groupe && (
                        <span className="text-xs text-muted-foreground">
                          Groupe {aff.groupe}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {aff.volumeHeures}h
                      </span>
                    </div>
                  </div>
                  <Badge
                    className={`text-[10px] px-1.5 py-0 border ${
                      TYPE_BADGE[aff.typeSeance]?.className ?? ''
                    }`}
                  >
                    {TYPE_BADGE[aff.typeSeance]?.label ?? aff.typeSeance}
                  </Badge>
                </div>
              ))}
            </div>

            {/* Date publication */}
            {affs[0]?.publishedAt && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Publiée le {formatDateUTC(affs[0].publishedAt)}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
