'use client'

/**
 * CertificateTemplateDialog
 *
 * Dialog for RESPONSABLE/ADMIN to configure the per-UE certificate template:
 * - Primary color (hex picker)
 * - Accent color (hex picker)
 * - Theme icon (dropdown: default, code, science, law, business, math, language, art)
 * - Font family (dropdown: helvetica, times, courier)
 * - Background image (file upload -> base64 data URI, used as faint watermark)
 *
 * Saves via POST /api/certificate-templates (upsert by ueId).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Award, Loader2, Save, Trash2, Upload, Download, Sparkles, Wand2 } from 'lucide-react'
import { toast } from 'sonner'

interface UE {
  id: string
  code: string
  nom: string
}

interface TemplateData {
  id?: string
  backgroundImage: string | null
  primaryColor: string | null
  accentColor: string | null
  themeIcon: string | null
  fontFamily: string | null
}

const ICON_OPTIONS = [
  { value: 'default', label: 'Défaut (aucun filigrane)' },
  { value: 'code', label: 'Informatique (</>)' },
  { value: 'science', label: 'Sciences (atome)' },
  { value: 'law', label: 'Droit (balance)' },
  { value: 'business', label: 'Économie (graphique)' },
  { value: 'math', label: 'Mathématiques (π)' },
  { value: 'language', label: 'Langues (globe)' },
  { value: 'art', label: 'Arts (palette)' },
]

const FONT_OPTIONS = [
  { value: 'helvetica', label: 'Helvetica (moderne)' },
  { value: 'times', label: 'Times (classique)' },
  { value: 'courier', label: 'Courier (monospace)' },
]

const DEFAULT_PRIMARY = '1A4D2E'
const DEFAULT_ACCENT = 'DAA520'

interface Props {
  ue: UE | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CertificateTemplateDialog({ ue, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoGenerating, setAutoGenerating] = useState<'rules' | 'ai' | null>(null)
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY)
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT)
  const [themeIcon, setThemeIcon] = useState('default')
  const [fontFamily, setFontFamily] = useState('helvetica')
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchTemplate = useCallback(async () => {
    if (!ue) return
    setLoading(true)
    try {
      const res = await fetch(`/api/certificate-templates?ueId=${ue.id}`)
      if (res.ok) {
        const data = await res.json()
        const tpl = data.templates?.[0] as TemplateData | undefined
        if (tpl) {
          setPrimaryColor(tpl.primaryColor || DEFAULT_PRIMARY)
          setAccentColor(tpl.accentColor || DEFAULT_ACCENT)
          setThemeIcon(tpl.themeIcon || 'default')
          setFontFamily(tpl.fontFamily || 'helvetica')
          setBackgroundImage(tpl.backgroundImage)
        } else {
          // Reset to defaults
          setPrimaryColor(DEFAULT_PRIMARY)
          setAccentColor(DEFAULT_ACCENT)
          setThemeIcon('default')
          setFontFamily('helvetica')
          setBackgroundImage(null)
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [ue])

  useEffect(() => {
    if (open && ue) fetchTemplate()
  }, [open, ue, fetchTemplate])

  const handleAutoGenerate = async (mode: 'rules' | 'ai') => {
    if (!ue) return
    setAutoGenerating(mode)
    try {
      const res = await fetch('/api/certificate-templates/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ueId: ue.id, mode }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur')
      }
      const data = await res.json()
      const tpl = data.template
      setPrimaryColor(tpl.primaryColor)
      setAccentColor(tpl.accentColor)
      setThemeIcon(tpl.themeIcon)
      setFontFamily(tpl.fontFamily)
      toast.success('Template auto-généré', {
        description: data.message || `Source: ${data.source}`,
      })
    } catch (err) {
      toast.error('Auto-génération échouée', {
        description: err instanceof Error ? err.message : 'Réessayez.',
      })
    } finally {
      setAutoGenerating(null)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image trop lourde', { description: 'Maximum 2 MB.' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setBackgroundImage(reader.result as string)
      toast.success('Image chargée')
    }
    reader.onerror = () => toast.error('Erreur lors du chargement')
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!ue) return
    setSaving(true)
    try {
      const res = await fetch('/api/certificate-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ueId: ue.id,
          primaryColor,
          accentColor,
          themeIcon,
          fontFamily,
          backgroundImage,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur')
      }
      toast.success('Template enregistré', {
        description: `Le template de certificat pour ${ue.code} a été sauvegardé.`,
      })
      onOpenChange(false)
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible d\'enregistrer le template.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveBackground = () => {
    setBackgroundImage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Normalize color: strip leading #, uppercase
  const normalizeColor = (c: string) => c.replace(/^#/, '').toUpperCase().slice(0, 6)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-amber-600" />
            Template de certificat — {ue?.code}
          </DialogTitle>
          <DialogDescription>
            Personnalisez l&apos;apparence des certificats pour l&apos;UE « {ue?.nom} ». Les modifications s&apos;appliquent aux futurs PDF générés.
          </DialogDescription>
        </DialogHeader>

        {/* ─── Auto-generate buttons ─── */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-3">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
          <span className="text-xs text-violet-800 dark:text-violet-300 mr-1">Auto-générer :</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAutoGenerate('rules')}
            disabled={autoGenerating !== null || !ue}
            className="h-7 text-xs border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40"
          >
            {autoGenerating === 'rules' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            Par mots-clés (instantané)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAutoGenerate('ai')}
            disabled={autoGenerating !== null || !ue}
            className="h-7 text-xs border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40"
          >
            {autoGenerating === 'ai' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Par IA (~3s)
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Couleur principale</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={`#${primaryColor}`}
                    onChange={(e) => setPrimaryColor(normalizeColor(e.target.value))}
                    className="h-9 w-12 rounded border border-input cursor-pointer"
                    aria-label="Couleur principale"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(normalizeColor(e.target.value))}
                    className="font-mono text-sm"
                    placeholder="1A4D2E"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Titres, bordures, nom de l&apos;étudiant</p>
              </div>

              <div className="space-y-2">
                <Label>Couleur d&apos;accent</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={`#${accentColor}`}
                    onChange={(e) => setAccentColor(normalizeColor(e.target.value))}
                    className="h-9 w-12 rounded border border-input cursor-pointer"
                    aria-label="Couleur d'accent"
                  />
                  <Input
                    value={accentColor}
                    onChange={(e) => setAccentColor(normalizeColor(e.target.value))}
                    className="font-mono text-sm"
                    placeholder="DAA520"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Lignes décoratives, intitulé du certificat</p>
              </div>
            </div>

            {/* Theme icon */}
            <div className="space-y-2">
              <Label>Icône thématique (filigrane central)</Label>
              <Select value={themeIcon} onValueChange={setThemeIcon}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Affichée en grand en arrière-plan (opacité ~8%) pour personnaliser visuellement le certificat.
              </p>
            </div>

            {/* Font */}
            <div className="space-y-2">
              <Label>Police</Label>
              <Select value={fontFamily} onValueChange={setFontFamily}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Background image */}
            <div className="space-y-2">
              <Label>Image de fond (filigrane, optionnel)</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {backgroundImage ? 'Changer l\'image' : 'Téléverser une image'}
                </Button>
                {backgroundImage && (
                  <Button variant="ghost" size="sm" onClick={handleRemoveBackground}>
                    <Trash2 className="h-4 w-4" />
                    Retirer
                  </Button>
                )}
              </div>
              {backgroundImage && (
                <div className="flex items-center gap-2 mt-1">
                  <img
                    src={backgroundImage}
                    alt="Aperçu du filigrane"
                    className="h-16 w-16 object-contain rounded border border-border"
                  />
                  <Badge variant="secondary" className="text-xs">Filigrane ~10% opacité</Badge>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                L&apos;image sera affichée en filigrane très léger derrière le texte. PNG ou JPEG, max 2 MB.
              </p>
            </div>

            {/* Preview note */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                💡 Pour voir le résultat, enregistrez le template puis téléchargez un certificat existant depuis la page « Mes certificats ». Le PDF reflétera les couleurs, le filigrane et la police choisis.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Enregistrer le template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
