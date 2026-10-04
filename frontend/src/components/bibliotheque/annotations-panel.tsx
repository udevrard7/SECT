'use client'

// SECT-BIBLIO-P4 (ADR-0008 §1) : panneau d'annotations du lecteur.
// Vit dans le Dialog lecteur de bibliotheque-page (aside droite) :
// liste des annotations visibles (propres + FILIERE + ETABLISSEMENT,
// le scoping est fait par les policies RLS 000127), création rapide
// (page pré-remplie par le marque-page déclaratif), suppression de ses
// propres annotations uniquement.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  MessageSquareText,
  StickyNote,
  Trash2,
  Users,
  Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PulseSkeleton } from '@/components/ds'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  type OuvrageAnnotation,
  type VisibiliteAnnotation,
  visibiliteAnnotationLabel,
} from '@/lib/ouvrages-types'

interface AnnotationsPanelProps {
  ouvrageId: string
  /** Page courante (marque-page déclaratif) — pré-remplit le formulaire. */
  pageCourante: number | null
  /** userId courant — pour distinguer ses annotations (supprimables). */
  userId?: string
}

export function AnnotationsPanel({
  ouvrageId,
  pageCourante,
  userId,
}: AnnotationsPanelProps) {
  const queryClient = useQueryClient()
  const [formPage, setFormPage] = useState<string>(
    pageCourante ? String(pageCourante) : '',
  )
  const [formContenu, setFormContenu] = useState('')
  const [formVisibilite, setFormVisibilite] =
    useState<VisibiliteAnnotation>('PRIVEE')
  const [envoiEnCours, setEnvoiEnCours] = useState(false)

  const annotationsQuery = useQuery({
    queryKey: ['ouvrages', ouvrageId, 'annotations'],
    queryFn: async () => {
      const res = await fetch(`/api/ouvrages/${ouvrageId}/annotations`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      const body = await res.json()
      return (body?.annotations ?? []) as OuvrageAnnotation[]
    },
  })

  const creerAnnotation = async () => {
    const page = parseInt(formPage, 10)
    if (!Number.isInteger(page) || page < 1) {
      toast.error('Page invalide', {
        description: 'Indiquez le numéro de la page annotée (≥ 1).',
      })
      return
    }
    if (!formContenu.trim()) {
      toast.error('Annotation vide')
      return
    }
    setEnvoiEnCours(true)
    try {
      const res = await fetch(`/api/ouvrages/${ouvrageId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          page,
          contenu: formContenu.trim(),
          visibilite: formVisibilite,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      setFormContenu('')
      await queryClient.invalidateQueries({
        queryKey: ['ouvrages', ouvrageId, 'annotations'],
      })
      toast.success('Annotation ajoutée', {
        description: `Page ${page} — ${visibiliteAnnotationLabel(formVisibilite)}.`,
      })
    } catch (err) {
      toast.error('Annotation impossible', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    } finally {
      setEnvoiEnCours(false)
    }
  }

  const supprimer = useMutation({
    mutationFn: async (annotationId: string) => {
      const res = await fetch(
        `/api/ouvrages/${ouvrageId}/annotations/${annotationId}`,
        { method: 'DELETE', credentials: 'include' },
      )
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Erreur ${res.status}`)
      }
      return annotationId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['ouvrages', ouvrageId, 'annotations'],
      })
      toast.success('Annotation supprimée')
    },
    onError: (err: Error) => {
      toast.error('Suppression impossible', { description: err.message })
    },
  })

  const annotations = annotationsQuery.data ?? []

  return (
    <div className="flex h-full flex-col">
      {/* En-tête du panneau */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquareText className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Annotations</p>
        <Badge variant="secondary" className="ml-auto">
          {annotations.length}
        </Badge>
      </div>

      {/* Formulaire de création */}
      <div className="space-y-3 border-b border-border px-4 py-3">
        <div className="flex gap-2">
          <div className="w-24">
            <Label htmlFor="annot-page" className="text-xs text-muted-foreground">
              Page
            </Label>
            <Input
              id="annot-page"
              type="number"
              min={1}
              value={formPage}
              onChange={(e) => setFormPage(e.target.value)}
              className="h-8 text-sm"
              placeholder={pageCourante ? String(pageCourante) : '1'}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Visibilité</Label>
            <Select
              value={formVisibilite}
              onValueChange={(v) => setFormVisibilite(v as VisibiliteAnnotation)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVEE">{visibiliteAnnotationLabel('PRIVEE')}</SelectItem>
                <SelectItem value="FILIERE">{visibiliteAnnotationLabel('FILIERE')}</SelectItem>
                <SelectItem value="ETABLISSEMENT">
                  {visibiliteAnnotationLabel('ETABLISSEMENT')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Textarea
          value={formContenu}
          onChange={(e) => setFormContenu(e.target.value)}
          placeholder="Votre note sur cette page…"
          className="min-h-[70px] text-sm"
          maxLength={2000}
          aria-label="Contenu de l'annotation"
        />
        <Button
          size="sm"
          className="w-full gap-1.5"
          onClick={creerAnnotation}
          disabled={envoiEnCours}
        >
          {envoiEnCours ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <StickyNote className="h-3.5 w-3.5" />
          )}
          Annoter la page
        </Button>
      </div>

      {/* Liste (max-h + scroll — règle listes longues) */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-[52vh]">
        {annotationsQuery.isLoading ? (
          <div className="space-y-2">
            <PulseSkeleton className="h-16 w-full" />
            <PulseSkeleton className="h-16 w-full" />
          </div>
        ) : annotationsQuery.isError ? (
          <div className="rounded-md border border-destructive/50 p-3 text-center text-xs text-muted-foreground">
            {annotationsQuery.error instanceof Error
              ? annotationsQuery.error.message
              : 'Erreur de chargement'}
          </div>
        ) : annotations.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            Aucune annotation visible — les annotations privées des autres
            lecteurs ne vous sont pas montrées.
          </div>
        ) : (
          annotations.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-border bg-background p-3 space-y-1.5"
            >
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="font-mono">
                  p. {a.page}
                </Badge>
                <span className="font-medium text-foreground truncate">
                  {a.userNom}
                </span>
                {a.visibilite !== 'PRIVEE' && (
                  <Badge variant="secondary" className="gap-1 ml-auto shrink-0">
                    {a.visibilite === 'FILIERE' ? (
                      <Users className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    {visibiliteAnnotationLabel(a.visibilite)}
                  </Badge>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">
                {a.contenu}
              </p>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{new Date(a.createdAt).toLocaleString('fr-FR')}</span>
                {a.userId === userId && (
                  <button
                    type="button"
                    onClick={() => supprimer.mutate(a.id)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-destructive hover:bg-destructive/10"
                    aria-label={`Supprimer l'annotation de la page ${a.page}`}
                  >
                    <Trash2 className="h-3 w-3" />
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
