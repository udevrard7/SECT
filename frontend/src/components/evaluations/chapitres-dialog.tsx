// ─────────────────────────────────────────────────────────────────────
// ChapitresDialog — SECT-BIBLIO-P2.5 (ADR-0007 §P2.5) : rattachement des
// questions d'une épreuve à leur chapitre du support source. Première
// utilisation du PATCH /api/questions/{id} côté frontend. Le feedback
// étudiant cite ensuite « Support · Chap. N : titre » (mon-resultat-dialog)
// et l'audit de conformité P3 s'appuie sur cette traçabilité.
// ═════════════════════════════════════════════════════════════════════

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  ChevronRight,
  Link2,
  Loader2,
  Unlink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

// ─── Types (miroir des DTO backend) ───

interface QuestionChapitre {
  id: string
  titre: string
  ordre: number
}

interface EpreuveQuestionTracabilite {
  id: string
  questionId: string
  bareme: number
  ordre: number
  question: {
    id: string
    type: string
    enonce: string
    difficulte?: string
    documentId?: string | null
    chapterId?: string | null
    chapter?: QuestionChapitre | null
  }
}

interface SupportOption {
  id: string
  nomFichier: string
  statutAnalyse: string
}

interface ChapitresDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  epreuveId: string
  epreuveTitre: string
}

const SANS_CHAPITRE = '__sans_chapitre__'

