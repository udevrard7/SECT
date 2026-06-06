'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Settings,
  Save,
  Shield,
  Building2,
  Eye,
  Lock,
  AlertTriangle,
  ClipboardCheck,
  MonitorSmartphone,
  MousePointerClick,
  Printer,
  UserCheck,
  Timer,
  AppWindow,
  BellRing,
  Send,
  FileSearch,
  BarChart3,
  Loader2,
  CheckCircle2,
  XCircle,
  Camera,
  Globe,
  Phone,
  Mail,
  MapPin,
  Hash,
  Plus,
  Trash2,
  Wifi,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useAuthStore, getAuthHeaders } from '@/stores/auth-store'

// ─── Types ───

interface EtablissementInfo {
  id: string
  nom: string
  type: string | null
  ville: string | null
  pays: string | null
  adresse: string | null
  telephone: string | null
  email: string | null
  siteWeb: string | null
  formatMatricule: string | null
  exempleMatricule: string | null
  regexMatricule: string | null
  actif: boolean
  _count?: { filieres: number; users: number }
}

interface SecuritySettings {
  id: string
  etablissementId: string
  proctoringActif: boolean
  detectionCopie: boolean
  detectionOnglet: boolean
  detectionFullscreen: boolean
  captureEcran: boolean
  blocageCopie: boolean
  blocageClicDroit: boolean
  blocageImpression: boolean
  verificationIdentite: boolean
  tempsInactiviteMax: number
  nbOngletsMax: number
  nbAlertesMax: number
  autoSubmitOnViolation: boolean
  rapportFraude: boolean
  seuilSimilarite: number
  penaliteFullscreenExit: number
  fullscreenObligatoire: boolean
  intervalleCaptureEcran: number
}

interface IpWhitelistEntry {
  id: string
  adresseIp: string
  description: string | null
  etablissementId: string | null
  actif: boolean
  createdAt: string
}

// ─── Toggle Row Component ───

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  icon: Icon,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors ${checked ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20' : 'border-border'} ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${checked ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
            {label}
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  )
}

// ─── Slider Row Component ───

function SliderRow({
  id,
  label,
  description,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  formatValue,
  icon: Icon,
}: {
  id: string
  label: string
  description: string
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step?: number
  formatValue?: (value: number) => string
  icon: React.ComponentType<{ className?: string }>
}) {
  const displayValue = formatValue ? formatValue(value) : String(value)

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id} className="text-sm font-medium">
              {label}
            </Label>
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 font-mono text-xs">
              {displayValue}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        </div>
      </div>
      <Slider
        id={id}
        value={[value]}
        onValueChange={([val]) => onValueChange(val)}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatValue ? formatValue(min) : min}</span>
        <span>{formatValue ? formatValue(max) : max}</span>
      </div>
    </div>
  )
}

// ─── Main Component ───

