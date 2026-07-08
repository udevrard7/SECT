'use client'

/**
 * MesEtudiantsPage — Liste des étudiants de l'enseignant (lecture seule).
 *
 * MES-ETUDIANTS-REFOUND-1 (refonte) :
 *  - Aucune liste ne s'affiche au chargement. L'enseignant DOIT choisir
 *    une filière ET un niveau avant que la liste se charge.
 *  - Scoping STRICT par UE affectée (côté backend via Affectation +
 *    UniteEnseignement + UniteEnseignementFiliere). L'enseignant ne voit
 *    QUE les étudiants dont (filiereId, niveau) matche une de ses UE.
 *  - Filtres optionnels : semestre + année universitaire (pour la fiche
 *    de notes téléchargée).
 *  - 2 boutons globaux de téléchargement : CSV (direct backend) + PDF
 *    tableau (route Next.js jsPDF+autotable). Remplace l'ancien bouton
 *    "Relevé" par ligne.
 *  - Modale de détail par étudiant (EtudiantNotesDialog) affichant
 *    toutes ses évaluations/notes pour les épreuves de l'enseignant.
 *
 * Identité Savane EdTech : hero ds-kente-pattern, cards border-l-4,
 * tokens oklch, framer-motion, font-mono tabular-nums.
 */

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, Search, Download, Loader2, GraduationCap, Mail,
  FileText, AlertCircle, BookOpen, Eye, FileSpreadsheet, Filter,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PulseSkeleton } from '@/components/ds'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { EtudiantNotesDialog } from './etudiant-notes-dialog'

// ─── Types ───

interface Etudiant {
  id: string
  name: string
  email: string
  matricule: string | null
  niveau: string | null
  filiere: { id: string; nom: string; code: string } | null
  nbEpreuves: number
  derniereConnexion: string | null
  ues?: { id: string; code: string; nom: string }[]
}

interface UECtx { id: string; code: string; nom: string; niveau: string; niveaux?: string | null }
interface FiliereCtx {
  id: string
  nom: string
  code: string
  niveaux: string[]
  unitesEnseignement: UECtx[]
}

const NIVEAU_LABELS: Record<string, string> = {
  L1: 'L1', L2: 'L2', L3: 'L3', M1: 'M1', M2: 'M2', DOCTORAT: 'Doctorat',
}

// Années universitaires récentes (de -2 à +1)
function buildAnneesOptions(): string[] {
  const now = new Date()
  const year = now.getFullYear()
  const options: string[] = []
  for (let i = -2; i <= 1; i++) {
    const y = year + i
    options.push(`${y}-${y + 1}`)
  }
  return options
}

