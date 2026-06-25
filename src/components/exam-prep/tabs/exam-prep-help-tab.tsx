'use client'

/**
 * Onglet Aide prof — messagerie étudiant↔enseignant ancrée au document.
 *
 * - Liste les threads existants (GET /api/exam-prep/help?documentId)
 * - Bouton « Nouvelle question » → form (sujet, message, chapter?)
 * - POST /api/exam-prep/help pour créer
 * - Vue conversation : GET /api/exam-prep/help/[id]/messages + POST pour répondre
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Plus, Send, Loader2, MessageCircle, ArrowLeft,
  HelpCircle, CheckCircle2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PulseSkeleton } from '@/components/ds'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface Chapter { id: string; titre: string; ordre: number; sujets: string[] }

interface Thread {
  id: string
  sujet: string
  statut: string
  passageContext: string | null
  updatedAt: string
  chapter: { id: string; titre: string } | null
  etudiant: { id: string; name: string }
  enseignant: { id: string; name: string } | null
  _count?: { messages: number }
  messages?: Array<{ id: string; auteurId: string; role: string; content: string; createdAt: string }>
}

interface Props {
  documentId: string
  chapters: Chapter[]
  documentName: string
}

export function ExamPrepHelpTab({ documentId, chapters, documentName }: Props) {
  const { user } = useAuthStore()
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Thread | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form
  const [formSujet, setFormSujet] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formChapterId, setFormChapterId] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/exam-prep/help?documentId=${documentId}`)
      if (res.ok) {
        const data = await res.json()
        setThreads(data.threads ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!formSujet.trim() || !formMessage.trim()) {
      toast.error('Sujet et message requis')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/exam-prep/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          chapterId: formChapterId || undefined,
          sujet: formSujet,
          message: formMessage,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Question envoyée au professeur')
      setShowForm(false)
      setFormSujet('')
      setFormMessage('')
      setFormChapterId('')
      load()
    } catch {
      toast.error('Échec de l\'envoi')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return <PulseSkeleton className="h-64 w-full" variant="card" />
  }

  // ─── Vue conversation ───
  if (selected) {
    return (
      <ConversationView
        thread={selected}
        currentUserId={user?.id ?? ''}
        onBack={() => { setSelected(null); load() }}
      />
    )
  }

  // ─── Vue liste + form ───
  return (
    <div className="space-y-4">
      {/* CTA nouvelle question */}
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-4">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-3 w-full text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Plus className="h-5 w-5 text-primary-text" />
              </div>
              <div>
                <p className="font-semibold text-sm">Poser une question au professeur</p>
                <p className="text-xs text-muted-foreground">{documentName}</p>
              </div>
            </button>
          ) : (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Nouvelle question</p>
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="h-7 w-7 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {chapters.length > 0 && (
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Chapitre concerné (optionnel)</label>
                  <select value={formChapterId} onChange={(e) => setFormChapterId(e.target.value)} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm mt-1">
                    <option value="">Non spécifié</option>
                    {chapters.map((ch) => (
                      <option key={ch.id} value={ch.id}>Ch.{ch.ordre + 1} : {ch.titre}</option>
                    ))}
                  </select>
                </div>
              )}
              <input
                type="text"
                value={formSujet}
                onChange={(e) => setFormSujet(e.target.value)}
                placeholder="Sujet court (ex. « Je ne comprends pas la dérivée »)"
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              />
              <textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Détaillez votre question…"
                rows={4}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
              />
              <Button onClick={handleCreate} disabled={creating} className="w-full gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Envoyer au professeur
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Liste des threads */}
      {threads.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">Aucune question pour le moment</p>
            <p className="text-xs text-muted-foreground mt-1">Vos échanges avec le professeur apparaîtront ici.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="w-full text-left rounded-lg border border-border/60 bg-card p-3 hover:shadow-sm hover:border-primary/30 transition-all ds-lift"
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  t.statut === 'REPONDU' ? 'bg-success/10' : t.statut === 'CLOS' ? 'bg-muted' : 'bg-warning/10'
                }`}>
                  {t.statut === 'REPONDU' ? <CheckCircle2 className="h-4 w-4 text-success-text" />
                   : <HelpCircle className="h-4 w-4 text-warning" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate flex-1">{t.sujet}</p>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${
                      t.statut === 'REPONDU' ? 'bg-success/10 text-success-text'
                      : t.statut === 'CLOS' ? 'bg-muted text-muted-foreground'
                      : 'bg-warning/10 text-warning'
                    }`}>{t.statut}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.chapter ? `Ch.${t.chapter.titre} · ` : ''}{t._count?.messages ?? 0} message(s)
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Vue conversation ───

function ConversationView({
  thread, currentUserId, onBack,
}: {
  thread: Thread
  currentUserId: string
  onBack: () => void
}) {
  const [messages, setMessages] = useState<NonNullable<Thread['messages']>>(thread.messages ?? [])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(!thread.messages)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Charge les messages complets si pas déjà inclus
  useEffect(() => {
    if (thread.messages) return
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/exam-prep/help/${thread.id}/messages`)
        if (res.ok) {
          const data = await res.json()
          setMessages(data.thread?.messages ?? [])
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [thread.id, thread.messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    setInput('')
    try {
      const res = await fetch(`/api/exam-prep/help/${thread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMessages([...messages, data.message])
    } catch {
      toast.error('Échec de l\'envoi')
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" /> Retour aux questions
      </Button>

      <Card>
        <CardContent className="p-0">
          {/* Header thread */}
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary-text" />
              <p className="font-semibold text-sm">{thread.sujet}</p>
            </div>
            {thread.passageContext && (
              <p className="text-xs text-muted-foreground mt-1.5 italic line-clamp-2">
                « {thread.passageContext} »
              </p>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="h-[400px] overflow-y-auto p-4 space-y-3 scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m) => {
                  const isMe = m.auteurId === currentUserId
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${isMe ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                        isMe
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-muted rounded-tl-sm'
                      }`}>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        <p className={`text-[10px] mt-1 ${isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {m.role === 'etudiant' ? 'Étudiant' : 'Professeur'} · {new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
              placeholder="Votre réponse…"
              disabled={sending || thread.statut === 'CLOS'}
              className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
            <Button size="sm" onClick={handleSend} disabled={sending || !input.trim() || thread.statut === 'CLOS'} className="gap-1.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