export function ChapitresDialog({ open, onOpenChange, epreuveId, epreuveTitre }: ChapitresDialogProps) {
  const [questions, setQuestions] = useState<EpreuveQuestionTracabilite[]>([])
  const [loading, setLoading] = useState(false)
  const [chapitresParDoc, setChapitresParDoc] = useState<Record<string, QuestionChapitre[]>>({})
  const [supports, setSupports] = useState<SupportOption[]>([])
  const [docReference, setDocReference] = useState<string>('')
  const [patchingId, setPatchingId] = useState<string | null>(null)
  // Copie de travail du chapterId par question (mise à jour optimiste).
  const [chapterIds, setChapterIds] = useState<Record<string, string | null>>({})

  // ─── Chargement des questions (ids réels, hydratées chapitre) ───
  const chargerQuestions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/epreuves/${epreuveId}/questions`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data: EpreuveQuestionTracabilite[] = await res.json()
      const qs = Array.isArray(data) ? data : []
      setQuestions(qs)
      const ids: Record<string, string | null> = {}
      for (const q of qs) {
        ids[q.questionId] = q.question.chapterId ?? null
      }
      setChapterIds(ids)
      // Charger les chapitres des documents sources distincts.
      const docIds = Array.from(
        new Set(qs.map((q) => q.question.documentId).filter((d): d is string => !!d)),
      )
      const parDoc: Record<string, QuestionChapitre[]> = {}
      await Promise.all(
        docIds.map(async (docId) => {
          try {
            const r = await fetch(`/api/documents/${docId}/chapters`, {
              credentials: 'include',
            })
            if (!r.ok) return
            const d = await r.json()
            parDoc[docId] = Array.isArray(d?.chapters) ? d.chapters : []
          } catch {
            /* doc d'autrui → RLS 0 chapitre, silencieux */
          }
        }),
      )
      setChapitresParDoc(parDoc)
    } catch (e) {
      toast.error('Chargement impossible', {
        description: e instanceof Error ? e.message : 'Erreur inconnue',
      })
    } finally {
      setLoading(false)
    }
  }, [epreuveId])

  // ─── Supports de référence (pour les questions IA sans documentId) ───
  useEffect(() => {
    if (!open) return
    void chargerQuestions()
    void (async () => {
      try {
        const res = await fetch('/api/documents', { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json()
        const docs: SupportOption[] = Array.isArray(data?.documents) ? data.documents : []
        setSupports(docs)
      } catch {
        /* non bloquant */
      }
    })()
  }, [open, chargerQuestions])

  const sansDocument = useMemo(
    () => questions.filter((q) => !q.question.documentId),
    [questions],
  )
  const rattachees = useMemo(
    () => questions.filter((q) => chapterIds[q.questionId]),
    [questions, chapterIds],
  )

  // ─── PATCH d'une question (tri-state : valeur | null = retirer) ───
  const rattacher = async (questionId: string, chapterId: string | null) => {
    setPatchingId(questionId)
    try {
      const res = await fetch(`/api/questions/${questionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chapterId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || `Erreur ${res.status}`)
      setChapterIds((prev) => ({ ...prev, [questionId]: chapterId }))
      toast.success(
        chapterId
          ? 'Question rattachée au chapitre'
          : 'Chapitre détaché de la question',
      )
    } catch (e) {
      toast.error('Rattachement impossible', {
        description: e instanceof Error ? e.message : 'Erreur inconnue',
      })
      // Recharger l'état réel (le PATCH a pu échouer sur une contrainte).
      void chargerQuestions()
    } finally {
      setPatchingId(null)
    }
  }

  const chapitresPour = (q: EpreuveQuestionTracabilite): QuestionChapitre[] => {
    const docId = q.question.documentId ?? docReference
    if (!docId) return []
    return chapitresParDoc[docId] ?? []
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary-text" />
            Traçabilité chapitres — {epreuveTitre}
          </DialogTitle>
          <DialogDescription>
            Rattachez chaque question à son chapitre du support : le feedback
            étudiant citera « Support · Chap. N » et l&apos;audit de conformité
            s&apos;appuiera sur cette traçabilité.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 pr-3">
            {/* Stats rapides */}
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="gap-1 border-primary/25 text-primary-text">
                <Link2 className="h-3 w-3" />
                {rattachees.length}/{questions.length} rattachée(s)
              </Badge>
              {sansDocument.length > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  {sansDocument.length} question(s) IA sans support source
                </Badge>
              )}
            </div>

            {/* Document de référence pour les questions IA (documentId NULL) */}
            {sansDocument.length > 0 && (
              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Support de référence (questions générées sans support source)
                </Label>
                <Select value={docReference || undefined} onValueChange={setDocReference}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir un de vos supports…" />
                  </SelectTrigger>
                  <SelectContent>
                    {supports
                      .filter((d) => d.statutAnalyse === 'ANALYSE')
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nomFichier}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ces questions ont été générées par IA lors de la création de
                  l&apos;épreuve. Le chapitre doit venir d&apos;un de vos
                  supports analysés.
                </p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des questions…
              </div>
            ) : questions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Cette épreuve n&apos;a pas de questions relationnelles
                (épreuve modèle ou questions non persistées).
              </p>
            ) : (
              <div className="space-y-2">
                {questions
                  .slice()
                  .sort((a, b) => a.ordre - b.ordre)
                  .map((q, idx) => {
                    const chapitres = chapitresPour(q)
                    const current = chapterIds[q.questionId] ?? null
                    return (
                      <div key={q.id} className="flex items-start gap-3 rounded-lg border p-3">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                          {q.ordre || idx + 1}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="text-sm line-clamp-2">{q.question.enonce}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {q.question.type}
                            </Badge>
                            {current && chapitres.find((c) => c.id === current) ? (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-primary/20 bg-primary/10 text-primary-text">
                                <BookOpen className="h-2.5 w-2.5" />
                                Chap. {(chapitres.find((c) => c.id === current)?.ordre ?? 0) + 1} :{' '}
                                {chapitres.find((c) => c.id === current)?.titre}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-dashed text-muted-foreground">
                                <Unlink className="h-2.5 w-2.5" />
                                Non rattachée
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="w-[240px] shrink-0">
                          {chapitres.length === 0 ? (
                            <p className="text-xs text-muted-foreground pt-1.5">
                              {q.question.documentId
                                ? 'Aucun chapitre visible pour ce support.'
                                : docReference
                                  ? 'Aucun chapitre pour ce support de référence.'
                                  : 'Choisissez un support de référence.'}
                            </p>
                          ) : (
                            <Select
                              value={current ?? SANS_CHAPITRE}
                              onValueChange={(v) =>
                                void rattacher(q.questionId, v === SANS_CHAPITRE ? null : v)
                              }
                              disabled={patchingId === q.questionId}
                            >
                              <SelectTrigger className="w-full" size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={SANS_CHAPITRE}>
                                  <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <ChevronRight className="h-3 w-3" />
                                    Aucun chapitre
                                  </span>
                                </SelectItem>
                                {chapitres.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    Chap. {c.ordre + 1} : {c.titre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
