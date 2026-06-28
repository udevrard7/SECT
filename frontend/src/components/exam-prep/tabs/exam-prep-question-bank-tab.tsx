'use client'

/**
 * Onglet Banque — QUESTION-BANK-1.
 *
 * Banque de questions collaborative pour le document courant. Affiche toutes
 * les questions validées (générées par l'IA lors des sessions d'entraînement
 * précédentes) avec leurs stats de vote. Les étudiants peuvent upvote/
 * downvote pour faire émerger les questions les plus pertinentes.
 *
 * - GET    /api/exam-prep/question-bank?documentId=X  (TanStack Query)
 * - POST   /api/exam-prep/questions/{id}/vote         (upsert +1/-1)
 * - DELETE /api/exam-prep/questions/{id}/vote         (un-vote)
 *
 * UX vote : si l'utilisateur a déjà voté (+1 ou -1), le bouton correspondant
 * est mis en évidence ; cliquer à nouveau sur le même bouton supprime le vote
 * (DELETE) ; cliquer sur le bouton opposé bascule le vote (POST avec la valeur
 * opposée). Si l'utilisateur n'a pas voté, les deux boutons sont cliquables.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Library,
  Loader2, Inbox, Award,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface Props {
  documentId: string
}

interface QuestionBankItem {
  id: string
  type: string
  enonce: string
  propositions: Array<{ text?: string; texte?: string }> | string[] | null
  reponseCorrecte: string | null
  explication: string | null
  difficulte: string
  themes: string[] | string | null
  validee: boolean
  createdAt: string
  netVotes: number
  upvotes: number
  downvotes: number
  userVote: number | null // +1, -1, ou null
}

const DIFF_COLORS: Record<string, string> = {
  FACILE: 'bg-success/15 text-success-text border-success/30',
  MOYEN: 'bg-info/15 text-info border-info/30',
  DIFFICILE: 'bg-warning/15 text-warning border-warning/30',
  EXPERT: 'bg-destructive/15 text-destructive border-destructive/30',
}

const TYPE_LABELS: Record<string, string> = {
  QCU: 'QCU',
  QCM: 'QCM',
  QRC: 'Réponse courte',
  REFLEXION: 'Réflexion',
  CODE: 'Code',
  TRS: 'Vrai/Faux',
}

// Normalise les propositions en Array<{ texte: string }> | null.
function normalizePropositions(
  props: QuestionBankItem['propositions'],
): Array<{ texte: string }> | null {
  if (!props) return null
  if (Array.isArray(props)) {
    const mapped = props
      .map((p: any) => {
        if (typeof p === 'string') return { texte: p }
        if (p && typeof p === 'object') {
          if (typeof p.texte === 'string') return { texte: p.texte }
          if (typeof p.text === 'string') return { texte: p.text }
        }
        return null
      })
      .filter((p): p is { texte: string } => p !== null)
    return mapped.length > 0 ? mapped : null
  }
  return null
}

// Normalise themes en string[].
function normalizeThemes(themes: QuestionBankItem['themes']): string[] {
  if (Array.isArray(themes)) return themes.filter((t): t is string => typeof t === 'string')
  if (typeof themes === 'string' && themes) {
    try {
      const p = JSON.parse(themes)
      return Array.isArray(p) ? p.filter((t): t is string => typeof t === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

export function ExamPrepQuestionBankTab({ documentId }: Props) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // ─── Liste des questions de la banque (TanStack Query) ───
  const bankQuery = useQuery<{ questions: QuestionBankItem[] }>({
    queryKey: ['exam-prep-question-bank', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/exam-prep/question-bank?documentId=${documentId}&limit=50`)
      if (!res.ok) throw new Error('Échec du chargement de la banque')
      const data = await res.json()
      return { questions: data.questions ?? [] }
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  })

  const questions = bankQuery.data?.questions ?? []
  const loading = bankQuery.isLoading

  // ─── Mutation : voter (upsert) ───
  const voteMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: 1 | -1 }) => {
      const res = await fetch(`/api/exam-prep/questions/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec du vote')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-prep-question-bank', documentId] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // ─── Mutation : retirer son vote (un-vote) ───
  const removeVoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/exam-prep/questions/${id}/vote`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Échec du retrait de vote')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam-prep-question-bank', documentId] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Handler unifié pour le clic sur un bouton de vote.
  // - Si userVote === value → retirer le vote (toggle off)
  // - Sinon → voter avec cette valeur (upsert : bascule ou nouveau vote)
  const handleVote = (q: QuestionBankItem, value: 1 | -1) => {
    if (q.userVote === value) {
      removeVoteMutation.mutate(q.id)
    } else {
      voteMutation.mutate({ id: q.id, value })
    }
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
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
  if (questions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Inbox className="h-8 w-8 text-primary-text" />
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
            Aucune question partagée pour ce document
          </h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Soyez le premier à vous entraîner ! Lancez une session dans l&apos;onglet
            <span className="inline-flex items-center gap-1 mx-1 font-medium text-primary-text">
              <Award className="h-3 w-3" /> Entraînement
            </span>
            — les questions générées par l&apos;IA seront automatiquement partagées
            ici pour toute la classe.
          </p>
        </CardContent>
      </Card>
    )
  }

  // ─── Liste ───
  return (
    <div className="space-y-4">
      {/* Bandeau contextuel */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Library className="h-4 w-4 shrink-0 text-primary-text" />
          <span>
            {questions.length} question{questions.length > 1 ? 's' : ''} partagée{questions.length > 1 ? 's' : ''} ·
            cliquez pour voir le détail · votez pour faire émerger les meilleures
          </span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          Collaboratif
        </Badge>
      </div>

      {/* Liste des questions */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {questions.map((q, i) => {
            const isExpanded = !!expanded[q.id]
            const props = normalizePropositions(q.propositions)
            const themes = normalizeThemes(q.themes)
            const isChoice = props !== null
            const userVotedUp = q.userVote === 1
            const userVotedDown = q.userVote === -1
            return (
              <motion.div
                key={q.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
              >
                <Card className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    {/* Ligne 1 : badges + vote */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary-text">
                            {TYPE_LABELS[q.type] ?? q.type}
                          </Badge>
                          {q.difficulte && (
                            <Badge variant="outline" className={`text-[10px] ${DIFF_COLORS[q.difficulte] ?? ''}`}>
                              {q.difficulte}
                            </Badge>
                          )}
                          {themes.slice(0, 3).map((t, idx) => (
                            <Badge key={idx} variant="outline" className="text-[10px] bg-muted/50">
                              {t}
                            </Badge>
                          ))}
                          {themes.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{themes.length - 3}</span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed line-clamp-2">{q.enonce}</p>
                      </div>

                      {/* Bloc vote */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => handleVote(q, 1)}
                          disabled={voteMutation.isPending || removeVoteMutation.isPending}
                          className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ds-press disabled:opacity-40 ${
                            userVotedUp
                              ? 'bg-success/20 text-success-text'
                              : 'text-muted-foreground hover:bg-success/10 hover:text-success-text'
                          }`}
                          aria-label="Vote positif"
                          title={userVotedUp ? 'Retirer mon vote positif' : 'Voter positivement'}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <span className={`text-xs font-semibold tabular-nums ${
                          q.netVotes > 0 ? 'text-success-text' : q.netVotes < 0 ? 'text-destructive' : 'text-muted-foreground'
                        }`}>
                          {q.netVotes > 0 ? '+' : ''}{q.netVotes}
                        </span>
                        <button
                          onClick={() => handleVote(q, -1)}
                          disabled={voteMutation.isPending || removeVoteMutation.isPending}
                          className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ds-press disabled:opacity-40 ${
                            userVotedDown
                              ? 'bg-destructive/20 text-destructive'
                              : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                          }`}
                          aria-label="Vote négatif"
                          title={userVotedDown ? 'Retirer mon vote négatif' : 'Voter négativement'}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Ligne 2 : bouton expand */}
                    <button
                      onClick={() => toggleExpand(q.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? (
                        <><ChevronUp className="h-3.5 w-3.5" /> Masquer le détail</>
                      ) : (
                        <><ChevronDown className="h-3.5 w-3.5" /> Voir le détail {isChoice ? `(${props!.length} propositions)` : '(réponse ouverte)'}</>
                      )}
                    </button>

                    {/* Détail expansé (lecture seule) */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-3 pt-1 border-t border-border/40">
                            {/* Propositions */}
                            {isChoice && (
                              <div className="space-y-1.5 pt-2">
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                  Propositions
                                </p>
                                {props!.map((p, idx) => (
                                  <div
                                    key={idx}
                                    className="rounded-md border border-border/50 bg-muted/30 px-3 py-1.5 text-xs"
                                  >
                                    <span className="font-mono text-muted-foreground mr-2">{String.fromCharCode(65 + idx)}.</span>
                                    {p.texte}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Réponse correcte */}
                            {q.reponseCorrecte && (
                              <div className="rounded-lg bg-success/5 border-l-4 border-l-success p-2.5">
                                <p className="text-[10px] font-medium text-success-text uppercase tracking-wider mb-0.5">
                                  Réponse attendue
                                </p>
                                <p className="text-xs">{q.reponseCorrecte}</p>
                              </div>
                            )}

                            {/* Explication */}
                            {q.explication && (
                              <div className="rounded-lg bg-info/5 border-l-4 border-l-info p-2.5">
                                <p className="text-[10px] font-medium text-info uppercase tracking-wider mb-0.5">
                                  Explication
                                </p>
                                <p className="text-xs">{q.explication}</p>
                              </div>
                            )}

                            {/* Stats de vote détaillées */}
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
                              <span className="flex items-center gap-1">
                                <ThumbsUp className="h-3 w-3 text-success-text" /> {q.upvotes}
                              </span>
                              <span className="flex items-center gap-1">
                                <ThumbsDown className="h-3 w-3 text-destructive" /> {q.downvotes}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
