'use client'

/**
 * ExamPrepPage — Page maîtresse du module Préparation aux examens (étudiant).
 *
 * EXAM-PREP-CARD-REFACTOR : cartes documents statiques avec 2 actions claires.
 *  - Corps de carte non cliquable (plus de clic accidentel)
 *  - Bouton « Lire » (outline) → ouvre le DocumentReader (lecteur + highlight)
 *  - Bouton « Révision » (primary lime) → ouvre la vue détail avec 8 onglets
 *  - Suppression des badges thèmes (illisibles en text-[10px])
 *  - Suppression des boutons PDF/TXT (endpoint backend non implémenté)
 *
 * Architecture à 2 vues :
 *  1. Liste des documents de cours accessibles (EntityCard statiques)
 *  2. Vue détail d'un document avec 8 onglets (cf. exam-prep-document-detail)
 *
 * Le DocumentReader reste monté au niveau de cette page (pour le highlight
 * → flashcard / explain passage).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, FileText, BookOpen, ArrowLeft, RefreshCw,
  AlertCircle, Eye, Trophy, LayoutGrid, List, Search, X,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { EntityCard, PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'

import { ExamPrepDocumentDetail } from './exam-prep-document-detail'
import { DocumentReader } from './document-reader'

// ─── Types ───

interface ExamPrepChapter {
  id: string
  titre: string
  ordre: number
  sujets: string[]
}

export interface ExamPrepDocument {
  id: string
  nomFichier: string
  typeMime: string | null
  tailleFichier: number | null
  statutAnalyse: string
  themesDetectes: string[]
  resumeAnalyse: string | null
  dateUpload: string
  uniteEnseignement: { id: string; code: string; nom: string; creditsECTS: number | null }
  owner: { id: string; name: string }
  chapters: ExamPrepChapter[]
}

// ─── Composant principal ───

export function ExamPrepPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get('documentId')
  )
  const [readerDocumentId, setReaderDocumentId] = useState<string | null>(null)
  // HIGHLIGHT-FLASHCARD-1 : prefill Q&A depuis le DocumentReader
  const [qaPrefill, setQaPrefill] = useState<string | undefined>(undefined)

  // EXAM-PREP-LIST-TOOLBAR : vue Liste/Groupé + recherche + filtres (miroir /epreuves)
  // Par défaut : mode groupé (accordéons fermés, comme /epreuves Modèle)
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('grouped')
  const [groupBy, setGroupBy] = useState<'ue' | 'enseignant' | 'theme'>('ue')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterUEId, setFilterUEId] = useState<string>('')
  // Accordéons : groupes fermés par défaut (Set vide = tout fermé)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Debounce recherche (300ms) — évite un refiltre à chaque frappe
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const handleExplainPassage = useCallback((text: string, documentId: string) => {
    setReaderDocumentId(null)
    setSelectedId(documentId)
    setQaPrefill(text)
  }, [])

  // ─── Fetch documents (TanStack Query) ───
  const documentsQuery = useQuery<{ documents: ExamPrepDocument[] }>({
    queryKey: ['exam-prep-documents'],
    queryFn: async () => {
      const res = await fetch('/api/exam-prep/documents')
      if (!res.ok) throw new Error('Failed to fetch documents')
      const data = await res.json()
      return { documents: data.documents ?? [] }
    },
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  })

  const allDocuments = documentsQuery.data?.documents ?? []
  const loading = documentsQuery.isLoading
  const error = documentsQuery.error ? 'Impossible de charger vos supports de cours.' : null

  // ─── Filtres côté client (recherche + UE) ───
  // La recherche matche sur nomFichier, titre UE, nom enseignant, thèmes, résumé.
  const documents = useMemo(() => {
    let result = allDocuments
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim()
      result = result.filter((d) =>
        d.nomFichier.toLowerCase().includes(q) ||
        d.uniteEnseignement.code.toLowerCase().includes(q) ||
        d.uniteEnseignement.nom.toLowerCase().includes(q) ||
        d.owner.name.toLowerCase().includes(q) ||
        (d.resumeAnalyse ?? '').toLowerCase().includes(q) ||
        d.themesDetectes.some((t) => t.toLowerCase().includes(q)) ||
        d.chapters.some((c) => c.titre.toLowerCase().includes(q))
      )
    }
    if (filterUEId) {
      result = result.filter((d) => d.uniteEnseignement.id === filterUEId)
    }
    return result
  }, [allDocuments, debouncedSearch, filterUEId])

  // Liste dédoublonnée des UEs (pour le select filtre)
  const ueOptions = useMemo(() => {
    const map = new Map<string, { id: string; code: string; nom: string }>()
    allDocuments.forEach((d) => {
      if (!map.has(d.uniteEnseignement.id)) {
        map.set(d.uniteEnseignement.id, d.uniteEnseignement)
      }
    })
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code))
  }, [allDocuments])

  // ─── Groupement (mode groupé) ───
  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; subtitle?: string; docs: ExamPrepDocument[] }>()
    for (const doc of documents) {
      let key: string
      let label: string
      let subtitle: string | undefined
      if (groupBy === 'ue') {
        key = doc.uniteEnseignement.id
        label = `${doc.uniteEnseignement.code} — ${doc.uniteEnseignement.nom}`
        subtitle = `${doc.chapters.length} chapitre${doc.chapters.length > 1 ? 's' : ''}`
      } else if (groupBy === 'enseignant') {
        key = doc.owner.id
        label = doc.owner.name
        subtitle = 'Enseignant'
      } else {
        // theme : regroupe par premier thème détecté (ou « Autres »)
        const theme = doc.themesDetectes[0] ?? 'Autres'
        key = theme
        label = theme
        subtitle = 'Thème'
      }
      if (!groups.has(key)) {
        groups.set(key, { key, label, subtitle, docs: [] })
      }
      groups.get(key)!.docs.push(doc)
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [documents, groupBy])
  const refreshDocuments = () => {
    toast.promise(queryClient.invalidateQueries({ queryKey: ['exam-prep-documents'] }), {
      loading: 'Actualisation…',
      success: 'Liste actualisée',
      error: 'Échec de l\'actualisation',
    })
  }

  // Synchronise ?documentId dans l'URL (pour partage/refresh).
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (selectedId) {
      params.set('documentId', selectedId)
    } else {
      params.delete('documentId')
    }
    const qs = params.toString()
    router.replace(qs ? `/exam-prep?${qs}` : '/exam-prep', { scroll: false })
  }, [selectedId, router, searchParams])

  // ─── Vue détail ───
  const selectedDocument = documents.find((d) => d.id === selectedId) ?? null

  if (selectedId && selectedDocument) {
    return (
      <ExamPrepDocumentDetail
        document={selectedDocument}
        onBack={() => setSelectedId(null)}
        qaPrefill={qaPrefill}
        onConsumeQaPrefill={() => setQaPrefill(undefined)}
      />
    )
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <PulseSkeleton className="h-24 w-full" variant="card" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <PulseSkeleton key={i} variant="card" className="h-56" />
          ))}
        </div>
      </div>
    )
  }

  // ─── Error ───
  if (error) {
    return (
      <div className="space-y-6">
        <HeroHeader count={0} onRefresh={refreshDocuments} />
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Erreur de chargement</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={refreshDocuments}>
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Vue liste ───
  return (
    <div className="space-y-6">
      <HeroHeader count={documents.length} onRefresh={refreshDocuments} />

      {/* Empty state (aucun document du tout) */}
      {allDocuments.length === 0 ? (
        <Card className="border-dashed ds-kente-watermark">
          <CardContent className="relative flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ds-logo-glow">
              <Trophy className="h-10 w-10 text-primary-text" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
              Aucun support de cours disponible
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Vos enseignants n'ont pas encore partagé de documents de cours pour votre filière et votre niveau.
              Dès qu'un support est analysé, vous pourrez le transformer en moteur de révision actif : Q&A IA,
              questions d'entraînement, planning de révision et aide du professeur.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Barre d'outils : recherche + toggle Liste/Groupé + filtres ─── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Recherche */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Rechercher un cours, un thème, un chapitre…"
                className="pl-9 pr-9 h-9 text-sm"
                aria-label="Rechercher"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Filtre UE */}
              <Select value={filterUEId} onValueChange={(v) => setFilterUEId(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-9 w-[180px] text-xs">
                  <SelectValue placeholder="Toutes les UE" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les UE</SelectItem>
                  {ueOptions.map((ue) => (
                    <SelectItem key={ue.id} value={ue.id}>
                      {ue.code} — {ue.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* View mode toggle — Liste / Groupé */}
              <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
                <button
                  type="button"
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'flat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setViewMode('flat')}
                >
                  <List className="h-3.5 w-3.5" /> Liste
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'grouped' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setViewMode('grouped')}
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Groupé
                </button>
              </div>

              {/* Group by selector (visible en mode grouped uniquement) */}
              {viewMode === 'grouped' && (
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'ue' | 'enseignant' | 'theme')}>
                  <SelectTrigger className="h-9 w-[150px] text-xs">
                    <SelectValue placeholder="Grouper par" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ue">Par UE</SelectItem>
                    <SelectItem value="enseignant">Par enseignant</SelectItem>
                    <SelectItem value="theme">Par thème</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Empty state (recherche/filtre sans résultat) */}
          {documents.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
                  Aucun résultat
                </h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Aucun document ne correspond à votre recherche ou vos filtres.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                  onClick={() => {
                    setSearchInput('')
                    setFilterUEId('')
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Réinitialiser les filtres
                </Button>
              </CardContent>
            </Card>
          ) : viewMode === 'grouped' ? (
            /* ─── Mode groupé : accordéons fermés par défaut (miroir /epreuves) ─── */
            <div className="space-y-3">
              {/* Controls : count + Tout développer / Tout réduire */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1 text-xs bg-primary/10 text-primary-text border-primary/20">
                  <LayoutGrid className="h-3 w-3" />
                  {groupedDocuments.length} groupe{groupedDocuments.length > 1 ? 's' : ''}
                </Badge>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setExpandedGroups(new Set(groupedDocuments.map((g) => g.key)))}
                >
                  Tout développer
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setExpandedGroups(new Set())}
                >
                  Tout réduire
                </button>
              </div>

              {/* Groupes accordéon */}
              <div className="space-y-2">
                {groupedDocuments.map((group) => {
                  const isExpanded = expandedGroups.has(group.key)
                  const GroupIcon = groupBy === 'ue' ? BookOpen : groupBy === 'enseignant' ? GraduationCap : FileText
                  return (
                    <Collapsible
                      key={group.key}
                      open={isExpanded}
                      onOpenChange={() => {
                        setExpandedGroups((prev) => {
                          const next = new Set(prev)
                          if (next.has(group.key)) next.delete(group.key)
                          else next.add(group.key)
                          return next
                        })
                      }}
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50 ds-press"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                            <GroupIcon className="h-4 w-4 text-primary-text" />
                          </div>
                          <span className="truncate flex-1 text-left">{group.label}</span>
                          {group.subtitle && (
                            <span className="hidden sm:inline text-xs text-muted-foreground shrink-0">{group.subtitle}</span>
                          )}
                          <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] px-1.5 py-0 bg-muted">
                            {group.docs.length}
                          </Badge>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pl-2">
                          {group.docs.map((doc) => (
                            <DocumentEntityCard
                              key={doc.id}
                              doc={doc}
                              onRevision={() => setSelectedId(doc.id)}
                              onRead={() => setReaderDocumentId(doc.id)}
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )
                })}
              </div>
            </div>
          ) : (
            /* ─── Mode liste : grid de cartes (par défaut) ─── */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              <AnimatePresence mode="popLayout">
                {documents.map((doc, i) => (
                  <motion.div
                    key={doc.id}
                    layout
                    initial={{ opacity: 0, y: 12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}
                  >
                    <DocumentEntityCard
                      doc={doc}
                      onRevision={() => setSelectedId(doc.id)}
                      onRead={() => setReaderDocumentId(doc.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </>
      )}

      {/* Visionneuse de document (lecture directe) — montée au niveau page */}
      <DocumentReader
        documentId={readerDocumentId}
        onClose={() => setReaderDocumentId(null)}
        onExplainPassage={handleExplainPassage}
      />
    </div>
  )
}

// ─── Hero header avec motif kente ───

function HeroHeader({ count, onRefresh }: { count: number; onRefresh: () => void }) {
  return (
    <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 ds-logo-glow">
          <GraduationCap className="h-6 w-6 text-primary-text" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Préparation aux examens
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Transformez vos supports de cours en moteur de préparation actif
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 self-start sm:self-auto">
        {count > 0 && (
          <Badge variant="secondary" className="gap-1.5 bg-primary/10 text-primary-text">
            <BookOpen className="h-3.5 w-3.5" />
            {count} support{count > 1 ? 's' : ''}
          </Badge>
        )}
        <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Actualiser</span>
        </Button>
      </div>
    </div>
  )
}

// ─── Carte de document (statique, 2 actions : Lire + Révision) ───
// EXAM-PREP-CARD-REFACTOR : carte statique (pas de clic global).
// - Suppression des badges thèmes illisibles (text-[10px] trop petit)
// - Suppression des boutons PDF/TXT (endpoint backend non implémenté)
// - 2 actions claires : « Lire » (lecteur plein écran) et « Révision » (onglets)
// - Seuls les boutons sont cliquables, le corps est statique

function DocumentEntityCard({
  doc, onRevision, onRead,
}: {
  doc: ExamPrepDocument
  onRevision: () => void
  onRead: () => void
}) {
  return (
    <div className="relative h-full">
      <EntityCard
        title={doc.nomFichier}
        subtitle={`${doc.uniteEnseignement.code} — ${doc.uniteEnseignement.nom}`}
        thumbnailIcon={FileText}
        badge={
          doc.chapters.length > 0
            ? { label: `${doc.chapters.length} ch.`, variant: 'primary' as const }
            : undefined
        }
        meta={`${doc.owner.name} · ${new Date(doc.dateUpload).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
        index={0}
      >
        {/* Résumé du document (corps statique, non cliquable) */}
        {doc.resumeAnalyse && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{doc.resumeAnalyse}</p>
        )}

        {/* Actions : Lire (secondaire) + Révision (principal) */}
        <div className="mt-3 flex gap-1.5">
          <button
            onClick={onRead}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-border/60 bg-background text-xs font-medium hover:border-primary/40 hover:bg-accent/40 transition-all ds-press"
            aria-label={`Lire ${doc.nomFichier}`}
          >
            <Eye className="h-3.5 w-3.5" />
            Lire
          </button>
          <button
            onClick={onRevision}
            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all ds-press shadow-sm"
            aria-label={`Ouvrir la révision de ${doc.nomFichier}`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Révision
          </button>
        </div>
      </EntityCard>
    </div>
  )
}
