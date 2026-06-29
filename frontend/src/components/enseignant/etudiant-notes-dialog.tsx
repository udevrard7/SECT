'use client'

/**
 * EtudiantNotesDialog — Modale de détail des notes d'un étudiant.
 *
 * MES-ETUDIANTS-REFOUND-1 : remplace l'ancien bouton "Relevé" (PDF par
 * étudiant) par une vue modale. L'enseignant clique sur la ligne d'un
 * étudiant → la modale s'ouvre et affiche TOUTES les évaluations/notes
 * de cet étudiant pour les épreuves de l'enseignant (RLS côté backend
 * filtre déjà par enseignant via Epreuve.enseignantId).
 *
 * Source : GET /api/resultats?etudiantId=X → { resultats: SessionPassation[] }
 *
 * Identité visuelle : Dialog shadcn, Table avec header kente, Badge pour
 * les statuts, framer-motion pour l'entrée, score-circle pour la moyenne.
 */

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PulseSkeleton } from '@/components/ds'
import { Mail, GraduationCap, BookOpen, AlertCircle, Award, Loader2 } from 'lucide-react'

// ─── Types ───

interface EpreuveRef {
  id: string
  titre: string
  noteTotal: number
  duree?: number
  enseignant?: { id: string; name: string }
}

interface SessionResultat {
  id: string
  etudiantId: string
  epreuveId: string
  statut: string
  score: number | null
  dateDebut: string | null
  dateFin: string | null
  penalite?: number | null
  epreuve?: EpreuveRef
}

interface EtudiantInfo {
  id: string
  name: string
  email: string
  matricule: string | null
  niveau: string | null
  filiere?: { id: string; nom: string; code: string } | null
  ues?: { id: string; code: string; nom: string }[]
}

interface Props {
  etudiant: EtudiantInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const NIVEAU_LABELS: Record<string, string> = {
  L1: 'L1', L2: 'L2', L3: 'L3', M1: 'M1', M2: 'M2', DOCTORAT: 'Doctorat',
}

const STATUT_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  SOUMISE: { label: 'Soumise', variant: 'secondary' },
  CORRIGEE: { label: 'Corrigée', variant: 'default' },
  RETOURNEE: { label: 'Retournée', variant: 'default' },
  EN_COURS: { label: 'En cours', variant: 'outline' },
  ABANDON: { label: 'Abandon', variant: 'destructive' },
}

// ─── Composant ───

