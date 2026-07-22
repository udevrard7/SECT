// ─────────────────────────────────────────────────────────────
// NotificationPreferences — section de la page profil pour gérer
// les préférences de notification par catégorie.
//
// SECT-NOTIF-PREFERENCES-UI-1
//
// Consomme :
//   GET  /api/notifications/preferences → {preferences: [{id, categorie, pushEnabled, emailEnabled}]}
//   PATCH /api/notifications/preferences body {categorie, pushEnabled?, emailEnabled?}
//
// Catégories (miroir du dispatcher) :
//   - pedagogique : affectations, clôture d'année, inscriptions
//   - evaluation  : résultats d'épreuves, devoirs corrigés
//   - messagerie  : messages de classe/DM
//   - admin       : alertes système, accès établissement
//   - general     : notifications diverses (défaut)
// ─────────────────────────────────────────────────────────────

'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Mail, Smartphone, Loader2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────

interface Preference {
  id: string
  categorie: string
  pushEnabled: boolean
  emailEnabled: boolean
}

// ─── Catégories métier ────────────────────────────────────────

const CATEGORIES: { key: string; label: string; description: string; icon: string }[] = [
  {
    key: 'pedagogique',
    label: 'Pédagogique',
    description: 'Affectations publiées, clôture d\'année, inscriptions',
    icon: 'GraduationCap',
  },
  {
    key: 'evaluation',
    label: 'Évaluations',
    description: 'Résultats d\'épreuves publiés, devoirs corrigés',
    icon: 'FileCheck',
  },
  {
    key: 'messagerie',
    label: 'Messagerie',
    description: 'Messages de classe, DM, réactions',
    icon: 'MessageSquare',
  },
  {
    key: 'admin',
    label: 'Administration',
    description: 'Alertes système, accès établissement, sécurité',
    icon: 'Shield',
  },
  {
    key: 'general',
    label: 'Général',
    description: 'Notifications diverses non classées',
    icon: 'Bell',
  },
]

// ─── Composant ────────────────────────────────────────────────

export function NotificationPreferences() {
  const queryClient = useQueryClient()
  const [updatingCat, setUpdatingCat] = useState<string | null>(null)

  // Fetch preferences existantes
  const { data, isLoading, error } = useQuery<{ preferences: Preference[] }>({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/preferences', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Erreur lors du chargement des préférences')
      return res.json()
    },
  })

  // Build a map: categorie → preference (default = push:true, email:true)
  const prefMap = new Map<string, Preference>()
  for (const p of data?.preferences ?? []) {
    prefMap.set(p.categorie, p)
  }

  // Mutation : upsert preference
  const updateMutation = useMutation({
    mutationFn: async (input: { categorie: string; pushEnabled?: boolean; emailEnabled?: boolean }) => {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur lors de la mise à jour')
      }
      return res.json()
    },
    onMutate: (input) => {
      setUpdatingCat(input.categorie)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
      toast.success('Préférences mises à jour')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
    onSettled: () => {
      setUpdatingCat(null)
    },
  })

  const handleToggle = (categorie: string, field: 'pushEnabled' | 'emailEnabled', value: boolean) => {
    updateMutation.mutate({ categorie, [field]: value })
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
            Préférences de notification
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
            Préférences de notification
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-destructive/50" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
          Préférences de notification
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Choisissez comment recevoir vos notifications pour chaque catégorie.
          Les notifications in-app (cloche) sont toujours actives.
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Header row (desktop only) */}
        <div className="hidden sm:grid grid-cols-[1fr_auto_auto] gap-4 px-3 pb-2 border-b border-border/60">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Catégorie
          </span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 w-20 justify-center">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            Push
          </span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 w-20 justify-center">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            Email
          </span>
        </div>

        {CATEGORIES.map((cat) => {
          const pref = prefMap.get(cat.key)
          const pushEnabled = pref?.pushEnabled ?? true // défaut: true
          const emailEnabled = pref?.emailEnabled ?? true // défaut: true
          const isUpdating = updatingCat === cat.key

          return (
            <div
              key={cat.key}
              className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 sm:gap-4 px-3 py-3 rounded-lg hover:bg-accent/50 transition-colors items-center"
            >
              {/* Catégorie info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{cat.label}</p>
                  {isUpdating && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
              </div>

              {/* Push switch */}
              <div className="flex items-center justify-between sm:justify-center gap-2 sm:w-20">
                <span className="text-xs text-muted-foreground sm:hidden flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                  Push
                </span>
                <Switch
                  checked={pushEnabled}
                  onCheckedChange={(v) => handleToggle(cat.key, 'pushEnabled', v)}
                  disabled={isUpdating}
                  aria-label={`Push notifications for ${cat.label}`}
                />
              </div>

              {/* Email switch */}
              <div className="flex items-center justify-between sm:justify-center gap-2 sm:w-20">
                <span className="text-xs text-muted-foreground sm:hidden flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  Email
                </span>
                <Switch
                  checked={emailEnabled}
                  onCheckedChange={(v) => handleToggle(cat.key, 'emailEnabled', v)}
                  disabled={isUpdating}
                  aria-label={`Email notifications for ${cat.label}`}
                />
              </div>
            </div>
          )
        })}

        {/* Note */}
        <div className="pt-3 mt-2 border-t border-border/60">
          <p className="text-xs text-muted-foreground italic">
            Les notifications in-app (cloche en haut à droite) sont toujours affichées,
            quelles que soient vos préférences. Ces réglages contrôlent uniquement les
            canaux push et email.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
