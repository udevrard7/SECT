'use client'

/**
 * Panneau de configuration du filigrane certificat
 * Accessible aux RESPONSABLE et ADMIN
 */

import { useState, useEffect } from 'react'
import {
  Save, Loader2, Eye, EyeOff, Sparkles, Palette, Type,
  Droplet, Grid3x3, RotateCcw, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

interface WatermarkConfig {
  certWatermarkText: string | null
  certWatermarkEnabled: boolean
  certWatermarkOpacity: number
  certWatermarkColor: string | null
  certWatermarkPattern: string | null
}

const DEFAULT_CONFIG: WatermarkConfig = {
  certWatermarkText: 'ORIGINAL',
  certWatermarkEnabled: true,
  certWatermarkOpacity: 0.04,
  certWatermarkColor: '#1B3A5C',
  certWatermarkPattern: 'diamond',
}

const PATTERN_OPTIONS = [
  { value: 'diamond', label: 'Losanges', desc: 'Motif géométrique en losanges' },
  { value: 'circle', label: 'Cercles', desc: 'Motif de cercles concentriques' },
  { value: 'text', label: 'Texte seul', desc: 'Filigrane texte uniquement, sans motif de fond' },
  { value: 'none', label: 'Aucun', desc: 'Désactive le motif de fond' },
]

const COLOR_PRESETS = [
  { value: '#1B3A5C', label: 'Marine', color: 'bg-blue-900' },
  { value: '#C5A044', label: 'Or', color: 'bg-amber-600' },
  { value: '#6B7280', label: 'Gris', color: 'bg-gray-500' },
  { value: '#1F2937', label: 'Charbon', color: 'bg-gray-800' },
  { value: '#7C2D12', label: 'Bordeaux', color: 'bg-red-900' },
  { value: '#064E3B', label: 'Émeraude', color: 'bg-emerald-900' },
]

export function WatermarkConfigPanel() {
  const [config, setConfig] = useState<WatermarkConfig>(DEFAULT_CONFIG)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/certificats/watermark-config')
        if (res.ok) {
          const data = await res.json()
          setConfig({ ...DEFAULT_CONFIG, ...data.config })
        }
      } catch {
        setError('Impossible de charger la configuration.')
      } finally {
        setIsLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/certificats/watermark-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur de sauvegarde')
      }
      toast.success('Configuration enregistrée', {
        description: 'Le filigrane sera appliqué aux prochains certificats générés.',
      })
    } catch (err) {
      toast.error('Erreur', { description: err instanceof Error ? err.message : 'Réessayez.' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG)
    toast.info('Réinitialisé', { description: 'Cliquez sur Enregistrer pour appliquer.' })
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Chargement de la configuration...
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Filigrane des certificats
            </CardTitle>
            <CardDescription>
              Personnalisez l'apparence du filigrane sur les certificats de votre établissement
            </CardDescription>
          </div>
          <Badge variant={config.certWatermarkEnabled ? 'default' : 'secondary'}
            className={config.certWatermarkEnabled ? 'bg-emerald-600' : ''}>
            {config.certWatermarkEnabled ? 'Activé' : 'Désactivé'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Activation */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2">
            {config.certWatermarkEnabled ? <Eye className="h-4 w-4 text-emerald-500" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
            <div>
              <Label className="text-sm font-medium">Activer le filigrane</Label>
              <p className="text-xs text-muted-foreground">Affiche le filigrane sur tous les certificats</p>
            </div>
          </div>
          <Switch
            checked={config.certWatermarkEnabled}
            onCheckedChange={(v) => setConfig({ ...config, certWatermarkEnabled: v })}
          />
        </div>

        {/* Texte du filigrane */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Type className="h-3.5 w-3.5" />
            Texte du filigrane
          </Label>
          <Input
            value={config.certWatermarkText ?? ''}
            onChange={(e) => setConfig({ ...config, certWatermarkText: e.target.value })}
            placeholder="ORIGINAL, COPIE, OFFICIEL..."
            maxLength={30}
            disabled={!config.certWatermarkEnabled}
          />
          <p className="text-xs text-muted-foreground">
            Texte affiché en grand en diagonale sur le certificat (max 30 caractères)
          </p>
        </div>

        {/* Motif de fond */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Grid3x3 className="h-3.5 w-3.5" />
            Motif de fond
          </Label>
          <Select
            value={config.certWatermarkPattern ?? 'diamond'}
            onValueChange={(v) => setConfig({ ...config, certWatermarkPattern: v })}
            disabled={!config.certWatermarkEnabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PATTERN_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <div className="flex flex-col">
                    <span>{p.label}</span>
                    <span className="text-xs text-muted-foreground">{p.desc}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Couleur */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <Palette className="h-3.5 w-3.5" />
            Couleur du filigrane
          </Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                onClick={() => setConfig({ ...config, certWatermarkColor: c.value })}
                disabled={!config.certWatermarkEnabled}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                  config.certWatermarkColor === c.value
                    ? 'border-foreground bg-muted shadow-sm'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <span className={`h-3 w-3 rounded-full ${c.color}`} />
                {c.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5">
              <input
                type="color"
                value={config.certWatermarkColor ?? '#1B3A5C'}
                onChange={(e) => setConfig({ ...config, certWatermarkColor: e.target.value })}
                disabled={!config.certWatermarkEnabled}
                className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <span className="text-xs">Personnalisé</span>
            </div>
          </div>
        </div>

        {/* Opacité */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-sm">
              <Droplet className="h-3.5 w-3.5" />
              Opacité
            </Label>
            <span className="text-xs font-mono text-muted-foreground">
              {Math.round((config.certWatermarkOpacity ?? 0.04) * 100)}%
            </span>
          </div>
          <Slider
            value={[Math.round((config.certWatermarkOpacity ?? 0.04) * 100)]}
            onValueChange={([v]) => setConfig({ ...config, certWatermarkOpacity: v / 100 })}
            min={1}
            max={20}
            step={1}
            disabled={!config.certWatermarkEnabled}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Subtil (1%)</span>
            <span>Visible (20%)</span>
          </div>
        </div>

        {/* Aperçu */}
        <div className="rounded-lg border-2 border-dashed p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Aperçu</p>
          <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-white to-muted/30 dark:from-card dark:to-muted/10">
            {/* Pattern preview */}
            {config.certWatermarkEnabled && config.certWatermarkPattern !== 'none' && config.certWatermarkPattern !== 'text' && (
              <div className="absolute inset-0 flex items-center justify-center opacity-20"
                style={{ color: config.certWatermarkColor ?? '#1B3A5C' }}>
                {config.certWatermarkPattern === 'diamond' && (
                  <div className="grid grid-cols-5 gap-2">
                    {Array.from({ length: 15 }).map((_, i) => (
                      <div key={i} className="h-3 w-3 rotate-45 border" style={{ borderColor: 'currentColor' }} />
                    ))}
                  </div>
                )}
                {config.certWatermarkPattern === 'circle' && (
                  <div className="grid grid-cols-5 gap-2">
                    {Array.from({ length: 15 }).map((_, i) => (
                      <div key={i} className="h-3 w-3 rounded-full border" style={{ borderColor: 'currentColor' }} />
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Text watermark preview */}
            {config.certWatermarkEnabled && (
              <span
                className="absolute text-2xl font-bold tracking-wider"
                style={{
                  color: config.certWatermarkColor ?? '#1B3A5C',
                  opacity: config.certWatermarkOpacity ? Math.min(config.certWatermarkOpacity * 3, 0.3) : 0.12,
                  transform: 'rotate(-20deg)',
                }}
              >
                {config.certWatermarkText || 'ORIGINAL'}
              </span>
            )}
            {!config.certWatermarkEnabled && (
              <span className="text-sm text-muted-foreground">Filigrane désactivé</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Enregistrer
          </Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Réinitialiser
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
