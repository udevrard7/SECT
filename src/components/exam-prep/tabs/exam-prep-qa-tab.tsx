'use client'

/**
 * Onglet Q&A IA — chat RAG ancré au document.
 *
 * - Recharge l'historique du thread au montage (GET /api/exam-prep/qa)
 * - POST /api/exam-prep/qa à chaque envoi
 * - Affiche les citations [Chapitre X] sous la réponse de l'IA
 * - Suggestions de questions cliquables au démarrage
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Send, Loader2, BookOpen, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'

interface Chapter {
  id: string
  titre: string
  ordre: number
  sujets: string[]
}

interface Citation {
  chapterId: string
  chapterTitle: string
  chapterNumber: number
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
}

const SUGGESTIONS = [
  'Explique-moi le concept principal de ce cours',
  'Quels sont les points clés à retenir pour l\'examen ?',
  'Génère-moi un résumé en 5 points',
  'Quelles sont les notions les plus difficiles ?',
]

export function ExamPrepQaTab({ documentId, chapters }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ─── Charge l'historique ───
  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/exam-prep/qa?documentId=${documentId}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages ?? [])
      }
    } catch {
      // Silent — l'utilisateur verra juste un thread vide
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Scroll en bas à chaque nouveau message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || sending) return

    setInput('')
    setSending(true)
    // Optimistic : ajoute le message user immédiatement
    const optimistic: Message[] = [...messages, { role: 'user', content }]
    setMessages(optimistic)

    try {
      const res = await fetch('/api/exam-prep/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, message: content }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erreur')
      }
      const data = await res.json()
      setMessages([...optimistic, data.message])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la question')
      // Retire le message optimistic en cas d'erreur
      setMessages(messages)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau contextuel */}
      {chapters.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          <span>L'IA s'appuie sur {chapters.length} chapitre{chapters.length > 1 ? 's' : ''} de ce document pour répondre.</span>
        </div>
      )}

      {/* Zone de messages */}
      <Card className="flex flex-col h-[480px]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ds-logo-glow">
                <Sparkles className="h-7 w-7 text-primary-text" />
              </div>
              <div>
                <p className="font-display font-semibold">Posez votre première question</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  L'IA répond en citant les passages pertinents de votre document de cours.
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
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {/* Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((c, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary-text border border-primary/20">
                            <BookOpen className="h-2.5 w-2.5" />
                            Chapitre {c.chapterNumber} : {c.chapterTitle}
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
