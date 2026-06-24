'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Building2,
  Search,
  Filter,
  Edit3,
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
  IdCard,
  Info,
  CreditCard,
  UserCheck,
  Lock,
  ArrowRight,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import { PAGE_ROUTES } from '@/lib/routes'
import { Card, CardContent } from '@/components/ui/card'
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
import { PulseSkeleton } from '@/components/ds'
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
  formatMatricule?: string | null
  exempleMatricule?: string | null
  regexMatricule?: string | null
  _count: { filieres: number; users: number }
  adminHasAccess?: boolean
  responsable?: {
    id: string
    name: string
    email: string
    actif: boolean
    derniereConnexion: string | null
  } | null
  abonnements?: Array<{
    id: string
    statut: string
    plan: { nom: string }
    dateFin: string | null
  }>
}

interface EtablissementDetail extends EtablissementItem {
  filieres: Array<{
    id: string
    nom: string
    code: string | null
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
      return <Badge className="bg-success/15 text-success border-success/30">Université</Badge>
    case 'École d\'ingénieurs':
      return <Badge className="bg-info/15 text-info border-info/30">École d\'ingénieurs</Badge>
    case 'Institut':
      return <Badge className="bg-warning/15 text-warning border-warning/30">Institut</Badge>
    case 'École de commerce':
      return <Badge className="bg-destructive/15 text-destructive border-destructive/30">École de commerce</Badge>
    default:
      return type ? <Badge variant="outline">{type}</Badge> : <Badge variant="outline" className="text-muted-foreground">Autre</Badge>
  }
}

function getRoleBadge(role: string) {
  switch (role) {
    case 'ADMIN':
      return <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs">Admin</Badge>
    case 'RESPONSABLE':
      return <Badge className="bg-warning/15 text-warning border-warning/30 text-xs">Responsable</Badge>
    case 'ENSEIGNANT':
      return <Badge className="bg-success/15 text-success border-success/30 text-xs">Enseignant</Badge>
    case 'ETUDIANT':
      return <Badge className="bg-info/15 text-info border-info/30 text-xs">Étudiant</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{role}</Badge>
  }
}

// ─── Main Component ───

