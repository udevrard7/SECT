'use client'

/**
 * Onglet Q&A IA — chat RAG ancré au document.
 *
 * EXAM-PREP-REFACTOR-1 : DS "Savane EdTech".
 *  - PulseSkeleton pendant le chargement initial
 *  - Empty state avec icône Sparkles + ds-logo-glow
 *  - Bulles user/assistant cohérentes avec la palette (primary pour user, muted pour assistant)
 *  - Citations affichées en badges primary en bas des réponses assistant
 *
 * Flux backend :
 *  - GET  /api/exam-prep/qa?documentId=X  → (endpoint non implémenté côté backend
 *    pour l'instant — on tente l'appel et on retombe gracieusement sur un thread
 *    vide si 404/405. L'historique sera disponible dès que le backend exposera GET /qa.)
 *  - POST /api/exam-prep/qa body { documentId, question } → { response, model, citations, documentId }
 *
 * HIGHLIGHT-FLASHCARD-1 : prop `prefillQuestion` (depuis DocumentReader "Explique-moi
 * ce passage"). Quand elle est non vide, on envoie automatiquement la question.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Send, BookOpen, User, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'
import { MarkdownRenderer } from '../markdown-renderer'

interface Chapter {
  id: string
  titre: string
  ordre: number
  sujets: string[]
}

interface Citation {
  chapterId?: string
  chapterTitle?: string
  chapterNumber?: number
}

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  createdAt?: string
}

interface Props {
  documentId: string
  chapters: Chapter[]
  /**
   * HIGHLIGHT-FLASHCARD-1 : question pré-remplie depuis le DocumentReader
   * (action "Explique-moi ce passage"). Quand cette prop change et est non
   * vide, on l'envoie automatiquement comme question au Q&A RAG.
   */
  prefillQuestion?: string
  /** Appelé après consommation du prefill (pour vider l'état parent). */
  onConsumePrefill?: () => void
}

const SUGGESTIONS = [
  'Explique-moi le concept principal de ce cours',
  'Quels sont les points clés à retenir pour l\'examen ?',
  'Génère-moi un résumé en 5 points',
  'Quelles sont les notions les plus difficiles ?',
]

export function ExamPrepQaTab({ documentId, chapters, prefillQuestion, onConsumePrefill }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasInitiallyScrolled = useRef(false)
  const prefillConsumedRef = useRef<string | undefined>(undefined)

  // ─── Charge l'historique ───
  // NOTE backend : GET /qa n'est pas encore implémenté — on tente l'appel
  // et on retombe gracieusement sur un thread vide si l'endpoint est absent.
  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/exam-prep/qa?documentId=${documentId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(Array.isArray(data.messages) ? data.messages : [])
      } else {
        // Endpoint non implémenté (404/405) — thread vide.
        setMessages([])
      }
    } catch {
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // ─── HIGHLIGHT-FLASHCARD-1 : prefill question depuis le DocumentReader ───
  useEffect(() => {
    if (
      prefillQuestion &&
      prefillQuestion.trim().length > 0 &&
      prefillConsumedRef.current !== prefillQuestion &&
      !sending &&
      !loading
    ) {
      prefillConsumedRef.current = prefillQuestion
      handleSend(prefillQuestion)
      onConsumePrefill?.()
    }
    // handleSend is stable enough (uses state setters + closures) — we intentionally
    // omit it from deps to avoid re-firing the prefill on every render.
  }, [prefillQuestion, sending, loading, onConsumePrefill])

  // Scroll en bas : instant au chargement initial, smooth ensuite.
  useEffect(() => {
    const behavior: ScrollBehavior = hasInitiallyScrolled.current ? 'smooth' : 'auto'
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior })
    hasInitiallyScrolled.current = true
  }, [messages])

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || sending) return

    setInput('')
    setSending(true)
    const optimistic: Message[] = [...messages, { role: 'user', content }]
    setMessages(optimistic)

    try {
      const res = await fetch('/api/exam-prep/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, question: content }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur')
      }
      const data = await res.json()
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.response ?? '',
        citations: Array.isArray(data.citations) ? data.citations : [],
      }
      setMessages([...optimistic, assistantMsg])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la question')
      setMessages(messages)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={MessageCircle}
          title="Questions au cours"
          desc="Posez vos questions — l'IA répond en citant votre document."
        />
        <Card className="h-[480px] p-4">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <PulseSkeleton key={i} className={`h-12 ${i % 2 === 0 ? 'w-3/4' : 'w-2/3 ml-auto'}`} />
            ))}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={MessageCircle}
        title="Questions au cours"
        desc={chapters.length > 0
          ? `L'IA s'appuie sur ${chapters.length} chapitre(s) de ce document pour répondre.`
          : 'L\'IA s\'appuie sur le contenu textuel de votre document pour répondre.'
        }
      />

      {/* Zone de messages */}
      <Card className="flex flex-col h-[520px]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ds-logo-glow">
                <Sparkles className="h-8 w-8 text-primary-text" />
              </div>
              <div>
                <p className="font-display font-semibold text-base">Posez votre première question</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  L&apos;IA répond en citant les passages pertinents de votre document de cours.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    disabled={sending}
                    className="text-xs px-3 py-1.5 rounded-lg border border-border/60 bg-card hover:bg-accent hover:border-primary/40 transition-all ds-press disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={msg.id ?? i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}>
                    {msg.role === 'user' ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-primary-text" />}
                  </div>
                  <div className={`flex flex-col gap-1.5 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-muted rounded-tl-sm'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <MarkdownRenderer content={msg.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    {/* Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((c, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary-text border border-primary/20">
                            <BookOpen className="h-2.5 w-2.5" />
                            {c.chapterNumber ? `Chapitre ${c.chapterNumber}` : 'Passage'}
                            {c.chapterTitle ? ` : ${c.chapterTitle}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {sending && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Sparkles className="h-4 w-4 text-primary-text" />
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Posez votre question sur ce cours…"
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 disabled:opacity-50 max-h-32"
          />
          <Button
            size="sm"
            onClick={() => handleSend()}
            disabled={sending || !input.trim()}
            className="self-end gap-1.5"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Envoyer</span>
          </Button>
        </div>
      </Card>
    </div>
  )
}

// ─── Header de section réutilisable ───

function SectionHeader({
  icon: Icon, title, desc,
}: {
  icon: typeof MessageCircle
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
