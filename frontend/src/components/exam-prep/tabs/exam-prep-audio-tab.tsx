'use client'

/**
 * Onglet Audio — AUDIO-LEARNING-1 (Mode Audio-Learning / Podcasts de révision).
 *
 * EXAM-PREP-REFACTOR-1 : DS "Savane EdTech".
 *  - PulseSkeleton pendant le chargement
 *  - Empty state avec icône Headphones + CTA générer
 *  - Cards cohérentes (rounded-xl, border-l-4 selon statut)
 *  - Couleurs sémantiques (info=EN_COURS, success=PRET, destructive=ERREUR)
 *  - Boutons touch-target ≥ 44px (h-9 minimum)
 *
 * SECT-TTS-5 — PRÉSENTATION « ÉMISSION DE RADIO » : l'onglet devient
 * l'antenne « Révision Express » — émission à personnages nommés et
 * titrés (Aya Konan, journaliste et animatrice ; docteur Kouassi Brou,
 * expert invité), numéro d'épisode par auditeur, génériques d'ouverture
 * et de clôture, script affiché en DIALOGUE avec pastilles de
 * locuteur (et non plus en bloc brut).
 *
 * Permet à l'étudiant de générer un épisode de ~6 minutes (script IA
 * « émission de radio » + synthèse TTS MULTI-VOIX — SECT-TTS-3 : deux
 * voix studio distinctes dirigées comme des intervenants d'antenne,
 * chaîne 0 coût Gemini duo → MeloTTS, Edge retiré SECT-TTS-4) qui
 * résume les concepts clés d'un document.
 *
 * - GET    /api/exam-prep/documents/{id}/audio  (TanStack Query, polling 3s si EN_COURS)
 * - POST   /api/exam-prep/documents/{id}/audio  (202 → AudioGenerationQueue)
 *
 * UX :
 * - Bouton "Générer un podcast" → POST 202 → invalidation + polling 3s.
 * - Chaque carte affiche : numéro d'épisode, statut (EN_COURS spinner /
 *   PRET check vert / ERREUR rouge), intervenants, lecteur HTML5 <audio>
 *   si PRET + audioUrl, script en dialogue (toujours si PRET), date + durée.
 */

import { useCallback, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Headphones, Loader2, CheckCircle2, AlertCircle, ChevronDown,
  Play, Podcast, FileText, Clock, RefreshCw, Trash2, Radio, Mic,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PulseSkeleton } from '@/components/ds'
import { useAuthStore } from '@/stores/auth-store'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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

// ─── Identité de l'émission (SECT-TTS-5) ───
// Miroir des personnages imposés par le prompt worker (buildPodcastPrompt)
// et reconnus par parserDialogue côté backend — même casting à l'écran
// et à l'antenne.
const SHOW_NAME = 'Révision Express'
const SHOW_SIGNATURE = 'Réviser malin, réussir tranquillement'
const HOSTS = 'Aya Konan & Dr Kouassi Brou'

// classerLocuteur — type d'intervenant d'après le marqueur de réplique
// (« Aya : », « Dr Brou : », hérités « Présentateur : » / « Expert : »).
function classerLocuteur(marqueur: string): 'aya' | 'brou' | null {
  const n = marqueur
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/^(aya|presentateur|animateur|host)\b/.test(n)) return 'aya'
  if (/^(dr\s*brou|docteur\s*brou|brou|docteur|expert|professeur)\b/.test(n)) return 'brou'
  return null
}

interface Replique {
  marqueur: string
  texte: string
}