export function EtablissementsPage() {
  const router = useRouter()

  // ─── Data state ───
  const [etablissements, setEtablissements] = useState<EtablissementItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ─── Filter state ───
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  // ─── Dialog state ───
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingEtab, setEditingEtab] = useState<EtablissementItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EtablissementItem | null>(null)

  // ─── Detail view state ───
  const [detailEtab, setDetailEtab] = useState<EtablissementDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailAdminAccess, setDetailAdminAccess] = useState<boolean | null>(null)

  // ─── Form state ───
  const [formNom, setFormNom] = useState('')
  const [formType, setFormType] = useState('')
  const [formVille, setFormVille] = useState('')
  const [formPays, setFormPays] = useState("Côte d'Ivoire")
  const [formAdresse, setFormAdresse] = useState('')
  const [formTelephone, setFormTelephone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formSiteWeb, setFormSiteWeb] = useState('')
  const [formFormatMatricule, setFormFormatMatricule] = useState('')
  const [formExempleMatricule, setFormExempleMatricule] = useState('')
  const [formRegexMatricule, setFormRegexMatricule] = useState('')

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

  // ─── Open edit dialog ───
  const handleOpenEdit = (etab: EtablissementItem) => {
    setEditingEtab(etab)
    setFormNom(etab.nom)
    setFormType(etab.type ?? '')
    setFormVille(etab.ville ?? '')
    setFormPays(etab.pays ?? "Côte d'Ivoire")
    setFormAdresse(etab.adresse ?? '')
    setFormTelephone(etab.telephone ?? '')
    setFormEmail(etab.email ?? '')
    setFormSiteWeb(etab.siteWeb ?? '')
    setFormFormatMatricule(etab.formatMatricule ?? '')
    setFormExempleMatricule(etab.exempleMatricule ?? '')
    setFormRegexMatricule(etab.regexMatricule ?? '')
    setEditDialogOpen(true)
  }

  // ─── Submit edit ───
  const handleSubmit = async () => {
    if (!formNom) {
      toast.error('Nom manquant', { description: 'Le nom de l\'établissement est obligatoire.' })
      return
    }
    if (!editingEtab) return

    setIsSubmitting(true)
    try {
      const body = {
        nom: formNom,
        type: formType || null,
        ville: formVille || null,
        pays: formPays || "Côte d'Ivoire",
        adresse: formAdresse || null,
        telephone: formTelephone || null,
        email: formEmail || null,
        siteWeb: formSiteWeb || null,
        formatMatricule: formFormatMatricule || null,
        exempleMatricule: formExempleMatricule || null,
        regexMatricule: formRegexMatricule || null,
      }

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
      setEditDialogOpen(false)
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
    setDetailAdminAccess(null)
    try {
      const res = await fetch(`/api/etablissements/${etab.id}`)
      if (res.ok) {
        const data = await res.json()
        setDetailEtab(data.etablissement)
        if (typeof data.adminAccess === 'boolean') {
          setDetailAdminAccess(data.adminAccess)
        }
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
          <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Building2 className="h-7 w-7 text-success" />
            Gestion des Établissements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulter et administrer les établissements partenaires
          </p>
        </div>
        <Button onClick={() => router.push(PAGE_ROUTES.abonnements)}>
          <CreditCard className="h-4 w-4" />
          Nouvelle souscription
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>

      {/* ─── Stats bar ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-l-4 border-l-success ds-lift">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
              <Building2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total établissements</p>
              <p className="text-xl font-bold font-mono tabular-nums">{totalEtab}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-info ds-lift">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/15">
              <Users className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Actifs</p>
              <p className="text-xl font-bold font-mono tabular-nums">{actifCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning ds-lift">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
              <GraduationCap className="h-5 w-5 text-warning" />
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
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <PulseSkeleton className="h-5 w-40" />
                    <PulseSkeleton className="h-4 w-24" />
                  </div>
                  <PulseSkeleton className="h-6 w-20" />
                </div>
                <div className="mt-4 space-y-2">
                  <PulseSkeleton className="h-3 w-32" />
                  <PulseSkeleton className="h-3 w-24" />
                </div>
                <div className="mt-4 flex gap-2">
                  <PulseSkeleton className="h-6 w-16" />
                  <PulseSkeleton className="h-6 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && etablissements.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
            <Building2 className="h-10 w-10 text-success" />
          </div>
          <h3 className="mt-4 text-lg font-display font-semibold">Aucun établissement trouvé</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            {search || typeFilter !== 'all'
              ? 'Aucun résultat ne correspond à vos filtres.'
              : 'Aucun établissement enregistré. Créez-en un via la page Abonnements.'}
          </p>
          {!search && typeFilter === 'all' && (
            <Button className="mt-6" onClick={() => router.push(PAGE_ROUTES.abonnements)}>
              <CreditCard className="h-4 w-4" />
              Nouvelle souscription
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* ─── Card grid ─── */}
      {!isLoading && etablissements.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {etablissements.map((etab) => (
            <Card key={etab.id} className="group transition-shadow hover:shadow-md ds-lift">
              <CardContent className="flex flex-col gap-4 p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-display font-semibold leading-tight">{etab.nom}</h3>
                    <div className="mt-1">{getTypeBadge(etab.type)}</div>
                  </div>
                  {etab.actif ? (
                    <Badge className="bg-success/15 text-success border-success/30 text-xs">Actif</Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground border-border text-xs">Inactif</Badge>
                  )}
                </div>

                {/* Details */}
                <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {etab.ville && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-success" />
                      {etab.ville}{etab.pays ? `, ${etab.pays}` : ''}
                    </span>
                  )}
                  {etab.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-info" />
                      {etab.email}
                    </span>
                  )}
                  {etab.telephone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {etab.telephone}
                    </span>
                  )}
                  {etab.responsable && (
                    <span className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-warning" />
                      <span className="truncate">Responsable: {etab.responsable.name}</span>
                      {!etab.responsable.actif && (
                        <Badge className="bg-muted text-muted-foreground border-border text-[10px] px-1.5 py-0">Inactif</Badge>
                      )}
                    </span>
                  )}
                </div>

                {/* Abonnement badge */}
                {etab.abonnements && etab.abonnements.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {etab.abonnements.map((abo) => {
                      const statutLabel = abo.statut === 'ESSAI' ? 'Essai' : abo.statut === 'ACTIF' ? 'Actif' : abo.statut === 'EXPIRE' ? 'Expiré' : abo.statut === 'RESILIE' ? 'Résilié' : abo.statut
                      const statutClass = abo.statut === 'ACTIF'
                        ? 'bg-success/15 text-success border-success/30'
                        : abo.statut === 'ESSAI'
                          ? 'bg-warning/15 text-warning border-warning/30'
                          : 'bg-muted text-muted-foreground border-border'
                      return (
                        <Badge key={abo.id} className={`text-[10px] gap-1 ${statutClass}`}>
                          <CreditCard className="h-2.5 w-2.5" />
                          {abo.plan.nom} — {statutLabel}
                        </Badge>
                      )
                    })}
                  </div>
                )}

                {/* Counts */}
                <div className="flex gap-3">
                  <Badge variant="secondary" className="gap-1 bg-success/10 text-success">
                    <GraduationCap className="h-3 w-3" />
                    <span className="font-mono tabular-nums">{etab._count.filieres}</span> filière{etab._count.filieres > 1 ? 's' : ''}
                  </Badge>
                  <Badge variant="secondary" className="gap-1 bg-info/10 text-info">
                    <Users className="h-3 w-3" />
                    <span className="font-mono tabular-nums">{etab._count.users}</span> utilisateur{etab._count.users > 1 ? 's' : ''}
                  </Badge>
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEdit(etab)}
                    className="border-success/40 text-success hover:bg-success/10"
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
                    className="border-info/40 text-info hover:bg-info/10"
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

      {/* ─── Edit Etablissement Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        if (!open) setEditDialogOpen(false)
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display tracking-tight">
              <Building2 className="h-5 w-5 text-success" />
              Modifier l&apos;établissement
            </DialogTitle>
            <DialogDescription>
              Modifiez les informations de l&apos;établissement.
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
                  placeholder="Abidjan"
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
                  placeholder="Côte d'Ivoire"
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

            <Separator />

            {/* ─── Matricule Configuration ─── */}
            <div className="space-y-1">
              <h3 className="text-sm font-display font-semibold flex items-center gap-2 text-success">
                <IdCard className="h-4 w-4" />
                Configuration des Matricules Étudiants
              </h3>
              <p className="text-xs text-muted-foreground">
                Définissez le format des matricules attribués aux étudiants de cet établissement.
              </p>
            </div>

            <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="etab-format-matricule" className="text-xs">
                  Format du matricule
                </Label>
                <Input
                  id="etab-format-matricule"
                  placeholder="Ex: {YYYY}/{FIL}-{NIV}/{NNN}"
                  value={formFormatMatricule}
                  onChange={(e) => setFormFormatMatricule(e.target.value)}
                  className="text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Variables : {'{YYYY}'} (année), {'{YY}'} (année courte), {'{FIL}'} (code filière), {'{NIV}'} (niveau), {'{CODE}'} (code étab.), {'{NNN}'} (numéro)
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="etab-exemple-matricule" className="text-xs">
                    Exemple
                  </Label>
                  <Input
                    id="etab-exemple-matricule"
                    placeholder="Ex: 2026/INFO-L3/001"
                    value={formExempleMatricule}
                    onChange={(e) => setFormExempleMatricule(e.target.value)}
                    className="text-sm font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="etab-regex-matricule" className="text-xs">
                    Regex de validation (optionnel)
                  </Label>
                  <Input
                    id="etab-regex-matricule"
                    placeholder="Ex: ^\\d{4}/.+\\/.+$"
                    value={formRegexMatricule}
                    onChange={(e) => setFormRegexMatricule(e.target.value)}
                    className="text-sm font-mono"
                  />
                </div>
              </div>
              {!formFormatMatricule && (
                <p className="text-xs text-warning flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Sans format défini, un matricule aléatoire (ETU-XXXXXX) sera généré.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
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
              className="bg-destructive hover:bg-destructive/90"
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
            <DialogTitle className="flex items-center gap-2 font-display tracking-tight">
              <Building2 className="h-5 w-5 text-success" />
              {detailEtab?.nom ?? 'Détails de l\'établissement'}
            </DialogTitle>
            <DialogDescription>
              Informations détaillées, filières et utilisateurs
            </DialogDescription>
          </DialogHeader>

          {detailLoading && (
            <div className="space-y-4 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <PulseSkeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {detailEtab && !detailLoading && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6">
                {/* Info section — always shown */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {detailEtab.type && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Type :</span>
                      {getTypeBadge(detailEtab.type)}
                    </div>
                  )}
                  {detailEtab.ville && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-success" />
                      {detailEtab.ville}{detailEtab.pays ? `, ${detailEtab.pays}` : ''}
                    </div>
                  )}
                  {detailEtab.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-3.5 w-3.5 text-info" />
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
                      <Globe className="h-3.5 w-3.5 text-success" />
                      <a href={detailEtab.siteWeb} target="_blank" rel="noopener noreferrer" className="text-success hover:underline">
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

                {/* Restricted access message for ADMIN without access */}
                {detailAdminAccess === false && (
                  <>
                    <Separator />
                    <div className="rounded-lg bg-warning/10 border border-warning/30 p-4 flex items-start gap-3">
                      <Lock className="h-5 w-5 text-warning mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-display font-semibold text-warning">Accès non autorisé</p>
                        <p className="text-xs text-warning mt-1">
                          Vous n&apos;avez pas d&apos;accès autorisé aux données détaillées de cet établissement. Demandez une autorisation dans la section Accès &amp; autorisations.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* Full detail view — only when adminAccess is true or not applicable (non-ADMIN) */}
                {detailAdminAccess !== false && (
                  <>
                    <Separator />

                    {/* Filières section */}
                    <div>
                      <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 text-success" />
                        Filières (<span className="font-mono tabular-nums">{detailEtab.filieres?.length ?? 0}</span>)
                      </h3>
                      {!detailEtab.filieres || detailEtab.filieres.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">Aucune filière dans cet établissement.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {detailEtab.filieres.map((f) => (
                            <Card key={f.id} className="py-0">
                              <CardContent className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-sm">{f.nom}</p>
                                    {f.code && <p className="text-xs text-muted-foreground">{f.code}</p>}
                                    {f.responsable && <p className="text-xs text-muted-foreground mt-0.5">Resp: {f.responsable.name}</p>}
                                  </div>
                                  <Badge variant="secondary" className="text-xs font-mono tabular-nums">
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
                      <h3 className="text-sm font-display font-semibold mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4 text-info" />
                        Utilisateurs (<span className="font-mono tabular-nums">{detailEtab.users?.length ?? 0}</span>)
                      </h3>
                      {!detailEtab.users || detailEtab.users.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">Aucun utilisateur dans cet établissement.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {detailEtab.users.map((u) => (
                            <div key={u.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-muted/50">
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-success/15 flex items-center justify-center text-xs font-bold text-success font-mono tabular-nums">
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
                  </>
                )}
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
