'use client'

/**
 * ExamPrepDocumentDetail — Vue détail d'un document avec 9 onglets.
 *
 * EXAM-PREP-REFACTOR-1 : refonte DS "Savane EdTech".
 *  - Hero avec motif kente + métadonnées du document
 *  - TabsList scrollable horizontalement sur mobile (9 onglets trop serrés
 *    pour un grid-cols-4), inline-flex sur desktop
 *  - Chaque TabsContent a un padding consistent (p-4 sm:p-6) et space-y-6
 *
 * 9 onglets :
 *  1. Vue d'ensemble (overview) — LayoutDashboard
 *  2. Entraînement (practice) — Zap
 *  3. Banque (bank) — Library
 *  4. Flashcards (flashcards) — Layers
 *  5. Audio (audio) — Headphones
 *  6. Q&A IA (qa) — MessageCircle
 *  7. Aide (help) — HelpCircle
 *  8. Planification (planning) — Calendar
 *  9. Progression (progress) — TrendingUp
 */

import { useState } from 'react'
import {
  ArrowLeft, FileText, Sparkles, Award, Calendar, HelpCircle, TrendingUp,
  Layers, Library, Headphones, MessageCircle, LayoutDashboard, BookOpen,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { EntityCard } from '@/components/ds'
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
  { value: 'overview', label: 'Vue d\'ensemble', short: 'Aperçu', icon: LayoutDashboard },
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
  const [tab, setTab] = useState<string>(qaPrefill && qaPrefill.trim() ? 'qa' : 'overview')

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
          {/* ─── Vue d'ensemble ─── */}
          <TabsContent value="overview" className="mt-0 space-y-6 p-4 sm:p-0">
            <OverviewTab doc={doc} onSelectTab={setTab} />
          </TabsContent>

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

// ─── Vue d'ensemble ───

function OverviewTab({
  doc, onSelectTab,
}: {
  doc: ExamPrepDocument
  onSelectTab: (tab: string) => void
}) {
  return (
    <div className="space-y-6">
      {/* Chapitres */}
      <div>
        <h3 className="font-display text-sm font-semibold tracking-tight text-muted-foreground uppercase mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary-text" />
          Chapitres du document
        </h3>
        {doc.chapters.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Aucun chapitre structuré détecté lors de l&apos;analyse. Vous pouvez
              quand même utiliser « Q&A IA » et l&apos;entraînement sur l&apos;ensemble du document.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {doc.chapters.map((ch, i) => (
              <EntityCard
                key={ch.id}
                title={ch.titre}
                subtitle={ch.sujets.length > 0 ? ch.sujets.slice(0, 2).join(' · ') : undefined}
                badge={{ label: `Ch. ${ch.ordre + 1}`, variant: 'primary' }}
                index={i}
              >
                {ch.sujets.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
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
              </EntityCard>
            ))}
          </div>
        )}
      </div>

      {/* Thèmes détectés */}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
        <QuickAction
          icon={Sparkles}
          title="Poser une question"
          desc="L'IA répond en citant votre cours"
          accent="primary"
          onClick={() => onSelectTab('qa')}
        />
        <QuickAction
          icon={Award}
          title="S'entraîner"
          desc="Questions auto + correction"
          accent="success"
          onClick={() => onSelectTab('practice')}
        />
        <QuickAction
          icon={Layers}
          title="Créer des flashcards"
          desc="Sélectionnez un passage dans le lecteur"
          accent="info"
          onClick={() => onSelectTab('flashcards')}
        />
      </div>
    </div>
  )
}

function QuickAction({
  icon: Icon, title, desc, accent, onClick,
}: {
  icon: typeof Sparkles
  title: string
  desc: string
  accent: 'primary' | 'success' | 'info' | 'warning'
  onClick: () => void
}) {
  const accentBg = {
    primary: 'bg-primary/10',
    success: 'bg-success/10',
    info: 'bg-info/10',
    warning: 'bg-warning/10',
  }[accent]
  const accentText = {
    primary: 'text-primary-text',
    success: 'text-success-text',
    info: 'text-info',
    warning: 'text-warning',
  }[accent]
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all ds-lift text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accentBg}`}>
        <Icon className={`h-5 w-5 ${accentText}`} />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </button>
  )
}
