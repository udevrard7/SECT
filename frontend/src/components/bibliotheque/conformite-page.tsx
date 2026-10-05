// ─────────────────────────────────────────────────────────────────────
// ConformitePage — SECT-BIBLIO-P3 (ADR-0007 §P3) : l'audit de direction.
// « Le cours de M. X couvre N % du référentiel officiel » — la carte
// d'alignement support↔référentiel + la conformité par épreuve,
// sous-produit des déclarations enseignantes (alignements) et de la
// traçabilité chapitre (P2.5). Exportable CSV.
// SECT-RBAC-AUDITS (ADR-0009) : l'établissement sondé doit être celui
// des claims pour TOUS — l'ADMIN global (sans etab) voit la carte
// d'orientation mode assistance (plus de sélecteur global).
// ═════════════════════════════════════════════════════════════════════

'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AssistancePrompt } from '@/components/bibliotheque/assistance-prompt'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { StatCard, PulseSkeleton, ProgressBar } from '@/components/ds'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import {
  type ConformiteResult,
  type ConformiteSupport,
} from '@/lib/ouvrages-types'

import { formatDateUTC } from '@/lib/date-utils'

/** Accents conformité (Savane EdTech — jamais d'indigo/bleu). */
/** Accent pour StatCard ('danger') et ProgressBar ('destructive') —
 *  deux unions différentes côté DS, même sémantique de seuils. */
function accentTauxCard(taux: number): 'success' | 'warning' | 'danger' {
  if (taux >= 80) return 'success'
  if (taux >= 50) return 'warning'
  return 'danger'
}

function accentTauxBar(taux: number): 'success' | 'warning' | 'destructive' {
  if (taux >= 80) return 'success'
  if (taux >= 50) return 'warning'
  return 'destructive'
}

