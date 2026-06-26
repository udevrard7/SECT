'use client'

/**
 * MesEtudiantsPage — Liste des étudiants de l'enseignant (lecture seule).
 *
 * L'enseignant voit les étudiants correspondant à ses affectations
 * (EnseignantFiliere + Affectation sur UE). Il ne peut ni créer, ni
 * éditer, ni supprimer — uniquement consulter et télécharger le relevé
 * de notes détaillé (PDF par semestre).
 *
 * Fonctionnalités :
 *  - Recherche (nom, email, matricule)
 *  - Filtre par filière + niveau
 *  - Tableau : nom, matricule, filière, niveau, nb épreuves, dernière connexion
 *  - Bouton « Relevé de notes » → téléchargement PDF (par semestre)
 *
 * Identité Savane EdTech : hero ds-kente-pattern, cards border-l-4,
 * tokens oklch, framer-motion, font-mono tabular-nums.
 */

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Users, Search, Download, Loader2, GraduationCap, Mail, Clock,
  FileText, AlertCircle, Filter, BookOpen,
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

interface Etudiant {
  id: string
  name: string
  email: string
  matricule: string | null
  niveau: string | null
  filiere: { id: string; nom: string; code: string } | null
  nbEpreuves: number
  derniereConnexion: string | null
}

const NIVEAU_LABELS: Record<string, string> = {
  L1: 'L1', L2: 'L2', L3: 'L3', M1: 'M1', M2: 'M2', DOCTORAT: 'Doctorat',
}

export function MesEtudiantsPage() {
  const { user } = useAuthStore()
  const [etudiants, setEtudiants] = useState<Etudiant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filiereFilter, setFiliereFilter] = useState('')
  const [niveauFilter, setNiveauFilter] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // Listes dérivées pour les filtres (filières et niveaux uniques)
  const filieres = Array.from(
    new Map(
      etudiants
        .map((e) => e.filiere)
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .map((f) => [f.id, f])
    ).values()
  )
  const niveaux = Array.from(new Set(etudiants.map((e) => e.niveau).filter((n): n is string => n !== null)))

  const fetchEtudiants = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filiereFilter) params.set('filiereId', filiereFilter)
      if (niveauFilter) params.set('niveau', niveauFilter)
      const res = await fetch(`/api/enseignant/etudiants?${params.toString()}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setEtudiants(data.etudiants ?? [])
    } catch {
      setError('Impossible de charger vos étudiants.')
    } finally {
      setLoading(false)
    }
  }, [search, filiereFilter, niveauFilter])

  useEffect(() => {
    fetchEtudiants()
  }, [fetchEtudiants])

  const handleDownloadReleve = async (etudiantId: string) => {
    setDownloadingId(etudiantId)
    try {
      const res = await fetch(`/api/etudiants/${etudiantId}/releve-notes`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `releve_notes.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Relevé de notes téléchargé')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec du téléchargement')
    } finally {
      setDownloadingId(null)
    }
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <PulseSkeleton className="h-24 w-full" variant="card" />
        <PulseSkeleton className="h-12 w-full" variant="card" />
        <PulseSkeleton className="h-64 w-full" variant="card" />
      </div>
    )
  }

  // ─── Error ───
  if (error) {
    return (
      <Card className="border-l-4 border-l-destructive">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Erreur de chargement</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchEtudiants}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

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
              Étudiants de vos UE et filières affectées — consultation et relevés de notes
            </p>
          </div>
        </div>
        {etudiants.length > 0 && (
          <Badge variant="secondary" className="self-start sm:self-auto gap-1.5 bg-primary/10 text-primary-text">
            <GraduationCap className="h-3.5 w-3.5" />
            {etudiants.length} étudiant{etudiants.length > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* ─── Filtres ─── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, email ou matricule…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {filieres.length > 1 && (
          <select
            value={filiereFilter}
            onChange={(e) => setFiliereFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Toutes filières</option>
            {filieres.map((f) => (
              <option key={f.id} value={f.id}>{f.code} — {f.nom}</option>
            ))}
          </select>
        )}
        {niveaux.length > 1 && (
          <select
            value={niveauFilter}
            onChange={(e) => setNiveauFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Tous niveaux</option>
            {niveaux.map((n) => (
              <option key={n} value={n}>{NIVEAU_LABELS[n] ?? n}</option>
            ))}
          </select>
        )}
      </div>

      {/* ─── Tableau ─── */}
      {etudiants.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-10 w-10 text-primary-text" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
              {search || filiereFilter || niveauFilter ? 'Aucun résultat' : 'Aucun étudiant'}
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {search || filiereFilter || niveauFilter
                ? 'Aucun étudiant ne correspond à vos filtres.'
                : "Vous n'avez pas encore d'étudiants affectés. Contactez votre responsable des études pour une affectation sur des UE ou filières."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
        >
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="font-display">Étudiant</TableHead>
                      <TableHead className="font-display">Matricule</TableHead>
                      <TableHead className="font-display hidden md:table-cell">Filière</TableHead>
                      <TableHead className="font-display hidden sm:table-cell">Niveau</TableHead>
                      <TableHead className="font-display text-center hidden lg:table-cell">Épreuves</TableHead>
                      <TableHead className="font-display hidden xl:table-cell">Dernière connexion</TableHead>
                      <TableHead className="font-display text-right">Relevé</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {etudiants.map((etu, i) => (
                      <motion.tr
                        key={etu.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-muted/20 transition-colors"
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
                        <TableCell className="hidden md:table-cell text-sm">
                          {etu.filiere ? (
                            <span className="truncate">{etu.filiere.code} — {etu.filiere.nom}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className="text-xs">
                            {etu.niveau ? (NIVEAU_LABELS[etu.niveau] ?? etu.niveau) : '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-center font-mono tabular-nums text-sm">
                          {etu.nbEpreuves}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                          {etu.derniereConnexion
                            ? new Date(etu.derniereConnexion).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadReleve(etu.id)}
                            disabled={downloadingId === etu.id}
                            className="gap-1.5 ds-press"
                          >
                            {downloadingId === etu.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Download className="h-3.5 w-3.5" />}
                            <span className="hidden sm:inline">Relevé</span>
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
              Le relevé de notes détaillé regroupe les notes par semestre et année académique.
              Accès en lecture seule — contactez votre responsable pour toute modification.
            </span>
          </div>
        </motion.div>
      )}
    </div>
  )
}
