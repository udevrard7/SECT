'use client'

/**
 * ExamPrepDocumentDetail — Vue détail d'un document avec 8 onglets.
 *
 * EXAM-PREP-REFACTOR-1 : refonte DS "Savane EdTech".
 *  - Hero avec motif kente + métadonnées du document
 *  - TabsList scrollable horizontalement sur mobile (8 onglets), inline-flex sur desktop
 *  - Chaque TabsContent a un padding consistent (p-4 sm:p-0) et space-y-6
 *
 * 8 onglets :
 *  1. Entraînement (practice) — Award
 *  2. Banque (bank) — Library
 *  3. Flashcards (flashcards) — Layers
 *  4. Audio (audio) — Headphones
 *  5. Q&A IA (qa) — MessageCircle
 *  6. Aide (help) — HelpCircle
 *  7. Planification (planning) — Calendar
 *  8. Progression (progress) — TrendingUp
 */

import { useState } from 'react'
import {
  ArrowLeft, FileText, Award, Calendar, HelpCircle, TrendingUp,
  Layers, Library, Headphones, MessageCircle, BookOpen,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { ExamPrepDocument } from './exam-prep-page'
import { ExamPrepQaTab } from './tabs/exam-prep-qa-tab'
import { ExamPrepPracticeTab } from './tabs/exam-prep-practice-tab'
import { ExamPrepPlanningTab } from './tabs/exam-prep-planning-tab'
import { ExamPrepHelpTab } from './tabs/exam-prep-help-tab'
import { ExamPrepProgressTab } from './tabs/exam-prep-progress-tab'
import { ExamPrepFlashcardsTab } from './tabs/exam-prep-flashcards-tab'
import { ExamPrepQuestionBankTab } from './tabs/exam-prep-question-bank-tab'
import { ExamPrepAudioTab } from './tabs/exam-prep-audio-tab'

interface Props {
  document: ExamPrepDocument
  onBack: () => void
  /**
   * HIGHLIGHT-FLASHCARD-1 : question pré-remplie depuis le DocumentReader
   * (action "Explique-moi ce passage"). Quand cette prop est non vide,
   * le composant bascule sur l'onglet Q&A et transmet le prefill.
   */
  qaPrefill?: string
  /** Appelé quand le prefill a été consommé par ExamPrepQaTab. */
  onConsumeQaPrefill?: () => void
}

const TABS = [
  { value: 'practice', label: 'Entraînement', short: 'Train', icon: Award },
  { value: 'bank', label: 'Banque', short: 'Banque', icon: Library },
  { value: 'flashcards', label: 'Flashcards', short: 'Cards', icon: Layers },
  { value: 'audio', label: 'Audio', short: 'Audio', icon: Headphones },
  { value: 'qa', label: 'Q&A IA', short: 'Questions', icon: MessageCircle },
  { value: 'help', label: 'Aide', short: 'Aide', icon: HelpCircle },
  { value: 'planning', label: 'Planification', short: 'Planning', icon: Calendar },
  { value: 'progress', label: 'Progression', short: 'Progr.', icon: TrendingUp },
] as const

export function ExamPrepDocumentDetail({ document: doc, onBack, qaPrefill, onConsumeQaPrefill }: Props) {
  const [tab, setTab] = useState<string>(qaPrefill && qaPrefill.trim() ? 'qa' : 'practice')

  return (
    <div className="space-y-5">
      {/* ─── Breadcrumb retour ─── */}
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

      {/* ─── Hero du document (motif kente) ─── */}
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
        {/* TabsList : scroll horizontal sur mobile (9 onglets), inline-flex sur desktop */}
        <TabsList
          aria-label="Sections du document"
          className="flex w-full overflow-x-auto scrollbar-thin justify-start sm:inline-flex sm:w-auto sm:overflow-visible h-auto py-1 gap-1"
        >
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="gap-1.5 shrink-0 h-9"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">{t.label}</span>
                <span className="md:hidden">{t.short}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        <div className="mt-5">
          {/* ─── Entraînement ─── */}
          <TabsContent value="practice" className="mt-0 p-4 sm:p-0">
            <ExamPrepPracticeTab documentId={doc.id} chapters={doc.chapters} />
          </TabsContent>

          {/* ─── Banque (QUESTION-BANK-1) ─── */}
          <TabsContent value="bank" className="mt-0 p-4 sm:p-0">
            <ExamPrepQuestionBankTab documentId={doc.id} />
          </TabsContent>

          {/* ─── Flashcards (HIGHLIGHT-FLASHCARD-1) ─── */}
          <TabsContent value="flashcards" className="mt-0 p-4 sm:p-0">
            <ExamPrepFlashcardsTab documentId={doc.id} chapters={doc.chapters} />
          </TabsContent>

          {/* ─── Audio (AUDIO-LEARNING-1) ─── */}
          <TabsContent value="audio" className="mt-0 p-4 sm:p-0">
            <ExamPrepAudioTab documentId={doc.id} />
          </TabsContent>

          {/* ─── Q&A IA ─── */}
          <TabsContent value="qa" className="mt-0 p-4 sm:p-0">
            <ExamPrepQaTab
              documentId={doc.id}
              chapters={doc.chapters}
              prefillQuestion={qaPrefill}
              onConsumePrefill={onConsumeQaPrefill}
            />
          </TabsContent>

          {/* ─── Aide ─── */}
          <TabsContent value="help" className="mt-0 p-4 sm:p-0">
            <ExamPrepHelpTab documentId={doc.id} documentName={doc.nomFichier} />
          </TabsContent>

          {/* ─── Planification ─── */}
          <TabsContent value="planning" className="mt-0 p-4 sm:p-0">
            <ExamPrepPlanningTab documentId={doc.id} chapters={doc.chapters} />
          </TabsContent>

          {/* ─── Progression ─── */}
          <TabsContent value="progress" className="mt-0 p-4 sm:p-0">
            <ExamPrepProgressTab documentId={doc.id} chapters={doc.chapters} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
