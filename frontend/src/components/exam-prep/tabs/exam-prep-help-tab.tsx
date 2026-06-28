'use client'

/**
 * Onglet Aide prof — messagerie étudiant↔enseignant ancrée au document.
 *
 * EXAM-PREP-REFACTOR-1 :
 *  - Alignement strict backend :
 *    • GET  /api/exam-prep/help?documentId=X  → { threads: HelpThread[] }
 *      HelpThread = { id, documentId, etudiantId, enseignantId?, sujet, statut
 *                     ("OUVERT"|"CLOS"), createdAt, updatedAt, etudiant?, document? }
 *    • POST /api/exam-prep/help body { documentId, sujet, messageInitial }
 *      → 201 { thread }
 *    • POST /api/exam-prep/help/{id}/close → { message }
 *    • GET  /api/exam-prep/help/{id}/messages → { messages: HelpMessage[] }
 *      HelpMessage = { id, threadId, auteurId, contenu, createdAt }
 *    • POST /api/exam-prep/help/{id}/messages body { contenu } → 201 { message }
 *  - DS "Savane EdTech" : PulseSkeleton, cards cohérentes, empty state.
 *  - Le rôle d'un message est inféré côté client en comparant auteurId à
 *    thread.etudiantId (étudiant) ou thread.enseignantId (professeur).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HelpCircle, Plus, Send, Loader2, MessageCircle, ArrowLeft,
  CheckCircle2, X, AlertCircle, RefreshCw, Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PulseSkeleton } from '@/components/ds'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface Props {
  documentId: string
  documentName: string
}

// ─── Types backend (alignés sur domain.HelpThread / HelpMessage) ───

interface UserRef { id: string; name: string }
interface DocumentRef { id: string; nomFichier: string }

interface HelpThread {
  id: string
  documentId: string
  etudiantId: string
  enseignantId?: string | null
  sujet: string
  statut: 'OUVERT' | 'CLOS'
  createdAt: string
  updatedAt: string
  etudiant?: UserRef | null
  enseignant?: UserRef | null
  document?: DocumentRef | null
}

interface HelpMessage {
  id: string
  threadId: string
  auteurId: string
  contenu: string
  createdAt: string
}

export function ExamPrepHelpTab({ documentId, documentName }: Props) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<HelpThread | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form
  const [formSujet, setFormSujet] = useState('')
  const [formMessage, setFormMessage] = useState('')

  // ─── Liste des threads (TanStack Query) ───
  const threadsQuery = useQuery<{ threads: HelpThread[] }>({
    queryKey: ['exam-prep-help', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/exam-prep/help?documentId=${documentId}`)
      if (!res.ok) throw new Error('Échec du chargement des questions')
      const data = await res.json()
      return { threads: data.threads ?? [] }
    },
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  })

  const threads = threadsQuery.data?.threads ?? []
  const loading = threadsQuery.isLoading
  const error = threadsQuery.error

  // ─── Mutation : créer un thread ───
  // Body backend : { documentId, sujet, messageInitial }
  const createMutation = useMutation({
    mutationFn: async ({ sujet, messageInitial }: { sujet: string; messageInitial: string }) => {
      const res = await fetch('/api/exam-prep/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, sujet, messageInitial }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec de la création')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Question envoyée au professeur')
      setShowForm(false)
      setFormSujet('')
      setFormMessage('')
      queryClient.invalidateQueries({ queryKey: ['exam-prep-help', documentId] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleCreate = () => {
    if (!formSujet.trim() || !formMessage.trim()) {
      toast.error('Sujet et message requis')
      return
    }
    createMutation.mutate({ sujet: formSujet.trim(), messageInitial: formMessage.trim() })
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={HelpCircle}
          title="Aide du professeur"
          desc={`Posez vos questions sur ${documentName}.`}
        />
        <PulseSkeleton className="h-20 w-full" variant="card" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <PulseSkeleton key={i} className="h-16 w-full" />
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
          icon={HelpCircle}
          title="Aide du professeur"
          desc={`Posez vos questions sur ${documentName}.`}
        />
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <p className="mt-3 text-sm font-medium">Échec du chargement des questions</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['exam-prep-help', documentId] })}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Vue conversation ───
  if (selected) {
    return (
      <ConversationView
        thread={selected}
        currentUserId={user?.id ?? ''}
        onBack={() => {
          setSelected(null)
          queryClient.invalidateQueries({ queryKey: ['exam-prep-help', documentId] })
        }}
      />
    )
  }

  // ─── Vue liste + form ───
  return (
    <div className="space-y-6">
      <SectionHeader
        icon={HelpCircle}
        title="Aide du professeur"
        desc={`Posez vos questions sur ${documentName}. Le professeur répondra dans le fil.`}
      />

      {/* CTA nouvelle question */}
      <Card className="border-l-4 border-l-primary ds-kente-top">
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
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="h-8 w-8 p-0" aria-label="Annuler">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <input
                type="text"
                value={formSujet}
                onChange={(e) => setFormSujet(e.target.value)}
                placeholder="Sujet court (ex. « Je ne comprends pas la dérivée »)"
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Détaillez votre question…"
                rows={4}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full gap-2">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Envoyer au professeur
              </Button>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Liste des threads */}
      {threads.length === 0 ? (
        <Card className="border-dashed ds-kente-watermark">
          <CardContent className="relative flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">Aucune question pour le moment</p>
            <p className="text-xs text-muted-foreground mt-1">Vos échanges avec le professeur apparaîtront ici.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {threads.map((t, i) => (
              <motion.button
                key={t.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                onClick={() => setSelected(t)}
                className="w-full text-left rounded-xl border border-border/60 bg-card p-3 hover:shadow-sm hover:border-primary/30 transition-all ds-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    t.statut === 'CLOS' ? 'bg-muted' : 'bg-warning/10'
                  }`}>
                    {t.statut === 'CLOS'
                      ? <Lock className="h-4 w-4 text-muted-foreground" />
                      : <HelpCircle className="h-4 w-4 text-warning" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate flex-1">{t.sujet}</p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${
                          t.statut === 'CLOS'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-warning/10 text-warning'
                        }`}
                      >
                        {t.statut === 'CLOS' ? 'Clos' : 'Ouvert'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.etudiant?.name ?? 'Étudiant'} · {new Date(t.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ─── Vue conversation ───

function ConversationView({
  thread, currentUserId, onBack,
}: {
  thread: HelpThread
  currentUserId: string
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<HelpMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Charge les messages
  const loadMessages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/exam-prep/help/${thread.id}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(Array.isArray(data.messages) ? data.messages : [])
      } else {
        setMessages([])
      }
    } catch {
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [thread.id])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    const content = input.trim()
    setInput('')
    try {
      // Body backend : { contenu: string }
      const res = await fetch(`/api/exam-prep/help/${thread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu: content }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec de l\'envoi')
      }
      const data = await res.json()
      if (data.message) {
        setMessages((prev) => [...prev, data.message])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de l\'envoi')
      setInput(content)
    }
  }

  const handleClose = async () => {
    setClosing(true)
    try {
      const res = await fetch(`/api/exam-prep/help/${thread.id}/close`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec de la clôture')
      }
      toast.success('Fil clos')
      queryClient.invalidateQueries({ queryKey: ['exam-prep-help', thread.documentId] })
      onBack()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la clôture')
    } finally {
      setClosing(false)
    }
  }

  // Infère le rôle d'un message : étudiant si auteurId === thread.etudiantId,
  // professeur sinon (enseignantId ou autre).
  const inferRole = (auteurId: string): 'etudiant' | 'professeur' => {
    if (auteurId === thread.etudiantId) return 'etudiant'
    return 'professeur'
  }

  const isClosed = thread.statut === 'CLOS'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Retour aux questions
        </Button>
        {!isClosed && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={closing}
            className="gap-1.5"
          >
            {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Clore le fil</span>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Header thread */}
          <div className="border-b border-border p-4 ds-kente-top">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary-text" />
              <p className="font-semibold text-sm">{thread.sujet}</p>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  isClosed ? 'bg-muted text-muted-foreground' : 'bg-warning/10 text-warning'
                }`}
              >
                {isClosed ? 'Clos' : 'Ouvert'}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {thread.etudiant?.name ?? 'Étudiant'} · {new Date(thread.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="h-[420px] overflow-y-auto p-4 space-y-3 scrollbar-thin">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <PulseSkeleton key={i} className={`h-12 ${i % 2 === 0 ? 'w-3/4' : 'w-2/3 ml-auto'}`} />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Aucun message dans ce fil.</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m) => {
                  const role = inferRole(m.auteurId)
                  const isMe = m.auteurId === currentUserId
                  const isProf = role === 'professeur'
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
                          : isProf
                            ? 'bg-info/15 text-info rounded-tl-sm border border-info/20'
                            : 'bg-muted rounded-tl-sm'
                      }`}>
                        <p className="whitespace-pre-wrap">{m.contenu}</p>
                        <p className={`text-[10px] mt-1 ${isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {isProf ? 'Professeur' : 'Étudiant'} · {new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
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
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={isClosed ? 'Fil clos — vous ne pouvez plus répondre' : 'Votre réponse…'}
              disabled={isClosed}
              className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={isClosed || !input.trim()}
              className="gap-1.5"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Envoyer</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Header de section réutilisable ───

function SectionHeader({
  icon: Icon, title, desc,
}: {
  icon: typeof HelpCircle
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
