'use client'

// SECT-BIBLIO-P4 (ADR-0008 §2) : file de propositions G1 — le
// RESPONSABLE propose (métadonnées, SANS fichier : le dépôt du PDF
// reste un acte ADMIN), l'ADMIN tranche (accepter/refuser avec motif).
// Notifications fire-and-forquet côté backend (PROPOSITION_TRANCHEE).

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  FileUp,
  Inbox,
  Loader2,
  MessageSquareText,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PulseSkeleton } from '@/components/ds'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateUTC } from '@/lib/date-utils'
import {
  type OuvrageProposition,
  type CreatePropositionPayload,
  type StatutProposition,
  CATEGORIES_OUVRAGE,
  NIVEAUX_ETUDE,
  categorieLabel,
  parseAuteurs,
} from '@/lib/ouvrages-types'

interface PropositionsViewProps {
  /** ADMIN : ouvrir le dialog de dépôt pré-lié à la proposition ACCEPTEE. */
  onDeposer?: (p: OuvrageProposition) => void
  /** Options filières (pré-remplissage — passées par la page hôte). */
  filieresOptions: { id: string; nom: string }[]
}

export function PropositionsView({
  onDeposer,
  filieresOptions,
}: PropositionsViewProps) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'ADMIN'
  const peutProposer = user?.role === 'RESPONSABLE' || isAdmin

  // ─── File (queryKey partagée avec le badge count du hôte) ───
  const propositionsQuery = useQuery({
    queryKey: ['ouvrages-propositions'],
    queryFn: async () => {
      const res = await fetch('/api/ouvrages/propositions?limit=50', {
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      return res.json()
    },
    staleTime: 30_000,
  })

  const propositions: OuvrageProposition[] =
    propositionsQuery.data?.propositions ?? []
  const enAttente = propositions.filter((p) => p.statut === 'EN_ATTENTE')
  const tranchees = propositions.filter((p) => p.statut !== 'EN_ATTENTE')

  const invalider = () =>
    queryClient.invalidateQueries({ queryKey: ['ouvrages-propositions'] })

  // ─── Dialog proposition (RESPONSABLE) ───
  const [propOuvert, setPropOuvert] = useState(false)
  const [propEnCours, setPropEnCours] = useState(false)
  const [pTitre, setPTitre] = useState('')
  const [pCategorie, setPCategorie] = useState<string>('')
  const [pLicence, setPLicence] = useState('')
  const [pAuteurs, setPAuteurs] = useState('')
  const [pEditeur, setPEditeur] = useState('')
  const [pAnnee, setPAnnee] = useState('')
  const [pIsbn, setPIsbn] = useState('')
  const [pLangue, setPLangue] = useState('')
  const [pFiliere, setPFiliere] = useState('toutes')
  const [pNiveau, setPNiveau] = useState('tous')
  const [pThemes, setPThemes] = useState('')
  const [pDescription, setPDescription] = useState('')

  const resetProposition = () => {
    setPTitre('')
    setPCategorie('')
    setPLicence('')
    setPAuteurs('')
    setPEditeur('')
    setPAnnee('')
    setPIsbn('')
    setPLangue('')
    setPFiliere('toutes')
    setPNiveau('tous')
    setPThemes('')
    setPDescription('')
  }

  const soumettreProposition = async () => {
    if (!pTitre.trim()) {
      toast.error('Titre manquant')
      return
    }
    if (!pCategorie) {
      toast.error('Catégorie manquante')
      return
    }
    if (!pLicence.trim()) {
      toast.error('Licence / origine des droits requise', {
        description:
          "Garde-fou ADR-0007 : indiquez l'origine des droits pour que l'administration puisse instruire la demande.",
      })
      return
    }
    setPropEnCours(true)
    try {
      const payload: CreatePropositionPayload = {
        titre: pTitre.trim(),
        categorie: pCategorie as CreatePropositionPayload['categorie'],
        licenceOrigine: pLicence.trim(),
      }
      if (pAuteurs.trim())
        payload.auteurs = JSON.stringify(
          pAuteurs.split(/[;,]/).map((a) => a.trim()).filter(Boolean),
        )
      if (pEditeur.trim()) payload.editeur = pEditeur.trim()
      if (pAnnee.trim()) payload.anneePublication = parseInt(pAnnee, 10)
      if (pIsbn.trim()) payload.isbn = pIsbn.trim()
      if (pLangue.trim()) payload.langue = pLangue.trim()
      if (pFiliere !== 'toutes') payload.filiereId = pFiliere
      if (pNiveau !== 'tous') payload.niveau = pNiveau
      if (pThemes.trim())
        payload.themes = JSON.stringify(
          pThemes.split(/[;,]/).map((t) => t.trim()).filter(Boolean),
        )
      if (pDescription.trim()) payload.description = pDescription.trim()

      const res = await fetch('/api/ouvrages/propositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      await invalider()
      setPropOuvert(false)
      resetProposition()
      toast.success('Proposition envoyée', {
        description:
          "L'administration de votre établissement va l'examiner — vous serez notifié de la décision.",
      })
    } catch (err) {
      toast.error('Proposition impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    } finally {
      setPropEnCours(false)
    }
  }

  // ─── Tranche ADMIN (accepter / refuser + motif) ───
  const [refusCible, setRefusCible] = useState<OuvrageProposition | null>(null)
  const [refusMotif, setRefusMotif] = useState('')
  const [acceptCible, setAcceptCible] = useState<OuvrageProposition | null>(null)
  const [trancheEnCours, setTrancheEnCours] = useState(false)

  const trancher = async (
    p: OuvrageProposition,
    decision: StatutProposition,
    motifRefus?: string,
  ) => {
    setTrancheEnCours(true)
    try {
      const res = await fetch(
        `/api/ouvrages/propositions/${p.id}/trancher`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ decision, motifRefus }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      await invalider()
      if (decision === 'REFUSEE') {
        setRefusCible(null)
        setRefusMotif('')
        toast.success('Proposition refusée', {
          description: 'Le proposant a été notifié avec le motif.',
        })
      } else {
        setAcceptCible(null)
        toast.success('Proposition acceptée', {
          description:
            "Déposez maintenant le fichier PDF (« Déposer le fichier ») pour l'ajouter au catalogue.",
        })
      }
    } catch (err) {
      toast.error('Décision impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    } finally {
      setTrancheEnCours(false)
    }
  }

  const retirer = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ouvrages/propositions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      return id
    },
    onSuccess: () => {
      invalider()
      toast.success('Proposition retirée')
    },
    onError: (err: Error) => {
      toast.error('Retrait impossible', { description: err.message })
    },
  })

  const statutBadge = (s: StatutProposition) => {
    if (s === 'ACCEPTEE') return <Badge className="bg-success/15 text-success-text border-success/30">Acceptée</Badge>
    if (s === 'REFUSEE') return <Badge variant="destructive">Refusée</Badge>
    return <Badge variant="secondary" className="border-warning/40 text-warning-text bg-warning/10">En attente</Badge>
  }

  const ligneProposition = (p: OuvrageProposition, attendente: boolean) => (
    <TableRow key={p.id}>
      <TableCell className="max-w-[260px]">
        <p className="font-medium truncate">{p.titre}</p>
        <p className="text-xs text-muted-foreground truncate">
          {parseAuteurs(p.auteurs).join(', ') || 'Auteur inconnu'} ·{' '}
          {categorieLabel(p.categorie)}
          {p.anneePublication ? ` · ${p.anneePublication}` : ''}
        </p>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {p.proposantNom}
      </TableCell>
      <TableCell>{statutBadge(p.statut)}</TableCell>
      <TableCell className="max-w-[220px]">
        {p.statut === 'REFUSEE' && p.motifRefus ? (
          <p className="text-xs text-destructive line-clamp-2" title={p.motifRefus}>
            {p.motifRefus}
          </p>
        ) : p.statut === 'ACCEPTEE' ? (
          p.ouvrageId ? (
            <p className="text-xs text-success-text truncate">
              Déposé : {p.ouvrageTitre ?? 'ouvrage lié'}
            </p>
          ) : isAdmin ? (
            <span className="text-xs text-warning-text">
              Fichier à déposer
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Dépôt du fichier à venir
            </span>
          )
        ) : (
          <span className="text-xs text-muted-foreground">
            {formatDateUTC(p.createdAt)}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {attendente && isAdmin && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-success-text hover:bg-success/10"
                onClick={() => setAcceptCible(p)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Accepter
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setRefusCible(p)
                  setRefusMotif('')
                }}
              >
                <XCircle className="h-4 w-4" />
                Refuser
              </Button>
            </>
          )}
          {p.statut === 'ACCEPTEE' && !p.ouvrageId && isAdmin && onDeposer && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              onClick={() => onDeposer(p)}
            >
              <FileUp className="h-4 w-4" />
              Déposer le fichier
            </Button>
          )}
          {attendente && p.proposantId === user?.id && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-destructive hover:bg-destructive/10"
              onClick={() => retirer.mutate(p.id)}
              disabled={retirer.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Retirer
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )

  return (
    <div className="space-y-6">
      {/* En-tête + bouton proposer (RESPONSABLE) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" />
            Propositions d’ouvrages
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {isAdmin
              ? 'La file des demandes des responsables — vous tranchez, puis déposez le fichier des propositions acceptées.'
              : 'Proposez des ouvrages à l’administration : elle examine la demande et dépose le fichier si elle est acceptée.'}
          </p>
        </div>
        {peutProposer && !isAdmin && (
          <Button onClick={() => setPropOuvert(true)} className="ds-shimmer gap-2">
            <Plus className="h-4 w-4" />
            Proposer un ouvrage
          </Button>
        )}
      </div>

      {/* File EN_ATTENTE */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-warning" />
            En attente de décision
            <Badge variant="secondary">{enAttente.length}</Badge>
          </h3>
          {propositionsQuery.isLoading ? (
            <div className="space-y-2">
              <PulseSkeleton className="h-10 w-full" />
              <PulseSkeleton className="h-10 w-full" />
            </div>
          ) : propositionsQuery.isError ? (
            <div className="rounded-md border border-destructive/50 p-4 text-center text-sm text-muted-foreground">
              {propositionsQuery.error instanceof Error
                ? propositionsQuery.error.message
                : 'Erreur de chargement'}
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => propositionsQuery.refetch()}
                >
                  Réessayer
                </Button>
              </div>
            </div>
          ) : enAttente.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucune proposition en attente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ouvrage proposé</TableHead>
                    <TableHead>Proposant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Détail</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enAttente.map((p) => ligneProposition(p, true))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique tranché */}
      {tranchees.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium mb-3">
              Décisions récentes
              <Badge variant="secondary" className="ml-2">
                {tranchees.length}
              </Badge>
            </h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ouvrage proposé</TableHead>
                    <TableHead>Proposant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Détail</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tranchees.map((p) => ligneProposition(p, false))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Dialog proposition (RESPONSABLE — métadonnées SANS fichier) ─── */}
      <Dialog open={propOuvert} onOpenChange={setPropOuvert}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proposer un ouvrage</DialogTitle>
            <DialogDescription>
              Décrivez l’ouvrage souhaité — l’administration vérifiera les
              droits et déposera le fichier si la proposition est acceptée.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="prop-titre">Titre *</Label>
              <Input
                id="prop-titre"
                value={pTitre}
                onChange={(e) => setPTitre(e.target.value)}
                placeholder="Ex : Algorithmique avancée — 3e édition"
              />
            </div>
            <div className="space-y-2">
              <Label>Catégorie *</Label>
              <Select value={pCategorie} onValueChange={setPCategorie}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES_OUVRAGE.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-licence">Licence / origine des droits *</Label>
              <Input
                id="prop-licence"
                value={pLicence}
                onChange={(e) => setPLicence(e.target.value)}
                placeholder="Ex : auteur de l’établissement, licence campus…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-auteurs">Auteurs (séparés par ;)</Label>
              <Input
                id="prop-auteurs"
                value={pAuteurs}
                onChange={(e) => setPAuteurs(e.target.value)}
                placeholder="Ex : Diallo M. ; Traoré A."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-editeur">Éditeur</Label>
              <Input
                id="prop-editeur"
                value={pEditeur}
                onChange={(e) => setPEditeur(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-annee">Année</Label>
              <Input
                id="prop-annee"
                type="number"
                value={pAnnee}
                onChange={(e) => setPAnnee(e.target.value)}
                placeholder="2026"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-isbn">ISBN</Label>
              <Input
                id="prop-isbn"
                value={pIsbn}
                onChange={(e) => setPIsbn(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Filière</Label>
              <Select value={pFiliere} onValueChange={setPFiliere}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="toutes">Toutes</SelectItem>
                  {filieresOptions.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Niveau</Label>
              <Select value={pNiveau} onValueChange={setPNiveau}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous</SelectItem>
                  {NIVEAUX_ETUDE.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-langue">Langue</Label>
              <Input
                id="prop-langue"
                value={pLangue}
                onChange={(e) => setPLangue(e.target.value)}
                placeholder="Français"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="prop-themes">Thèmes (séparés par ;)</Label>
              <Input
                id="prop-themes"
                value={pThemes}
                onChange={(e) => setPThemes(e.target.value)}
                placeholder="Ex : graphes ; complexité ; tri"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="prop-description">Description / justification</Label>
              <Textarea
                id="prop-description"
                value={pDescription}
                onChange={(e) => setPDescription(e.target.value)}
                placeholder="Pourquoi cet ouvrage est pertinent pour vos cours…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPropOuvert(false)}>
              Annuler
            </Button>
            <Button
              onClick={soumettreProposition}
              disabled={propEnCours}
              className="gap-1.5"
            >
              {propEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
              Envoyer la proposition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog acceptation (ADMIN) ─── */}
      <Dialog open={!!acceptCible} onOpenChange={(v) => !v && setAcceptCible(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accepter la proposition ?</DialogTitle>
            <DialogDescription>
              « {acceptCible?.titre} » sera marquée acceptée. Vous déposerez
              ensuite le fichier PDF (bouton « Déposer le fichier »), qui sera
              lié à cette proposition.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptCible(null)}>
              Annuler
            </Button>
            <Button
              className="gap-1.5"
              disabled={trancheEnCours}
              onClick={() => acceptCible && trancher(acceptCible, 'ACCEPTEE')}
            >
              {trancheEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
              <CheckCircle2 className="h-4 w-4" />
              Accepter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog refus (ADMIN — motif obligatoire) ─── */}
      <Dialog open={!!refusCible} onOpenChange={(v) => !v && setRefusCible(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser la proposition</DialogTitle>
            <DialogDescription>
              Le motif sera transmis au proposant ({refusCible?.proposantNom}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="refus-motif">Motif du refus *</Label>
            <Textarea
              id="refus-motif"
              value={refusMotif}
              onChange={(e) => setRefusMotif(e.target.value)}
              placeholder="Ex : droits non éclaircis pour cette édition…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefusCible(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              disabled={trancheEnCours || !refusMotif.trim()}
              onClick={() =>
                refusCible &&
                trancher(refusCible, 'REFUSEE', refusMotif.trim())
              }
            >
              {trancheEnCours && <Loader2 className="h-4 w-4 animate-spin" />}
              <XCircle className="h-4 w-4" />
              Refuser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
