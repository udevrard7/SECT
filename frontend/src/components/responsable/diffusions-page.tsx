'use client'

// SECT-NOTIF-DIFFUSION-1 — Page « Diffusions » du RESPONSABLE.
//
// SYSTÈME DE DIFFUSION PROPRES AUX ÉTABLISSEMENTS, strictement séparé du
// centre de diffusion SaaS de l'ADMIN (/notifications, réservé ADMIN
// plateforme) :
//   - Ici, le responsable diffuse à SON établissement uniquement
//     (l'établissement est tiré du JWT côté backend — jamais du body).
//   - Audiences : tout l'établissement / enseignants / étudiants.
//   - API : POST/GET/DELETE /api/notifications/diffusion.
//
// L'ADMIN en mode assistance (ADMIN + etablissementId) accède à cette page
// et agit comme responsable de l'établissement visité. L'ADMIN SaaS sans
// établissement est orienté vers son propre centre (/notifications).

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Megaphone,
  Send,
  Trash2,
  Users,
  GraduationCap,
  BookOpen,
  Loader2,
  Calendar,
  History,
  ExternalLink,
  Building2,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { PulseSkeleton, StatCard } from '@/components/ds'
import { PAGE_ROUTES } from '@/lib/routes'
import { useRouter } from 'next/navigation'

// ─── Types ───

interface DiffusionItem {
  id: string
  type: string
  titre: string
  message: string
  destinataireRole: string | null
  destinataireSegment: string | null
  destinataireEtablissementId: string | null
  lu: boolean
  actionUrl: string | null
  actionLabel: string | null
  priorite: string
  categorie: string
  icone: string | null
  expireLe: string | null
  createdAt: string
}

// ─── Constantes ───

const AUDIENCES = [
  { value: 'TOUS', label: "Tout l'établissement", icon: Users },
  { value: 'ENSEIGNANTS', label: 'Enseignants', icon: BookOpen },
  { value: 'ETUDIANTS', label: 'Étudiants', icon: GraduationCap },
] as const

const PRIORITES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'] as const

const CATEGORIES = [
  { value: 'general', label: 'Générale' },
  { value: 'pedagogique', label: 'Pédagogique' },
  { value: 'evaluation', label: 'Évaluation' },
  { value: 'admin', label: 'Administration' },
] as const

// ─── Helpers ───

function getAudienceLabel(d: DiffusionItem): string {
  if (d.destinataireRole === 'ENSEIGNANT') return 'Enseignants'
  if (d.destinataireRole === 'ETUDIANT') return 'Étudiants'
  if (d.destinataireSegment === 'ETABLISSEMENT') return "Tout l'établissement"
  return 'Diffusion'
}