// parseRepliques — découpe le script en répliques pour l'affichage en
// dialogue. Miroir strict (et volontairement simple) de parserDialogue
// côté backend : ligne commençant par « Quelqu'un : » = nouvelle
// réplique, les lignes de continuation rejoignent la réplique courante.
function parseRepliques(script: string): Replique[] {
  const repliques: Replique[] = []
  for (const ligne of script.split('\n')) {
    const l = ligne.trim()
    if (!l) continue
    const m = l.match(/^([A-Za-zÀ-ÿ'’ .-]{2,40}?)\s*:\s*(.*)$/)
    if (m && classerLocuteur(m[1])) {
      repliques.push({ marqueur: m[1].trim(), texte: m[2].trim() })
    } else if (repliques.length > 0) {
      repliques[repliques.length - 1].texte += ` ${l}`
    }
  }
  return repliques
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
  const userId = useAuthStore((s) => s.user?.id ?? null)

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
    placeholderData: (prev) => prev,
    refetchInterval: (query) => {
      const audios = query.state.data?.audios ?? []
      const hasPending = audios.some((a) => a.status === 'EN_COURS')
      return hasPending ? 3000 : false
    },
  })

  const audios = audioQuery.data?.audios ?? []
  const loading = audioQuery.isLoading
  const error = audioQuery.error
  const hasPending = audios.some((a) => a.status === 'EN_COURS')

  // Numéro d'épisode SECT-TTS-5 : les podcasts d'un même auditeur sur ce
  // document, dans leur ordre de création (la liste arrive DESC). Miroir
  // du décompte fait par le worker (compterEpisodes) — le numéro affiché
  // est celui qu'Aya annonce à l'antenne.
  const episodeOf = useCallback(
    (a: DocumentAudio) =>
      audios.filter(
        (x) => x.userId === a.userId && new Date(x.createdAt) <= new Date(a.createdAt),
      ).length,
    [audios],
  )

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
      toast.success(`${SHOW_NAME} : épisode en préparation… (≈ 1 à 4 min, deux voix d'antenne)`)
      queryClient.invalidateQueries({ queryKey: ['exam-prep-audio', documentId] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleGenerate = () => {
    generateMutation.mutate()
  }

  // ─── Mutation : supprimer un podcast ───
  // AUDIO-DELETE-STUDENT : DELETE /api/exam-prep/audio/{id}. L'utilisateur ne
  // peut supprimer que ses propres podcasts (vérif usecase + policy RLS).
  const deleteMutation = useMutation({
    mutationFn: async (audioId: string) => {
      const res = await fetch(`/api/exam-prep/audio/${audioId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec de la suppression')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Podcast supprimé')
      queryClient.invalidateQueries({ queryKey: ['exam-prep-audio', documentId] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleDelete = (audioId: string) => {
    deleteMutation.mutate(audioId)
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <PulseSkeleton key={i} variant="card" className="h-24" />
          ))}
        </div>
      </div>
    )
  }

  // ─── Error ───
  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader />
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <p className="mt-3 text-sm font-medium">Échec du chargement des épisodes</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['exam-prep-audio', documentId] })}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Empty state ───
  if (audios.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeader />
        <Card className="border-dashed ds-kente-watermark">
          <CardContent className="relative flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Radio className="h-8 w-8 text-primary-text" aria-hidden />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
              L'antenne n'a pas encore diffusé d'épisode
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Cliquez sur « Générer un podcast » pour mettre à l'antenne «&nbsp;{SHOW_NAME}&nbsp;»
              : {HOSTS} transforment ce cours en émission de radio de ~6 minutes —
              générique, concepts clés, pièges d'examen, quiz éclair et moyen
              mnémotechnique.
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
      </div>
    )
  }

  // ─── Liste ───
  return (
    <div className="space-y-6">
      {/* Header + bouton générer */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          desc={`${audios.length} épisode(s) · ${hasPending ? 'en direct de la rédaction…' : 'à votre écoute'}`}
        />
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
              <AudioCard
                audio={a}
                episode={episodeOf(a)}
                isMine={userId === a.userId}
                onDelete={handleDelete}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === a.id}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Sous-composant : carte audio individuelle ───

function AudioCard({
  audio,
  episode,
  isMine = false,
  onDelete,
  isDeleting = false,
}: {
  audio: DocumentAudio
  episode?: number
  isMine?: boolean
  onDelete: (audioId: string) => void
  isDeleting?: boolean
}) {
  const [scriptOpen, setScriptOpen] = useState(false)

  // Titre de la carte : « Épisode N » (SECT-TTS-5 — même numéro que celui
  // annoncé à l'antenne), sous-titre d'émission.
  const titre = episode && episode > 0 ? `Épisode ${episode}` : 'Podcast de révision'

  // Bouton supprimer réutilisable (AlertDialog de confirmation). Affiché sur
  // tous les statuts (EN_COURS pour annuler une génération bloquée, ERREUR pour
  // nettoyer, PRET pour retirer un podcast terminé).
  const deleteButton = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
          disabled={isDeleting}
          aria-label="Supprimer le podcast"
          title="Supprimer le podcast"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce podcast ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est définitive. Le podcast et son script seront
            définitivement supprimés. Cette action ne peut pas être annulée.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onDelete(audio.id)}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Suppression…' : 'Supprimer'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // Statut EN_COURS : spinner + message radio.
  if (audio.status === 'EN_COURS') {
    return (
      <Card className="border-l-4 border-l-info/60">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-info/10">
            <Loader2 className="h-5 w-5 animate-spin text-info" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{titre} — en préparation…</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              La rédaction écrit le script ({HOSTS}), puis chaque intervenant
              est synthétisé avec sa voix d'antenne. Cela peut prendre 1 à 4 minutes.
            </p>
          </div>
          <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-[10px] shrink-0">
            <Clock className="h-3 w-3 mr-1" />
            {formatDate(audio.createdAt)}
          </Badge>
          {deleteButton}
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
            <p className="font-semibold text-sm">{titre} — échec de la mise à l'antenne</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {audio.errorMessage ?? 'Une erreur est survenue pendant la génération.'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Réessayez en générant un nouvel épisode.
            </p>
          </div>
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px] shrink-0">
            <Clock className="h-3 w-3 mr-1" />
            {formatDate(audio.createdAt)}
          </Badge>
          {deleteButton}
        </CardContent>
      </Card>
    )
  }

  // Statut PRET : lecteur audio (si audioUrl) + script en dialogue.
  const hasAudio = !!audio.audioUrl
  const duration = audio.durationSec ?? null
  const repliques = parseRepliques(audio.script || '')

  return (
    <Card className="border-l-4 border-l-success/60 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Ligne 1 : icône + titre + date + bouton supprimer */}
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
                {hasAudio ? `${SHOW_NAME} — ${titre}` : `${titre} (script)`}
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
              {!isMine && (
                <Badge variant="outline" className="text-[10px]" title="Généré par un autre auditeur">
                  <Mic className="h-3 w-3 mr-1" />
                  Autre auditeur
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Avec {HOSTS} · «&nbsp;{SHOW_SIGNATURE}&nbsp;» · {formatDate(audio.createdAt)}
            </p>
          </div>
          {deleteButton}
        </div>

        {/* Lecteur audio HTML5 (si audio disponible — WAV Gemini ou MP3
            Edge/Voxtral selon le fournisseur, SECT-TTS-3 : le type suit
            l'extension de la clé R2 présignée). */}
        {hasAudio ? (
          <audio controls preload="metadata" className="w-full">
            <source
              src={audio.audioUrl}
              type={audio.audioUrl?.toLowerCase().includes('.wav') ? 'audio/wav' : 'audio/mpeg'}
            />
            Votre navigateur ne supporte pas la lecture audio.
          </audio>
        ) : (
          <div className="rounded-lg bg-warning/5 border-l-4 border-l-warning p-2.5">
            <p className="text-[10px] font-medium text-warning uppercase tracking-wider mb-0.5">
              Synthèse vocale indisponible pour ce podcast
            </p>
            <p className="text-xs">
              Tous les fournisseurs vocaux gratuits étaient en échec au moment
              de la génération. Voici le script du podcast — vous pouvez le lire
              à l&apos;écran ou relancer une génération.
            </p>
          </div>
        )}

        {/* Script en dialogue (SECT-TTS-5 : pastilles de locuteur au lieu
            d'un bloc brut — le script se lit comme un scénario d'émission) */}
        <button
          onClick={() => setScriptOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={scriptOpen}
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
              <div className="pt-2 border-t border-border/40 max-h-96 overflow-y-auto scrollbar-thin space-y-2.5">
                {repliques.length > 0 ? (
                  repliques.map((r, idx) => <LigneDialogue key={idx} replique={r} />)
                ) : (
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground/90">
                    {audio.script || '(script vide)'}
                  </pre>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

// ─── Sous-composant : une réplique du script (SECT-TTS-5) ───

function LigneDialogue({ replique }: { replique: Replique }) {
  const type = classerLocuteur(replique.marqueur)
  // Intervenants titrés : même casting qu'à l'antenne (buildPodcastPrompt).
  const nomComplet =
    type === 'aya'
      ? 'Aya Konan'
      : type === 'brou'
        ? 'Dr Kouassi Brou'
        : replique.marqueur
  const role = type === 'aya' ? 'Animatrice' : type === 'brou' ? 'Expert invité' : ''
  const pastille =
    type === 'aya'
      ? 'bg-primary/10 text-primary-text border-primary/30'
      : type === 'brou'
        ? 'bg-warning/10 text-warning border-warning/30'
        : 'bg-muted text-muted-foreground border-border'

  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${pastille}`}
      >
        {type === 'aya' && <Mic className="h-2.5 w-2.5" aria-hidden />}
        {type === 'brou' && <Headphones className="h-2.5 w-2.5" aria-hidden />}
        {nomComplet}
        {role && <span className="font-normal opacity-70">· {role}</span>}
      </span>
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/90">
        {replique.texte}
      </p>
    </div>
  )
}

// ─── Header de section : l'antenne « Révision Express » ───

function SectionHeader({ desc }: { desc?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Radio className="h-5 w-5 text-primary-text" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="font-display text-base font-semibold tracking-tight">
            {SHOW_NAME}
          </h2>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Mic className="h-3 w-3" aria-hidden /> {HOSTS}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {desc ??
            `Votre émission de révision : ~6 minutes de dialogue radio — générique, concepts clés, pièges d'examen, quiz éclair.`}
        </p>
      </div>
    </div>
  )
}
