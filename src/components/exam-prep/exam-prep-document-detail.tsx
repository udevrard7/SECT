'use client'

/**
 * ExamPrepDocumentDetail — Vue détail d'un document avec onglets.
 *
 * 6 onglets (respectent l'identité Savane EdTech) :
 *  1. Aperçu — chapitres + résumé + thèmes
 *  2. Q&A IA — chat RAG ancré au document (exige exam-prep-qa-tab)
 *  3. Entraînement — génération de questions + correction (exam-prep-practice-tab)
 *  4. Planning — sessions de révision + spaced repetition (exam-prep-planning-tab)
 *  5. Aide prof — messagerie étudiant↔enseignant (exam-prep-help-tab)
 *  6. Progression — tableau de bord (exam-prep-progress-tab)
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, FileText, Sparkles, Award, Clock, BookOpen, TrendingUp,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { ExamPrepDocument } from './exam-prep-page'
import { ExamPrepQaTab } from './tabs/exam-prep-qa-tab'
import { ExamPrepPracticeTab } from './tabs/exam-prep-practice-tab'
import { ExamPrepPlanningTab } from './tabs/exam-prep-planning-tab'
import { ExamPrepHelpTab } from './tabs/exam-prep-help-tab'
import { ExamPrepProgressTab } from './tabs/exam-prep-progress-tab'

interface Props {
  document: ExamPrepDocument
  onBack: () => void
}

export function ExamPrepDocumentDetail({ document: doc, onBack }: Props) {
  const [tab, setTab] = useState('overview')

  return (
    <div className="space-y-5">
      {/* ─── Header avec retour ─── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 shrink-0">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Retour</span>
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{doc.uniteEnseignement.code} · {doc.uniteEnseignement.nom}</span>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="font-semibold text-foreground truncate">{doc.nomFichier}</span>
        </div>
      </div>

      {/* ─── Hero du document ─── */}
      <div className="ds-kente-pattern rounded-lg px-4 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 ds-logo-glow">
            <FileText className="h-6 w-6 text-primary-text" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl line-clamp-2">
              {doc.nomFichier}
            </h1>
            {doc.resumeAnalyse && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{doc.resumeAnalyse}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {doc.chapters.length > 0 && (
                <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary-text">
                  <BookOpen className="h-3 w-3" /> {doc.chapters.length} chapitres
                </Badge>
              )}
              {doc.themesDetectes.slice(0, 2).map((t, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
              ))}
              {doc.themesDetectes.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{doc.themesDetectes.length - 2}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Onglets ─── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Aperçu</span>
          </TabsTrigger>
          <TabsTrigger value="qa" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Q&A IA</span>
            <span className="sm:hidden">Q&A</span>
          </TabsTrigger>
          <TabsTrigger value="practice" className="gap-1.5">
            <Award className="h-4 w-4" />
            <span className="hidden sm:inline">Entraînement</span>
            <span className="sm:hidden">Train</span>
          </TabsTrigger>
          <TabsTrigger value="planning" className="gap-1.5">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Planning</span>
          </TabsTrigger>
          <TabsTrigger value="help" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Aide prof</span>
            <span className="sm:hidden">Aide</span>
          </TabsTrigger>
          <TabsTrigger value="progress" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Progression</span>
            <span className="sm:hidden">Progr.</span>
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="mt-5"
          >
            {/* ─── Aperçu ─── */}
            <TabsContent value="overview" className="mt-0 space-y-4">
              {/* Chapitres */}
              <div>
                <h3 className="font-display text-sm font-semibold tracking-tight text-muted-foreground uppercase mb-3">
                  Chapitres du document
                </h3>
                {doc.chapters.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    Aucun chapitre structuré détecté lors de l'analyse. Vous pouvez
                    quand même utiliser le Q&A IA et l'entraînement sur l'ensemble du document.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {doc.chapters.map((ch, i) => (
                      <Card key={ch.id} className="border-l-4 border-l-primary/60">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-bold text-primary-text">
                              {ch.ordre + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm leading-snug">{ch.titre}</p>
                              {ch.sujets.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {ch.sujets.slice(0, 3).map((s, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-muted">
                                      {s}
                                    </Badge>
                                  ))}
                                  {ch.sujets.length > 3 && (
                                    <span className="text-[10px] text-muted-foreground">+{ch.sujets.length - 3}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Thèmes + infos */}
              {doc.themesDetectes.length > 0 && (
                <div>
                  <h3 className="font-display text-sm font-semibold tracking-tight text-muted-foreground uppercase mb-3">
                    Thèmes détectés
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {doc.themesDetectes.map((t, i) => (
                      <Badge key={i} variant="outline" className="bg-accent/50">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* CTAs vers les autres onglets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setTab('qa')}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all ds-lift text-left"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary-text" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Poser une question</p>
                    <p className="text-xs text-muted-foreground">L'IA répond en citant votre cours</p>
                  </div>
                </button>
                <button
                  onClick={() => setTab('practice')}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all ds-lift text-left"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                    <Award className="h-5 w-5 text-success-text" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">S'entraîner</p>
                    <p className="text-xs text-muted-foreground">Questions auto + correction IA</p>
                  </div>
                </button>
              </div>
            </TabsContent>

            {/* ─── Q&A IA ─── */}
            <TabsContent value="qa" className="mt-0">
              <ExamPrepQaTab documentId={doc.id} chapters={doc.chapters} />
            </TabsContent>

            {/* ─── Entraînement ─── */}
            <TabsContent value="practice" className="mt-0">
              <ExamPrepPracticeTab documentId={doc.id} chapters={doc.chapters} />
            </TabsContent>

            {/* ─── Planning ─── */}
            <TabsContent value="planning" className="mt-0">
              <ExamPrepPlanningTab documentId={doc.id} chapters={doc.chapters} />
            </TabsContent>

            {/* ─── Aide prof ─── */}
            <TabsContent value="help" className="mt-0">
              <ExamPrepHelpTab documentId={doc.id} chapters={doc.chapters} documentName={doc.nomFichier} />
            </TabsContent>

            {/* ─── Progression ─── */}
            <TabsContent value="progress" className="mt-0">
              <ExamPrepProgressTab documentId={doc.id} chapters={doc.chapters} />
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>
    </div>
  )
}
