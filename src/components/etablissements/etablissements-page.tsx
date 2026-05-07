'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Building2,
  Plus,
  Search,
  Filter,
  Edit3,
  Trash2,
  Eye,
  Power,
  PowerOff,
  MapPin,
  Mail,
  Phone,
  Globe,
  GraduationCap,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

// ─── Types ───

interface EtablissementItem {
  id: string
  nom: string
  type: string | null
  ville: string | null
  pays: string | null
  adresse: string | null
  telephone: string | null
  email: string | null
  siteWeb: string | null
  actif: boolean
  createdAt: string
  _count: { filieres: number; users: number }
}

interface EtablissementDetail extends EtablissementItem {
  filieres: Array<{
    id: string
    nom: string
    code: string | null
    niveau: string | null
    description: string | null
    nbEtudiants: number | null
    actif: boolean
    responsable: { id: string; name: string; email: string } | null
    _count: { etudiants: number }
  }>
  users: Array<{
    id: string
    name: string
    email: string
    role: string
    actif: boolean
  }>
}

// ─── Utility functions ───

function getTypeBadge(type: string | null) {
  switch (type) {
    case 'Université':
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">Université</Badge>
    case 'École d\'ingénieurs':
      return <Badge className="bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800">École d\'ingénieurs</Badge>
    case 'Institut':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">Institut</Badge>
    case 'École de commerce':
      return <Badge className="bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800">École de commerce</Badge>
    default:
      return type ? <Badge variant="outline">{type}</Badge> : <Badge variant="outline" className="text-muted-foreground">Autre</Badge>
  }
}

function getRoleBadge(role: string) {
  switch (role) {
    case 'ADMIN':
      return <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-xs dark:bg-rose-900/40 dark:text-rose-300">Admin</Badge>
    case 'RESPONSABLE':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs dark:bg-amber-900/40 dark:text-amber-300">Responsable</Badge>
    case 'ENSEIGNANT':
      return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs dark:bg-emerald-900/40 dark:text-emerald-300">Enseignant</Badge>
    case 'ETUDIANT':
      return <Badge className="bg-sky-100 text-sky-800 border-sky-200 text-xs dark:bg-sky-900/40 dark:text-sky-300">Étudiant</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{role}</Badge>
  }
}

// ─── Main Component ───