export function EtudiantNotesDialog({ etudiant, open, onOpenChange }: Props) {
  const notesQuery = useQuery<{ resultats: SessionResultat[] }>({
    queryKey: ['etudiant-notes', etudiant?.id],
    queryFn: async () => {
      const res = await fetch(`/api/resultats?etudiantId=${etudiant!.id}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? `Erreur ${res.status}`)
      }
      const data = await res.json()
      return { resultats: data.resultats ?? [] }
    },
    enabled: !!etudiant?.id && open,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  })

  const resultats = notesQuery.data?.resultats ?? []
  const loading = notesQuery.isLoading
  const error = notesQuery.error ? (notesQuery.error as Error).message : null

  // Calculs : moyenne, nb corrigées, taux réussite
  const notesValides = resultats.filter(
    (r) => r.score !== null && (r.statut === 'CORRIGEE' || r.statut === 'RETOURNEE'),
  )
  const sommeNotes = notesValides.reduce((sum, r) => {
    const noteSur20 = r.epreuve?.noteTotal && r.epreuve.noteTotal > 0
      ? (r.score! / r.epreuve.noteTotal) * 20
      : r.score!
    return sum + noteSur20
  }, 0)
  const moyenne = notesValides.length > 0 ? sommeNotes / notesValides.length : null
  const tauxReussite = notesValides.length > 0
    ? (notesValides.filter((r) => {
        const noteSur20 = r.epreuve?.noteTotal && r.epreuve.noteTotal > 0
          ? (r.score! / r.epreuve.noteTotal) * 20
          : r.score!
        return noteSur20 >= 10
      }).length / notesValides.length) * 100
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <GraduationCap className="h-5 w-5 text-primary-text" />
            Notes de l&apos;étudiant
          </DialogTitle>
          <DialogDescription className="sr-only">
            Détail des évaluations et notes de {etudiant?.name}
          </DialogDescription>
        </DialogHeader>

        {/* Header étudiant */}
        {etudiant && (
          <div className="ds-kente-pattern -mx-6 -mt-4 px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <span className="font-mono text-sm font-bold text-primary-text">
                  {etudiant.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold tracking-tight truncate">{etudiant.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                  <Mail className="h-3 w-3" />{etudiant.email}
                  {etudiant.matricule && <span className="font-mono">• {etudiant.matricule}</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {etudiant.filiere && (
                <Badge variant="outline" className="gap-1.5">
                  <BookOpen className="h-3 w-3" />
                  {etudiant.filiere.code} — {etudiant.filiere.nom}
                </Badge>
              )}
              {etudiant.niveau && (
                <Badge variant="secondary" className="gap-1.5">
                  {NIVEAU_LABELS[etudiant.niveau] ?? etudiant.niveau}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* UEs de l'enseignant pour cet étudiant */}
        {etudiant?.ues && etudiant.ues.length > 0 && (
          <div className="px-6 py-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">UEs suivies :</span>
            {etudiant.ues.map((ue) => (
              <Badge key={ue.id} variant="outline" className="text-xs font-mono">
                {ue.code}
              </Badge>
            ))}
          </div>
        )}

        {/* KPIs */}
        {!loading && !error && resultats.length > 0 && (
          <div className="px-6 grid grid-cols-3 gap-3">
            <KpiCard
              label="Évaluations"
              value={String(resultats.length)}
              sub={`${notesValides.length} corrigée${notesValides.length > 1 ? 's' : ''}`}
              icon={<Award className="h-4 w-4" />}
            />
            <KpiCard
              label="Moyenne"
              value={moyenne !== null ? `${moyenne.toFixed(2)}/20` : '—'}
              sub={moyenne !== null && moyenne >= 10 ? 'Réussite' : 'Insuffisant'}
              accent={moyenne !== null && moyenne >= 10 ? 'success' : 'destructive'}
              icon={<Award className="h-4 w-4" />}
            />
            <KpiCard
              label="Taux de réussite"
              value={tauxReussite !== null ? `${tauxReussite.toFixed(0)}%` : '—'}
              sub={tauxReussite !== null && tauxReussite >= 50 ? 'Correct' : 'Faible'}
              accent={tauxReussite !== null && tauxReussite >= 50 ? 'success' : 'destructive'}
              icon={<Award className="h-4 w-4" />}
            />
          </div>
        )}

        {/* Contenu : tableau des évaluations */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-6">
          {loading ? (
            <div className="space-y-2">
              <PulseSkeleton className="h-10 w-full" variant="default" />
              <PulseSkeleton className="h-10 w-full" variant="default" />
              <PulseSkeleton className="h-10 w-full" variant="default" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : resultats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Award className="h-7 w-7 text-primary-text" />
              </div>
              <p className="mt-3 font-medium text-sm">Aucune évaluation</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Cet étudiant n&apos;a pas encore participé à vos épreuves, ou aucune session n&apos;a été corrigée.
              </p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
            >
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="font-display">Épreuve</TableHead>
                      <TableHead className="font-display hidden sm:table-cell">UE</TableHead>
                      <TableHead className="font-display hidden md:table-cell">Date</TableHead>
                      <TableHead className="font-display text-center">Note</TableHead>
                      <TableHead className="font-display text-center hidden sm:table-cell">/20</TableHead>
                      <TableHead className="font-display text-right">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultats.map((r, i) => {
                      const noteSur20 = r.epreuve?.noteTotal && r.epreuve.noteTotal > 0 && r.score !== null
                        ? (r.score / r.epreuve.noteTotal) * 20
                        : r.score
                      const isValide = r.statut === 'CORRIGEE' || r.statut === 'RETOURNEE'
                      const statutInfo = STATUT_LABELS[r.statut] ?? { label: r.statut, variant: 'outline' as const }
                      return (
                        <motion.tr
                          key={r.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="hover:bg-muted/20 transition-colors"
                        >
                          <TableCell className="font-medium text-sm">
                            {r.epreuve?.titre ?? '—'}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground font-mono">
                            {r.epreuve?.id ? r.epreuve.id.slice(0, 8) : '—'}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                            {r.dateFin
                              ? new Date(r.dateFin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </TableCell>
                          <TableCell className="text-center font-mono tabular-nums text-sm font-semibold">
                            {r.score !== null ? r.score.toFixed(2) : '—'}
                          </TableCell>
                          <TableCell className="text-center font-mono tabular-nums text-sm">
                            {isValide && noteSur20 !== null ? (
                              <span className={noteSur20 >= 10 ? 'text-success-text' : 'text-destructive'}>
                                {noteSur20.toFixed(2)}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={statutInfo.variant} className="text-xs">
                              {statutInfo.label}
                            </Badge>
                          </TableCell>
                        </motion.tr>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-primary-text" />
                Notes normalisées sur 20. Les évaluations en cours ou abandonnées ne sont pas comptées dans la moyenne.
              </p>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── KPI Card (local) ───

function KpiCard({
  label, value, sub, icon, accent,
}: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  accent?: 'success' | 'destructive'
}) {
  const valueColor = accent === 'success' ? 'text-success-text'
    : accent === 'destructive' ? 'text-destructive'
    : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`mt-1 font-display text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}
