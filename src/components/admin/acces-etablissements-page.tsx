'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  KeyRound,
  ShieldCheck,
  Clock,
  Building2,
  Plus,
  Send,
  Eye,
  RotateCcw,
  X,
  Loader2,
  Lock,
  MapPin,
  Users,
  GraduationCap,
  Calendar,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

// ─── Types ───

interface AccessRecord {
  id: string
  adminId: string
  etablissementId: string
  motif: string
  statut: 'EN_ATTENTE' | 'APPROUVE' | 'REFUSE' | 'EXPIRE'
  dateDebut: string | null
  dateFin: string | null
  commentaire: string | null
  approuvePar: string | null
  createdAt: string
  admin: { id: string; name: string; email: string }
  etablissement: { id: string; nom: string; ville: string | null; actif: boolean }
}

interface AuthorizedEtablissement {
  id: string
  nom: string
  type: string | null
  ville: string | null
  pays: string | null
  email: string | null
  telephone: string | null
  actif: boolean
  access: {
    id: string
    motif: string
    dateDebut: string | null
    dateFin: string | null
    commentaire: string | null
    createdAt: string
  }
}

interface EtablissementOption {
  id: string
  nom: string
  ville: string | null
  type: string | null
  actif: boolean
  _count: { filieres: number; users: number }
}

// ─── Utility functions ───

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case 'EN_ATTENTE':
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
          <Clock className="h-3 w-3 mr-1" />
          En attente
        </Badge>
      )
    case 'APPROUVE':
      return (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Approuvé
        </Badge>
      )
    case 'REFUSE':
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">
          <X className="h-3 w-3 mr-1" />
          Refusé
        </Badge>
      )
    case 'EXPIRE':
      return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
          <AlertCircle className="h-3 w-3 mr-1" />
          Expiré
        </Badge>
      )
    default:
      return <Badge variant="outline">{statut}</Badge>
  }
}

function getMotifLabel(motif: string) {
  switch (motif) {
    case 'Audit':
      return 'Audit'
    case 'Support technique':
      return 'Support technique'
    case 'Inspection':
      return 'Inspection'
    case 'Urgence':
      return 'Urgence'
    default:
      return motif
  }
}

// ─── Main Component ───

