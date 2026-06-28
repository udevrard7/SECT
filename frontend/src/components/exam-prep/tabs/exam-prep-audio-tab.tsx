'use client'

/**
 * Onglet Audio — AUDIO-LEARNING-1 (Mode Audio-Learning / Podcasts de révision).
 *
 * Permet à l'étudiant de générer un podcast de ~5 minutes (script IA + synthèse
 * TTS optionnelle) qui résume les concepts clés d'un document. Le podcast est
 * un dialogue entre un "Présentateur" (host enthousiaste) et un "Expert"
 * (professeur). Si le provider IA supporte /audio/speech (TTS), un MP3 est
 * généré et stocké sur Cloudflare R2 ; sinon, seul le script textuel est
 * disponible (dégradation gracieuse).
 *
 * - GET    /api/exam-prep/documents/{id}/audio  (TanStack Query, polling 3s si EN_COURS)
 * - POST   /api/exam-prep/documents/{id}/audio  (202 → AudioGenerationQueue)
 *
 * UX :
 * - Bouton "Générer un podcast" → POST 202 → invalidation + polling 3s.
 * - Chaque carte affiche : statut (EN_COURS spinner / PRET check vert / ERREUR rouge),
 *   lecteur HTML5 <audio> si PRET + audioUrl, script collapsible (toujours si PRET),
 *   date + durée (si disponible).
 * - Empty state : "Aucun podcast généré. Cliquez sur 'Générer un podcast'…"
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Headphones, Loader2, CheckCircle2, AlertCircle, ChevronDown,
  Play, Podcast, FileText, Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface Props {
  documentId: string
}

interface DocumentAudio {
  id: string
  documentId: string
  userId: string
  script: string
  r2Key?: string | null
  durationSec?: number | null
  status: 'EN_COURS' | 'PRET' | 'ERREUR'
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
  audioUrl?: string
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ExamPrepAudioTab({ documentId }: Props) {
  const queryClient = useQueryClient()

  // ─── Liste des audios du document (TanStack Query) ───
  // Le polling 3s ne s'active QUE si au moins un audio est EN_COURS.
  const audioQuery = useQuery<{ audios: DocumentAudio[] }>({
    queryKey: ['exam-prep-audio', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/exam-prep/documents/${documentId}/audio`)
      if (!res.ok) throw new Error('Échec du chargement des podcasts')
      const data = await res.json()
      return { audios: data.audios ?? [] }
    },
    staleTime: 5 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const audios = query.state.data?.audios ?? []
      const hasPending = audios.some((a) => a.status === 'EN_COURS')
      return hasPending ? 3000 : false
    },
  })

  const audios = audioQuery.data?.audios ?? []
  const loading = audioQuery.isLoading
  const hasPending = audios.some((a) => a.status === 'EN_COURS')

  // ─── Mutation : générer un podcast ───
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/exam-prep/documents/${documentId}/audio`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec de la génération')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Podcast en cours de génération… (≈ 30 à 90 s)')
      queryClient.invalidateQueries({ queryKey: ['exam-prep-audio', documentId] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleGenerate = () => {
    generateMutation.mutate()
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ─── Empty state ───
  if (audios.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Headphones className="h-8 w-8 text-primary-text" />
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
            Aucun podcast généré
          </h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Cliquez sur « Générer un podcast » pour créer un résumé audio de
            ~5 minutes de ce document. L&apos;IA produira un dialogue engageant
            entre un présentateur et un expert.
          </p>
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className="mt-5 gap-2"
            size="sm"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Lancement…</span>
              </>
            ) : (
              <>
                <Podcast className="h-4 w-4" />
                <span>Générer un podcast</span>
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ─── Liste ───
  return (
    <div className="space-y-4">
      {/* Bandeau contextuel + bouton générer */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Headphones className="h-4 w-4 shrink-0 text-primary-text" />
          <span>
            {audios.length} podcast{audios.length > 1 ? 's' : ''} ·
            {hasPending ? ' génération en cours…' : ' à votre écoute'}
          </span>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generateMutation.isPending || hasPending}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {generateMutation.isPending || hasPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Génération…</span>
            </>
          ) : (
            <>
              <Podcast className="h-4 w-4" />
              <span>Générer un podcast</span>
            </>
          )}
        </Button>
      </div>

      {/* Liste des cartes audio */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {audios.map((a, i) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
            >
              <AudioCard audio={a} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Sous-composant : carte audio individuelle ───

function AudioCard({ audio }: { audio: DocumentAudio }) {
  const [scriptOpen, setScriptOpen] = useState(false)

  // Statut EN_COURS : spinner + message.
  if (audio.status === 'EN_COURS') {
    return (
      <Card className="border-l-4 border-l-info/60">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10">
            <Loader2 className="h-5 w-5 animate-spin text-info" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Génération en cours…</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              L&apos;IA écrit le script du podcast puis synthétise l&apos;audio.
              Cela peut prendre 30 à 90 secondes.
            </p>
          </div>
          <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-[10px]">
            <Clock className="h-3 w-3 mr-1" />
            {formatDate(audio.createdAt)}
          </Badge>
        </CardContent>
      </Card>
    )
  }

  // Statut ERREUR : message d'erreur.
  if (audio.status === 'ERREUR') {
    return (
      <Card className="border-l-4 border-l-destructive/60">
        <CardContent className="p-4 flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Échec de la génération</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {audio.errorMessage ?? 'Une erreur est survenue pendant la génération.'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Réessayez en générant un nouveau podcast.
            </p>
          </div>
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
            <Clock className="h-3 w-3 mr-1" />
            {formatDate(audio.createdAt)}
          </Badge>
        </CardContent>
      </Card>
    )
  }

  // Statut PRET : lecteur audio (si audioUrl) + script collapsible.
  const hasAudio = !!audio.audioUrl
  const duration = audio.durationSec ?? null

  return (
    <Card className="border-l-4 border-l-success/60 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Ligne 1 : icône + titre + date */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10">
            {hasAudio ? (
              <Play className="h-5 w-5 text-success-text" />
            ) : (
              <FileText className="h-5 w-5 text-success-text" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-sm">
                {hasAudio ? 'Podcast de révision' : 'Script de podcast'}
              </p>
              <Badge variant="outline" className="bg-success/10 text-success-text border-success/30 text-[10px] gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Prêt
              </Badge>
              {duration && duration > 0 ? (
                <Badge variant="outline" className="text-[10px]">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatDuration(duration)}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDate(audio.createdAt)}
            </p>
          </div>
        </div>

        {/* Lecteur audio HTML5 (si MP3 disponible) */}
        {hasAudio ? (
          <audio controls preload="metadata" className="w-full">
            <source src={audio.audioUrl} type="audio/mpeg" />
            Votre navigateur ne supporte pas la lecture audio.
          </audio>
        ) : (
          <div className="rounded-lg bg-warning/5 border-l-4 border-l-warning p-2.5">
            <p className="text-[10px] font-medium text-warning uppercase tracking-wider mb-0.5">
              Audio non disponible pour ce provider
            </p>
            <p className="text-xs">
              Le provider IA actif ne supporte pas la synthèse audio (TTS).
              Voici le script du podcast — vous pouvez le lire à l&apos;écran
              ou le faire lire par votre navigateur.
            </p>
          </div>
        )}

        {/* Script collapsible */}
        <button
          onClick={() => setScriptOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${scriptOpen ? 'rotate-180' : ''}`}
          />
          {scriptOpen ? 'Masquer le script' : 'Lire le script'}
        </button>

        <AnimatePresence>
          {scriptOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-2 border-t border-border/40">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground/90 max-h-96 overflow-y-auto">
                  {audio.script || '(script vide)'}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