export function ResponsableParametresPage() {
  const { user } = useAuthStore()

  // Data state
  const [etablissement, setEtablissement] = useState<EtablissementInfo | null>(null)
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null)
  const [ipEntries, setIpEntries] = useState<IpWhitelistEntry[]>([])

  // Loading states
  const [loadingEtab, setLoadingEtab] = useState(true)
  const [loadingSecurity, setLoadingSecurity] = useState(false)
  const [loadingIp, setLoadingIp] = useState(false)
  const [savingEtab, setSavingEtab] = useState(false)
  const [savingSecurity, setSavingSecurity] = useState(false)

  // IP form state
  const [newIp, setNewIp] = useState('')
  const [newIpDesc, setNewIpDesc] = useState('')
  const [addingIp, setAddingIp] = useState(false)

  // ─── Fetch etablissement info ───

  const fetchEtablissement = useCallback(async () => {
    if (!user?.etablissementId) return
    setLoadingEtab(true)
    try {
      const res = await fetch(`/api/etablissements/${user.etablissementId}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Erreur réseau')
      const data = await res.json()
      setEtablissement(data.etablissement)
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger les informations de l\'établissement' })
    } finally {
      setLoadingEtab(false)
    }
  }, [user?.etablissementId])

  // ─── Fetch security settings ───

  const fetchSecuritySettings = useCallback(async () => {
    if (!user?.etablissementId) return
    setLoadingSecurity(true)
    try {
      const res = await fetch(`/api/security-settings/etablissement/${user.etablissementId}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Erreur réseau')
      const data = await res.json()
      setSecuritySettings(data.securitySettings)
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger les paramètres de sécurité' })
    } finally {
      setLoadingSecurity(false)
    }
  }, [user?.etablissementId])

  // ─── Fetch IP whitelist ───

  const fetchIpWhitelist = useCallback(async () => {
    if (!user?.etablissementId) return
    setLoadingIp(true)
    try {
      const res = await fetch(`/api/ip-whitelist?etablissementId=${user.etablissementId}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Erreur réseau')
      const data = await res.json()
      setIpEntries(data.entries || [])
    } catch {
      toast.error('Erreur', { description: 'Impossible de charger la liste blanche IP' })
    } finally {
      setLoadingIp(false)
    }
  }, [user?.etablissementId])

  useEffect(() => {
    fetchEtablissement()
  }, [fetchEtablissement])

  // ─── Save etablissement info ───

  const handleSaveEtablissement = async () => {
    if (!etablissement || !user?.etablissementId) return
    setSavingEtab(true)
    try {
      const res = await fetch(`/api/etablissements/${user.etablissementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          nom: etablissement.nom,
          type: etablissement.type,
          ville: etablissement.ville,
          adresse: etablissement.adresse,
          telephone: etablissement.telephone,
          email: etablissement.email,
          siteWeb: etablissement.siteWeb,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la sauvegarde')
      }
      toast.success('Établissement mis à jour', {
        description: 'Les informations de l\'établissement ont été sauvegardées.',
      })
    } catch (err) {
      toast.error('Erreur de sauvegarde', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setSavingEtab(false)
    }
  }

  // ─── Save matricule format ───

  const handleSaveMatricule = async () => {
    if (!etablissement || !user?.etablissementId) return
    setSavingEtab(true)
    try {
      const res = await fetch(`/api/etablissements/${user.etablissementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          formatMatricule: etablissement.formatMatricule,
          exempleMatricule: etablissement.exempleMatricule,
          regexMatricule: etablissement.regexMatricule,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la sauvegarde')
      }
      toast.success('Format matricule mis à jour', {
        description: 'Le format de matricule a été sauvegardé.',
      })
    } catch (err) {
      toast.error('Erreur de sauvegarde', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setSavingEtab(false)
    }
  }

  // ─── Update security field ───

  const updateSecurityField = <K extends keyof SecuritySettings>(key: K, value: SecuritySettings[K]) => {
    if (!securitySettings) return
    setSecuritySettings({ ...securitySettings, [key]: value })
  }

  // ─── Save security settings ───

  const handleSaveSecurity = async () => {
    if (!securitySettings) return
    setSavingSecurity(true)
    try {
      const res = await fetch(`/api/security-settings/${securitySettings.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          proctoringActif: securitySettings.proctoringActif,
          detectionCopie: securitySettings.detectionCopie,
          detectionOnglet: securitySettings.detectionOnglet,
          detectionFullscreen: securitySettings.detectionFullscreen,
          captureEcran: securitySettings.captureEcran,
          blocageCopie: securitySettings.blocageCopie,
          blocageClicDroit: securitySettings.blocageClicDroit,
          blocageImpression: securitySettings.blocageImpression,
          verificationIdentite: securitySettings.verificationIdentite,
          tempsInactiviteMax: securitySettings.tempsInactiviteMax,
          nbOngletsMax: securitySettings.nbOngletsMax,
          nbAlertesMax: securitySettings.nbAlertesMax,
          autoSubmitOnViolation: securitySettings.autoSubmitOnViolation,
          rapportFraude: securitySettings.rapportFraude,
          seuilSimilarite: securitySettings.seuilSimilarite,
          penaliteFullscreenExit: securitySettings.penaliteFullscreenExit,
          fullscreenObligatoire: securitySettings.fullscreenObligatoire,
          intervalleCaptureEcran: securitySettings.intervalleCaptureEcran,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la sauvegarde')
      }
      toast.success('Sécurité mise à jour', {
        description: 'Les paramètres de sécurité ont été sauvegardés.',
      })
    } catch (err) {
      toast.error('Erreur de sauvegarde', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setSavingSecurity(false)
    }
  }

  // ─── Add IP to whitelist ───

  const handleAddIp = async () => {
    if (!newIp.trim() || !user?.etablissementId) return
    setAddingIp(true)
    try {
      const res = await fetch('/api/ip-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          adresseIp: newIp.trim(),
          description: newIpDesc.trim() || null,
          etablissementId: user.etablissementId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'ajout')
      }
      toast.success('Adresse IP ajoutée', {
        description: `${newIp} a été ajouté à la liste blanche.`,
      })
      setNewIp('')
      setNewIpDesc('')
      fetchIpWhitelist()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setAddingIp(false)
    }
  }

  // ─── Toggle IP active ───

  const handleToggleIp = async (entryId: string, currentActif: boolean) => {
    try {
      const res = await fetch(`/api/ip-whitelist/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ actif: !currentActif }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(currentActif ? 'Adresse IP désactivée' : 'Adresse IP activée')
      fetchIpWhitelist()
    } catch {
      toast.error('Erreur', { description: 'Impossible de modifier l\'entrée' })
    }
  }

  // ─── Delete IP ───

  const handleDeleteIp = async (entryId: string, ip: string) => {
    try {
      const res = await fetch(`/api/ip-whitelist/${entryId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Adresse IP retirée', { description: `${ip} a été supprimé de la liste blanche.` })
      fetchIpWhitelist()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer l\'entrée' })
    }
  }

  // ─── Loading state ───

  if (loadingEtab) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!etablissement) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Aucun établissement</CardTitle>
            <CardDescription>
              Votre compte n&apos;est pas associé à un établissement. Contactez un administrateur.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ─── Header ─── */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Settings className="h-7 w-7 text-amber-600" />
            Paramètres de l&apos;établissement
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configurez les informations, la sécurité et les préférences de <span className="font-medium text-foreground">{etablissement.nom}</span>
          </p>
        </div>

        {/* ─── Tabs ─── */}
        <Tabs defaultValue="etablissement" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="etablissement" className="gap-1.5">
              <Building2 className="h-4 w-4 hidden sm:block" />
              Établissement
            </TabsTrigger>
            <TabsTrigger value="securite" className="gap-1.5">
              <Shield className="h-4 w-4 hidden sm:block" />
              Sécurité
            </TabsTrigger>
            <TabsTrigger value="matricule" className="gap-1.5">
              <Hash className="h-4 w-4 hidden sm:block" />
              Matricule
            </TabsTrigger>
            <TabsTrigger value="ip-whitelist" className="gap-1.5">
              <Wifi className="h-4 w-4 hidden sm:block" />
              Whitelist IP
            </TabsTrigger>
          </TabsList>

          {/* ═══════════ Tab: Établissement ═══════════ */}
          <TabsContent value="etablissement">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-amber-600" />
                  Informations de l&apos;établissement
                </CardTitle>
                <CardDescription>
                  Les informations de contact et les coordonnées de votre établissement
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="etab-nom" className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      Nom de l&apos;établissement
                    </Label>
                    <Input
                      id="etab-nom"
                      value={etablissement.nom}
                      onChange={(e) => setEtablissement({ ...etablissement, nom: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="etab-type" className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      Type d&apos;établissement
                    </Label>
                    <Select
                      value={etablissement.type || ''}
                      onValueChange={(val) => setEtablissement({ ...etablissement, type: val })}
                    >
                      <SelectTrigger id="etab-type">
                        <SelectValue placeholder="Sélectionner un type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Université">Université</SelectItem>
                        <SelectItem value="Grande École">Grande École</SelectItem>
                        <SelectItem value="Institut">Institut</SelectItem>
                        <SelectItem value="École d'Ingénieurs">École d&apos;Ingénieurs</SelectItem>
                        <SelectItem value="École de Commerce">École de Commerce</SelectItem>
                        <SelectItem value="IUT">IUT</SelectItem>
                        <SelectItem value="BTS">BTS</SelectItem>
                        <SelectItem value="Lycée">Lycée</SelectItem>
                        <SelectItem value="Autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="etab-ville" className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      Ville
                    </Label>
                    <Input
                      id="etab-ville"
                      value={etablissement.ville || ''}
                      onChange={(e) => setEtablissement({ ...etablissement, ville: e.target.value })}
                      placeholder="Ex: Paris"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="etab-adresse" className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      Adresse
                    </Label>
                    <Input
                      id="etab-adresse"
                      value={etablissement.adresse || ''}
                      onChange={(e) => setEtablissement({ ...etablissement, adresse: e.target.value })}
                      placeholder="12 rue Exemple, 75001 Paris"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="etab-telephone" className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      Téléphone
                    </Label>
                    <Input
                      id="etab-telephone"
                      value={etablissement.telephone || ''}
                      onChange={(e) => setEtablissement({ ...etablissement, telephone: e.target.value })}
                      placeholder="+33 1 23 45 67 89"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="etab-email" className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      Email de contact
                    </Label>
                    <Input
                      id="etab-email"
                      type="email"
                      value={etablissement.email || ''}
                      onChange={(e) => setEtablissement({ ...etablissement, email: e.target.value })}
                      placeholder="contact@etablissement.fr"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="etab-site" className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    Site web
                  </Label>
                  <Input
                    id="etab-site"
                    value={etablissement.siteWeb || ''}
                    onChange={(e) => setEtablissement({ ...etablissement, siteWeb: e.target.value })}
                    placeholder="https://www.etablissement.fr"
                  />
                </div>

                <Separator />

                {/* Stats summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4 bg-amber-50/50 dark:bg-amber-950/20">
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                      {etablissement._count?.filieres ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Filières</p>
                  </div>
                  <div className="rounded-lg border p-4 bg-amber-50/50 dark:bg-amber-950/20">
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                      {etablissement._count?.users ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Utilisateurs</p>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-end">
                  <Button
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={handleSaveEtablissement}
                    disabled={savingEtab}
                  >
                    {savingEtab && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Sauvegarder
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ Tab: Sécurité & Surveillance ═══════════ */}
          <TabsContent value="securite">
            {loadingSecurity ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
                <span className="ml-3 text-sm text-muted-foreground">Chargement des paramètres de sécurité...</span>
              </div>
            ) : !securitySettings ? (
              <div className="flex justify-center py-4">
                <Button
                  onClick={fetchSecuritySettings}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  Charger les paramètres de sécurité
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Section A: Surveillance & Détection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
                        <Eye className="h-4 w-4" />
                      </div>
                      Surveillance & Détection
                    </CardTitle>
                    <CardDescription>
                      Activez les mécanismes de surveillance et de détection de comportement suspect
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ToggleRow
                      id="proctoring-actif"
                      label="Proctoring actif"
                      description="Active la surveillance vidéo et le suivi en temps réel des candidats pendant les évaluations"
                      checked={securitySettings.proctoringActif}
                      onCheckedChange={(v) => updateSecurityField('proctoringActif', v)}
                      icon={MonitorSmartphone}
                    />
                    <ToggleRow
                      id="detection-copie"
                      label="Détection de copier/coller"
                      description="Détecte les tentatives de copier/coller pendant l'évaluation et les signale comme alerte"
                      checked={securitySettings.detectionCopie}
                      onCheckedChange={(v) => updateSecurityField('detectionCopie', v)}
                      icon={ClipboardCheck}
                    />
                    <ToggleRow
                      id="detection-onglet"
                      label="Détection de changement d'onglet"
                      description="Surveille les changements d'onglet ou de fenêtre du navigateur pendant l'évaluation"
                      checked={securitySettings.detectionOnglet}
                      onCheckedChange={(v) => updateSecurityField('detectionOnglet', v)}
                      icon={AppWindow}
                    />
                    <ToggleRow
                      id="detection-fullscreen"
                      label="Détection de sortie plein écran"
                      description="Détecte si le candidat quitte le mode plein écran imposé pendant l'évaluation"
                      checked={securitySettings.detectionFullscreen}
                      onCheckedChange={(v) => updateSecurityField('detectionFullscreen', v)}
                      icon={MonitorSmartphone}
                    />
                    {securitySettings.detectionFullscreen && (
                      <>
                        <ToggleRow
                          id="fullscreen-obligatoire"
                          label="Plein écran obligatoire"
                          description="Bloque l'épreuve si l'étudiant n'est pas en plein écran"
                          checked={securitySettings.fullscreenObligatoire}
                          onCheckedChange={(v) => updateSecurityField('fullscreenObligatoire', v)}
                          icon={MonitorSmartphone}
                        />
                        <SliderRow
                          id="penalite-fullscreen-exit"
                          label="Pénalité par sortie plein écran"
                          description="Points retirés à la note de l'étudiant à chaque sortie du plein écran"
                          value={securitySettings.penaliteFullscreenExit}
                          onValueChange={(v) => updateSecurityField('penaliteFullscreenExit', v)}
                          min={0}
                          max={10}
                          step={1}
                          formatValue={(v) => `-${v} pts`}
                          icon={AlertTriangle}
                        />
                      </>
                    )}
                    <ToggleRow
                      id="capture-ecran"
                      label="Capture d'écran périodique"
                      description="Effectue des captures d'écran automatiques à intervalle régulier pendant l'évaluation"
                      checked={securitySettings.captureEcran}
                      onCheckedChange={(v) => updateSecurityField('captureEcran', v)}
                      icon={Camera}
                    />
                    {securitySettings.captureEcran && (
                      <SliderRow
                        id="intervalle-capture-ecran"
                        label="Intervalle des captures"
                        description="Fréquence des captures d'écran automatiques en secondes"
                        value={securitySettings.intervalleCaptureEcran}
                        onValueChange={(v) => updateSecurityField('intervalleCaptureEcran', v)}
                        min={30}
                        max={300}
                        step={10}
                        formatValue={(v) => `${v}s`}
                        icon={Timer}
                      />
                    )}
                  </CardContent>
                </Card>

                {/* Section B: Blocage & Protection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-900/50 dark:text-teal-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      Blocage & Protection
                    </CardTitle>
                    <CardDescription>
                      Bloquez les actions non autorisées pour sécuriser le déroulement des évaluations
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ToggleRow
                      id="blocage-copie"
                      label="Blocage du copier/coller"
                      description="Empêche complètement les opérations de copier, couper et coller dans la page d'évaluation"
                      checked={securitySettings.blocageCopie}
                      onCheckedChange={(v) => updateSecurityField('blocageCopie', v)}
                      icon={ClipboardCheck}
                    />
                    <ToggleRow
                      id="blocage-clic-droit"
                      label="Blocage du clic droit"
                      description="Désactive le menu contextuel du clic droit pour empêcher l'inspection et la copie"
                      checked={securitySettings.blocageClicDroit}
                      onCheckedChange={(v) => updateSecurityField('blocageClicDroit', v)}
                      icon={MousePointerClick}
                    />
                    <ToggleRow
                      id="blocage-impression"
                      label="Blocage de l'impression écran"
                      description="Bloque les touches d'impression écran (PrtScn) et les raccourcis de capture système"
                      checked={securitySettings.blocageImpression}
                      onCheckedChange={(v) => updateSecurityField('blocageImpression', v)}
                      icon={Printer}
                    />
                    <ToggleRow
                      id="verification-identite"
                      label="Vérification d'identité"
                      description="Exige une vérification d'identité (photo ou pièce d'identité) avant le début de l'évaluation"
                      checked={securitySettings.verificationIdentite}
                      onCheckedChange={(v) => updateSecurityField('verificationIdentite', v)}
                      icon={UserCheck}
                    />
                  </CardContent>
                </Card>

                {/* Section C: Seuils & Alertes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400">
                        <BellRing className="h-4 w-4" />
                      </div>
                      Seuils & Alertes
                    </CardTitle>
                    <CardDescription>
                      Configurez les seuils de tolérance et les actions automatiques en cas de violation
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <SliderRow
                      id="temps-inactivite-max"
                      label="Temps d'inactivité max"
                      description="Durée maximale d'inactivité avant déclenchement d'une alerte (en secondes)"
                      value={securitySettings.tempsInactiviteMax}
                      onValueChange={(v) => updateSecurityField('tempsInactiviteMax', v)}
                      min={30}
                      max={300}
                      step={10}
                      formatValue={(v) => `${v}s`}
                      icon={Timer}
                    />
                    <SliderRow
                      id="nb-onglets-max"
                      label="Nb changements onglet max"
                      description="Nombre maximal de changements d'onglet autorisés avant déclenchement d'une alerte"
                      value={securitySettings.nbOngletsMax}
                      onValueChange={(v) => updateSecurityField('nbOngletsMax', v)}
                      min={1}
                      max={10}
                      step={1}
                      icon={AppWindow}
                    />
                    <SliderRow
                      id="nb-alertes-max"
                      label="Nb alertes max avant soumission auto"
                      description="Nombre d'alertes cumulées déclenchant la soumission automatique de l'évaluation"
                      value={securitySettings.nbAlertesMax}
                      onValueChange={(v) => updateSecurityField('nbAlertesMax', v)}
                      min={1}
                      max={15}
                      step={1}
                      icon={AlertTriangle}
                    />
                    <ToggleRow
                      id="auto-submit-violation"
                      label="Soumission automatique en cas de violation"
                      description="Soumet automatiquement l'évaluation lorsque le nombre maximal d'alertes est atteint"
                      checked={securitySettings.autoSubmitOnViolation}
                      onCheckedChange={(v) => updateSecurityField('autoSubmitOnViolation', v)}
                      icon={Send}
                    />
                  </CardContent>
                </Card>

                {/* Section D: Analyse & Rapports */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600 dark:bg-cyan-900/50 dark:text-cyan-400">
                        <BarChart3 className="h-4 w-4" />
                      </div>
                      Analyse & Rapports
                    </CardTitle>
                    <CardDescription>
                      Paramètres d&apos;analyse de similarité et de génération de rapports de fraude
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ToggleRow
                      id="rapport-fraude"
                      label="Rapport de fraude"
                      description="Génère un rapport détaillé des comportements suspects pour chaque session d'évaluation"
                      checked={securitySettings.rapportFraude}
                      onCheckedChange={(v) => updateSecurityField('rapportFraude', v)}
                      icon={FileSearch}
                    />
                    <SliderRow
                      id="seuil-similarite"
                      label="Seuil de similarité"
                      description="Seuil de similarité pour la détection de copie entre les réponses des étudiants"
                      value={securitySettings.seuilSimilarite}
                      onValueChange={(v) => updateSecurityField('seuilSimilarite', v)}
                      min={0.5}
                      max={1.0}
                      step={0.05}
                      formatValue={(v) => v.toFixed(2)}
                      icon={ClipboardCheck}
                    />
                    <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-800 dark:bg-cyan-950/30">
                      <h4 className="text-sm font-semibold text-cyan-800 dark:text-cyan-300 mb-2 flex items-center gap-2">
                        <FileSearch className="h-4 w-4" />
                        Interprétation du seuil
                      </h4>
                      <ul className="text-sm text-cyan-700 dark:text-cyan-400 space-y-1">
                        <li>• <strong>0.50 – 0.65</strong> : Tolérant — détecte les similarités évidentes uniquement</li>
                        <li>• <strong>0.70 – 0.85</strong> : Équilibré — bon compromis entre faux positifs et détection</li>
                        <li>• <strong>0.90 – 1.00</strong> : Strict — signale les réponses très similaires uniquement</li>
                      </ul>
                      <p className="mt-2 text-xs text-cyan-600 dark:text-cyan-500">
                        Seuil actuel : <strong>{securitySettings.seuilSimilarite.toFixed(2)}</strong> — {
                          securitySettings.seuilSimilarite < 0.7 ? 'Tolérant' :
                          securitySettings.seuilSimilarite < 0.9 ? 'Équilibré' : 'Strict'
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    className="bg-amber-600 hover:bg-amber-700 min-w-[180px]"
                    onClick={handleSaveSecurity}
                    disabled={savingSecurity}
                    size="lg"
                  >
                    {savingSecurity ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Sauvegarder
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ═══════════ Tab: Format Matricule ═══════════ */}
          <TabsContent value="matricule">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-amber-600" />
                  Format des matricules étudiants
                </CardTitle>
                <CardDescription>
                  Définissez le format, l&apos;exemple et la regex de validation des matricules pour votre établissement
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="mat-format">Format du matricule</Label>
                  <Input
                    id="mat-format"
                    value={etablissement.formatMatricule || ''}
                    onChange={(e) => setEtablissement({ ...etablissement, formatMatricule: e.target.value })}
                    placeholder="Ex: AAAA-NNNN (Année-Numéro)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Décrivez le format attendu du matricule (ex: AAAA-NNNN pour 2024-0001)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mat-exemple">Exemple de matricule</Label>
                  <Input
                    id="mat-exemple"
                    value={etablissement.exempleMatricule || ''}
                    onChange={(e) => setEtablissement({ ...etablissement, exempleMatricule: e.target.value })}
                    placeholder="Ex: 2024-0001"
                  />
                  <p className="text-xs text-muted-foreground">
                    Un exemple concret de matricule valide pour guider les étudiants
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mat-regex">Expression régulière (Regex)</Label>
                  <Input
                    id="mat-regex"
                    value={etablissement.regexMatricule || ''}
                    onChange={(e) => setEtablissement({ ...etablissement, regexMatricule: e.target.value })}
                    placeholder="Ex: ^\d{4}-\d{4}$"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Regex utilisée pour valider le format du matricule lors de l&apos;inscription des étudiants
                  </p>
                </div>

                {/* Preview */}
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    Aperçu de la configuration
                  </h4>
                  <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                    <li>• Format : <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded text-xs">{etablissement.formatMatricule || 'Non défini'}</code></li>
                    <li>• Exemple : <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded text-xs">{etablissement.exempleMatricule || 'Non défini'}</code></li>
                    <li>• Regex : <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded text-xs">{etablissement.regexMatricule || 'Non définie'}</code></li>
                  </ul>
                </div>

                <Separator />

                <div className="flex justify-end">
                  <Button
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={handleSaveMatricule}
                    disabled={savingEtab}
                  >
                    {savingEtab && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Sauvegarder
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ Tab: Whitelist IP ═══════════ */}
          <TabsContent value="ip-whitelist">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="h-5 w-5 text-amber-600" />
                    Liste blanche IP
                  </CardTitle>
                  <CardDescription>
                    Restreignez l&apos;accès aux évaluations de votre établissement à certaines adresses IP. Si la liste est vide, toutes les adresses IP sont autorisées.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Add IP form */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="new-ip">Adresse IP</Label>
                      <Input
                        id="new-ip"
                        value={newIp}
                        onChange={(e) => setNewIp(e.target.value)}
                        placeholder="192.168.1.0/24"
                        className="font-mono"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="new-ip-desc">Description</Label>
                      <Input
                        id="new-ip-desc"
                        value={newIpDesc}
                        onChange={(e) => setNewIpDesc(e.target.value)}
                        placeholder="Salle informatique Bâtiment A"
                      />
                    </div>
                    <Button
                      className="bg-amber-600 hover:bg-amber-700 shrink-0"
                      onClick={handleAddIp}
                      disabled={addingIp || !newIp.trim()}
                    >
                      {addingIp ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Ajouter
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* IP list */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Wifi className="h-5 w-5 text-amber-600" />
                    Adresses autorisées
                    <Badge variant="secondary" className="ml-2">{ipEntries.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingIp ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                      <span className="ml-2 text-sm text-muted-foreground">Chargement...</span>
                    </div>
                  ) : ipEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Wifi className="h-10 w-10 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Aucune restriction IP configurée. Toutes les adresses sont autorisées.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Ajoutez des adresses IP ci-dessus pour restreindre l&apos;accès.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Adresse IP</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-center">Statut</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ipEntries.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell className="font-mono text-sm">
                                {entry.adresseIp}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {entry.description || '—'}
                              </TableCell>
                              <TableCell className="text-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={() => handleToggleIp(entry.id, entry.actif)}>
                                      {entry.actif ? (
                                        <CheckCircle2 className="h-5 w-5 text-emerald-500 inline-block" />
                                      ) : (
                                        <XCircle className="h-5 w-5 text-muted-foreground/40 inline-block" />
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {entry.actif ? 'Cliquez pour désactiver' : 'Cliquez pour activer'}
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteIp(entry.id, entry.adresseIp)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}