export function MesEtudiantsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // ─── Filtres (filière + niveau OBLIGATOIRES, semestre + année optionnels) ───
  const [filiereFilter, setFiliereFilter] = useState('')
  const [niveauFilter, setNiveauFilter] = useState('')
  const [semestreFilter, setSemestreFilter] = useState('')
  const [anneeFilter, setAnneeFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [downloading, setDownloading] = useState<'' | 'csv' | 'pdf'>('')
  const [selectedEtudiant, setSelectedEtudiant] = useState<Etudiant | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // Amélioration filtres : tri des colonnes + statut connexion
  const [sortBy, setSortBy] = useState<'name' | 'matricule' | 'nbEpreuves' | 'derniereConnexion'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Debounce recherche 350ms
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // ─── Query : contexte enseignant (filieres + niveaux pour les selects) ───
  const contextQuery = useQuery<{ filieres: FiliereCtx[] }>({
    queryKey: ['enseignant-context', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/enseignant/context${user?.id ? `?enseignantId=${user.id}` : ''}`)
      if (!res.ok) throw new Error('Failed to fetch context')
      return res.json()
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const filieres = contextQuery.data?.filieres ?? []

  // Niveaux disponibles pour la filière sélectionnée (cascade)
  const niveauxDisponibles = useMemo(() => {
    if (!filiereFilter) return []
    const f = filieres.find((x) => x.id === filiereFilter)
    return f?.niveaux ?? []
  }, [filiereFilter, filieres])

  // ─── Query : étudiants (GATE — ne se déclenche que si filière + niveau choisis) ───
  const etudiantsQuery = useQuery<{ etudiants: Etudiant[] }>({
    queryKey: ['mes-etudiants', user?.id, filiereFilter, niveauFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('filiereId', filiereFilter)
      params.set('niveau', niveauFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/enseignant/etudiants?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Failed to fetch etudiants')
      }
      const data = await res.json()
      return { etudiants: data.etudiants ?? [] }
    },
    enabled: !!user?.id && !!filiereFilter && !!niveauFilter,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  })

  const etudiants = etudiantsQuery.data?.etudiants ?? []
  const loading = etudiantsQuery.isLoading
  const error = etudiantsQuery.error ? (etudiantsQuery.error as Error).message : null
  const refreshEtudiants = () => queryClient.invalidateQueries({ queryKey: ['mes-etudiants', user?.id] })

  // Amélioration filtres : tri côté client (pattern réutilisé de /utilisateurs)
  const sortedEtudiants = useMemo(() => {
    const sorted = [...etudiants].sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'fr-FR')
          break
        case 'matricule':
          cmp = (a.matricule ?? '').localeCompare(b.matricule ?? '', 'fr-FR')
          break
        case 'nbEpreuves':
          cmp = a.nbEpreuves - b.nbEpreuves
          break
        case 'derniereConnexion':
          const ta = a.derniereConnexion ? new Date(a.derniereConnexion).getTime() : 0
          const tb = b.derniereConnexion ? new Date(b.derniereConnexion).getTime() : 0
          cmp = ta - tb
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [etudiants, sortBy, sortDir])

  const handleSort = (key: typeof sortBy) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir('asc')
    }
  }

  // Filtres remplis ?
  const filtersReady = !!filiereFilter && !!niveauFilter

  // ─── Handlers ───

  const handleOpenDetail = (etu: Etudiant) => {
    setSelectedEtudiant(etu)
    setDialogOpen(true)
  }

  const buildDownloadParams = () => {
    const params = new URLSearchParams()
    params.set('filiereId', filiereFilter)
    params.set('niveau', niveauFilter)
    if (semestreFilter) params.set('semestre', semestreFilter)
    if (anneeFilter) params.set('anneeUniversitaire', anneeFilter)
    return params.toString()
  }

  const handleDownloadCSV = async () => {
    setDownloading('csv')
    try {
      const res = await fetch(`/api/enseignant/fiche-notes?format=csv&${buildDownloadParams()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fiche_notes_${filiereFilter}_${niveauFilter}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Fiche de notes CSV téléchargée')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec du téléchargement CSV')
    } finally {
      setDownloading('')
    }
  }

  const handleDownloadPDF = async () => {
    setDownloading('pdf')
    try {
      const res = await fetch(`/api/enseignant/fiche-notes-pdf?${buildDownloadParams()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fiche_notes_${filiereFilter}_${niveauFilter}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Fiche de notes PDF téléchargée')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec du téléchargement PDF')
    } finally {
      setDownloading('')
    }
  }

  // ─── Render ───

  return (
    <div className="space-y-6">
      {/* ─── Hero canonique ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 ds-logo-glow">
            <Users className="h-6 w-6 text-primary-text" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Mes étudiants
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Étudiants de vos UE affectées — sélectionnez une filière et un niveau pour commencer
            </p>
          </div>
        </div>
        {filtersReady && etudiants.length > 0 && (
          <Badge variant="secondary" className="self-start sm:self-auto gap-1.5 bg-primary/10 text-primary-text">
            <GraduationCap className="h-3.5 w-3.5" />
            {etudiants.length} étudiant{etudiants.length > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* ─── Filtres OBLIGATOIRES (filière + niveau) + optionnels (semestre + année) ─── */}
      <Card className={filtersReady ? '' : 'border-l-4 border-l-primary'}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="h-4 w-4 text-primary-text" />
            <span>Sélectionnez une filière et un niveau pour afficher vos étudiants</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {/* Filière (obligatoire) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Filière <span className="text-destructive">*</span>
              </label>
              <select
                value={filiereFilter}
                onChange={(e) => {
                  setFiliereFilter(e.target.value)
                  setNiveauFilter('') // reset niveau cascade
                }}
                disabled={contextQuery.isLoading}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                <option value="">— Choisir —</option>
                {filieres.map((f) => (
                  <option key={f.id} value={f.id}>{f.code} — {f.nom}</option>
                ))}
              </select>
            </div>

            {/* Niveau (obligatoire, cascade sur filière) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Niveau <span className="text-destructive">*</span>
              </label>
              <select
                value={niveauFilter}
                onChange={(e) => setNiveauFilter(e.target.value)}
                disabled={!filiereFilter || niveauxDisponibles.length === 0}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                <option value="">— Choisir —</option>
                {niveauxDisponibles.map((n) => (
                  <option key={n} value={n}>{NIVEAU_LABELS[n] ?? n}</option>
                ))}
              </select>
            </div>

            {/* Semestre (optionnel) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Semestre <span className="text-muted-foreground/60">(optionnel)</span>
              </label>
              <select
                value={semestreFilter}
                onChange={(e) => setSemestreFilter(e.target.value)}
                disabled={!filtersReady}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                <option value="">Tous semestres</option>
                <option value="1">Semestre 1</option>
                <option value="2">Semestre 2</option>
              </select>
            </div>

            {/* Année universitaire (optionnelle) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Année <span className="text-muted-foreground/60">(optionnel)</span>
              </label>
              <select
                value={anneeFilter}
                onChange={(e) => setAnneeFilter(e.target.value)}
                disabled={!filtersReady}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              >
                <option value="">Toutes années</option>
                {buildAnneesOptions().map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Recherche (activée seulement si filtres remplis) */}
          {filtersReady && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, email ou matricule…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 h-9 text-sm max-w-md"
              />
            </div>
          )}

          {/* Boutons de téléchargement globaux (activés si liste non vide) */}
          {filtersReady && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadCSV}
                disabled={etudiants.length === 0 || downloading !== ''}
                className="gap-1.5 ds-press"
              >
                {downloading === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                <span>Fiche CSV</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                disabled={etudiants.length === 0 || downloading !== ''}
                className="gap-1.5 ds-press"
              >
                {downloading === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                <span>Fiche PDF</span>
              </Button>
              {etudiants.length > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  Fiche de notes : {etudiants.length} étudiant(s) × toutes vos épreuves
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Contenu ─── */}
      {!filtersReady ? (
        // État initial : aucun filtre → message invitant à choisir
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-10 w-10 text-primary-text" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
              Sélectionnez une filière et un niveau
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Pour préserver la confidentialité, la liste de vos étudiants ne s&apos;affiche qu&apos;après choix d&apos;une filière et d&apos;un niveau. Vous ne verrez que les étudiants dont le couple (filière, niveau) correspond à une de vos UE affectées.
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="space-y-3">
          <PulseSkeleton className="h-12 w-full" variant="card" />
          <PulseSkeleton className="h-64 w-full" variant="card" />
        </div>
      ) : error ? (
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Erreur de chargement</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={refreshEtudiants}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : etudiants.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-10 w-10 text-primary-text" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
              {search ? 'Aucun résultat' : 'Aucun étudiant'}
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {search
                ? 'Aucun étudiant ne correspond à votre recherche dans cette filière et ce niveau.'
                : "Aucun étudiant ne correspond à vos UE affectées pour cette filière et ce niveau. Vérifiez vos affectations (page Affectations) ou contactez votre responsable des études."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="font-display">
                        <button
                          type="button"
                          onClick={() => handleSort('name')}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Étudiant
                          <span className="text-[10px] text-muted-foreground">
                            {sortBy === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead className="font-display">
                        <button
                          type="button"
                          onClick={() => handleSort('matricule')}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Matricule
                          <span className="text-[10px] text-muted-foreground">
                            {sortBy === 'matricule' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      {/* Colonne UEs masquée pour ergonomie (les UEs restent visibles dans le dialog détail) */}
                      <TableHead className="font-display text-center hidden lg:table-cell">
                        <button
                          type="button"
                          onClick={() => handleSort('nbEpreuves')}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Épreuves
                          <span className="text-[10px] text-muted-foreground">
                            {sortBy === 'nbEpreuves' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead className="font-display hidden xl:table-cell">
                        <button
                          type="button"
                          onClick={() => handleSort('derniereConnexion')}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Dernière connexion
                          <span className="text-[10px] text-muted-foreground">
                            {sortBy === 'derniereConnexion' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      </TableHead>
                      <TableHead className="font-display text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEtudiants.map((etu, i) => (
                      <motion.tr
                        key={etu.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => handleOpenDetail(etu)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <span className="font-mono text-xs font-bold text-primary-text">
                                {etu.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{etu.name}</p>
                              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                <Mail className="h-3 w-3" />{etu.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{etu.matricule ?? '—'}</TableCell>
                        <TableCell className="hidden lg:table-cell text-center font-mono tabular-nums text-sm">
                          {etu.nbEpreuves}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                          {etu.derniereConnexion
                            ? new Date(etu.derniereConnexion).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDetail(etu)}
                            className="gap-1.5 ds-press"
                            aria-label={`Voir les notes de ${etu.name}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Voir notes</span>
                          </Button>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Note pédagogique */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-4">
            <FileText className="h-3.5 w-3.5 text-primary-text" />
            <span>
              Cliquez sur une ligne pour voir le détail des évaluations et notes de l&apos;étudiant.
              Vous ne voyez que les étudiants de vos UE affectées — accès en lecture seule.
            </span>
          </div>
        </motion.div>
      )}

      {/* ─── Modale détail notes ─── */}
      <EtudiantNotesDialog
        etudiant={selectedEtudiant}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
