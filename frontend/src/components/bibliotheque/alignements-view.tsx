// ─────────────────────────────────────────────────────────────────────
// AlignementsView — SECT-BIBLIO-P3 (ADR-0007 §P3) : la déclaration des
// 5 minutes. Flux : (1) l'IA PROPOSE les ouvrages dont les thèmes
// recoupent ceux du support (retrieval déterministe), (2) l'enseignant
// VALIDE/AJUSTE (autorité de la transposition didactique — l'IA propose,
// l'enseignant décide), (3) la bibliographie auto est générée (exportable).
// ═════════════════════════════════════════════════════════════════════

'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookMarked,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EntityCard, PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'
import {
  type AlignementOuvrage,
  type AlignementsResult,
  type BibliographieResult,
  type OuvrageSection,
  type OuvrageSectionsResult,
  type OuvrageSuggestion,
  type SuggestionsResult,
  categorieLabel,
  formatReferenceBibliographique,
  parseAuteurs,
} from '@/lib/ouvrages-types'
import { formatDateUTC } from '@/lib/date-utils'

// Document (support) tel que servi par /api/documents (miroir local léger).
interface SupportOption {
  id: string
  nomFichier: string
  statutAnalyse: string
  themesDetectes: string | null
}

/** Parse un TEXT-JSON (["a","b"]) — tolérant. */
function parseThemes(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

export function AlignementsView() {
  const queryClient = useQueryClient()

  // ─── Support sélectionné ───
  const [supportId, setSupportId] = useState('')
  const [ajusteSuggestion, setAjusteSuggestion] = useState<OuvrageSuggestion | null>(null)
  const [ajusteNote, setAjusteNote] = useState('')
  const [ajusteSectionId, setAjusteSectionId] = useState<string>('sans-section')
  const [rejetees, setRejetees] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ─── Mes supports analysés (le support doit être analysé pour avoir des thèmes) ───
  const supportsQuery = useQuery<SupportOption[]>({
    queryKey: ['alignements-supports'],
    queryFn: async () => {
      const res = await fetch('/api/documents', { credentials: 'include' })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      const docs: SupportOption[] = Array.isArray(data?.documents) ? data.documents : []
      return docs.filter((d) => d.statutAnalyse === 'ANALYSE')
    },
    staleTime: 60_000,
  })

  const supports = supportsQuery.data ?? []
  const support = supports.find((d) => d.id === supportId) ?? null
  const themesSupport = useMemo(() => parseThemes(support?.themesDetectes), [support])

  // ─── Suggestions IA (retrieval) ───
  const suggestionsQuery = useQuery<SuggestionsResult>({
    queryKey: ['alignements-suggestions', supportId],
    enabled: !!supportId,
    queryFn: async () => {
      const res = await fetch(`/api/documents/${supportId}/alignements/suggestions`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      return res.json()
    },
    staleTime: 60_000,
  })

  // ─── Déclarations existantes ───
  const alignementsQuery = useQuery<AlignementsResult>({
    queryKey: ['alignements', supportId],
    enabled: !!supportId,
    queryFn: async () => {
      const res = await fetch(`/api/documents/${supportId}/alignements`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      return res.json()
    },
  })

  // ─── Sections de l'ouvrage en cours d'ajustement ───
  const sectionsQuery = useQuery<OuvrageSection[]>({
    queryKey: ['ouvrage-sections', ajusteSuggestion?.ouvrage.id],
    enabled: !!ajusteSuggestion,
    queryFn: async () => {
      const res = await fetch(`/api/ouvrages/${ajusteSuggestion!.ouvrage.id}/sections`, {
        credentials: 'include',
      })
      if (!res.ok) return []
      const data: OuvrageSectionsResult = await res.json()
      return data.sections ?? []
    },
    staleTime: 5 * 60_000,
  })

  // ─── Bibliographie (aperçu + export CSV) ───
  const bibliographieQuery = useQuery<BibliographieResult>({
    queryKey: ['bibliographie', supportId],
    enabled: !!supportId,
    queryFn: async () => {
      const res = await fetch(`/api/documents/${supportId}/bibliographie`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      return res.json()
    },
  })

  const suggestions = (suggestionsQuery.data?.suggestions ?? []).filter(
    (s) => !rejetees.has(s.ouvrage.id) && !s.dejaAligne,
  )
  const alignements = alignementsQuery.data?.alignements ?? []

  // ─── Actions ───
  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['alignements', supportId] })
    void queryClient.invalidateQueries({ queryKey: ['alignements-suggestions', supportId] })
    void queryClient.invalidateQueries({ queryKey: ['bibliographie', supportId] })
  }

  const declarerAlignement = async (
    ouvrageId: string,
    sectionId: string | null,
    note: string | null,
  ) => {
    setSavingId(ouvrageId)
    try {
      const res = await fetch(`/api/documents/${supportId}/alignements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ouvrageId,
          ouvrageSectionId: sectionId,
          note: note && note.trim() !== '' ? note.trim() : null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Erreur ${res.status}`)
      toast.success('Alignement déclaré', {
        description: 'La bibliographie du support est à jour.',
      })
      invalidateAll()
    } catch (e) {
      toast.error('Déclaration impossible', {
        description: e instanceof Error ? e.message : 'Erreur inconnue',
      })
    } finally {
      setSavingId(null)
    }
  }

  const supprimerAlignement = async (a: AlignementOuvrage) => {
    setDeletingId(a.id)
    try {
      const res = await fetch(`/api/documents/${supportId}/alignements/${a.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      toast.success('Alignement retiré')
      invalidateAll()
    } catch (e) {
      toast.error('Suppression impossible', {
        description: e instanceof Error ? e.message : 'Erreur inconnue',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const rejeterSuggestion = (ouvrageId: string) => {
    setRejetees((prev) => new Set(prev).add(ouvrageId))
    toast.info('Proposition écartée', {
      description: 'Vous pouvez la retrouver dans le catalogue de la bibliothèque.',
    })
  }

  const exporterBibliographieCSV = () => {
    const refs = bibliographieQuery.data?.references ?? []
    if (refs.length === 0) return
    const escapeCSV = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = [
      ['Référence', 'Catégorie', 'Section', 'Note', 'Déclarée le'].map(escapeCSV).join(';'),
      ...refs.map((r) =>
        [
          formatReferenceBibliographique(r.ouvrage, r.section),
          categorieLabel(r.ouvrage.categorie),
          r.section?.titre ?? '',
          r.note ?? '',
          formatDateUTC(r.creeLe),
        ]
          .map((c) => escapeCSV(String(c)))
          .join(';'),
      ),
    ]
    const blob = new Blob(['\ufeff' + rows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bibliographie_${support?.nomFichier?.replace(/\.[^.]+$/, '') ?? 'support'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Rendu ───
  return (
    <div className="space-y-6">
      {/* Sélecteur de support */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1 max-w-xl">
              <Label className="text-xs text-muted-foreground">
                Support de cours (analysé par l&apos;IA)
              </Label>
              <Select
                value={supportId || undefined}
                onValueChange={(v) => {
                  setSupportId(v)
                  setRejetees(new Set())
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir un support…" />
                </SelectTrigger>
                <SelectContent>
                  {supports.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nomFichier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Seuls vos supports analysés apparaissent (le recoupement de thèmes
                exige <code className="text-[11px]">themesDetectes</code>).
              </p>
            </div>
            {support && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={exporterBibliographieCSV}
                disabled={(bibliographieQuery.data?.references ?? []).length === 0}
              >
                <Download className="h-4 w-4" />
                Bibliographie CSV
              </Button>
            )}
          </div>

          {support && themesSupport.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Thèmes détectés du support
              </p>
              <div className="flex flex-wrap gap-1.5">
                {themesSupport.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-primary-text"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!supportId ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <BookMarked className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">Choisissez un support pour commencer</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              La déclaration d&apos;alignement prend moins de 5 minutes : l&apos;IA
              propose les ouvrages de votre établissement dont les thèmes recoupent
              votre support, vous validez en un clic.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Propositions IA */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-secondary-text" />
                Propositions de la bibliothèque
                {suggestionsQuery.isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-muted-foreground font-normal">
                    — {suggestions.length} ouvrage(s) par recoupement de thèmes
                  </span>
                )}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => void queryClient.invalidateQueries({ queryKey: ['alignements-suggestions', supportId] })}
              >
                Relancer
              </Button>
            </div>

            {suggestionsQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <PulseSkeleton variant="card" />
                <PulseSkeleton variant="card" />
                <PulseSkeleton variant="card" />
              </div>
            ) : suggestionsQuery.isError ? (
              <Card className="border-destructive/50">
                <CardContent className="py-6 text-center text-sm text-destructive">
                  Impossible de calculer les propositions —{' '}
                  {suggestionsQuery.error instanceof Error
                    ? suggestionsQuery.error.message
                    : 'erreur inconnue'}
                </CardContent>
              </Card>
            ) : suggestions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center space-y-1.5">
                  <XCircle className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">Aucun recoupement de thèmes pour l&apos;instant</p>
                  <p className="text-xs text-muted-foreground">
                    Déposez un référentiel officiel dans la bibliothèque (ADMIN) avec
                    des thèmes proches de votre support, ou déclarez un ouvrage
                    manuellement depuis le catalogue.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {suggestions.map((s) => (
                  <EntityCard
                    key={s.ouvrage.id}
                    title={s.ouvrage.titre}
                    subtitle={categorieLabel(s.ouvrage.categorie)}
                    thumbnailIcon={BookOpen}
                    badge={{ label: `Score ${s.score}`, variant: 'secondary' }}
                    meta={
                      [
                        parseAuteurs(s.ouvrage.auteurs).slice(0, 2).join(', ') || null,
                        s.ouvrage.editeur,
                        s.ouvrage.anneePublication ? String(s.ouvrage.anneePublication) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                  >
                    <div className="space-y-2.5">
                      {s.themesCommuns.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {s.themesCommuns.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1 rounded-md border border-success/25 bg-success/10 px-1.5 py-0.5 text-[10px] text-success-text"
                            >
                              <Target className="h-2.5 w-2.5" />
                              {t.length > 34 ? `${t.slice(0, 34)}…` : t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 flex-1"
                          disabled={savingId === s.ouvrage.id}
                          onClick={() => void declarerAlignement(s.ouvrage.id, null, null)}
                        >
                          {savingId === s.ouvrage.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ThumbsUp className="h-3.5 w-3.5" />
                          )}
                          Valider
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5"
                          onClick={() => {
                            setAjusteSuggestion(s)
                            setAjusteNote('')
                            setAjusteSectionId('sans-section')
                          }}
                        >
                          Ajuster
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          aria-label="Écarter la proposition"
                          onClick={() => rejeterSuggestion(s.ouvrage.id)}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </EntityCard>
                ))}
              </div>
            )}
          </div>

          {/* Déclarations existantes + bibliographie */}
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <BookMarked className="h-4 w-4 text-primary-text" />
              Vos déclarations
              <span className="text-muted-foreground font-normal">
                — {alignements.length} alignement(s)
              </span>
            </h2>

            {alignementsQuery.isLoading ? (
              <PulseSkeleton variant="card" />
            ) : alignements.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Aucune déclaration pour ce support — validez une proposition
                  ci-dessus pour générer la bibliographie.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {alignements.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium truncate">
                        {a.ouvrage?.titre ?? 'Ouvrage masqué'}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {a.ouvrage
                          ? formatReferenceBibliographique(a.ouvrage, a.section)
                          : 'Ouvrage retiré de la bibliothèque ou droits expirés'}
                      </p>
                      {a.note && (
                        <p className="text-xs italic text-muted-foreground">« {a.note} »</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {categorieLabel(a.ouvrage?.categorie ?? 'OUVRAGE_REFERENCE')}
                        {a.section ? ` · Section : ${a.section.titre}` : ' · Ouvrage entier'}
                        {` · ${formatDateUTC(a.createdAt)}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-destructive hover:text-destructive"
                      aria-label="Retirer l'alignement"
                      disabled={deletingId === a.id}
                      onClick={() => void supprimerAlignement(a)}
                    >
                      {deletingId === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Dialog d'ajustement (section du TOC + note) */}
      <Dialog
        open={!!ajusteSuggestion}
        onOpenChange={(open) => {
          if (!open) setAjusteSuggestion(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary-text" />
              Ajuster la déclaration
            </DialogTitle>
            <DialogDescription>
              {ajusteSuggestion?.ouvrage.titre} — cibler une section précise
              (TOC curaté par l&apos;administration) et annoter votre déclaration.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Section de l&apos;ouvrage</Label>
              {sectionsQuery.isLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Chargement du TOC…
                </div>
              ) : (sectionsQuery.data ?? []).length === 0 ? (
                <p className="py-1 text-xs text-muted-foreground">
                  Aucune section curatée pour cet ouvrage — la déclaration portera
                  sur l&apos;ouvrage entier.
                </p>
              ) : (
                <Select value={ajusteSectionId} onValueChange={setAjusteSectionId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sans-section">Ouvrage entier</SelectItem>
                    {(sectionsQuery.data ?? []).map((sec) => (
                      <SelectItem key={sec.id} value={sec.id}>
                        {sec.titre}
                        {sec.pageDebut != null ? ` (p. ${sec.pageDebut})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground" htmlFor="note-alignement">
                Note (optionnelle)
              </Label>
              <Textarea
                id="note-alignement"
                value={ajusteNote}
                onChange={(e) => setAjusteNote(e.target.value)}
                placeholder="Ex. : couvre les chapitres 3 à 5 du programme — utilisé pour la préparation de l'épreuve."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAjusteSuggestion(null)}>
              Annuler
            </Button>
            <Button
              className="gap-2"
              disabled={savingId === ajusteSuggestion?.ouvrage.id}
              onClick={() => {
                if (!ajusteSuggestion) return
                void declarerAlignement(
                  ajusteSuggestion.ouvrage.id,
                  ajusteSectionId === 'sans-section' ? null : ajusteSectionId,
                  ajusteNote,
                ).then(() => setAjusteSuggestion(null))
              }}
            >
              {savingId === ajusteSuggestion?.ouvrage.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Enregistrer la déclaration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
