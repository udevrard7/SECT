'use client'

/**
 * ExamPrepPage — Page maîtresse du module Préparation aux examens (étudiant).
 *
 * Architecture à 2 vues :
 *  1. Liste des documents de cours accessibles (cartes cliquables)
 *  2. Vue détail d'un document avec onglets :
 *     - Aperçu (chapitres + résumé)
 *     - Q&A IA (chat RAG ancré au document)
 *     - Entraînement (génération de questions + correction + SRS)
 *     - Planning (sessions de révision + spaced repetition)
 *     - Aide prof (messagerie étudiant↔enseignant)
 *     - Progression (tableau de bord)
 *
 * Le passage liste→détail se fait via state local (selectedDocumentId)
 * synchronisé avec ?documentId= dans l'URL (pour le partage/refresh).
 *
 * Identité visuelle : Savane EdTech (ds-kente-pattern hero, ds-kente-top
 * cards, tokens oklch, framer-motion) — aligné sur mes-certificats /
 * mes-resultats.
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, FileText, BookOpen, ArrowLeft, Loader2,
  AlertCircle, Sparkles, Clock, Award,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PulseSkeleton } from '@/components/ds'
import { toast } from 'sonner'

import { ExamPrepDocumentDetail } from './exam-prep-document-detail'

// ─── Types ───

interface ExamPrepChapter {
  id: string
  titre: string
  ordre: number
  sujets: string[]
}

export interface ExamPrepDocument {
  id: string
  nomFichier: string
  typeMime: string | null
  tailleFichier: number | null
  statutAnalyse: string
  themesDetectes: string[]
  resumeAnalyse: string | null
  dateUpload: string
  uniteEnseignement: { id: string; code: string; nom: string; creditsECTS: number | null }
  owner: { id: string; name: string }
  chapters: ExamPrepChapter[]
}

// ─── Composant principal ───

export function ExamPrepPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()

  const [documents, setDocuments] = useState<ExamPrepDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get('documentId')
  )

  // ─── Fetch documents ───
  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/exam-prep/documents')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDocuments(data.documents ?? [])
    } catch {
      setError('Impossible de charger vos supports de cours.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Synchronise ?documentId dans l'URL (pour partage/refresh)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedId) {
      url.searchParams.set('documentId', selectedId)
    } else {
      url.searchParams.delete('documentId')
    }
    window.history.replaceState({}, '', url.toString())
  }, [selectedId])

  // ─── Vue détail ───
  const selectedDocument = documents.find((d) => d.id === selectedId) ?? null

  if (selectedId && selectedDocument) {
    return (
      <ExamPrepDocumentDetail
        document={selectedDocument}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <PulseSkeleton className="h-24 w-full" variant="card" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <PulseSkeleton key={i} variant="card" className="h-48" />
          ))}
        </div>
      </div>
    )
  }

  // ─── Error ───
  if (error) {
    return (
      <Card className="border-l-4 border-l-destructive">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">Erreur de chargement</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={fetchDocuments}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ─── Vue liste ───
  return (
    <div className="space-y-6">
      {/* Hero canonique */}
      <div className="ds-kente-pattern -mx-4 -mt-4 rounded-lg px-4 py-4 sm:-mx-6 sm:px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 ds-logo-glow">
            <GraduationCap className="h-6 w-6 text-primary-text" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Préparation aux examens
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Transformez vos supports de cours en moteur de préparation actif
            </p>
          </div>
        </div>
        {documents.length > 0 && (
          <Badge variant="secondary" className="self-start sm:self-auto gap-1.5 bg-primary/10 text-primary-text">
            <BookOpen className="h-3.5 w-3.5" />
            {documents.length} support{documents.length > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Empty state */}
      {documents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-10 w-10 text-primary-text" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">
              Aucun support de cours disponible
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Vos enseignants n'ont pas encore partagé de documents de cours pour votre filière et votre niveau.
              Dès qu'un support est analysé, vous pourrez le transformer en moteur de révision actif : Q&A IA,
              questions d'entraînement, planning de révision et aide du professeur.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Features preview (rappel des piliers) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Sparkles, label: 'Q&A IA', desc: 'Contextuel RAG' },
              { icon: Award, label: 'Entraînement', desc: 'Questions auto' },
              { icon: Clock, label: 'Planning', desc: 'Spaced repetition' },
              { icon: BookOpen, label: 'Aide prof', desc: 'Messagerie' },
            ].map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.25 }}
              >
                <Card className="border-l-4 border-l-primary/50">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <f.icon className="h-4 w-4 text-primary-text" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{f.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{f.desc}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Liste des documents */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <AnimatePresence mode="popLayout">
              {documents.map((doc, i) => (
                <motion.div
                  key={doc.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}
                >
                  <button
                    onClick={() => setSelectedId(doc.id)}
                    className="group relative w-full overflow-hidden rounded-xl border border-border/60 bg-card p-5 text-left shadow-sm ds-kente-top hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 ds-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* En-tête : icône + nb chapitres */}
                    <div className="flex items-start justify-between mb-4 mt-1">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-secondary/10 shadow-md">
                        <FileText className="h-5 w-5 text-primary-text" />
                      </div>
                      {doc.chapters.length > 0 && (
                        <Badge variant="outline" className="bg-primary/10 text-primary-text border-primary/30">
                          {doc.chapters.length} ch.
                        </Badge>
                      )}
                    </div>

                    {/* UE */}
                    <div className="mb-2">
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {doc.uniteEnseignement.code}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.uniteEnseignement.nom}
                      </p>
                    </div>

                    {/* Titre du document */}
                    <h3 className="font-semibold text-sm leading-snug font-display line-clamp-2 mb-2">
                      {doc.nomFichier}
                    </h3>

                    {/* Résumé */}
                    {doc.resumeAnalyse && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {doc.resumeAnalyse}
                      </p>
                    )}

                    {/* Thèmes */}
                    {doc.themesDetectes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {doc.themesDetectes.slice(0, 3).map((t, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-muted">
                            {t}
                          </Badge>
                        ))}
                        {doc.themesDetectes.length > 3 && (
                          <span className="text-[10px] text-muted-foreground self-center">
                            +{doc.themesDetectes.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Footer : prof + date */}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/40">
                      <span className="truncate">{doc.owner.name}</span>
                      <span>{new Date(doc.dateUpload).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                    </div>

                    {/* CTA hover */}
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary-text opacity-0 group-hover:opacity-100 transition-opacity">
                      <Sparkles className="h-3.5 w-3.5" />
                      Commencer la révision
                    </div>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </div>
  )
}
