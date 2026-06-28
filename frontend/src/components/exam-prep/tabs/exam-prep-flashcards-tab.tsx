'use client'

/**
 * Onglet Flashcards — HIGHLIGHT-FLASHCARD-1.
 *
 * EXAM-PREP-REFACTOR-1 : DS "Savane EdTech".
 *  - PulseSkeleton pendant le chargement
 *  - Empty state avec icône Inbox + ds-kente-watermark + CTA "Lire le document"
 *  - StatCard pour le compteur en haut
 *  - Cartes avec animation flip (Framer Motion) + kente-top sur la première
 *  - Couleurs sémantiques (primary pour "Question", success pour "Réponse")
 *
 * Liste les flashcards de l'étudiant pour le document courant (générées
 * depuis le DocumentReader via "Sélectionner → Créer une Flashcard").
 *
 * - GET    /api/exam-prep/flashcards?documentId=X (TanStack Query)
 * - DELETE /api/exam-prep/flashcards/{id} (avec invalidation)
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Layers, Trash2, Loader2, Sparkles, RotateCw, Inbox, AlertCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatCard, PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'

interface Chapter {
  id: string
  titre: string
  ordre: number
  sujets: string[]
}

interface Flashcard {
  id: string
  chapterId?: string | null
  documentId?: string | null
  recto: string
  verso: string
  createdAt: string
}

interface Props {
  documentId: string
  chapters: Chapter[]
}

export function ExamPrepFlashcardsTab({ documentId, chapters }: Props) {
  const queryClient = useQueryClient()
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})

  // ─── Liste des flashcards (TanStack Query) ───
  const flashcardsQuery = useQuery<{ flashcards: Flashcard[] }>({
    queryKey: ['exam-prep-flashcards', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/exam-prep/flashcards?documentId=${documentId}`)
      if (!res.ok) throw new Error('Failed to fetch flashcards')
      const data = await res.json()
      return { flashcards: data.flashcards ?? [] }
    },
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  })

  const flashcards = flashcardsQuery.data?.flashcards ?? []
  const loading = flashcardsQuery.isLoading
  const error = flashcardsQuery.error

  // ─── Mutation : suppression ───
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/exam-prep/flashcards/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Échec de la suppression')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-prep-flashcards', documentId] })
      toast.success('Flashcard supprimée')
    },
    onError: () => {
      toast.error('Échec de la suppression')
    },
  })

  const handleFlip = (id: string) => {
    setFlipped((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id)
  }

  const chapterTitle = (chapterId?: string | null) => {
    if (!chapterId) return null
    const ch = chapters.find((c) => c.id === chapterId)
    return ch?.titre ?? null
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={Layers}
          title="Flashcards"
          desc="Cartes Q/R générées depuis les passages sélectionnés dans le lecteur."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <PulseSkeleton key={i} variant="card" className="h-56" />
          ))}
        </div>
      </div>
    )
  }

  // ─── Error ───
  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={Layers}
          title="Flashcards"
          desc="Cartes Q/R générées depuis les passages sélectionnés dans le lecteur."
        />
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <p className="mt-3 text-sm font-medium">Échec du chargement des flashcards</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['exam-prep-flashcards', documentId] })}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Empty state ───
  if (flashcards.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={Layers}
          title="Flashcards"
          desc="Cartes Q/R générées depuis les passages sélectionnés dans le lecteur."
        />
        <Card className="border-dashed ds-kente-watermark">
          <CardContent className="relative flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Inbox className="h-8 w-8 text-primary-text" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
              Aucune flashcard pour l&apos;instant
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Ouvrez le document en mode lecture (bouton <span className="font-medium">Lire</span>),
              sélectionnez un passage pertinent, puis cliquez sur
              <span className="inline-flex items-center gap-1 mx-1 font-medium text-primary-text">
                <Sparkles className="h-3 w-3" /> Créer une Flashcard
              </span>
              pour générer automatiquement une carte Q/R.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Liste ───
  return (
    <div className="space-y-6">
      {/* Header + compteur */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          icon={Layers}
          title="Flashcards"
          desc={`${flashcards.length} carte(s) · cliquez pour retourner la carte`}
        />
        <Badge variant="outline" className="text-[10px] gap-1">
          <RotateCw className="h-3 w-3" />
          SRS actif
        </Badge>
      </div>

      {/* Grille de flashcards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {flashcards.map((fc, i) => {
            const isFlipped = !!flipped[fc.id]
            const chTitle = chapterTitle(fc.chapterId)
            return (
              <motion.div
                key={fc.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.04, duration: 0.25, ease: 'easeOut' }}
                className="group"
              >
                <Card
                  className={`relative h-56 cursor-pointer overflow-hidden ds-lift transition-all hover:shadow-lg ${i === 0 ? 'ds-kente-top' : ''}`}
                  onClick={() => handleFlip(fc.id)}
                >
                  <CardContent className="h-full p-0">
                    {/* Recto / Verso avec flip */}
                    <div className="relative h-full w-full">
                      {/* Recto */}
                      <div
                        className={`absolute inset-0 flex flex-col p-4 transition-all duration-300 ${
                          isFlipped ? 'opacity-0 -translate-y-2' : 'opacity-100'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <Badge
                            variant="secondary"
                            className="text-[9px] bg-primary/10 text-primary-text"
                          >
                            Question
                          </Badge>
                          {chTitle && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[60%]">
                              {chTitle}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 flex items-center">
                          <p className="text-sm font-medium leading-snug">{fc.recto}</p>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <RotateCw className="h-2.5 w-2.5" /> Cliquer pour retourner
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(fc.id)
                            }}
                            disabled={deleteMutation.isPending}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive disabled:opacity-30"
                            aria-label="Supprimer la flashcard"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Verso */}
                      <div
                        className={`absolute inset-0 flex flex-col p-4 bg-success/5 transition-all duration-300 ${
                          isFlipped ? 'opacity-100' : 'opacity-0 translate-y-2'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <Badge
                            variant="secondary"
                            className="text-[9px] bg-success/15 text-success-text"
                          >
                            Réponse
                          </Badge>
                          {chTitle && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[60%]">
                              {chTitle}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 flex items-center overflow-y-auto scrollbar-thin">
                          <p className="text-sm leading-relaxed text-foreground/90">{fc.verso}</p>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <RotateCw className="h-2.5 w-2.5" /> Cliquer pour retourner
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(fc.id)
                            }}
                            disabled={deleteMutation.isPending}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive disabled:opacity-30"
                            aria-label="Supprimer la flashcard"
                            title="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Header de section réutilisable ───

function SectionHeader({
  icon: Icon, title, desc,
}: {
  icon: typeof Layers
  title: string
  desc: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary-text" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  )
}