export function EtablissementsPage() {
  // ─── Data state ───
  const [etablissements, setEtablissements] = useState<EtablissementItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  // ─── Dialog state ───
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingEtab, setEditingEtab] = useState<EtablissementItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EtablissementItem | null>(null)

  // ─── Detail view state ───
  const [detailEtab, setDetailEtab] = useState<EtablissementDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  // ─── Form state ───
  const [formNom, setFormNom] = useState('')
  const [formType, setFormType] = useState('')
  const [formVille, setFormVille] = useState('')
  const [formPays, setFormPays] = useState('France')
  const [formAdresse, setFormAdresse] = useState('')
  const [formTelephone, setFormTelephone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formSiteWeb, setFormSiteWeb] = useState('')

  // ─── Fetch etablissements ───
  const fetchEtablissements = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter)

      const res = await fetch(`/api/etablissements?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEtablissements(data.etablissements ?? [])
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [search, typeFilter])

  useEffect(() => {
    fetchEtablissements()
  }, [fetchEtablissements])

  // ─── Stats ───
  const totalEtab = etablissements.length
  const actifCount = etablissements.filter((e) => e.actif).length
  const types = [...new Set(etablissements.map((e) => e.type).filter(Boolean))]

  // ─── Open create dialog ───
  const handleOpenCreate = () => {
    setEditingEtab(null)
    setFormNom('')
    setFormType('')
    setFormVille('')
    setFormPays('France')
    setFormAdresse('')
    setFormTelephone('')
    setFormEmail('')
    setFormSiteWeb('')
    setCreateDialogOpen(true)
  }

  // ─── Open edit dialog ───
  const handleOpenEdit = (etab: EtablissementItem) => {
    setEditingEtab(etab)
    setFormNom(etab.nom)
    setFormType(etab.type ?? '')
    setFormVille(etab.ville ?? '')
    setFormPays(etab.pays ?? 'France')
    setFormAdresse(etab.adresse ?? '')
    setFormTelephone(etab.telephone ?? '')
    setFormEmail(etab.email ?? '')
    setFormSiteWeb(etab.siteWeb ?? '')
    setCreateDialogOpen(true)
  }

  // ─── Submit create/edit ───
  const handleSubmit = async () => {
    if (!formNom) {
      toast.error('Nom manquant', { description: 'Le nom de l\'établissement est obligatoire.' })
      return
    }

    setIsSubmitting(true)
    try {
      const body = {
        nom: formNom,
        type: formType || null,
        ville: formVille || null,
        pays: formPays || 'France',
        adresse: formAdresse || null,
        telephone: formTelephone || null,
        email: formEmail || null,
        siteWeb: formSiteWeb || null,
      }

      if (editingEtab) {
        const res = await fetch(`/api/etablissements/${editingEtab.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la modification')
        }
        toast.success('Établissement modifié', { description: `${formNom} a été mis à jour.` })
      } else {
        const res = await fetch('/api/etablissements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Erreur lors de la création')
        }
        toast.success('Établissement créé', { description: `${formNom} a été ajouté.` })
      }

      setCreateDialogOpen(false)
      await fetchEtablissements()
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Une erreur est survenue.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Toggle active ───
  const handleToggleActive = async (etab: EtablissementItem) => {
    try {
      const res = await fetch(`/api/etablissements/${etab.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: !etab.actif }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(etab.actif ? 'Établissement désactivé' : 'Établissement activé')
      await fetchEtablissements()
    } catch {
      toast.error('Erreur', { description: 'Impossible de modifier le statut.' })
    }
  }

  // ─── Delete ───
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/etablissements/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Établissement supprimé')
      setDeleteTarget(null)
      await fetchEtablissements()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer l\'établissement.' })
    }
  }

  // ─── View detail ───
  const handleViewDetail = async (etab: EtablissementItem) => {
    setDetailLoading(true)
    setDetailOpen(true)
    try {
      const res = await fetch(`/api/etablissements/${etab.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailEtab(data.etablissement)
      }
    } catch {
      // Silent
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Building2 className="h-7 w-7 text-emerald-600" />
            Gestion des Établissements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administrer les établissements partenaires
          </p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4" />
          Nouvel établissement
        </Button>
      </div>

      {/* ─── Stats bar ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total établissements</p>
              <p className="text-xl font-bold">{totalEtab}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <Users className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actifs</p>
              <p className="text-xl font-bold">{actifCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <GraduationCap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Types</p>
              <p className="text-sm font-semibold">{types.length > 0 ? types.join(', ') : '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Toolbar ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un établissement..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="Université">Université</SelectItem>
            <SelectItem value="École d&apos;ingénieurs">École d&apos;ingénieurs</SelectItem>
            <SelectItem value="Institut">Institut</SelectItem>
            <SelectItem value="École de commerce">École de commerce</SelectItem>
            <SelectItem value="Autre">Autre</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── Loading state ─── */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="h-5 w-40 rounded bg-muted" />
                    <div className="h-4 w-24 rounded bg-muted" />
                  </div>
                  <div className="h-6 w-20 rounded-full bg-muted" />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-32 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="h-6 w-16 rounded bg-muted" />
                  <div className="h-6 w-16 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && etablissements.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
            <Building2 className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Aucun établissement trouvé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || typeFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres.'
              : 'Commencez par créer votre premier établissement.'}
          </p>
          {!search && typeFilter === 'all' && (
            <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              Créer un établissement
            </Button>
          )}
        </div>
      )}

      {/* ─── Card grid ─── */}
      {!isLoading && etablissements.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {etablissements.map((etab) => (
            <Card key={etab.id} className="group transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-4 p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold leading-tight">{etab.nom}</h3>
                    <div className="mt-1">{getTypeBadge(etab.type)}</div>
                  </div>
                  {etab.actif ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs">Actif</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-xs">Inactif</Badge>
                  )}
                </div>

                {/* Details */}
                <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {etab.ville && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      {etab.ville}{etab.pays ? `, ${etab.pays}` : ''}
                    </span>
                  )}
                  {etab.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                      {etab.email}
                    </span>
                  )}
                  {etab.telephone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {etab.telephone}
                    </span>
                  )}
                </div>

                {/* Counts */}
                <div className="flex gap-3">
                  <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                    <GraduationCap className="h-3 w-3" />
                    {etab._count.filieres} filière{etab._count.filieres > 1 ? 's' : ''}
                  </Badge>
                  <Badge variant="secondary" className="gap-1 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300">
                    <Users className="h-3 w-3" />
                    {etab._count.users} utilisateur{etab._count.users > 1 ? 's' : ''}
                  </Badge>
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEdit(etab)}
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(etab)}
                  >
                    {etab.actif ? (
                      <>
                        <PowerOff className="h-3.5 w-3.5" />
                        Désactiver
                      </>
                    ) : (
                      <>
                        <Power className="h-3.5 w-3.5" />
                        Activer
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDetail(etab)}
                    className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-950"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Détails
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Create/Edit Etablissement Dialog ─── */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        if (!open) setCreateDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              {editingEtab ? 'Modifier l\'établissement' : 'Nouvel établissement'}
            </DialogTitle>
            <DialogDescription>
              {editingEtab ? 'Modifiez les informations de l\'établissement.' : 'Remplissez les informations pour créer un nouvel établissement.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-2">
              <Label htmlFor="etab-nom">Nom *</Label>
              <Input
                id="etab-nom"
                placeholder="Ex: Université de Paris"
                value={formNom}
                onChange={(e) => setFormNom(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="etab-type">Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger id="etab-type">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Université">Université</SelectItem>
                    <SelectItem value="École d&apos;ingénieurs">École d&apos;ingénieurs</SelectItem>
                    <SelectItem value="Institut">Institut</SelectItem>
                    <SelectItem value="École de commerce">École de commerce</SelectItem>
                    <SelectItem value="Autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="etab-ville">Ville</Label>
                <Input
                  id="etab-ville"
                  placeholder="Ex: Paris"
                  value={formVille}
                  onChange={(e) => setFormVille(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="etab-pays">Pays</Label>
                <Input
                  id="etab-pays"
                  placeholder="France"
                  value={formPays}
                  onChange={(e) => setFormPays(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="etab-telephone">Téléphone</Label>
                <Input
                  id="etab-telephone"
                  placeholder="+33 1 23 45 67 89"
                  value={formTelephone}
                  onChange={(e) => setFormTelephone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="etab-email">Email</Label>
              <Input
                id="etab-email"
                type="email"
                placeholder="contact@etablissement.fr"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="etab-siteweb">Site web</Label>
              <Input
                id="etab-siteweb"
                placeholder="https://www.etablissement.fr"
                value={formSiteWeb}
                onChange={(e) => setFormSiteWeb(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="etab-adresse">Adresse</Label>
              <Textarea
                id="etab-adresse"
                placeholder="Adresse complète..."
                value={formAdresse}
                onChange={(e) => setFormAdresse(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingEtab ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l&apos;établissement</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.nom}</strong> ?
              Cette action est irréversible. Toutes les filières et données associées seront supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Detail View Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={(open) => {
        if (!open) {
          setDetailOpen(false)
          setDetailEtab(null)
        }
      }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              {detailEtab?.nom ?? 'Détails de l\'établissement'}
            </DialogTitle>
            <DialogDescription>
              Informations détaillées, filières et utilisateurs
            </DialogDescription>
          </DialogHeader>

          {detailLoading && (
            <div className="space-y-4 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {detailEtab && !detailLoading && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6">
                {/* Info section */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {detailEtab.type && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Type :</span>
                      {getTypeBadge(detailEtab.type)}
                    </div>
                  )}
                  {detailEtab.ville && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                      {detailEtab.ville}{detailEtab.pays ? `, ${detailEtab.pays}` : ''}
                    </div>
                  )}
                  {detailEtab.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-3.5 w-3.5 text-teal-600" />
                      {detailEtab.email}
                    </div>
                  )}
                  {detailEtab.telephone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {detailEtab.telephone}
                    </div>
                  )}
                  {detailEtab.siteWeb && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="h-3.5 w-3.5 text-emerald-600" />
                      <a href={detailEtab.siteWeb} target="_blank" rel="noopener noreferrer" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                        {detailEtab.siteWeb}
                      </a>
                    </div>
                  )}
                  {detailEtab.adresse && (
                    <div className="flex items-center gap-2 text-sm col-span-full">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {detailEtab.adresse}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Filières section */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-emerald-600" />
                    Filières ({detailEtab.filieres.length})
                  </h3>
                  {detailEtab.filieres.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">Aucune filière dans cet établissement.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {detailEtab.filieres.map((f) => (
                        <Card key={f.id} className="py-0">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-sm">{f.nom}</p>
                                {f.code && <p className="text-xs text-muted-foreground">{f.code} · {f.niveau || ''}</p>}
                                {f.responsable && <p className="text-xs text-muted-foreground mt-0.5">Resp: {f.responsable.name}</p>}
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {f._count.etudiants} étud.
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Users section */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-teal-600" />
                    Utilisateurs ({detailEtab.users.length})
                  </h3>
                  {detailEtab.users.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">Aucun utilisateur dans cet établissement.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {detailEtab.users.map((u) => (
                        <div key={u.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300">
                              {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{u.name}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                          {getRoleBadge(u.role)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