export function AccesEtablissementsPage() {
  const { user } = useAuthStore()

  // ─── Data state ───
  const [accessRecords, setAccessRecords] = useState<AccessRecord[]>([])
  const [authorizedEtablissements, setAuthorizedEtablissements] = useState<AuthorizedEtablissement[]>([])
  const [etablissements, setEtablissements] = useState<EtablissementOption[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // ─── Dialog state ───
  const [cancelTarget, setCancelTarget] = useState<AccessRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('mes-autorisations')

  // ─── Form state ───
  const [formEtablissementId, setFormEtablissementId] = useState('')
  const [formMotif, setFormMotif] = useState('')
  const [formDateDebut, setFormDateDebut] = useState('')
  const [formDateFin, setFormDateFin] = useState('')
  const [formCommentaire, setFormCommentaire] = useState('')

  // ─── Fetch data ───
  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const [accessRes, authorizedRes, etabRes] = await Promise.all([
        fetch(`/api/etablissement-access?adminId=${user.id}`),
        fetch(`/api/etablissement-access/authorized-etablissements?adminId=${user.id}`),
        fetch('/api/etablissements'),
      ])

      if (accessRes.ok) {
        const data = await accessRes.json()
        setAccessRecords(data.accessRecords ?? [])
      }
      if (authorizedRes.ok) {
        const data = await authorizedRes.json()
        setAuthorizedEtablissements(data.etablissements ?? [])
      }
      if (etabRes.ok) {
        const data = await etabRes.json()
        setEtablissements(
          (data.etablissements ?? []).map((e: EtablissementOption) => ({
            id: e.id,
            nom: e.nom,
            ville: e.ville,
            type: e.type,
            actif: e.actif,
            _count: e._count ?? { filieres: 0, users: 0 },
          }))
        )
      }
    } catch {
      // Silent
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Stats ───
  const approuveCount = accessRecords.filter((r) => r.statut === 'APPROUVE').length
  const enAttenteCount = accessRecords.filter((r) => r.statut === 'EN_ATTENTE').length
  const expireCount = accessRecords.filter((r) => r.statut === 'EXPIRE').length
  const activeEtablissementsCount = etablissements.filter((e) => e.actif).length

  // ─── Available establishments for the form ───
  // Only show establishments where admin doesn't already have APPROUVE or EN_ATTENTE access
  const unavailableEtabIds = new Set(
    accessRecords
      .filter((r) => r.statut === 'APPROUVE' || r.statut === 'EN_ATTENTE')
      .map((r) => r.etablissementId)
  )
  const availableEtablissements = etablissements.filter(
    (e) => e.actif && !unavailableEtabIds.has(e.id)
  )

  // ─── Cancel access request ───
  const handleCancelRequest = async () => {
    if (!cancelTarget) return
    try {
      const res = await fetch(`/api/etablissement-access/${cancelTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'annulation')
      }
      toast.success('Demande annulée', {
        description: `La demande d'accès à ${cancelTarget.etablissement.nom} a été annulée.`,
      })
      setCancelTarget(null)
      await fetchData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible d\'annuler la demande.',
      })
    }
  }

  // ─── Submit access request ───
  const handleSubmitRequest = async () => {
    if (!formEtablissementId || !formMotif || !user?.id) {
      toast.error('Champs manquants', {
        description: 'L\'établissement et le motif sont obligatoires.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/etablissement-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: user.id,
          etablissementId: formEtablissementId,
          motif: formMotif,
          dateDebut: formDateDebut || null,
          dateFin: formDateFin || null,
          commentaire: formCommentaire || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la création')
      }
      toast.success('Demande envoyée', {
        description: 'Votre demande d\'accès a été soumise avec succès.',
      })
      // Reset form
      setFormEtablissementId('')
      setFormMotif('')
      setFormDateDebut('')
      setFormDateFin('')
      setFormCommentaire('')
      setActiveTab('mes-autorisations')
      await fetchData()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Renew / Relancer (create new request for expired/refused) ───
  const handleRenew = (record: AccessRecord) => {
    // Pre-fill the form with the same etablissement and motif
    setFormEtablissementId(record.etablissementId)
    setFormMotif(record.motif)
    setFormDateDebut('')
    setFormDateFin('')
    setFormCommentaire('')
    setActiveTab('demander-acces')
    toast.info('Renouvellement', {
      description: `Formulaire pré-rempli pour ${record.etablissement.nom}.`,
    })
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <KeyRound className="h-7 w-7 text-emerald-600" />
          Accès aux Établissements
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gérez vos autorisations d&apos;accès aux données des établissements
        </p>
      </div>

      {/* ─── Notice box ─── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Confidentialité des données</p>
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              En tant que propriétaire de la plateforme, vous ne pouvez pas accéder aux données
              d&apos;un établissement sans autorisation explicite. Ce mécanisme garantit la
              confidentialité des données de chaque établissement client.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Stats Row ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Autorisations actives</p>
              <p className="text-xl font-bold">{approuveCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">En attente</p>
              <p className="text-xl font-bold">{enAttenteCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <AlertCircle className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expirées</p>
              <p className="text-xl font-bold">{expireCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/40">
              <Building2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Établissements disponibles</p>
              <p className="text-xl font-bold">{activeEtablissementsCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Main content with Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="mes-autorisations" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Mes autorisations
          </TabsTrigger>
          <TabsTrigger value="demander-acces" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Demander un accès
          </TabsTrigger>
          <TabsTrigger value="etablissements-autorises" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Établissements autorisés
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Mes autorisations ─── */}
        <TabsContent value="mes-autorisations">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : accessRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                <KeyRound className="h-10 w-10 text-emerald-500 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucune autorisation</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez encore demandé accès à aucun établissement.
              </p>
              <Button
                className="mt-6 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setActiveTab('demander-acces')}
              >
                <Plus className="h-4 w-4" />
                Demander un accès
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Établissement</TableHead>
                      <TableHead>Motif</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Date début</TableHead>
                      <TableHead>Date fin</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accessRecords.map((record) => (
                      <TableRow key={record.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                              {record.etablissement.nom.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{record.etablissement.nom}</p>
                              {record.etablissement.ville && (
                                <p className="text-xs text-muted-foreground">
                                  {record.etablissement.ville}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{getMotifLabel(record.motif)}</span>
                        </TableCell>
                        <TableCell>{getStatutBadge(record.statut)}</TableCell>
                        <TableCell className="text-sm">{formatDate(record.dateDebut)}</TableCell>
                        <TableCell className="text-sm">{formatDate(record.dateFin)}</TableCell>
                        <TableCell className="text-right">
                          {record.statut === 'EN_ATTENTE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                              onClick={() => setCancelTarget(record)}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Annuler
                            </Button>
                          )}
                          {record.statut === 'APPROUVE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                              onClick={() =>
                                toast.info('Navigation', {
                                  description: `Accès aux données de ${record.etablissement.nom} (à venir).`,
                                })
                              }
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Voir l&apos;établissement
                            </Button>
                          )}
                          {record.statut === 'EXPIRE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
                              onClick={() => handleRenew(record)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Renouveler
                            </Button>
                          )}
                          {record.statut === 'REFUSE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950"
                              onClick={() => handleRenew(record)}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Relancer
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 2: Demander un accès ─── */}
        <TabsContent value="demander-acces">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Send className="h-5 w-5 text-teal-600" />
                Demander un accès
              </CardTitle>
              <CardDescription>
                Remplissez le formulaire pour demander l&apos;accès aux données d&apos;un
                établissement. Votre demande sera examinée par le responsable de
                l&apos;établissement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableEtablissements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/30">
                    <Building2 className="h-8 w-8 text-teal-500 dark:text-teal-400" />
                  </div>
                  <h3 className="mt-4 font-semibold">Aucun établissement disponible</h3>
                  <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                    Vous avez déjà demandé ou obtenu l&apos;accès à tous les établissements actifs.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Établissement */}
                  <div className="space-y-2">
                    <Label htmlFor="access-etab">Établissement *</Label>
                    <Select
                      value={formEtablissementId}
                      onValueChange={setFormEtablissementId}
                    >
                      <SelectTrigger id="access-etab">
                        <SelectValue placeholder="Sélectionner un établissement" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableEtablissements.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.nom}
                            {e.ville ? ` — ${e.ville}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Motif */}
                  <div className="space-y-2">
                    <Label htmlFor="access-motif">Motif *</Label>
                    <Select value={formMotif} onValueChange={setFormMotif}>
                      <SelectTrigger id="access-motif">
                        <SelectValue placeholder="Sélectionner un motif" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Audit">Audit</SelectItem>
                        <SelectItem value="Support technique">Support technique</SelectItem>
                        <SelectItem value="Inspection">Inspection</SelectItem>
                        <SelectItem value="Urgence">Urgence</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date range */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="access-date-debut">Date début (optionnel)</Label>
                      <Input
                        id="access-date-debut"
                        type="date"
                        value={formDateDebut}
                        onChange={(e) => setFormDateDebut(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="access-date-fin">Date fin (optionnel)</Label>
                      <Input
                        id="access-date-fin"
                        type="date"
                        value={formDateFin}
                        onChange={(e) => setFormDateFin(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Commentaire */}
                  <div className="space-y-2">
                    <Label htmlFor="access-commentaire">Commentaire (optionnel)</Label>
                    <Textarea
                      id="access-commentaire"
                      placeholder="Précisez les raisons de votre demande..."
                      value={formCommentaire}
                      onChange={(e) => setFormCommentaire(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <Separator />

                  {/* Submit */}
                  <div className="flex justify-end">
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={handleSubmitRequest}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Envoi en cours...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Envoyer la demande
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 3: Établissements autorisés ─── */}
        <TabsContent value="etablissements-autorises">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6 space-y-3">
                    <div className="h-5 w-32 rounded bg-muted" />
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-4 w-full rounded bg-muted" />
                    <div className="h-4 w-20 rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : authorizedEtablissements.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/30">
                <ShieldCheck className="h-10 w-10 text-teal-500 dark:text-teal-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Aucun accès autorisé</h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Vous n&apos;avez pas encore d&apos;autorisation d&apos;accès approuvée.
              </p>
              <Button
                className="mt-6 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setActiveTab('demander-acces')}
              >
                <Plus className="h-4 w-4" />
                Demander un accès
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {authorizedEtablissements.map((etab) => {
                // Find matching etablissement data for counts
                const etabData = etablissements.find((e) => e.id === etab.id)
                const nbUsers = etabData?._count?.users ?? 0
                const nbFilieres = etabData?._count?.filieres ?? 0

                return (
                  <Card
                    key={etab.id}
                    className="transition-shadow hover:shadow-md border-t-4 border-t-emerald-500"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                            {etab.nom.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <CardTitle className="text-base">{etab.nom}</CardTitle>
                            {etab.ville && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3" />
                                {etab.ville}
                              </p>
                            )}
                          </div>
                        </div>
                        {etab.type && (
                          <Badge variant="outline" className="text-xs">
                            {etab.type}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Stats row */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {nbUsers} utilisateur{nbUsers > 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <GraduationCap className="h-3.5 w-3.5" />
                          {nbFilieres} filière{nbFilieres > 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Subscription info */}
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                        <Badge
                          className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800 text-xs"
                        >
                          Abonné
                        </Badge>
                      </div>

                      {/* Access expiration */}
                      {etab.access.dateFin && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>
                            Accès jusqu&apos;au {formatDate(etab.access.dateFin)}
                          </span>
                        </div>
                      )}

                      {/* Data visibility badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800 text-[10px]"
                        >
                          <FileText className="h-2.5 w-2.5 mr-1" />
                          Données utilisateurs
                        </Badge>
                        <Badge
                          className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800 text-[10px]"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                          Évaluations
                        </Badge>
                        <Badge
                          className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 text-[10px]"
                        >
                          <BarChart3Icon className="h-2.5 w-2.5 mr-1" />
                          Résultats
                        </Badge>
                      </div>

                      {/* Access button */}
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 mt-2"
                        size="sm"
                        onClick={() =>
                          toast.info('Accès aux données', {
                            description: `Accès aux données de ${etab.nom} (à venir).`,
                          })
                        }
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Accéder aux données
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Cancel Confirmation Dialog ─── */}
      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la demande</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir annuler votre demande d&apos;accès à{' '}
              <strong>{cancelTarget?.etablissement.nom}</strong> ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Non, garder la demande</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleCancelRequest}
            >
              Oui, annuler
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Small icon helper to avoid naming conflict ───
function BarChart3Icon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  )
}