function getPrioriteBadge(priorite: string) {
  switch (priorite) {
    case 'URGENTE':
      return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Urgente</Badge>
    case 'HAUTE':
      return <Badge className="bg-warning/10 text-warning border-warning/30">Haute</Badge>
    case 'BASSE':
      return <Badge className="bg-muted text-muted-foreground border-border">Basse</Badge>
    default:
      return <Badge className="bg-info/10 text-info border-info/30">Normale</Badge>
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isExpired(expireLe: string | null): boolean {
  if (!expireLe) return false
  return new Date(expireLe).getTime() < Date.now()
}

// ─── Composant ───

export function DiffusionsPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const queryClient = useQueryClient()

  const canDiffuse = user?.role === 'RESPONSABLE' || (user?.role === 'ADMIN' && !!user.etablissementId)

  // ─── Formulaire ───
  const [formTitre, setFormTitre] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formAudience, setFormAudience] = useState<string>('TOUS')
  const [formPriorite, setFormPriorite] = useState<string>('NORMALE')
  const [formCategorie, setFormCategorie] = useState<string>('general')
  const [formExpireLe, setFormExpireLe] = useState('')
  const [formActionUrl, setFormActionUrl] = useState('')
  const [formActionLabel, setFormActionLabel] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Suppression ───
  const [deleteTarget, setDeleteTarget] = useState<DiffusionItem | null>(null)

  // ─── Historique (TanStack Query) ───
  const diffusionsQuery = useQuery<{ diffusions: DiffusionItem[]; total: number }>({
    queryKey: ['diffusions-etablissement', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/notifications/diffusion?limit=100')
      if (!res.ok) throw new Error('Failed to fetch diffusions')
      return res.json()
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    enabled: canDiffuse,
  })

  const diffusions = diffusionsQuery.data?.diffusions ?? []
  const totalDiffusions = diffusionsQuery.data?.total ?? 0
  const actives = diffusions.filter((d) => !isExpired(d.expireLe))
  const diffusionsCeMois = diffusions.filter((d) => {
    const created = new Date(d.createdAt)
    const now = new Date()
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()
  }).length

  const refreshDiffusions = async () => {
    await queryClient.invalidateQueries({ queryKey: ['diffusions-etablissement'] })
  }

  // ─── Envoyer une diffusion ───
  const handleDiffuser = async () => {
    if (!formTitre || !formMessage) {
      toast.error('Champs manquants', {
        description: 'Le titre et le message sont obligatoires.',
      })
      return
    }

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        titre: formTitre,
        message: formMessage,
        audience: formAudience,
        priorite: formPriorite,
        categorie: formCategorie,
      }
      if (formExpireLe) body.expireLe = formExpireLe
      if (formActionUrl) {
        body.actionUrl = formActionUrl
        body.actionLabel = formActionLabel || 'Voir'
      }

      const res = await fetch('/api/notifications/diffusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erreur lors de la diffusion')
      }

      const audienceLabel = AUDIENCES.find((a) => a.value === formAudience)?.label ?? formAudience
      toast.success('Diffusion envoyée', {
        description: `« ${formTitre} » → ${audienceLabel}.`,
      })

      setFormTitre('')
      setFormMessage('')
      setFormAudience('TOUS')
      setFormPriorite('NORMALE')
      setFormCategorie('general')
      setFormExpireLe('')
      setFormActionUrl('')
      setFormActionLabel('')

      await refreshDiffusions()
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Une erreur est survenue.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Supprimer une diffusion ───
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/notifications/diffusion/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Erreur')
      toast.success('Diffusion supprimée', { description: deleteTarget.titre })
      setDeleteTarget(null)
      await refreshDiffusions()
    } catch {
      toast.error('Erreur', { description: 'Impossible de supprimer la diffusion.' })
    }
  }

  // ─── Garde d'accès ───
  if (!canDiffuse) {
    return (
      <div className="space-y-6">
        <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6">
          <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-success-text" />
            Diffusions
          </h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm font-medium">Aucun établissement rattaché à votre session</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              Les diffusions d&apos;établissement sont réservées aux responsables
              d&apos;établissement. En tant qu&apos;ADMIN SaaS, utilisez le centre de
              diffusion de la plateforme.
            </p>
            {user?.role === 'ADMIN' && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 border-success/40 text-success-text hover:bg-success/10"
                onClick={() => router.push(PAGE_ROUTES.notifications)}
              >
                <Megaphone className="h-4 w-4 mr-1.5" />
                Centre de diffusion plateforme
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:-mx-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-success-text" />
            Diffusions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Diffusez des annonces aux membres de votre établissement
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 border-success/40 text-success-text bg-success/5 self-start">
          <ShieldCheck className="h-3.5 w-3.5" />
          Établissement uniquement
        </Badge>
      </div>

      {/* ─── Stats ─── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Megaphone} label="Diffusions envoyées" value={totalDiffusions} accent="primary" index={0} />
        <StatCard icon={Send} label="Actives (non expirées)" value={actives.length} accent="primary" index={1} />
        <StatCard icon={Calendar} label="Ce mois-ci" value={diffusionsCeMois} accent="primary" index={2} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ─── Formulaire ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-display">
              <Send className="h-5 w-5 text-success-text" />
              Nouvelle diffusion
            </CardTitle>
            <CardDescription>
              Envoyée instantanément (cloche + notification temps réel) aux
              destinataires choisis de votre établissement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Audience */}
            <div className="space-y-2">
              <Label>Destinataires *</Label>
              <Select value={formAudience} onValueChange={setFormAudience}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      <span className="flex items-center gap-1.5">
                        <a.icon className="h-4 w-4" />
                        {a.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Titre */}
            <div className="space-y-2">
              <Label htmlFor="diff-titre">Titre *</Label>
              <Input
                id="diff-titre"
                placeholder="Ex : Suspension des cours vendredi"
                value={formTitre}
                onChange={(e) => setFormTitre(e.target.value)}
                maxLength={120}
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="diff-message">Message *</Label>
              <Textarea
                id="diff-message"
                placeholder="Contenu de l'annonce diffusée à votre établissement…"
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                rows={5}
                className="resize-y"
              />
            </div>

            {/* Priorité & Catégorie */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priorité</Label>
                <Select value={formPriorite} onValueChange={setFormPriorite}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p === 'BASSE' ? 'Basse' : p === 'NORMALE' ? 'Normale' : p === 'HAUTE' ? 'Haute' : 'Urgente'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={formCategorie} onValueChange={setFormCategorie}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Expiration */}
            <div className="space-y-2">
              <Label htmlFor="diff-expire">Date d&apos;expiration (optionnel)</Label>
              <Input
                id="diff-expire"
                type="date"
                value={formExpireLe}
                onChange={(e) => setFormExpireLe(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Après cette date, la diffusion disparaît automatiquement des cloches.
              </p>
            </div>

            {/* Action (optionnel) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="diff-action-url">Lien (optionnel)</Label>
                <Input
                  id="diff-action-url"
                  placeholder="/mes-epreuves"
                  value={formActionUrl}
                  onChange={(e) => setFormActionUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="diff-action-label">Libellé du bouton</Label>
                <Input
                  id="diff-action-label"
                  placeholder="Voir"
                  value={formActionLabel}
                  onChange={(e) => setFormActionLabel(e.target.value)}
                />
              </div>
            </div>

            <Button
              className="w-full border-success/40 bg-success/10 text-success-text hover:bg-success/20"
              onClick={handleDiffuser}
              disabled={isSubmitting || !formTitre || !formMessage}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Diffusion en cours…
                </>
              ) : (
                <>
                  <Megaphone className="h-4 w-4 mr-2" />
                  Diffuser
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* ─── Historique ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-display">
              <History className="h-5 w-5 text-success-text" />
              Historique des diffusions
            </CardTitle>
            <CardDescription>
              Les annonces déjà diffusées à votre établissement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {diffusionsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <PulseSkeleton key={i} className="h-20 w-full rounded-lg" variant="card" />
                ))}
              </div>
            ) : diffusions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Megaphone className="h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-medium">Aucune diffusion pour le moment</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Votre première annonce apparaîtra ici après envoi.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {diffusions.map((d) => {
                  const expired = isExpired(d.expireLe)
                  return (
                    <div
                      key={d.id}
                      className={`rounded-lg border p-4 transition-colors ${
                        expired ? 'opacity-60 border-border' : 'border-border hover:border-success/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="bg-success/10 text-success-text border-success/30 gap-1">
                              <Users className="h-3 w-3" />
                              {getAudienceLabel(d)}
                            </Badge>
                            {getPrioriteBadge(d.priorite)}
                            {expired && (
                              <Badge variant="outline" className="text-muted-foreground">Expirée</Badge>
                            )}
                          </div>
                          <p className="mt-2 text-sm font-semibold leading-tight">{d.titre}</p>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{d.message}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                            <span>{formatDate(d.createdAt)}</span>
                            {d.expireLe && !expired && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                expire le {formatDate(d.expireLe)}
                              </span>
                            )}
                            {d.actionUrl && (
                              <span className="flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" />
                                {d.actionLabel || d.actionUrl}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(d)}
                          aria-label="Supprimer la diffusion"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Confirmation suppression ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette diffusion ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleteTarget?.titre} » disparaîtra immédiatement des cloches de tous
              les destinataires de votre établissement. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
