// ─────────────────────────────────────────────────────────────
// ReleveParAnneeTab — « Relevé de notes par année » (étudiant)
// SECT-ANNEE-DETTES-5 : la suite logique produit notée à la
// livraison de SECT-ANNEE-ARCHIVAGE-2 (« mes-resultats/mes-
// certificats n'exposent pas encore le all — un relevé de notes
// par année reste la suite logique »).
//
// Contrairement aux onglets « Vue d'ensemble » et « Mes épreuves »
// (scopés par le sélecteur d'année de l'en-tête), ce relevé
// consulte TOUTES les années (?anneeAcademiqueId=all des deux
// endpoints) et les regroupe par année académique :
//   - une section par année (la courante en premier, badge dédié) ;
//   - stats par année : notes, moyenne /20, UE validées, crédits
//     ECTS validés (depuis ValidationUE) ;
//   - tableau des UE de l'année (progression, note, statut) ;
//   - GradeTable des notes de l'année (clic → détail existant).
//
// Sources de données :
//   - useMesResultats(userId, 'all')      → sessions + epreuve.anneeLibelle
//   - useMesValidationsUE(userId, 'all')  → validations + anneeLibelle
// ─────────────────────────────────────────────────────────────

'use client'

import { useMemo } from 'react'
import {
  CalendarRange,
  GraduationCap,
  AlertCircle,
  BookOpen,
  Award,
  Info,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { GradeTable, PulseSkeleton, type GradeEntry } from '@/components/ds'
import {
  useMesResultats,
  useMesValidationsUE,
  type MesValidationUE,
} from '@/hooks/use-resultats'
import type { StudentSession } from '@/types/resultats'
import {
  mapSessionsToGrades,
  sessionAnneeLibelle,
  type AnneeOptionReleve,
} from './grade-mapping'

// ─── Statuts ValidationUE (labels styles cohérents mes-certificats) ───

const STATUT_UE_META: Record<
  MesValidationUE['statut'],
  { label: string; cls: string }
> = {
  VALIDEE: { label: 'Validée', cls: 'bg-success/15 text-success-text' },
  NON_VALIDEE: { label: 'Non validée', cls: 'bg-destructive/15 text-destructive' },
  EN_COURS: { label: 'En cours', cls: 'bg-warning/15 text-warning' },
}

// Clé de groupage pour les lignes sans année rattachable.
const HORS_ANNEE = 'HORS_ANNEE'

interface ReleveGroup {
  key: string
  libelle: string
  estCourante: boolean
  ordre: string // clé de tri : dateDebut ISO ('' → dernier)
  sessions: StudentSession[]
  grades: GradeEntry[]
  validations: MesValidationUE[]
}

interface ReleveParAnneeTabProps {
  userId: string | undefined | null
  /** Liste des années de l'établissement (cache partagé ['annees-academiques']). */
  annees: AnneeOptionReleve[]
  onViewDetail: (session: StudentSession) => void
}

export function ReleveParAnneeTab({ userId, annees, onViewDetail }: ReleveParAnneeTabProps) {
  // Historique complet explicite — le sélecteur d'année de l'en-tête pilote
  // les DEUX autres onglets ; le relevé est par définition multi-années.
  const resultatsQuery = useMesResultats(userId, 'all')
  const validationsQuery = useMesValidationsUE(userId, 'all')

  const sessions: StudentSession[] = resultatsQuery.data ?? []
  const validations: MesValidationUE[] = validationsQuery.data ?? []
  const loading = resultatsQuery.isLoading || validationsQuery.isLoading

  // ─── Groupement par année académique ───
  const groupes = useMemo<ReleveGroup[]>(() => {
    const parAnnee = new Map<string, ReleveGroup>()

    const resolveGroupe = (libelle: string, anneeId?: string | null): ReleveGroup => {
      const key = libelle || HORS_ANNEE
      let g = parAnnee.get(key)
      if (!g) {
        const meta = anneeId ? annees.find((a) => a.id === anneeId) : undefined
        g = {
          key,
          libelle: libelle || 'Hors année académique',
          estCourante: meta ? meta.actif : false,
          ordre: meta?.dateDebut ?? '',
          sessions: [],
          grades: [],
          validations: [],
        }
        parAnnee.set(key, g)
      }
      // Un libellé peut arriver sans ID (DTO) : enrichir si l'ID est connu.
      if (anneeId && !g.estCourante) {
        const meta = annees.find((a) => a.id === anneeId)
        if (meta?.actif) g.estCourante = true
        if (meta?.dateDebut && !g.ordre) g.ordre = meta.dateDebut
      }
      return g
    }

    for (const s of sessions) {
      const libelle = sessionAnneeLibelle(s, annees)
      const g = resolveGroupe(libelle, s.epreuve.anneeAcademiqueId)
      g.sessions.push(s)
    }
    for (const v of validations) {
      const libelle = v.anneeLibelle ?? (v.anneeAcademiqueId
        ? annees.find((a) => a.id === v.anneeAcademiqueId)?.libelle ?? ''
        : '')
      const g = resolveGroupe(libelle, v.anneeAcademiqueId)
      g.validations.push(v)
    }

    const liste = [...parAnnee.values()]
    for (const g of liste) {
      g.grades = mapSessionsToGrades(g.sessions)
    }
    // Tri : années par dateDebut décroissante (la plus récente d'abord) ;
    // « Hors année académique » (ordre '') en fin de liste.
    liste.sort((a, b) => {
      if (a.ordre === b.ordre) return a.libelle.localeCompare(b.libelle)
      if (!a.ordre) return 1
      if (!b.ordre) return -1
      return b.ordre.localeCompare(a.ordre)
    })
    return liste
  }, [sessions, validations, annees])

  // ─── Stats globales (toutes années) ───
  const statsGlobales = useMemo(() => {
    const nbAnnees = groupes.filter((g) => g.key !== HORS_ANNEE).length
    const ueValidees = validations.filter((v) => v.statut === 'VALIDEE')
    const ects = ueValidees.reduce(
      (acc, v) => acc + (v.uniteEnseignement?.creditsECTS ?? 0),
      0
    )
    return { nbAnnees, nbUEValidees: ueValidees.length, ects }
  }, [groupes, validations])

  // ─── Rendu ───

  if (loading && !resultatsQuery.data && !validationsQuery.data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <PulseSkeleton key={i} variant="card" className="h-24" />
          ))}
        </div>
        <PulseSkeleton variant="card" className="h-64" />
      </div>
    )
  }

  if (resultatsQuery.isError) {
    return (
      <Card className="border-l-4 border-l-primary">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="mt-3 text-sm font-medium">Erreur de chargement</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Impossible de charger votre relevé.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (sessions.length === 0 && validations.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <CalendarRange className="h-10 w-10 text-primary-text" />
          </div>
          <h3 className="mt-4 text-lg font-display font-semibold tracking-tight">
            Aucun résultat à ce jour
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Votre relevé par année se remplira au fil de vos épreuves et
            validations d&apos;unités d&apos;enseignement.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hint : ce relevé est volontairement multi-années */}
      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
        <span>
          Relevé complet de votre parcours : toutes vos années académiques, de la
          plus récente à la plus ancienne. Le sélecteur d&apos;année de l&apos;en-tête
          filtre les onglets « Vue d&apos;ensemble » et « Mes épreuves ».
        </span>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <CalendarRange className="h-4 w-4 text-primary-text" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-2xl font-bold tabular-nums leading-none">
                {statsGlobales.nbAnnees}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                année{statsGlobales.nbAnnees > 1 ? 's' : ''} académique{statsGlobales.nbAnnees > 1 ? 's' : ''}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-success">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10">
              <Award className="h-4 w-4 text-success-text" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-2xl font-bold tabular-nums leading-none">
                {statsGlobales.nbUEValidees}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">UE validées</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gold">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10">
              <GraduationCap className="h-4 w-4 text-gold" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-2xl font-bold tabular-nums leading-none">
                {statsGlobales.ects}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">crédits ECTS validés</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sections par année */}
      {groupes.map((g) => {
        const moyenne = g.grades.length
          ? g.grades.reduce((acc, gr) => acc + (gr.maxScore > 0 ? (gr.score / gr.maxScore) * 20 : 0), 0) / g.grades.length
          : 0
        const ueValidees = g.validations.filter((v) => v.statut === 'VALIDEE')
        const ects = ueValidees.reduce(
          (acc, v) => acc + (v.uniteEnseignement?.creditsECTS ?? 0),
          0
        )
        return (
          <Card key={g.key} className="overflow-hidden">
            {/* En-tête de l'année */}
            <div className="ds-kente-strip" aria-hidden="true" />
            <CardContent className="p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                  <CalendarRange className="h-5 w-5 text-primary-text" />
                  {g.libelle}
                </h3>
                {g.estCourante && (
                  <Badge
                    variant="secondary"
                    className="bg-success/15 px-2 text-[10px] font-bold text-success-text"
                  >
                    Année courante
                  </Badge>
                )}
                {g.key === HORS_ANNEE && (
                  <Badge
                    variant="secondary"
                    className="bg-muted px-2 text-[10px] text-muted-foreground"
                  >
                    Avant le suivi par année
                  </Badge>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    <span className="font-mono tabular-nums">{g.grades.length}</span>{' '}
                    note{g.grades.length > 1 ? 's' : ''}
                  </span>
                  {g.grades.length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="font-mono font-bold tabular-nums text-foreground">
                        {moyenne.toFixed(1)}
                      </span>
                      /20
                    </span>
                  )}
                  {g.validations.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Award className="h-3 w-3" />
                      <span className="font-mono tabular-nums">{ueValidees.length}</span>/
                      <span className="font-mono tabular-nums">{g.validations.length}</span>{' '}
                      UE validée{ueValidees.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {ects > 0 && (
                    <span className="flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      <span className="font-mono font-bold tabular-nums text-foreground">{ects}</span>{' '}
                      ECTS
                    </span>
                  )}
                </div>
              </div>

              {/* Tableau des UE de l'année */}
              {g.validations.length > 0 && (
                <div className="mb-4 overflow-x-auto scrollbar-thin rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {['Code UE', 'Nom', 'ECTS', 'Épreuves', 'Note', 'Statut'].map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className="p-2.5 text-center font-display font-medium text-muted-foreground first:text-left"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.validations.map((v) => {
                        const sm = STATUT_UE_META[v.statut]
                        const note =
                          v.statut === 'EN_COURS' ? null : (v.noteFinale ?? v.moyenneUE)
                        return (
                          <tr
                            key={v.id}
                            className="border-b last:border-0 transition-colors hover:bg-muted/20"
                          >
                            <td className="p-2.5 text-left font-mono text-xs">
                              {v.uniteEnseignement?.code ?? '—'}
                            </td>
                            <td className="p-2.5 text-left font-medium">
                              {v.uniteEnseignement?.nom ?? '—'}
                            </td>
                            <td className="p-2.5 text-center font-mono tabular-nums">
                              {v.uniteEnseignement?.creditsECTS ?? 0}
                            </td>
                            <td className="p-2.5 text-center font-mono tabular-nums text-muted-foreground">
                              {v.nbEpreuvesCompletees}/{v.nbEpreuvesTotal}
                            </td>
                            <td className="p-2.5 text-center font-mono font-semibold tabular-nums">
                              {note !== null ? (
                                <span
                                  className={
                                    note >= 16
                                      ? 'text-gold'
                                      : note >= 10
                                        ? 'text-success-text'
                                        : 'text-destructive'
                                  }
                                >
                                  {note.toFixed(1)}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              <Badge variant="secondary" className={`gap-1 ${sm.cls}`}>
                                {sm.label}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Notes de l'année */}
              {g.grades.length > 0 ? (
                <GradeTable
                  grades={g.grades}
                  onRowClick={(grade) => {
                    // Miroir de handleGradeClick (mes-resultats-page) :
                    // retrouver la StudentSession depuis l'ID de la note.
                    const session = g.sessions.find((s) => s.id === grade.id)
                    if (session) onViewDetail(session)
                  }}
                />
              ) : (
                g.validations.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Aucune note exploitable sur cette année (sessions en attente de
                    correction exclues).
                  </p>
                )
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
