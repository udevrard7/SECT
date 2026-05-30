'use client'

import { useRef, type ReactNode } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  Brain,
  Building2,
  Check,
  CheckCircle,
  ChevronRight,
  Clock3,
  FileText,
  Github,
  GraduationCap,
  LockKeyhole,
  Mail,
  Phone,
  PlayCircle,
  Quote,
  Shield,
  Sparkles,
  Star,
  Upload,
  UsersRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface LandingPageProps {
  onLogin: () => void
  onDemo: () => void
}

function FadeInWhenVisible({
  children,
  delay = 0,
  direction = 'up',
}: {
  children: ReactNode
  delay?: number
  direction?: 'up' | 'down' | 'left' | 'right'
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  const directionMap = {
    up: { y: 36, x: 0 },
    down: { y: -36, x: 0 },
    left: { x: 36, y: 0 },
    right: { x: -36, y: 0 },
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, ...directionMap[direction] }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

const navItems = [
  { label: 'Plateforme', href: '#plateforme' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Tarifs', href: '#tarifs' },
  { label: 'Avis', href: '#temoignages' },
]

const heroStats = [
  { value: '2 min', label: 'pour générer un sujet' },
  { value: '99,7%', label: 'fiabilité de correction' },
  { value: '24/7', label: 'sessions surveillées' },
]

const features = [
  {
    icon: Sparkles,
    title: 'Studio IA de questions',
    description:
      'Transformez cours, PDF et supports pédagogiques en QCM, questions ouvertes et barèmes cohérents.',
    color: 'from-amber-400 to-orange-500',
  },
  {
    icon: Shield,
    title: 'Passation sécurisée',
    description:
      'Proctoring, verrouillage du navigateur et alertes comportementales pour des examens en ligne maîtrisés.',
    color: 'from-rose-400 to-pink-500',
  },
  {
    icon: Brain,
    title: 'Correction augmentée',
    description:
      'Notation automatique, feedbacks argumentés et relecture humaine intégrée pour garder le contrôle.',
    color: 'from-sky-400 to-blue-500',
  },
  {
    icon: BarChart3,
    title: 'Analytics pédagogiques',
    description:
      'Repérez les lacunes, comparez les cohortes et pilotez les décisions avec des indicateurs actionnables.',
    color: 'from-violet-400 to-purple-500',
  },
  {
    icon: Building2,
    title: 'Multi-établissements',
    description:
      'Déployez une organisation complète avec rôles, filières, unités d’enseignement et espaces cloisonnés.',
    color: 'from-emerald-400 to-teal-500',
  },
  {
    icon: LockKeyhole,
    title: 'Gouvernance & conformité',
    description:
      'Traçabilité, journaux d’activité, permissions fines et paramètres de sécurité par établissement.',
    color: 'from-slate-500 to-emerald-500',
  },
]

const workflow = [
  {
    icon: Upload,
    eyebrow: 'Préparer',
    title: 'Importez vos ressources',
    description:
      'Centralisez documents, banques de questions et grilles d’évaluation dans un espace pédagogique unique.',
  },
  {
    icon: FileText,
    eyebrow: 'Composer',
    title: 'Assemblez l’épreuve',
    description:
      'L’IA propose une structure, vous ajustez la difficulté, les consignes et le barème avant diffusion.',
  },
  {
    icon: UsersRound,
    eyebrow: 'Superviser',
    title: 'Surveillez en temps réel',
    description:
      'Suivez la présence, les alertes et la progression des étudiants depuis un cockpit clair et réactif.',
  },
  {
    icon: CheckCircle,
    eyebrow: 'Analyser',
    title: 'Publiez les résultats',
    description:
      'Validez les corrections, partagez les feedbacks et exportez les statistiques en quelques clics.',
  },
]

const plans = [
  {
    name: 'Starter',
    price: '0€',
    period: '/mois',
    description: 'Pour tester SECT avec une petite équipe.',
    features: ['1 établissement', '50 questions IA / mois', '5 épreuves actives', 'Correction automatique'],
    cta: 'Commencer',
    popular: false,
  },
  {
    name: 'Campus',
    price: '49€',
    period: '/mois',
    description: 'Pour structurer les évaluations d’un établissement.',
    features: ['3 établissements', '500 questions IA / mois', 'Proctoring standard', 'Analytics avancés', 'Support prioritaire'],
    cta: 'Essayer Campus',
    popular: true,
  },
  {
    name: 'Institution',
    price: 'Sur mesure',
    period: '',
    description: 'Pour les réseaux multi-sites et besoins avancés.',
    features: ['Établissements illimités', 'Questions IA illimitées', 'Proctoring avancé', 'API & intégrations', 'SLA dédié'],
    cta: 'Parler à un expert',
    popular: false,
  },
]

const testimonials = [
  {
    name: 'Dr. Marie Dupont',
    role: 'Doyenne de la Faculté des Sciences',
    institution: 'Université de Lyon',
    content:
      'SECT a remplacé plusieurs outils dispersés. Nos équipes préparent les examens plus vite, et les résultats sont plus faciles à exploiter.',
  },
  {
    name: 'Prof. Ahmed Benali',
    role: 'Responsable pédagogique',
    institution: 'École Nationale d’Ingénieurs',
    content:
      'Le cockpit de passation rassure les enseignants. Les alertes sont lisibles et la correction assistée nous fait gagner un temps considérable.',
  },
  {
    name: 'Dr. Claire Martin',
    role: 'Directrice des études',
    institution: 'Institut d’Administration des Entreprises',
    content:
      'La gestion multi-établissements est un vrai atout : chaque filière garde son autonomie tout en respectant nos standards communs.',
  },
]

const trustBadges = ['IA générative', 'Proctoring', 'Multi-tenant', 'Exports & rapports']

export function LandingPage({ onLogin, onDemo }: LandingPageProps) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#eefdf6] text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-300/30 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute bottom-0 right-0 h-[440px] w-[440px] rounded-full bg-cyan-300/25 blur-3xl dark:bg-cyan-500/10" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/50 bg-white/75 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/70">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-3" aria-label="Accueil SECT">
            <img src="/logo.svg" alt="SECT" className="h-10 w-10 rounded-2xl shadow-lg shadow-emerald-900/10" />
            <div>
              <span className="block text-lg font-black tracking-tight text-emerald-950 dark:text-white">SECT</span>
              <span className="hidden text-xs font-medium text-emerald-700/70 dark:text-emerald-300/70 sm:block">
                Evaluation OS
              </span>
            </div>
          </a>

          <div className="hidden items-center gap-2 rounded-full border border-emerald-100 bg-white/70 p-1 shadow-sm dark:border-white/10 dark:bg-white/5 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" onClick={onLogin} className="hidden text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-white/10 sm:inline-flex">
              Connexion
            </Button>
            <Button onClick={onLogin} className="rounded-full bg-slate-950 px-5 text-white shadow-xl shadow-emerald-900/15 hover:bg-emerald-700 dark:bg-white dark:text-slate-950 dark:hover:bg-emerald-100">
              Essai gratuit
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <main id="top">
        <section className="relative px-4 pb-16 pt-12 sm:px-6 sm:pb-24 lg:px-8 lg:pt-20">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}>
              <Badge className="mb-6 rounded-full border-emerald-200 bg-white/70 px-4 py-2 text-emerald-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-emerald-200">
                <Sparkles className="mr-2 h-4 w-4" />
                Nouvelle génération d’évaluations augmentées par IA
              </Badge>

              <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.05em] text-emerald-950 dark:text-white sm:text-6xl lg:text-7xl">
                Le campus digital qui prépare, surveille et corrige vos examens.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300 sm:text-xl">
                SECT modernise tout le cycle d’évaluation : génération de sujets, passation sécurisée,
                correction IA, dashboards pédagogiques et gouvernance multi-établissements.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" onClick={onLogin} className="h-14 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 px-7 text-base font-bold text-white shadow-2xl shadow-emerald-600/25 hover:from-emerald-700 hover:to-teal-600">
                  Créer mon espace
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" onClick={onDemo} className="h-14 rounded-full border-emerald-200 bg-white/70 px-7 text-base font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
                  <PlayCircle className="mr-2 h-5 w-5" />
                  Voir la démo
                </Button>
              </div>

              <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3">
                {heroStats.map((stat) => (
                  <div key={stat.label} className="rounded-3xl border border-white/70 bg-white/65 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                    <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{stat.value}</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.96, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.15, ease: 'easeOut' }} className="relative">
              <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-emerald-400/25 via-teal-300/20 to-sky-300/20 blur-2xl" />
              <Card className="relative overflow-hidden rounded-[2rem] border-white/70 bg-white/85 shadow-2xl shadow-emerald-950/10 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/80">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-emerald-100 bg-slate-950 px-5 py-4 text-white dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-red-400" />
                      <span className="h-3 w-3 rounded-full bg-amber-400" />
                      <span className="h-3 w-3 rounded-full bg-emerald-400" />
                    </div>
                    <Badge className="rounded-full bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/15">
                      Live exam cockpit
                    </Badge>
                  </div>

                  <div className="grid gap-5 p-5 sm:p-6">
                    <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-500 p-6 text-white shadow-xl shadow-emerald-700/20">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-emerald-100">Épreuve en cours</p>
                          <h2 className="mt-2 text-2xl font-black">Algorithmique avancée</h2>
                        </div>
                        <div className="rounded-2xl bg-white/15 px-4 py-3 text-right backdrop-blur">
                          <p className="text-xs text-emerald-100">Temps restant</p>
                          <p className="text-xl font-black">42:18</p>
                        </div>
                      </div>
                      <div className="mt-6 grid grid-cols-3 gap-3">
                        {[
                          ['124', 'inscrits'],
                          ['117', 'connectés'],
                          ['6', 'alertes'],
                        ].map(([value, label]) => (
                          <div key={label} className="rounded-2xl bg-white/15 p-3 backdrop-blur">
                            <p className="text-2xl font-black">{value}</p>
                            <p className="text-xs text-emerald-100">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1fr_0.85fr]">
                      <div className="rounded-3xl border border-emerald-100 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                        <div className="mb-4 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">Pipeline IA</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Sujet, correction, feedback</p>
                          </div>
                          <Brain className="h-5 w-5 text-emerald-500" />
                        </div>
                        {[
                          ['Extraction des notions clés', '100%'],
                          ['Génération des variantes', '82%'],
                          ['Barème contextualisé', '64%'],
                        ].map(([label, width]) => (
                          <div key={label} className="mb-4 last:mb-0">
                            <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                              <span>{label}</span>
                              <span>{width}</span>
                            </div>
                            <div className="h-2 rounded-full bg-emerald-100 dark:bg-white/10">
                              <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-3xl border border-emerald-100 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Alertes proctoring</p>
                        <div className="mt-4 space-y-3">
                          {[
                            ['Regard hors écran', '2 cas'],
                            ['Changement onglet', '3 cas'],
                            ['Identité vérifiée', '117/117'],
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between rounded-2xl bg-emerald-50 px-3 py-2 text-sm dark:bg-white/5">
                              <span className="text-slate-600 dark:text-slate-300">{label}</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-300">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        <section className="border-y border-white/60 bg-white/45 px-4 py-5 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-700/70 dark:text-emerald-300/70">
              Une plateforme unifiée pour
            </p>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
              {trustBadges.map((badge) => (
                <span key={badge} className="rounded-full border border-emerald-100 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-white">
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="plateforme" className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FadeInWhenVisible>
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <Badge className="mb-4 rounded-full bg-emerald-100 px-4 py-2 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200">
                  Plateforme
                </Badge>
                <h2 className="text-4xl font-black tracking-[-0.04em] text-emerald-950 dark:text-white sm:text-5xl">
                  Une stack moderne pour l’évaluation supérieure.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">
                  Chaque module est pensé pour réduire la charge administrative et augmenter la qualité pédagogique.
                </p>
              </div>
            </FadeInWhenVisible>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <FadeInWhenVisible key={feature.title} delay={index * 0.06}>
                  <Card className="group h-full rounded-[1.75rem] border-white/70 bg-white/75 shadow-sm backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-950/10 dark:border-white/10 dark:bg-white/5">
                    <CardContent className="p-6">
                      <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.color} text-white shadow-lg shadow-emerald-950/10 transition group-hover:scale-110`}>
                        <feature.icon className="h-7 w-7" />
                      </div>
                      <h3 className="text-xl font-black text-slate-950 dark:text-white">{feature.title}</h3>
                      <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">{feature.description}</p>
                    </CardContent>
                  </Card>
                </FadeInWhenVisible>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="bg-slate-950 px-4 py-20 text-white sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <FadeInWhenVisible direction="right">
                <Badge className="mb-5 rounded-full bg-white/10 px-4 py-2 text-emerald-200 hover:bg-white/10">Workflow</Badge>
                <h2 className="text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                  De vos supports aux résultats publiés, sans rupture.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-300">
                  SECT orchestre enseignants, responsables et étudiants dans un parcours fluide, transparent et sécurisé.
                </p>
                <Button onClick={onDemo} className="mt-8 rounded-full bg-white px-6 text-slate-950 hover:bg-emerald-100">
                  Explorer le parcours
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </FadeInWhenVisible>

              <div className="grid gap-4 sm:grid-cols-2">
                {workflow.map((step, index) => (
                  <FadeInWhenVisible key={step.title} delay={index * 0.08}>
                    <div className="h-full rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-6 backdrop-blur transition hover:bg-white/[0.09]">
                      <div className="mb-6 flex items-center justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
                          <step.icon className="h-6 w-6" />
                        </div>
                        <span className="text-sm font-black text-white/30">0{index + 1}</span>
                      </div>
                      <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-300">{step.eyebrow}</p>
                      <h3 className="mt-3 text-xl font-black">{step.title}</h3>
                      <p className="mt-3 leading-7 text-slate-300">{step.description}</p>
                    </div>
                  </FadeInWhenVisible>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 p-1 shadow-2xl shadow-emerald-900/15">
            <div className="grid gap-8 rounded-[1.85rem] bg-white/10 p-8 text-white backdrop-blur md:grid-cols-4 md:p-10">
              {[
                { icon: Clock3, value: '70%', label: 'de temps gagné sur la préparation' },
                { icon: GraduationCap, value: '4 rôles', label: 'admin, responsable, enseignant, étudiant' },
                { icon: BarChart3, value: '360°', label: 'vision des performances pédagogiques' },
                { icon: Shield, value: 'Audit', label: 'journalisation complète des actions' },
              ].map((stat) => (
                <div key={stat.label}>
                  <stat.icon className="mb-4 h-7 w-7 text-emerald-100" />
                  <p className="text-4xl font-black tracking-tight">{stat.value}</p>
                  <p className="mt-2 text-sm font-semibold text-white/75">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="tarifs" className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FadeInWhenVisible>
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <Badge className="mb-4 rounded-full bg-emerald-100 px-4 py-2 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200">Tarifs</Badge>
                <h2 className="text-4xl font-black tracking-[-0.04em] text-emerald-950 dark:text-white sm:text-5xl">
                  Démarrez simplement, déployez à l’échelle.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">
                  Choisissez le niveau adapté à votre établissement, puis activez les modules avancés selon vos usages.
                </p>
              </div>
            </FadeInWhenVisible>

            <div className="grid gap-6 lg:grid-cols-3">
              {plans.map((plan, index) => (
                <FadeInWhenVisible key={plan.name} delay={index * 0.08}>
                  <Card className={`relative h-full rounded-[2rem] border-white/70 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 ${plan.popular ? 'ring-2 ring-emerald-400 shadow-2xl shadow-emerald-900/10 lg:-translate-y-3' : ''}`}>
                    {plan.popular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="rounded-full bg-slate-950 px-4 py-1.5 text-white dark:bg-white dark:text-slate-950">Recommandé</Badge>
                      </div>
                    )}
                    <CardHeader className="p-7 pb-3">
                      <CardTitle className="text-2xl font-black text-slate-950 dark:text-white">{plan.name}</CardTitle>
                      <p className="min-h-12 text-slate-600 dark:text-slate-300">{plan.description}</p>
                      <div className="pt-5">
                        <span className="text-5xl font-black tracking-tight text-emerald-700 dark:text-emerald-300">{plan.price}</span>
                        <span className="font-semibold text-slate-500 dark:text-slate-400">{plan.period}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-7 pt-3">
                      <Separator className="mb-6 bg-emerald-100 dark:bg-white/10" />
                      <ul className="space-y-4">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex gap-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter className="p-7 pt-0">
                      <Button onClick={onLogin} className={`h-12 w-full rounded-full font-bold ${plan.popular ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-700 hover:to-teal-600' : 'bg-slate-950 text-white hover:bg-emerald-700 dark:bg-white dark:text-slate-950 dark:hover:bg-emerald-100'}`}>
                        {plan.cta}
                      </Button>
                    </CardFooter>
                  </Card>
                </FadeInWhenVisible>
              ))}
            </div>
          </div>
        </section>

        <section id="temoignages" className="bg-white/55 px-4 py-20 backdrop-blur dark:bg-white/5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FadeInWhenVisible>
              <div className="mx-auto mb-14 max-w-3xl text-center">
                <Badge className="mb-4 rounded-full bg-emerald-100 px-4 py-2 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200">Avis</Badge>
                <h2 className="text-4xl font-black tracking-[-0.04em] text-emerald-950 dark:text-white sm:text-5xl">
                  Adopté par les équipes pédagogiques exigeantes.
                </h2>
              </div>
            </FadeInWhenVisible>

            <div className="grid gap-5 lg:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <FadeInWhenVisible key={testimonial.name} delay={index * 0.08}>
                  <Card className="h-full rounded-[1.75rem] border-white/70 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/55">
                    <CardContent className="p-6">
                      <Quote className="mb-5 h-9 w-9 text-emerald-400" />
                      <p className="leading-7 text-slate-700 dark:text-slate-200">“{testimonial.content}”</p>
                      <div className="mt-6 flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                      <Separator className="my-5 bg-emerald-100 dark:bg-white/10" />
                      <p className="font-black text-slate-950 dark:text-white">{testimonial.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{testimonial.role}</p>
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{testimonial.institution}</p>
                    </CardContent>
                  </Card>
                </FadeInWhenVisible>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl rounded-[2.5rem] bg-slate-950 p-8 text-center text-white shadow-2xl shadow-emerald-950/20 dark:bg-white dark:text-slate-950 sm:p-12">
            <FadeInWhenVisible>
              <Badge className="mb-5 rounded-full bg-emerald-400/15 px-4 py-2 text-emerald-200 hover:bg-emerald-400/15 dark:bg-emerald-100 dark:text-emerald-700">
                Prêt pour votre prochain examen ?
              </Badge>
              <h2 className="text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                Donnez à vos équipes un système d’évaluation vraiment moderne.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300 dark:text-slate-600">
                Lancez un espace pilote, invitez vos enseignants et mesurez l’impact dès la première session.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" onClick={onLogin} className="h-14 rounded-full bg-white px-7 text-base font-bold text-slate-950 hover:bg-emerald-100 dark:bg-slate-950 dark:text-white dark:hover:bg-emerald-700">
                  Commencer gratuitement
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" onClick={onDemo} className="h-14 rounded-full border-white/20 bg-white/5 px-7 text-base font-bold text-white hover:bg-white/10 dark:border-slate-200 dark:text-slate-950 dark:hover:bg-slate-50">
                  <Mail className="mr-2 h-5 w-5" />
                  Contacter l’équipe
                </Button>
              </div>
            </FadeInWhenVisible>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/60 bg-emerald-950 px-4 py-12 text-emerald-50 dark:border-white/10 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.2fr_0.8fr_0.8fr_1fr]">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <img src="/logo.svg" alt="SECT" className="h-10 w-10 rounded-2xl" />
              <div>
                <p className="text-lg font-black">SECT</p>
                <p className="text-xs text-emerald-300/70">Système d’Evaluation Casse-Tête</p>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-7 text-emerald-100/65">
              La plateforme d’évaluation en ligne propulsée par l’intelligence artificielle pour les établissements d’enseignement supérieur.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-emerald-300">Produit</h4>
            <ul className="space-y-3 text-sm text-emerald-100/70">
              {navItems.map((item) => (
                <li key={item.href}><a href={item.href} className="transition hover:text-white">{item.label}</a></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-emerald-300">Ressources</h4>
            <ul className="space-y-3 text-sm text-emerald-100/70">
              <li><a href="#" className="transition hover:text-white">Support</a></li>
              <li><a href="#" className="transition hover:text-white">Mentions légales</a></li>
              <li><a href="#" className="transition hover:text-white">Confidentialité</a></li>
              <li><a href="#" className="transition hover:text-white">CGU</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-emerald-300">Contact</h4>
            <ul className="space-y-3 text-sm text-emerald-100/70">
              <li className="flex items-center gap-2"><Mail className="h-4 w-4" /> contact@sect.fr</li>
              <li className="flex items-center gap-2"><Phone className="h-4 w-4" /> +33 1 23 45 67 89</li>
            </ul>
            <a href="#" className="mt-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-emerald-100 transition hover:bg-white/15" aria-label="GitHub">
              <Github className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-7xl flex-col gap-3 border-t border-white/10 pt-6 text-xs text-emerald-100/50 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; 2026 SECT — Tous droits réservés.</p>
          <p>Conçu pour les examens fiables, rapides et pilotables.</p>
        </div>
      </footer>
    </div>
  )
}