export function ConformitePage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'
  const adminAssistance = isAdmin && !!user?.etablissementId

  const [search, setSearch] = useState('')
  const [ouvertSupport, setOuvertSupport] = useState<string | null>(null)

  // SECT-RBAC-AUDITS (ADR-0009) : l'établissement sondé est TOUJOURS
  // celui des claims (RESP, ou ADMIN en mode assistance — son JWT porte
  // l'etab). L'ADMIN global (sans etab) ne sonde plus rien : la requête
  // reste désactivée et la carte d'orientation s'affiche (retour APRÈS
  // les hooks — règle react-hooks).
  const etabEffectif = user?.etablissementId ?? ''

  // ─── Audit (fonction SECURITY DEFINER cloisonnée rôle+etab) ───
  const conformiteQuery = useQuery<ConformiteResult>({
    queryKey: ['conformite-referentiels', etabEffectif],
    enabled: !!etabEffectif,
    queryFn: async () => {
      const res = await fetch(`/api/etablissements/${etabEffectif}/conformite-referentiels`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      return res.json()
    },
  })

  const supports: ConformiteSupport[] = conformiteQuery.data?.supports ?? []

  const filtresSupports = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return supports
    return supports.filter(
      (s) =>
        s.nomFichier.toLowerCase().includes(q) ||
        s.enseignant.toLowerCase().includes(q) ||
        (s.ueCode ?? '').toLowerCase().includes(q),
    )
  }, [supports, search])

  // ─── KPIs globaux ───
  const stats = useMemo(() => {
    if (supports.length === 0) {
      return { tauxGlobal: 0, alignes: 0, total: 0, referentiels: 0, epreuvesConformes: 0, epreuvesTotal: 0 }
    }
    const alignes = supports.filter((s) => s.nbAlignements > 0).length
    const tauxGlobal = Math.round(
      supports.reduce((sum, s) => sum + s.tauxCouverture, 0) / supports.length,
    )
    // Épreuves conformes = au moins une épreuve avec taux >= 50 % par support
    let epreuvesConformes = 0
    let epreuvesTotal = 0
    for (const s of supports) {
      for (const e of s.epreuves) {
        epreuvesTotal++
        if (e.tauxConformite >= 50) epreuvesConformes++
      }
    }
    return {
      tauxGlobal,
      alignes,
      total: supports.length,
      referentiels: supports.reduce((sum, s) => sum + s.nbAlignementsReferentiel, 0),
      epreuvesConformes,
      epreuvesTotal,
    }
  }, [supports])

  const exporterCSV = () => {
    if (filtresSupports.length === 0) return
    const escapeCSV = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = [
      [
        'Enseignant',
        'Support',
        'UE',
        'Chapitres',
        'Questions',
        'Questions rattachées',
        'Alignements',
        'Alignements référentiel officiel',
        'Taux de couverture (%)',
        'Dernier alignement',
      ]
        .map(escapeCSV)
        .join(';'),
      ...filtresSupports.map((s) =>
        [
          s.enseignant,
          s.nomFichier,
          s.ueCode ?? '',
          String(s.nbChapitres),
          String(s.nbQuestions),
          String(s.nbQuestionsAlignees),
          String(s.nbAlignements),
          String(s.nbAlignementsReferentiel),
          String(s.tauxCouverture),
          s.dernierAlignementAt ? formatDateUTC(s.dernierAlignementAt) : '',
        ]
          .map((c) => escapeCSV(c))
          .join(';'),
      ),
    ]
    const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'audit_conformite_referentiels.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Export généré', { description: 'audit_conformite_referentiels.csv' })
  }

  return (
    <div className="space-y-6">
      {/* Bandeau kente — signature Savane EdTech */}
      <div className="ds-kente-pattern border-b border-border bg-card">
        <div className="ds-kente-strip" aria-hidden="true" />
        <div className="px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                Conformité aux référentiels
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Audit d&apos;alignement des supports et épreuves sur les référentiels
                officiels de la bibliothèque — l&apos;écart support↔référentiel comme
                objet de gouvernance.
              </p>
            </div>
            {(!isAdmin || adminAssistance) && (
              <Button variant="outline" className="gap-2" onClick={exporterCSV} disabled={filtresSupports.length === 0}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* SECT-RBAC-AUDITS (ADR-0009) : l'ADMIN global est orienté vers le
          mode assistance — l'audit est l'outil du RESPONSABLE de
          l'établissement ; l'accès ADMIN (consenti, approuvé par le
          RESPONSABLE, 24 h max, tracé) passe par le JWT d'assistance. */}
      {isAdmin && !adminAssistance ? (
        <AssistancePrompt outil="L'audit de conformité aux référentiels" />
      ) : (
        <>
      {/* KPIs */}
      {conformiteQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PulseSkeleton variant="card" />
          <PulseSkeleton variant="card" />
          <PulseSkeleton variant="card" />
          <PulseSkeleton variant="card" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Scale}
            label="Couverture moyenne"
            value={`${stats.tauxGlobal} %`}
            hint="Thèmes des supports couverts par les référentiels officiels alignés"
            accent={accentTauxCard(stats.tauxGlobal)}
            index={0}
          />
          <StatCard
            icon={BookOpen}
            label="Supports alignés"
            value={`${stats.alignes}/${stats.total}`}
            hint="Supports avec au moins une déclaration d'alignement"
            accent="primary"
            index={1}
          />
          <StatCard
            icon={ShieldCheck}
            label="Référentiels mobilisés"
            value={stats.referentiels}
            hint="Déclarations sur des ouvrages REFERENTIEL_OFFICIEL"
            accent="gold"
            index={2}
          />
          <StatCard
            icon={ChevronRight}
            label="Épreuves ≥ 50 % conformes"
            value={`${stats.epreuvesConformes}/${stats.epreuvesTotal}`}
            hint="Questions rattachées à un chapitre couvert par le référentiel (P2.5)"
            accent={accentTauxCard(stats.epreuvesTotal > 0 ? Math.round((stats.epreuvesConformes * 100) / stats.epreuvesTotal) : 0)}
            index={3}
          />
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un support, un enseignant, une UE…"
            className="pl-8"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => void conformiteQuery.refetch()}
          disabled={conformiteQuery.isFetching}
        >
          {conformiteQuery.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Rafraîchir
        </Button>
      </div>

      {/* Table d'audit par support */}
      {conformiteQuery.isLoading ? (
        <PulseSkeleton variant="card" />
      ) : conformiteQuery.isError ? (
        <Card className="border-destructive/50">
          <CardContent className="py-6 text-center text-sm text-destructive">
            Audit indisponible —{' '}
            {conformiteQuery.error instanceof Error
              ? conformiteQuery.error.message
              : 'erreur inconnue'}
          </CardContent>
        </Card>
      ) : filtresSupports.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-1.5">
            <Scale className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">
              {supports.length === 0
                ? 'Aucun support analysé dans cet établissement'
                : 'Aucun support ne correspond à la recherche'}
            </p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {supports.length === 0
                ? "L'audit se construit à mesure que les enseignants analysent leurs supports et déclarent leurs alignements."
                : 'Essayez un autre terme de recherche.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enseignant</TableHead>
                  <TableHead>Support</TableHead>
                  <TableHead>UE</TableHead>
                  <TableHead className="text-right">Questions</TableHead>
                  <TableHead className="text-right">Alignements</TableHead>
                  <TableHead className="w-[180px]">Couverture référentiel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtresSupports.map((s) => (
                  <TableRow
                    key={s.documentId}
                    className="cursor-pointer"
                    onClick={() =>
                      setOuvertSupport(ouvertSupport === s.documentId ? null : s.documentId)
                    }
                  >
                    <TableCell className="font-medium">{s.enseignant}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={s.nomFichier}>
                      {s.nomFichier}
                    </TableCell>
                    <TableCell>
                      {s.ueCode ? (
                        <Badge variant="outline" className="text-[10px]">
                          {s.ueCode}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {s.nbQuestionsAlignees}/{s.nbQuestions} rattachées
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {s.nbAlignements}
                      {s.nbAlignementsReferentiel > 0 && (
                        <span className="text-muted-foreground">
                          {' '}
                          ({s.nbAlignementsReferentiel} réf.)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ProgressBar
                        value={s.tauxCouverture}
                        accent={accentTauxBar(s.tauxCouverture)}
                        showLabel
                        label={`${s.tauxCouverture} %`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Détail par support : épreuves et conformité (Collapsible) */}
      {filtresSupports
        .filter((s) => s.documentId === ouvertSupport)
        .map((s) => (
          <Card key={s.documentId}>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold truncate">
                    {s.nomFichier}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {s.enseignant}
                    {s.ueCode ? ` · UE ${s.ueCode}` : ''} · {s.nbChapitres} chapitre(s)
                    {s.dernierAlignementAt
                      ? ` · dernier alignement ${formatDateUTC(s.dernierAlignementAt)}`
                      : ' · aucun alignement'}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  Couverture {s.tauxCouverture} %
                </Badge>
              </div>

              {s.epreuves.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune épreuve n&apos;évalue encore ce support.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Épreuves qui évaluent ce support — conformité par question
                  </p>
                  {s.epreuves.map((e) => (
                    <Collapsible key={e.epreuveId} defaultOpen>
                      <div className="rounded-lg border p-3">
                        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left">
                          <div className="flex min-w-0 items-center gap-2">
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm font-medium">{e.titre}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {e.nbQuestionsConformes}/{e.nbQuestions} conformes
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                e.tauxConformite >= 80
                                  ? 'border-success/30 text-success-text'
                                  : e.tauxConformite >= 50
                                    ? 'border-warning/30 text-warning'
                                    : 'border-destructive/30 text-destructive'
                              }`}
                            >
                              {e.tauxConformite} %
                            </Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2">
                            <ProgressBar
                              value={e.tauxConformite}
                              accent={accentTauxBar(e.tauxConformite)}
                              showValue
                            />
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              Question conforme = rattachée à un chapitre du support
                              (P2.5) dont un sujet recoupe un thème d&apos;un référentiel
                              officiel aligné.
                            </p>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        </>
      )}
    </div>
  )
}
