'use client'

import { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  FileText,
  GraduationCap,
  Award,
  TrendingUp,
  BookOpen,
  CheckCircle2,
  Zap,
  Calendar,
  Trophy,
  Sparkles,
} from 'lucide-react'
import {
  AppShell,
  StatCard,
  EntityCard,
  UserStats,
  GlassModal,
  ProgressRing,
  RewardToast,
  PulseSkeleton,
  StatCardSkeletonGrid,
  ProgressBar,
  BadgeCard,
  RewardCenter,
  AcademicCalendar,
  GradeTable,
  AIAssistant,
  ThemeToggle,
  type NavSection,
  type UserStatsData,
  type Reward,
  type CalendarEvent,
  type GradeEntry,
} from '@/components/ds'
import { Button } from '@/components/ui/button'

/**
 * DesignSystemShowcase — Démonstration vivante du Design System SECT.
 *
 * Affiche tous les composants du DS dans un AppShell fonctionnel, avec
 * des états interactifs (modale, toast, skeleton loading).
 *
 * Usage temporaire : monter ce composant dans src/app/page.tsx pour
 * visualiser le DS. Ne pas déployer en production.
 */
export function DesignSystemShowcase() {
  const [modalOpen, setModalOpen] = useState(false)
  const [toastOpen, setToastOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const sections: NavSection[] = [
    {
      title: 'Pédagogique',
      items: [
        { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
        { id: 'epreuves', label: 'Épreuves', icon: FileText, badge: 3 },
        { id: 'etudiants', label: 'Étudiants', icon: GraduationCap },
        { id: 'questions', label: 'Questions', icon: BookOpen },
      ],
    },
    {
      title: 'Administration',
      items: [
        { id: 'users', label: 'Utilisateurs', icon: Users },
        { id: 'badges', label: 'Badges', icon: Award },
      ],
    },
  ]

  const userStats: UserStatsData = {
    xp: 2840,
    streak: 7,
    level: 12,
    tier: 'gold',
  }

  return (
    <AppShell
      brand={{ name: 'SECT' }}
      sections={sections}
      activeId="dashboard"
      onNavigate={(item) => console.log('Nav:', item.id)}
      userStats={userStats}
      user={{ name: 'Ulrich Devrard', role: 'Enseignant' }}
      topbarActions={
        <>
          <ThemeToggle />
          <Button size="sm" variant="ghost" aria-label="Notifications">
            <Zap className="h-4 w-4" />
          </Button>
        </>
      }
      sidebarFooter={
        <div className="rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 p-3 text-xs">
          <p className="font-semibold mb-1">Plan Essentiel</p>
          <p className="text-muted-foreground mb-2">12 jours restants</p>
          <Button size="sm" className="w-full h-7 text-xs">Mettre à niveau</Button>
        </div>
      }
    >
      {/* ── Header de la page ── */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Design System Showcase
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Démonstration des composants du Design System SECT — style hybride Modern + Card + Glass + Gamification.
        </p>
      </div>

      {/* ── Section 1 : StatCards ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary-text" />
          StatCards — Métriques & tendances
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Moyenne générale"
            value="14.5/20"
            icon={GraduationCap}
            accent="primary"
            trend={{ direction: 'up', value: '+8%', label: 'vs semestre dernier' }}
            index={0}
          />
          <StatCard
            label="Taux de réussite"
            value="87%"
            icon={CheckCircle2}
            accent="success"
            trend={{ direction: 'up', value: '+12%' }}
            index={1}
          />
          <StatCard
            label="Évaluations en attente"
            value="5"
            icon={FileText}
            accent="warning"
            trend={{ direction: 'down', value: '-2' }}
            index={2}
          />
          <StatCard
            label="Étudiants en difficulté"
            value="3"
            icon={Users}
            accent="danger"
            hint="Score < 8/20"
            index={3}
          />
        </div>
      </section>

      {/* ── Section 2 : Skeleton loading ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <PulseSkeleton className="h-4 w-4" />
          États de chargement (PulseSkeleton)
        </h2>
        <div className="flex items-center gap-3 mb-3">
          <Button size="sm" variant="outline" onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 2500) }}>
            Simuler un chargement
          </Button>
          {loading && <span className="text-xs text-muted-foreground">Chargement pendant 2.5s…</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            <StatCardSkeletonGrid count={4} />
          ) : (
            <StatCard label="Cache rechargé" value="OK" icon={CheckCircle2} accent="success" index={0} />
          )}
        </div>
      </section>

      {/* ── Section 3 : EntityCards ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-secondary" />
          EntityCards — Cartes d'entités (épreuves, cours…)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <EntityCard
            title="Examen final — Algorithmique"
            subtitle="L3 Informatique · 45 min"
            thumbnailIcon={FileText}
            progress={75}
            tier="gold"
            badge={{ label: 'EN_COURS', variant: 'warning' }}
            meta="12 questions · 20 pts"
            index={0}
            onClick={() => console.log('Card 1')}
          />
          <EntityCard
            title="QCM — Bases de données"
            subtitle="L2 · 30 min"
            thumbnailIcon={BookOpen}
            progress={100}
            tier="platinum"
            badge={{ label: 'TERMINÉ', variant: 'success' }}
            meta="20 questions · 20 pts"
            index={1}
          />
          <EntityCard
            title="Devoir — Structures de données"
            subtitle="L1 · Sans limite"
            thumbnailIcon={FileText}
            progress={40}
            tier="bronze"
            badge={{ label: 'À FAIRE', variant: 'danger' }}
            meta="5 questions · 20 pts"
            index={2}
          />
          <EntityCard
            title="Projet — API REST"
            subtitle="M1 · 2 semaines"
            thumbnailIcon={GraduationCap}
            progress={0}
            tier="silver"
            meta="Rendu individuel"
            index={3}
          />
        </div>
      </section>

      {/* ── Section 4 : ProgressRing + UserStats détaillé ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-gold" />
          Gamification — ProgressRing & UserStats
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ProgressRings */}
          <div className="p-5 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-4">ProgressRing — anneaux animés</h3>
            <div className="flex flex-wrap items-center gap-6">
              <ProgressRing value={87} accent="success" sublabel="Réussite" index={0} />
              <ProgressRing value={62} accent="primary" sublabel="Progression" index={1} />
              <ProgressRing value={35} accent="warning" sublabel="À risque" index={2} />
              <ProgressRing value={95} accent="xp" sublabel="XP" index={3} />
            </div>
          </div>
          {/* UserStats détaillé */}
          <div className="p-5 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-4">UserStats — carte profil gamifiée</h3>
            <UserStats
              stats={userStats}
              compact={false}
              userName="Ulrich Devrard"
              avatarUrl="/logo.png"
            />
          </div>
        </div>
      </section>

      {/* ── Section 5 : GlassModal & RewardToast (interactif) ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary-text" />
          Interactions — GlassModal & RewardToast
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setModalOpen(true)}>Ouvrir GlassModal</Button>
          <Button variant="secondary" onClick={() => setToastOpen(true)}>
            Déclencher RewardToast
          </Button>
        </div>
      </section>

      {/* ── Section 6 : Palette de couleurs ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3">
          Palette — tokens sémantiques
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { name: 'Primary (Indigo)', cls: 'bg-primary text-primary-foreground' },
            { name: 'Secondary (Violet)', cls: 'bg-secondary text-secondary-foreground' },
            { name: 'Success (Emerald)', cls: 'bg-success text-success-foreground' },
            { name: 'Warning (Amber)', cls: 'bg-warning text-warning-foreground' },
            { name: 'Danger (Red)', cls: 'bg-destructive text-destructive-foreground' },
            { name: 'Info (Blue)', cls: 'bg-info text-info-foreground' },
            { name: 'Tech (Cyan)', cls: 'bg-tech text-tech-foreground' },
            { name: 'XP', cls: 'bg-xp text-white' },
            { name: 'Bronze', cls: 'bg-bronze text-white' },
            { name: 'Silver', cls: 'bg-silver text-black' },
            { name: 'Gold', cls: 'bg-gold text-black' },
            { name: 'Platinum', cls: 'bg-platinum text-black' },
            { name: 'Muted', cls: 'bg-muted text-muted-foreground' },
            { name: 'Card', cls: 'bg-card text-card-foreground border border-border' },
          ].map((c) => (
            <div key={c.name} className={`rounded-md p-3 text-xs font-medium ${c.cls}`}>
              {c.name}
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 7 : ProgressBar (animée) ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-tech" />
          ProgressBar — barres animées (8 accents)
        </h2>
        <div className="p-5 rounded-lg border border-border bg-card space-y-4">
          <div>
            <div className="flex justify-between mb-1.5"><span className="text-xs text-muted-foreground">Cours algorithmique</span><span className="font-mono text-xs">75%</span></div>
            <ProgressBar value={75} accent="primary" index={0} />
          </div>
          <div>
            <div className="flex justify-between mb-1.5"><span className="text-xs text-muted-foreground">Réussite examen</span><span className="font-mono text-xs">87%</span></div>
            <ProgressBar value={87} accent="success" index={1} />
          </div>
          <div>
            <div className="flex justify-between mb-1.5"><span className="text-xs text-muted-foreground">Objectif hebdo</span><span className="font-mono text-xs">40%</span></div>
            <ProgressBar value={40} accent="warning" index={2} />
          </div>
          <div>
            <div className="flex justify-between mb-1.5"><span className="text-xs text-muted-foreground">XP niveau 13</span><span className="font-mono text-xs">81%</span></div>
            <ProgressBar value={81} accent="xp" size="lg" showGlow index={3} />
          </div>
          <div>
            <div className="flex justify-between mb-1.5"><span className="text-xs text-muted-foreground">IA (cyan tech)</span><span className="font-mono text-xs">62%</span></div>
            <ProgressBar value={62} accent="tech" index={4} />
          </div>
        </div>
      </section>

      {/* ── Section 8 : RewardCenter (gamification) ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-gold" />
          RewardCenter — Centre de récompenses
        </h2>
        <RewardCenter
          userProgress={{ xp: 2840, nextLevelXp: 3500, level: 12 }}
          rewards={[
            { id: '1', title: 'Streak 7 jours', description: 'Connecté 7 jours de suite', tier: 'gold', icon: Zap, unlocked: true, unlockedAt: new Date(Date.now() - 86400000) },
            { id: '2', title: '50 copies corrigées', description: 'Sans erreur cette semaine', tier: 'platinum', icon: CheckCircle2, unlocked: true, unlockedAt: new Date(Date.now() - 3600000) },
            { id: '3', title: 'Premier examen', description: 'Votre première épreuve créée', tier: 'bronze', icon: FileText, unlocked: true, unlockedAt: new Date(Date.now() - 604800000) },
            { id: '4', title: '100 copies', description: 'Corriger 100 copies au total', tier: 'silver', icon: Award, unlocked: false, progress: 45 },
            { id: '5', title: 'Maître IA', description: 'Utiliser 50 fois l\'assistant IA', tier: 'platinum', icon: Sparkles, unlocked: false, progress: 12 },
            { id: '6', title: 'Excellence', description: 'Obtenir 20/20 à un examen', tier: 'gold', icon: Trophy, unlocked: false, progress: 0 },
          ]}
        />
      </section>

      {/* ── Section 9 : AcademicCalendar ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-info" />
          AcademicCalendar — Calendrier académique
        </h2>
        <div className="max-w-md">
          <AcademicCalendar
            events={[
              { id: '1', date: new Date(2025, new Date().getMonth(), 15), title: 'Examen final algorithmique', type: 'exam' },
              { id: '2', date: new Date(2025, new Date().getMonth(), 20), title: 'Rendu projet API', type: 'deadline' },
              { id: '3', date: new Date(2025, new Date().getMonth(), 10), title: 'Cours BDD', type: 'course' },
            ]}
          />
        </div>
      </section>

      {/* ── Section 10 : GradeTable ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-success-text" />
          GradeTable — Tableau des notes premium
        </h2>
        <GradeTable
          grades={[
            { id: '1', subject: 'Algorithmique', examTitle: 'Examen final', score: 16, maxScore: 20, date: '2025-06-23', coefficient: 3, comment: 'Très bonne maîtrise des AVL' },
            { id: '2', subject: 'Bases de données', examTitle: 'QCM', score: 18, maxScore: 20, date: '2025-06-20', coefficient: 2 },
            { id: '3', subject: 'Structures de données', examTitle: 'Devoir', score: 14, maxScore: 20, date: '2025-06-18', coefficient: 2, comment: 'Revoir les graphes' },
            { id: '4', subject: 'API REST', examTitle: 'Projet', score: 19, maxScore: 20, date: '2025-06-15', coefficient: 4 },
            { id: '5', subject: 'Réseaux', examTitle: 'Partiel', score: 9, maxScore: 20, date: '2025-06-10', coefficient: 2, comment: 'Insuffisant, revoir le cours' },
          ]}
        />
      </section>

      {/* ── Section 11 : AIAssistant (note : composant flottant, visible en bas à droite) ── */}
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-tech" />
          AIAssistant — Assistant IA pédagogique (bouton flottant en bas à droite →)
        </h2>
        <p className="text-sm text-muted-foreground">
          Cliquez sur le bouton flottant cyan en bas à droite de l'écran pour ouvrir l'assistant IA.
          Il propose des suggestions rapides, garde l'historique des messages, et gère le focus trap + Escape.
        </p>
        <AIAssistant
          title="Assistant pédagogique"
          suggestions={["Explique les arbres AVL", "Donne un exemple de tri rapide", "Comment optimiser une requête SQL ?"]}
          onSend={async (msg) => {
            await new Promise(r => setTimeout(r, 800))
            return `Voici ma réponse à votre question : "${msg}". [Réponse simulée pour la démo — en production, cette fonction appellerait l'API IA via le système de failover Mistral→Groq→OpenRouter.]`
          }}
        />
      </section>

      {/* ── GlassModal ── */}
      <GlassModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Confirmation de correction"
        description="Voulez-vous appliquer la note suggérée par l'IA ?"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button onClick={() => setModalOpen(false)}>Appliquer 16/20</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm">L'IA a évalué cette réponse avec une confiance de 92%.</p>
          <div className="flex items-center gap-3 p-3 rounded-md bg-muted">
            <ProgressRing value={92} accent="success" size={56} sublabel="" index={0} />
            <div>
              <p className="text-sm font-semibold">Note suggérée : 16/20</p>
              <p className="text-xs text-muted-foreground">Réponse complète et bien structurée</p>
            </div>
          </div>
        </div>
      </GlassModal>

      {/* ── RewardToast ── */}
      <RewardToast
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        title="Nouveau badge débloqué !"
        description="Vous avez corrigé 50 copies sans erreur cette semaine."
        xpGained={150}
        tier="gold"
        icon={Award}
        duration={5000}
      />
    </AppShell>
  )
}
