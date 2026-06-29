'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  Upload,
  ImageIcon,
  X,
  ChevronDown,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
import { PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'

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
  logo: string | null
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

interface EtablissementOption {
  id: string
  nom: string
}

// ─── Accent color helper ───

function getAccent(isAdmin: boolean) {
  return isAdmin
    ? {
        color: 'emerald',
        text: 'text-success-text',
        bg100: 'bg-success/10',
        bg50: 'bg-success/10',
        border200: 'border-success/30',
        text700: 'text-success-text',
        text800: 'text-success-text',
        btn: 'bg-success hover:bg-success/90',
        badge: 'bg-success/10 text-success-text',
        activeBorder: 'border-success/30',
        activeBg: 'bg-success/10',
        activeIconBg: 'bg-success/10 text-success-text',
        codeBg: 'bg-success/10',
        infoBorder: 'border-success/30',
        infoBg: 'bg-success/10',
        infoText: 'text-success-text',
        infoSubtext: 'text-success-text',
        infoSmall: 'text-success-text',
      }
    : {
        color: 'amber',
        text: 'text-warning',
        bg100: 'bg-warning/10',
        bg50: 'bg-warning/10',
        border200: 'border-warning/30',
        text700: 'text-warning',
        text800: 'text-warning',
        btn: 'bg-warning hover:bg-warning/90',
        badge: 'bg-warning/10 text-warning',
        activeBorder: 'border-warning/30',
        activeBg: 'bg-warning/10',
        activeIconBg: 'bg-warning/10 text-warning',
        codeBg: 'bg-warning/10',
        infoBorder: 'border-warning/30',
        infoBg: 'bg-warning/10',
        infoText: 'text-warning',
        infoSubtext: 'text-warning',
        infoSmall: 'text-warning',
      }
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
  accent,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
  accent: ReturnType<typeof getAccent>
}) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors ${checked ? `${accent.activeBorder} ${accent.activeBg}` : 'border-border'} ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${checked ? accent.activeIconBg : 'bg-muted text-muted-foreground'}`}>
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
  accent,
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
  accent: ReturnType<typeof getAccent>
}) {
  const displayValue = formatValue ? formatValue(value) : String(value)

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${accent.bg100} ${accent.text}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id} className="text-sm font-medium">
              {label}
            </Label>
            <Badge variant="secondary" className={`${accent.badge} font-mono text-xs`}>
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

// ─── Logo Upload Component ───

function LogoUpload({
  logo,
  etablissementId,
  accent,
  onLogoUpdate,
}: {
  logo: string | null
  etablissementId: string
  accent: ReturnType<typeof getAccent>
  onLogoUpdate: (logo: string | null) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFileSelect = async (file: File) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Format non supporté', { description: 'Utilisez PNG, JPG, WEBP ou SVG.' })
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Fichier trop volumineux', { description: 'La taille maximale est de 2 Mo.' })
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('etablissementId', etablissementId)
      const res = await fetch('/api/etablissements/upload-logo', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de l\'upload')
      }
      const data = await res.json()
      onLogoUpdate(data.logo || data.etablissement?.logo || null)
      toast.success('Logo mis à jour', { description: 'Le logo a été téléchargé avec succès.' })
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de télécharger le logo.',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDelete = async () => {
    setUploading(true)
    try {
      const res = await fetch(`/api/etablissements/${etablissementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo: null }),
      })
      if (!res.ok) throw new Error('Erreur')
      onLogoUpdate(null)
      toast.success('Logo supprimé', { description: 'Le logo a été retiré.' })
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer le logo.' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
        Logo de l&apos;établissement
      </Label>
      <div className="flex items-start gap-4">
        {/* Preview */}
        <div
          className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer overflow-hidden ${
            dragOver ? `${accent.activeBorder} ${accent.activeBg}` : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {logo ? (
            <img src={logo} alt="Logo" className="h-full w-full object-cover rounded-xl" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
              <Upload className="h-5 w-5" />
              <span className="text-[10px]">Clic/Glisser</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-xl">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted-foreground">
            Cliquez ou glissez-déposez une image. Formats acceptés : PNG, JPG, WEBP, SVG (max 2 Mo).
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Parcourir
            </Button>
            {logo && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={uploading}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Supprimer
              </Button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFileSelect(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ─── Main Component ───

export function ResponsableParametresPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'ADMIN'

  // Accent colors
  const accent = getAccent(isAdmin)
  const queryClient = useQueryClient()

  // Active etablissement ID (for ADMIN selector)
  const [activeEtabId, setActiveEtabId] = useState<string | null>(
    user?.etablissementId || null
  )

  // Data state (local for editable data — synced from queries via useEffect)
  const [etablissement, setEtablissement] = useState<EtablissementInfo | null>(null)
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null)

  // Saving states (local form state)
  const [savingEtab, setSavingEtab] = useState(false)
  const [savingSecurity, setSavingSecurity] = useState(false)

  // IP form state
  const [newIp, setNewIp] = useState('')
  const [newIpDesc, setNewIpDesc] = useState('')
  const [addingIp, setAddingIp] = useState(false)

  // Tab tracking
  const [activeTab, setActiveTab] = useState('etablissement')

  // BUGFIX QUERY-MIGRATION-GROUP-A : migration de useEffect+fetch+useState
  // vers TanStack Query. Le cache survit au démontage → 0 refetch au retour,
  // 0 skeleton, navigation instantanée. Les queries security/ip sont
  // lazy-loadées via `enabled` sur activeTab (équivalent des *LoadedRef).
  const etabOptionsQuery = useQuery<{ etablissements: EtablissementInfo[] }>({
    queryKey: ['etablissements'],
    queryFn: async () => {
      const res = await fetch('/api/etablissements')
      if (!res.ok) throw new Error('Failed to fetch etablissements')
      return res.json()
    },
    enabled: isAdmin,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const etabOptions = useMemo(
    () =>
      (etabOptionsQuery.data?.etablissements ?? []).map((e) => ({
        id: e.id,
        nom: e.nom,
      })),
    [etabOptionsQuery.data],
  )
  const loadingEtabOptions = etabOptionsQuery.isLoading

  // Toast sur erreur de chargement (admin selector).
  useEffect(() => {
    if (etabOptionsQuery.error) {
      toast.error('Erreur', { description: 'Impossible de charger la liste des établissements' })
    }
  }, [etabOptionsQuery.error])

  const etablissementQuery = useQuery<{ etablissement: EtablissementInfo }>({
    queryKey: ['responsable-etablissement', activeEtabId],
    queryFn: async () => {
      const res = await fetch(`/api/etablissements/${activeEtabId}`)
      if (!res.ok) throw new Error('Erreur réseau')
      return res.json()
    },
    enabled: !!activeEtabId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Sync query data → local state (préserve setEtablissement pour form editing).
  // Ne clear pas quand data est undefined (préserve stale data pendant loading,
  // comme le fetchEtablissement original qui ne clear pas sur activeEtabId null).
  useEffect(() => {
    if (etablissementQuery.data) {
      setEtablissement(etablissementQuery.data.etablissement)
    }
  }, [etablissementQuery.data])

  useEffect(() => {
    if (etablissementQuery.error) {
      toast.error('Erreur', { description: 'Impossible de charger les informations de l\'établissement' })
    }
  }, [etablissementQuery.error])

  const loadingEtab = etablissementQuery.isLoading

  const securityQuery = useQuery<{ securitySettings: SecuritySettings }>({
    queryKey: ['responsable-security-settings', activeEtabId],
    queryFn: async () => {
      const res = await fetch(`/api/security-settings/etablissement/${activeEtabId}`)
      if (!res.ok) throw new Error('Erreur réseau')
      return res.json()
    },
    enabled: !!activeEtabId && activeTab === 'securite',
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Sync query data → local state. Clear quand data est undefined
  // (évite d'afficher les settings d'un autre établissement).
  useEffect(() => {
    if (securityQuery.data) {
      setSecuritySettings(securityQuery.data.securitySettings)
    } else {
      setSecuritySettings(null)
    }
  }, [securityQuery.data])

  useEffect(() => {
    if (securityQuery.error) {
      toast.error('Erreur', { description: 'Impossible de charger les paramètres de sécurité' })
    }
  }, [securityQuery.error])

  const loadingSecurity = securityQuery.isFetching

  const ipQuery = useQuery<{ entries: IpWhitelistEntry[] }>({
    queryKey: ['responsable-ip-whitelist', activeEtabId],
    queryFn: async () => {
      const res = await fetch(`/api/ip-whitelist?etablissementId=${activeEtabId}`)
      if (!res.ok) throw new Error('Erreur réseau')
      return res.json()
    },
    enabled: !!activeEtabId && activeTab === 'ip-whitelist',
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const ipEntries = ipQuery.data?.entries ?? []
  const loadingIp = ipQuery.isFetching

  useEffect(() => {
    if (ipQuery.error) {
      toast.error('Erreur', { description: 'Impossible de charger la liste blanche IP' })
    }
  }, [ipQuery.error])

  // Helpers pour invalider le cache après mutation.
  const refreshSecuritySettings = () =>
    queryClient.invalidateQueries({ queryKey: ['responsable-security-settings', activeEtabId] })
  const refreshIpWhitelist = () =>
    queryClient.invalidateQueries({ queryKey: ['responsable-ip-whitelist', activeEtabId] })

  // ─── Save etablissement info ───

  const handleSaveEtablissement = async () => {
    if (!etablissement || !activeEtabId) return
    setSavingEtab(true)
    try {
      const body: Record<string, unknown> = {
        nom: etablissement.nom,
        type: etablissement.type,
        ville: etablissement.ville,
        adresse: etablissement.adresse,
        telephone: etablissement.telephone,
        email: etablissement.email,
        siteWeb: etablissement.siteWeb,
      }
      // Admin-only fields
      if (isAdmin) {
        body.pays = etablissement.pays
        body.actif = etablissement.actif
      }
      const res = await fetch(`/api/etablissements/${activeEtabId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    if (!etablissement || !activeEtabId) return
    setSavingEtab(true)
    try {
      const res = await fetch(`/api/etablissements/${activeEtabId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
      // PARAMETRES-FIX-P1+P5 : PATCH /etablissement/{etabId} (upsert) au lieu de
      // PATCH /{configId} (route inexistante + id vide si pas de config existante).
      const res = await fetch(`/api/security-settings/etablissement/${activeEtabId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
      const data = await res.json().catch(() => ({}))
      // Mettre à jour le state local avec la config retournée (id peuplé si nouvel INSERT).
      if (data?.securitySettings) {
        setSecuritySettings(data.securitySettings)
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
    if (!newIp.trim() || !activeEtabId) return
    setAddingIp(true)
    try {
      const res = await fetch('/api/ip-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adresseIp: newIp.trim(),
          description: newIpDesc.trim() || null,
          etablissementId: activeEtabId,
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
      refreshIpWhitelist()
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: !currentActif }),
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success(currentActif ? 'Adresse IP désactivée' : 'Adresse IP activée')
      refreshIpWhitelist()
    } catch {
      toast.error('Erreur', { description: 'Impossible de modifier l\'entrée' })
    }
  }

  // ─── Delete IP ───

  const handleDeleteIp = async (entryId: string, ip: string) => {
    try {
      const res = await fetch(`/api/ip-whitelist/${entryId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Adresse IP retirée', { description: `${ip} a été supprimé de la liste blanche.` })
      refreshIpWhitelist()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer l\'entrée' })
    }
  }

  // Helper: update etablissement field while preserving _count
  const updateEtab = (updates: Partial<EtablissementInfo>) => {
    setEtablissement((prev) => prev ? { ...prev, ...updates } : prev)
  }

  // ─── Loading state ───

  if (loadingEtab && !etablissement) {
    return (
      <div className="space-y-6">
        <div>
          <PulseSkeleton className="h-9 w-64 mb-2" />
          <PulseSkeleton className="h-5 w-96" />
        </div>
        <PulseSkeleton className="h-10 w-full" />
        <Card>
          <CardHeader>
            <PulseSkeleton className="h-6 w-48" />
            <PulseSkeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <PulseSkeleton className="h-4 w-32" />
                <PulseSkeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── ADMIN with no establishment selected ───

  if (isAdmin && !activeEtabId) {
    return (
      <TooltipProvider>
        <div className="space-y-6">
          <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2 font-display">
              <Settings className={`h-7 w-7 ${accent.text}`} />
              Paramètres des établissements
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sélectionnez un établissement pour configurer ses paramètres
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display">
                  <Building2 className={`h-5 w-5 ${accent.text}`} />
                  Sélectionner un établissement
                </CardTitle>
                <CardDescription>
                  Choisissez l&apos;établissement dont vous souhaitez modifier les paramètres
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingEtabOptions ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className={`h-6 w-6 animate-spin ${accent.text}`} />
                    <span className="ml-2 text-sm text-muted-foreground">Chargement des établissements...</span>
                  </div>
                ) : etabOptions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Building2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Aucun établissement trouvé.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {etabOptions.map((etab) => (
                      <motion.button
                        key={etab.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setActiveEtabId(etab.id)}
                        className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:${accent.activeBg} hover:${accent.activeBorder} group`}
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent.bg100} ${accent.text} group-hover:scale-110 transition-transform`}>
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{etab.nom}</p>
                          <p className="text-xs text-muted-foreground truncate">{etab.id}</p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground/50 -rotate-90" />
                      </motion.button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </TooltipProvider>
    )
  }

  if (!etablissement) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-display">Aucun établissement</CardTitle>
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
        <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2 font-display">
              <Settings className={`h-7 w-7 ${accent.text}`} />
              Paramètres de l&apos;établissement
            </h1>
            {isAdmin && (
              <Badge className={`${accent.bg100} ${accent.text700} w-fit text-xs`}>
                Mode Admin
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Configurez les informations, la sécurité et les préférences de <span className="font-medium text-foreground">{etablissement.nom}</span>
          </p>
        </div>

        {/* ─── Admin establishment selector ─── */}
        {isAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Building2 className={`h-4 w-4 ${accent.text}`} />
                  <Label className="text-sm whitespace-nowrap">Établissement actif :</Label>
                  <Select
                    value={activeEtabId || ''}
                    onValueChange={(val) => setActiveEtabId(val)}
                  >
                    <SelectTrigger className="w-full max-w-sm">
                      <SelectValue placeholder="Sélectionner un établissement..." />
                    </SelectTrigger>
                    <SelectContent>
                      {etabOptions.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>
                          {opt.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ─── Tabs ─── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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
                <CardTitle className="flex items-center gap-2 font-display">
                  <Building2 className={`h-5 w-5 ${accent.text}`} />
                  Informations de l&apos;établissement
                </CardTitle>
                <CardDescription>
                  Les informations de contact et les coordonnées de votre établissement
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Logo Upload */}
                <LogoUpload
                  logo={etablissement.logo}
                  etablissementId={etablissement.id}
                  accent={accent}
                  onLogoUpdate={(logo) => updateEtab({ logo })}
                />

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="etab-nom" className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      Nom de l&apos;établissement
                    </Label>
                    <Input
                      id="etab-nom"
                      value={etablissement.nom}
                      onChange={(e) => updateEtab({ nom: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="etab-type" className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      Type d&apos;établissement
                    </Label>
                    <Select
                      value={etablissement.type || ''}
                      onValueChange={(val) => updateEtab({ type: val })}
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
                      onChange={(e) => updateEtab({ ville: e.target.value })}
                      placeholder="Ex: Paris"
                    />
                  </div>
                  {/* Pays field — ADMIN only */}
                  {isAdmin ? (
                    <div className="space-y-2">
                      <Label htmlFor="etab-pays" className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        Pays
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">Admin</Badge>
                      </Label>
                      <Input
                        id="etab-pays"
                        value={etablissement.pays || ''}
                        onChange={(e) => updateEtab({ pays: e.target.value })}
                        placeholder="Ex: France"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="etab-adresse" className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        Adresse
                      </Label>
                      <Input
                        id="etab-adresse"
                        value={etablissement.adresse || ''}
                        onChange={(e) => updateEtab({ adresse: e.target.value })}
                        placeholder="12 rue Exemple, 75001 Paris"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label htmlFor="etab-adresse" className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        Adresse
                      </Label>
                      <Input
                        id="etab-adresse"
                        value={etablissement.adresse || ''}
                        onChange={(e) => updateEtab({ adresse: e.target.value })}
                        placeholder="12 rue Exemple, 75001 Paris"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="etab-telephone" className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      Téléphone
                    </Label>
                    <Input
                      id="etab-telephone"
                      value={etablissement.telephone || ''}
                      onChange={(e) => updateEtab({ telephone: e.target.value })}
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
                      onChange={(e) => updateEtab({ email: e.target.value })}
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
                    onChange={(e) => updateEtab({ siteWeb: e.target.value })}
                    placeholder="https://www.etablissement.fr"
                  />
                </div>

                {/* Actif toggle — ADMIN only */}
                {isAdmin && (
                  <>
                    <Separator />
                    <div className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${etablissement.actif ? accent.activeBorder + ' ' + accent.activeBg : 'border-border'}`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${etablissement.actif ? accent.activeIconBg : 'bg-muted text-muted-foreground'}`}>
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium flex items-center gap-1.5">
                            Établissement actif
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Admin</Badge>
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Désactivez l&apos;établissement pour suspendre l&apos;accès de tous ses utilisateurs
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={etablissement.actif}
                        onCheckedChange={(v) => updateEtab({ actif: v })}
                      />
                    </div>
                  </>
                )}

                <Separator />

                {/* Stats summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={`rounded-lg border p-4 ${accent.bg50}`}>
                    <p className={`text-2xl font-bold ${accent.text700} font-mono tabular-nums`}>{etablissement._count?.filieres ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Filières</p>
                  </div>
                  <div className={`rounded-lg border p-4 ${accent.bg50}`}>
                    <p className={`text-2xl font-bold ${accent.text700} font-mono tabular-nums`}>{etablissement._count?.users ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Utilisateurs</p>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-end">
                  <Button
                    className={accent.btn}
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
            <AnimatePresence mode="wait">
              {loadingSecurity ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center py-12"
                >
                  <Loader2 className={`h-8 w-8 animate-spin ${accent.text}`} />
                  <span className="ml-3 text-sm text-muted-foreground">Chargement des paramètres de sécurité...</span>
                </motion.div>
              ) : !securitySettings ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex justify-center py-4"
                >
                  <Button
                    onClick={() => { void refreshSecuritySettings() }}
                    className={accent.btn}
                  >
                    Charger les paramètres de sécurité
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="content"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* Section A: Surveillance & Détection */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-display">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent.bg100} ${accent.text}`}>
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
                        accent={accent}
                      />
                      <ToggleRow
                        id="detection-copie"
                        label="Détection de copier/coller"
                        description="Détecte les tentatives de copier/coller pendant l'évaluation et les signale comme alerte"
                        checked={securitySettings.detectionCopie}
                        onCheckedChange={(v) => updateSecurityField('detectionCopie', v)}
                        icon={ClipboardCheck}
                        accent={accent}
                      />
                      <ToggleRow
                        id="detection-onglet"
                        label="Détection de changement d'onglet"
                        description="Surveille les changements d'onglet ou de fenêtre du navigateur pendant l'évaluation"
                        checked={securitySettings.detectionOnglet}
                        onCheckedChange={(v) => updateSecurityField('detectionOnglet', v)}
                        icon={AppWindow}
                        accent={accent}
                      />
                      <ToggleRow
                        id="detection-fullscreen"
                        label="Détection de sortie plein écran"
                        description="Détecte si le candidat quitte le mode plein écran imposé pendant l'évaluation"
                        checked={securitySettings.detectionFullscreen}
                        onCheckedChange={(v) => updateSecurityField('detectionFullscreen', v)}
                        icon={MonitorSmartphone}
                        accent={accent}
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
                            accent={accent}
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
                            accent={accent}
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
                        accent={accent}
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
                          accent={accent}
                        />
                      )}
                    </CardContent>
                  </Card>

                  {/* Section B: Blocage & Protection */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-display">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success-text">
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
                        accent={accent}
                      />
                      <ToggleRow
                        id="blocage-clic-droit"
                        label="Blocage du clic droit"
                        description="Désactive le menu contextuel du clic droit pour empêcher l'inspection et la copie"
                        checked={securitySettings.blocageClicDroit}
                        onCheckedChange={(v) => updateSecurityField('blocageClicDroit', v)}
                        icon={MousePointerClick}
                        accent={accent}
                      />
                      <ToggleRow
                        id="blocage-impression"
                        label="Blocage de l'impression écran"
                        description="Bloque les touches d'impression écran (PrtScn) et les raccourcis de capture système"
                        checked={securitySettings.blocageImpression}
                        onCheckedChange={(v) => updateSecurityField('blocageImpression', v)}
                        icon={Printer}
                        accent={accent}
                      />
                      <ToggleRow
                        id="verification-identite"
                        label="Vérification d'identité"
                        description="Exige une vérification d'identité (photo ou pièce d'identité) avant le début de l'évaluation"
                        checked={securitySettings.verificationIdentite}
                        onCheckedChange={(v) => updateSecurityField('verificationIdentite', v)}
                        icon={UserCheck}
                        accent={accent}
                      />
                    </CardContent>
                  </Card>

                  {/* Section C: Seuils & Alertes */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-display">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
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
                        accent={accent}
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
                        accent={accent}
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
                        accent={accent}
                      />
                      <ToggleRow
                        id="auto-submit-violation"
                        label="Soumission automatique en cas de violation"
                        description="Soumet automatiquement l'évaluation lorsque le nombre maximal d'alertes est atteint"
                        checked={securitySettings.autoSubmitOnViolation}
                        onCheckedChange={(v) => updateSecurityField('autoSubmitOnViolation', v)}
                        icon={Send}
                        accent={accent}
                      />
                    </CardContent>
                  </Card>

                  {/* Section D: Analyse & Rapports */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg font-display">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10 text-info">
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
                        accent={accent}
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
                        accent={accent}
                      />
                      <div className="rounded-lg border border-info/30 bg-info/10 p-4">
                        <h4 className="text-sm font-semibold text-info mb-2 flex items-center gap-2">
                          <FileSearch className="h-4 w-4" />
                          Interprétation du seuil
                        </h4>
                        <ul className="text-sm text-info space-y-1">
                          <li>&#8226; <strong>0.50 – 0.65</strong> : Tolérant — détecte les similarités évidentes uniquement</li>
                          <li>&#8226; <strong>0.70 – 0.85</strong> : Équilibré — bon compromis entre faux positifs et détection</li>
                          <li>&#8226; <strong>0.90 – 1.00</strong> : Strict — signale les réponses très similaires uniquement</li>
                        </ul>
                        <p className="mt-2 text-xs text-info">
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
                      className={`${accent.btn} min-w-[180px]`}
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
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* ═══════════ Tab: Format Matricule ═══════════ */}
          <TabsContent value="matricule">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display">
                  <Hash className={`h-5 w-5 ${accent.text}`} />
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
                    onChange={(e) => updateEtab({ formatMatricule: e.target.value })}
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
                    onChange={(e) => updateEtab({ exempleMatricule: e.target.value })}
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
                    onChange={(e) => updateEtab({ regexMatricule: e.target.value })}
                    placeholder="Ex: ^\d{4}-\d{4}$"
                    className="font-mono tabular-nums"
                  />
                  <p className="text-xs text-muted-foreground">
                    Regex utilisée pour valider le format du matricule lors de l&apos;inscription des étudiants
                  </p>
                </div>

                {/* Preview */}
                <div className={`rounded-lg border p-4 ${accent.infoBorder} ${accent.infoBg}`}>
                  <h4 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${accent.infoText}`}>
                    <Hash className="h-4 w-4" />
                    Aperçu de la configuration
                  </h4>
                  <ul className={`text-sm space-y-1 ${accent.infoSubtext}`}>
                    <li>&#8226; Format : <code className={`font-mono px-1.5 py-0.5 rounded text-xs ${accent.codeBg}`}>{etablissement.formatMatricule || 'Non défini'}</code></li>
                    <li>&#8226; Exemple : <code className={`font-mono px-1.5 py-0.5 rounded text-xs ${accent.codeBg}`}>{etablissement.exempleMatricule || 'Non défini'}</code></li>
                    <li>&#8226; Regex : <code className={`font-mono px-1.5 py-0.5 rounded text-xs ${accent.codeBg}`}>{etablissement.regexMatricule || 'Non définie'}</code></li>
                  </ul>
                </div>

                <Separator />

                <div className="flex justify-end">
                  <Button
                    className={accent.btn}
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
                  <CardTitle className="flex items-center gap-2 font-display">
                    <Wifi className={`h-5 w-5 ${accent.text}`} />
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
                        className="font-mono tabular-nums"
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
                      className={`${accent.btn} shrink-0`}
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
                  <CardTitle className="flex items-center gap-2 text-lg font-display">
                    <Wifi className={`h-5 w-5 ${accent.text}`} />
                    Adresses autorisées
                    <Badge variant="secondary" className="ml-2">{ipEntries.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingIp ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className={`h-6 w-6 animate-spin ${accent.text}`} />
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
                            <TableHead className="font-display">Adresse IP</TableHead>
                            <TableHead className="font-display">Description</TableHead>
                            <TableHead className="text-center font-display">Statut</TableHead>
                            <TableHead className="text-right font-display">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ipEntries.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell className="font-mono tabular-nums text-sm">
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
                                        <CheckCircle2 className="h-5 w-5 text-success-text inline-block" />
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
                              <TableCell className="text-right font-mono tabular-nums">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteIp(entry.id, entry.adresseIp)}
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
