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
  type NavSection,
  type UserStatsData,
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
        <Button size="sm" variant="ghost" aria-label="Notifications">
          <Zap className="h-4 w-4" />
        </Button>
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
          <TrendingUp className="h-4 w-4 text-primary" />
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
              <ProgressRing value={95} accent="xp" sublabel="XP" size={60} index={3} />
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
          <Zap className="h-4 w-4 text-primary" />
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
