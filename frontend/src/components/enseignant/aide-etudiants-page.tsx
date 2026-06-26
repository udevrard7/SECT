'use client'

/**
 * AideEtudiantsPage — Boîte de réception enseignant pour les questions
 * d'aide des étudiants (module Préparation aux examens).
 *
 * - Liste les HelpThread des documents de l'enseignant (GET /api/exam-prep/help)
 *   avec filtre par statut (OUVERT / REPONDU / CLOS) et recherche
 * - Vue conversation : GET /api/exam-prep/help/[id]/messages + POST pour répondre
 * - Bouton « Clôturer » → POST /api/exam-prep/help/[id]/close
 *
 * Identité Savane EdTech : hero ds-kente-pattern, cards border-l-4,
 * tokens oklch, framer-motion, font-mono tabular-nums.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HelpCircle, MessageCircle, ArrowLeft, Send, Loader2, Search,
  CheckCircle2, Clock, XCircle, FileText, BookOpen, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PulseSkeleton } from '@/components/ds'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface Thread {
  id: string
  sujet: string
  statut: string
  passageContext: string | null
  updatedAt: string
  document: { id: string; nomFichier: string } | null
  chapter: { id: string; titre: string } | null
  // BUGFIX (ENS-AUDIT-3) : etudiant optionnel — l'API peut ne pas inclure la
  // relation (avant le fix backend ListHelpThreads). Optional chaining +
  // fallback partout pour éviter le crash `Cannot read 'name' of undefined`.
  etudiant?: { id: string; name: string } | null
  etudiantId?: string
  _count?: { messages: number }
}

interface Message {
  id: string
  auteurId: string
  role: string
  content: string
  createdAt: string
}

const STATUT_META: Record<string, { label: string; icon: typeof Clock; cls: string }> = {
  OUVERT: { label: 'Ouvert', icon: Clock, cls: 'bg-warning/15 text-warning' },
  REPONDU: { label: 'Répondu', icon: CheckCircle2, cls: 'bg-success/15 text-success-text' },
  CLOS: { label: 'Clos', icon: XCircle, cls: 'bg-muted text-muted-foreground' },
}

export function AideEtudiantsPage() {
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selected, setSelected] = useState<Thread | null>(null)

  // Auto-sélection via ?threadId (deep link depuis notification push)
  useEffect(() => {
    const tid = searchParams.get('threadId')
    if (tid && threads.length > 0 && !selected) {
      const found = threads.find((t) => t.id === tid)
      if (found) setSelected(found)
    }
  }, [searchParams, threads, selected])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/exam-prep/help')
      if (res.ok) {
        const data = await res.json()
        setThreads(data.threads ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Filtrage
  const filteredThreads = threads.filter((t) => {
    if (filter !== 'all' && t.statut !== filter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        t.sujet.toLowerCase().includes(q) ||
        (t.etudiant?.name ?? '').toLowerCase().includes(q) ||
        (t.document?.nomFichier ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  // Compteurs par statut
  const counts = {
    all: threads.length,
    OUVERT: threads.filter((t) => t.statut === 'OUVERT').length,
    REPONDU: threads.filter((t) => t.statut === 'REPONDU').length,
    CLOS: threads.filter((t) => t.statut === 'CLOS').length,
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

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <PulseSkeleton className="h-24 w-full" variant="card" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <PulseSkeleton key={i} variant="card" className="h-20" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hero canonique */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 ds-logo-glow">
            <HelpCircle className="h-6 w-6 text-primary-text" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Aide des étudiants
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Répondez aux questions de vos étudiants sur les documents de cours
            </p>
          </div>
        </div>
        {counts.OUVERT > 0 && (
          <Badge variant="secondary" className="self-start sm:self-auto gap-1.5 bg-warning/15 text-warning border-warning/30">
            <Clock className="h-3.5 w-3.5" />
            {counts.OUVERT} en attente
          </Badge>
        )}
      </div>

      {/* Recherche + filtres */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par sujet, étudiant ou document…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'OUVERT', 'REPONDU', 'CLOS'] as const).map((f) => {
            const meta = f === 'all' ? null : STATUT_META[f]
            const isActive = filter === f
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ds-press flex items-center gap-1.5 ${
                  isActive
                    ? f === 'OUVERT' ? 'bg-warning/15 text-warning'
                    : f === 'REPONDU' ? 'bg-success/15 text-success-text'
                    : f === 'CLOS' ? 'bg-muted text-muted-foreground'
                    : 'bg-primary/15 text-primary-text'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {meta && <meta.icon className="h-3 w-3" />}
                {f === 'all' ? 'Tous' : meta!.label}
                <span className="font-mono tabular-nums text-[10px] opacity-70">{counts[f]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Liste des threads */}
      {filteredThreads.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <MessageCircle className="h-10 w-10 text-primary-text" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
              {threads.length === 0 ? 'Aucune question pour le moment' : 'Aucun résultat'}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {threads.length === 0
                ? "Les questions de vos étudiants sur les documents de cours apparaîtront ici. Partagez des documents pour démarrer."
                : 'Aucun thread ne correspond à vos filtres.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
          className="space-y-2"
        >
          <AnimatePresence mode="popLayout">
            {filteredThreads.map((t, i) => {
              const meta = STATUT_META[t.statut] ?? STATUT_META.OUVERT
              const Icon = meta.icon
              return (
                <motion.button
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                  onClick={() => setSelected(t)}
                  className="w-full text-left rounded-xl border border-border/60 bg-card p-4 hover:shadow-md hover:border-primary/30 transition-all ds-lift"
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar statut */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.cls}`}>
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Sujet + statut */}
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate flex-1">{t.sujet}</p>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${meta.cls}`}>{meta.label}</Badge>
                      </div>

                      {/* Métadonnées */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {t.document?.nomFichier ?? '—'}
                        </span>
                        {t.chapter && (
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            {t.chapter.titre}
                          </span>
                        )}
                        <span>·</span>
                        <span className="font-medium text-foreground/80">{t.etudiant?.name ?? 'Étudiant inconnu'}</span>
                      </div>

                      {/* Passage contextuel (aperçu) */}
                      {t.passageContext && (
                        <p className="text-xs text-muted-foreground italic mt-1.5 line-clamp-1">
                          « {t.passageContext} »
                        </p>
                      )}
                    </div>

                    {/* Date + nb messages */}
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {new Date(t.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </p>
                      {t._count?.messages && t._count.messages > 0 && (
                        <Badge variant="secondary" className="text-[10px] mt-1 h-4 px-1.5 gap-0.5">
                          <MessageCircle className="h-2.5 w-2.5" />
                          {t._count.messages}
                        </Badge>
                      )}
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}

// ─── Vue conversation (réutilise le pattern de l'onglet étudiant) ───

function ConversationView({
  thread, currentUserId, onBack,
}: {
  thread: Thread
  currentUserId: string
  onBack: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Charge les messages
  useEffect(() => {
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
  }, [thread.id])

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
      toast.error("Échec de l'envoi")
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  const handleClose = async () => {
    setClosing(true)
    try {
      const res = await fetch(`/api/exam-prep/help/${thread.id}/close`, { method: 'POST' })
      if (!res.ok) throw new Error()
      toast.success('Thread clôturé')
      onBack()
    } catch {
      toast.error('Échec de la clôture')
    } finally {
      setClosing(false)
    }
  }

  const meta = STATUT_META[thread.statut] ?? STATUT_META.OUVERT

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
        {thread.statut !== 'CLOS' && (
          <Button variant="outline" size="sm" onClick={handleClose} disabled={closing} className="gap-1.5">
            {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Clôturer
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Header thread */}
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <meta.icon className={`h-4 w-4 ${meta.cls.split(' ')[1]}`} />
              <p className="font-semibold text-sm">{thread.sujet}</p>
              <Badge variant="outline" className={`text-[10px] ml-auto ${meta.cls}`}>{meta.label}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{thread.document?.nomFichier ?? '—'}</span>
              {thread.chapter && <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{thread.chapter.titre}</span>}
              <span>·</span>
              <span className="font-medium text-foreground/80">{thread.etudiant?.name ?? 'Étudiant inconnu'}</span>
            </div>
            {thread.passageContext && (
              <p className="text-xs text-muted-foreground italic mt-2 line-clamp-3 border-l-2 border-border pl-2">
                « {thread.passageContext} »
              </p>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="h-[440px] overflow-y-auto p-4 space-y-3 scrollbar-thin">
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

          {/* Input (désactivé si thread CLOS) */}
          <div className="border-t border-border p-3 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
              placeholder={thread.statut === 'CLOS' ? 'Thread clôturé' : 'Votre réponse…'}
              disabled={sending || thread.statut === 'CLOS'}
              className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={sending || !input.trim() || thread.statut === 'CLOS'}
              className="gap-1.5"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
