'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import {
  Sparkles,
  FileText,
  CheckCircle,
  Shield,
  BarChart3,
  Building2,
  ArrowRight,
  Star,
  Quote,
  Twitter,
  Linkedin,
  Github,
  Mail,
  Phone,
  Upload,
  Monitor,
  Brain,
  Check,
  Zap,
  Crown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface LandingPageProps {
  onLogin: () => void
  onDemo: () => void
}

/* ─── Animation helpers ─── */
function FadeInWhenVisible({
  children,
  delay = 0,
  direction = 'up',
}: {
  children: React.ReactNode
  delay?: number
  direction?: 'up' | 'down' | 'left' | 'right'
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })

  const directionMap = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { x: 40, y: 0 },
    right: { x: -40, y: 0 },
  }

  return (
    <motion.div
      ref={ref}
      initial={{
        opacity: 0,
        ...directionMap[direction],
      }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/* ─── Features data ─── */
const features = [
  {
    icon: Sparkles,
    title: 'Génération IA de questions',
    description:
      'Importez vos documents et laissez l\'IA générer automatiquement des questions pertinentes et variées adaptées à votre programme.',
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
  },
  {
    icon: FileText,
    title: 'Épreuves en ligne interactives',
    description:
      'Créez des épreuves personnalisées avec QCM, questions ouvertes, et bien plus. Planifiez et diffusez en un clic.',
    color: 'from-emerald-500 to-teal-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  {
    icon: CheckCircle,
    title: 'Correction automatisée par IA',
    description:
      'La correction des copies est effectuée par l\'IA en quelques secondes, avec une fiabilité de 99.7% et des feedbacks détaillés.',
    color: 'from-sky-500 to-blue-500',
    bgColor: 'bg-sky-50 dark:bg-sky-950/30',
  },
  {
    icon: Shield,
    title: 'Proctoring & anti-fraude',
    description:
      'Surveillance intelligente par IA : détection de triche, verrouillage du navigateur, et suivi comportemental en temps réel.',
    color: 'from-rose-500 to-pink-500',
    bgColor: 'bg-rose-50 dark:bg-rose-950/30',
  },
  {
    icon: BarChart3,
    title: 'Tableaux de bord analytiques',
    description:
      'Visualisez les performances, identifiez les lacunes et prenez des décisions éclairées grâce à des statistiques détaillées.',
    color: 'from-violet-500 to-purple-500',
    bgColor: 'bg-violet-50 dark:bg-violet-950/30',
  },
  {
    icon: Building2,
    title: 'Multi-établissements SaaS',
    description:
      'Gérez plusieurs établissements depuis une seule plateforme. Architecture multi-tenant sécurisée et évolutive.',
    color: 'from-emerald-500 to-cyan-500',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
]

/* ─── Steps data ─── */
const steps = [
  {
    number: '01',
    icon: Upload,
    title: 'Créez vos épreuves',
    description:
      'Uploadez vos documents pédagogiques et laissez l\'IA générer des questions pertinentes. Personnalisez, organisez et composez vos épreuves en quelques minutes.',
  },
  {
    number: '02',
    icon: Monitor,
    title: 'Faites passer les examens',
    description:
      'Diffusez les épreuves en ligne avec un système de proctoring intégré. Les étudiants passent les examens en toute sécurité depuis n\'importe quel appareil.',
  },
  {
    number: '03',
    icon: Brain,
    title: 'Corrigez automatiquement',
    description:
      'L\'IA corrige les copies instantanément et génère des analytics détaillés. Identifiez les forces et les axes d\'amélioration de chaque étudiant.',
  },
]

/* ─── Stats data ─── */
const stats = [
  { value: '10 000+', label: 'Questions générées' },
  { value: '500+', label: 'Épreuves créées' },
  { value: '99.7%', label: 'Fiabilité' },
  { value: '50+', label: 'Établissements' },
]

/* ─── Pricing data ─── */
const plans = [
  {
    name: 'Gratuit',
    price: '0€',
    period: '/mois',
    description: 'Idéal pour découvrir la plateforme',
    icon: Zap,
    features: [
      '1 établissement',
      '50 questions IA / mois',
      '5 épreuves actives',
      'Correction automatique',
      'Support communautaire',
    ],
    cta: 'Commencer gratuitement',
    popular: false,
  },
  {
    name: 'Essentiel',
    price: '49€',
    period: '/mois',
    description: 'Pour les établissements en croissance',
    icon: Crown,
    features: [
      '3 établissements',
      '500 questions IA / mois',
      '50 épreuves actives',
      'Proctoring basique',
      'Analytics avancés',
      'Support prioritaire',
    ],
    cta: 'Essayer gratuitement',
    popular: true,
  },
  {
    name: 'Professionnel',
    price: '149€',
    period: '/mois',
    description: 'Pour les grandes institutions',
    icon: Building2,
    features: [
      'Établissements illimités',
      'Questions IA illimitées',
      'Épreuves illimitées',
      'Proctoring avancé',
      'API & intégrations',
      'Support dédié 24/7',
      'SLA garanti 99.9%',
    ],
    cta: 'Contacter les ventes',
    popular: false,
  },
]

/* ─── Testimonials data ─── */
const testimonials = [
  {
    name: 'Dr. Marie Dupont',
    role: 'Doyenne de la Faculté des Sciences',
    institution: 'Université de Lyon',
    content:
      'SECT a révolutionné notre processus d\'évaluation. La génération de questions par IA nous fait gagner des heures de travail chaque semaine, et la correction automatique est d\'une fiabilité remarquable.',
    rating: 5,
  },
  {
    name: 'Prof. Ahmed Benali',
    role: 'Responsable Pédagogique',
    institution: 'École Nationale d\'Ingénieurs',
    content:
      'Le système de proctoring nous a permis de passer aux examens en ligne en toute confiance. Les étudiants apprécient la flexibilité et nous, la qualité des analytics.',
    rating: 5,
  },
  {
    name: 'Dr. Claire Martin',
    role: 'Directrice des Études',
    institution: 'Institut d\'Administration des Entreprises',
    content:
      'La plateforme multi-établissements est exactement ce dont nous avions besoin. Un seul outil pour gérer les évaluations de toutes nos composantes. L\'accompagnement est excellent.',
    rating: 5,
  },
]

/* ─── Main Component ─── */
export function LandingPage({ onLogin, onDemo }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-emerald-950 dark:via-teal-950 dark:to-emerald-900">
      {/* ─── Navbar ─── */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 dark:bg-emerald-950/70 border-b border-emerald-200/50 dark:border-emerald-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="SECT" className="w-9 h-9 rounded-lg" />
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-700 to-teal-600 dark:from-emerald-300 dark:to-teal-400 bg-clip-text text-transparent">
              SECT
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#fonctionnalites" className="text-sm font-medium text-emerald-800/70 dark:text-emerald-200/70 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">
              Fonctionnalités
            </a>
            <a href="#comment" className="text-sm font-medium text-emerald-800/70 dark:text-emerald-200/70 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">
              Comment ça marche
            </a>
            <a href="#tarifs" className="text-sm font-medium text-emerald-800/70 dark:text-emerald-200/70 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">
              Tarifs
            </a>
            <a href="#temoignages" className="text-sm font-medium text-emerald-800/70 dark:text-emerald-200/70 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">
              Témoignages
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={onLogin}
              className="text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
            >
              Connexion
            </Button>
            <Button
              onClick={onLogin}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20"
            >
              Essai gratuit
            </Button>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8">
        {/* Decorative orbs */}
        <div className="absolute top-20 -left-32 w-96 h-96 bg-emerald-400/20 dark:bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 -right-32 w-80 h-80 bg-teal-400/20 dark:bg-teal-500/10 rounded-full blur-3xl" />

        <div className="max-w-7xl mx-auto relative">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge
                variant="secondary"
                className="mb-6 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 px-4 py-1.5 text-sm"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Propulsé par l&apos;Intelligence Artificielle
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-emerald-900 dark:text-emerald-50 leading-tight"
            >
              Transformez{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                l&apos;évaluation
              </span>{' '}
              avec l&apos;Intelligence Artificielle
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 text-lg sm:text-xl text-emerald-700/80 dark:text-emerald-200/70 max-w-2xl mx-auto leading-relaxed"
            >
              SECT est la plateforme tout-en-un qui automatise la création, la passation et la
              correction des épreuves. Gagnez du temps, améliorez la fiabilité et offrez une
              expérience moderne à vos étudiants.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Button
                size="lg"
                onClick={onLogin}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-600/25 px-8 text-base h-12"
              >
                Commencer gratuitement
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={onDemo}
                className="border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 px-8 text-base h-12"
              >
                Voir une démo
              </Button>
            </motion.div>

            {/* Floating decorative cards */}
            <div className="relative mt-16 hidden lg:block">
              <motion.div
                initial={{ opacity: 0, x: -60, y: 20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="absolute -left-16 top-0"
              >
                <Card className="w-56 backdrop-blur-md bg-white/80 dark:bg-emerald-900/50 border-emerald-200/60 dark:border-emerald-800/40 shadow-xl">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">+247 questions</p>
                      <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">générées cette semaine</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 60, y: 20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.8, delay: 0.7 }}
                className="absolute -right-16 top-0"
              >
                <Card className="w-56 backdrop-blur-md bg-white/80 dark:bg-emerald-900/50 border-emerald-200/60 dark:border-emerald-800/40 shadow-xl">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">99.7% fiabilité</p>
                      <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">correction automatique</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section id="fonctionnalites" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/60 dark:bg-emerald-950/40">
        <div className="max-w-7xl mx-auto">
          <FadeInWhenVisible>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <Badge variant="secondary" className="mb-4 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                Fonctionnalités
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-emerald-900 dark:text-emerald-50">
                Tout ce dont vous avez besoin
              </h2>
              <p className="mt-4 text-lg text-emerald-700/70 dark:text-emerald-200/60">
                Une suite complète d&apos;outils pour moderniser l&apos;évaluation dans l&apos;enseignement supérieur.
              </p>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <FadeInWhenVisible key={feature.title} delay={index * 0.1}>
                <Card className="h-full backdrop-blur-md bg-white/70 dark:bg-emerald-900/40 border-emerald-200/50 dark:border-emerald-800/40 hover:shadow-lg hover:shadow-emerald-900/5 dark:hover:shadow-emerald-900/20 transition-all duration-300 group">
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <feature.icon className={`w-6 h-6 bg-gradient-to-r ${feature.color} bg-clip-text`} style={{ color: 'inherit' }} />
                    </div>
                    <h3 className="text-lg font-semibold text-emerald-900 dark:text-emerald-50 mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-emerald-700/70 dark:text-emerald-200/60 leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </FadeInWhenVisible>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it Works Section ─── */}
      <section id="comment" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <FadeInWhenVisible>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <Badge variant="secondary" className="mb-4 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                Comment ça marche
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-emerald-900 dark:text-emerald-50">
                Trois étapes simples
              </h2>
              <p className="mt-4 text-lg text-emerald-700/70 dark:text-emerald-200/60">
                De la création à la correction, SECT simplifie chaque étape du processus d&apos;évaluation.
              </p>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, index) => (
              <FadeInWhenVisible key={step.number} delay={index * 0.15}>
                <div className="relative text-center">
                  {/* Connector line */}
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-12 left-[calc(50%+48px)] w-[calc(100%-96px)] h-0.5 bg-gradient-to-r from-emerald-300 to-teal-300 dark:from-emerald-700 dark:to-teal-700" />
                  )}
                  <div className="relative z-10">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
                      <step.icon className="w-10 h-10 text-white" />
                    </div>
                    <span className="text-sm font-bold text-emerald-500 dark:text-emerald-400 tracking-widest uppercase">
                      Étape {step.number}
                    </span>
                    <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-50 mt-2 mb-3">
                      {step.title}
                    </h3>
                    <p className="text-sm text-emerald-700/70 dark:text-emerald-200/60 leading-relaxed max-w-sm mx-auto">
                      {step.description}
                    </p>
                  </div>
                </div>
              </FadeInWhenVisible>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Stats Section ─── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-700 dark:to-teal-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative">
          <FadeInWhenVisible>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <p className="text-4xl sm:text-5xl font-extrabold text-white">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-emerald-100/80 text-sm sm:text-base font-medium">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>
          </FadeInWhenVisible>
        </div>
      </section>

      {/* ─── Pricing Section ─── */}
      <section id="tarifs" className="py-20 px-4 sm:px-6 lg:px-8 bg-white/60 dark:bg-emerald-950/40">
        <div className="max-w-7xl mx-auto">
          <FadeInWhenVisible>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <Badge variant="secondary" className="mb-4 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                Tarifs
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-emerald-900 dark:text-emerald-50">
                Un plan pour chaque besoin
              </h2>
              <p className="mt-4 text-lg text-emerald-700/70 dark:text-emerald-200/60">
                Commencez gratuitement et évoluez selon vos besoins. Aucune carte de crédit requise.
              </p>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <FadeInWhenVisible key={plan.name} delay={index * 0.1}>
                <Card
                  className={`relative h-full backdrop-blur-md transition-all duration-300 ${
                    plan.popular
                      ? 'bg-white/90 dark:bg-emerald-900/60 border-emerald-400 dark:border-emerald-500 shadow-2xl shadow-emerald-500/10 scale-105 md:-mt-4 md:mb-[-16px]'
                      : 'bg-white/70 dark:bg-emerald-900/40 border-emerald-200/50 dark:border-emerald-800/40 hover:shadow-lg'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 px-4 py-1 text-xs font-semibold">
                        Le plus populaire
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <div className={`w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center ${
                      plan.popular
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                        : 'bg-emerald-100 dark:bg-emerald-900/50'
                    }`}>
                      <plan.icon className={`w-6 h-6 ${plan.popular ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                    </div>
                    <CardTitle className="text-xl text-emerald-900 dark:text-emerald-50">{plan.name}</CardTitle>
                    <CardDescription className="text-emerald-600/70 dark:text-emerald-400/70">
                      {plan.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center pb-2">
                    <div className="mb-6">
                      <span className="text-5xl font-extrabold text-emerald-900 dark:text-emerald-50">{plan.price}</span>
                      <span className="text-emerald-600/60 dark:text-emerald-400/60 text-lg">{plan.period}</span>
                    </div>
                    <Separator className="mb-6 bg-emerald-200/50 dark:bg-emerald-800/40" />
                    <ul className="space-y-3 text-left">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mt-0.5 shrink-0" />
                          <span className="text-sm text-emerald-800/80 dark:text-emerald-200/70">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter className="pt-4">
                    <Button
                      className={`w-full ${
                        plan.popular
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20'
                          : 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                      }`}
                      variant={plan.popular ? 'default' : 'outline'}
                      onClick={onLogin}
                    >
                      {plan.cta}
                    </Button>
                  </CardFooter>
                </Card>
              </FadeInWhenVisible>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials Section ─── */}
      <section id="temoignages" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <FadeInWhenVisible>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <Badge variant="secondary" className="mb-4 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                Témoignages
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-emerald-900 dark:text-emerald-50">
                Ils nous font confiance
              </h2>
              <p className="mt-4 text-lg text-emerald-700/70 dark:text-emerald-200/60">
                Découvrez ce que les professionnels de l&apos;enseignement supérieur disent de SECT.
              </p>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <FadeInWhenVisible key={testimonial.name} delay={index * 0.1}>
                <Card className="h-full backdrop-blur-md bg-white/70 dark:bg-emerald-900/40 border-emerald-200/50 dark:border-emerald-800/40 hover:shadow-lg transition-shadow duration-300">
                  <CardContent className="p-6">
                    <Quote className="w-8 h-8 text-emerald-300 dark:text-emerald-700 mb-4" />
                    <p className="text-sm text-emerald-800/80 dark:text-emerald-200/70 leading-relaxed mb-6">
                      &ldquo;{testimonial.content}&rdquo;
                    </p>
                    <div className="flex items-center gap-1 mb-4">
                      {Array.from({ length: testimonial.rating }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <Separator className="mb-4 bg-emerald-200/50 dark:bg-emerald-800/40" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-50">
                        {testimonial.name}
                      </p>
                      <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                        {testimonial.role}
                      </p>
                      <p className="text-xs text-emerald-500/60 dark:text-emerald-500/60 font-medium">
                        {testimonial.institution}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </FadeInWhenVisible>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 dark:from-emerald-700 dark:via-teal-700 dark:to-emerald-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-white rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative">
          <FadeInWhenVisible>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
              Prêt à transformer vos évaluations ?
            </h2>
            <p className="mt-6 text-lg text-emerald-100/80 max-w-2xl mx-auto">
              Rejoignez les établissements qui ont déjà adopté SECT. Commencez gratuitement et
              découvrez la puissance de l&apos;IA au service de l&apos;évaluation.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={onLogin}
                className="bg-white text-emerald-700 hover:bg-emerald-50 shadow-lg px-8 text-base h-12 font-semibold"
              >
                Commencer gratuitement
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={onDemo}
                className="border-white/30 text-white hover:bg-white/10 px-8 text-base h-12"
              >
                <Mail className="mr-2 h-4 w-4" />
                Nous contacter
              </Button>
            </div>
          </FadeInWhenVisible>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-emerald-900 dark:bg-emerald-950">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <img src="/logo.svg" alt="SECT" className="w-8 h-8 rounded-lg" />
                <span className="text-lg font-bold text-emerald-300">SECT</span>
              </div>
              <p className="text-sm text-emerald-400/70 leading-relaxed">
                Système d&apos;Evaluation Casse-Tête. La plateforme d&apos;évaluation en ligne propulsée par l&apos;Intelligence Artificielle.
              </p>
            </div>

            {/* Product links */}
            <div>
              <h4 className="text-sm font-semibold text-emerald-200 mb-4">Produit</h4>
              <ul className="space-y-2.5">
                <li><a href="#fonctionnalites" className="text-sm text-emerald-400/70 hover:text-emerald-300 transition-colors">Fonctionnalités</a></li>
                <li><a href="#tarifs" className="text-sm text-emerald-400/70 hover:text-emerald-300 transition-colors">Tarifs</a></li>
                <li><a href="#comment" className="text-sm text-emerald-400/70 hover:text-emerald-300 transition-colors">Comment ça marche</a></li>
                <li><a href="#temoignages" className="text-sm text-emerald-400/70 hover:text-emerald-300 transition-colors">Témoignages</a></li>
              </ul>
            </div>

            {/* Company links */}
            <div>
              <h4 className="text-sm font-semibold text-emerald-200 mb-4">Entreprise</h4>
              <ul className="space-y-2.5">
                <li><a href="#" className="text-sm text-emerald-400/70 hover:text-emerald-300 transition-colors">À propos</a></li>
                <li><a href="#" className="text-sm text-emerald-400/70 hover:text-emerald-300 transition-colors">Contact</a></li>
                <li><a href="#" className="text-sm text-emerald-400/70 hover:text-emerald-300 transition-colors">Mentions légales</a></li>
                <li><a href="#" className="text-sm text-emerald-400/70 hover:text-emerald-300 transition-colors">Support</a></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-semibold text-emerald-200 mb-4">Contact</h4>
              <ul className="space-y-2.5">
                <li className="flex items-center gap-2 text-sm text-emerald-400/70">
                  <Mail className="w-4 h-4" /> contact@sect.fr
                </li>
                <li className="flex items-center gap-2 text-sm text-emerald-400/70">
                  <Phone className="w-4 h-4" /> +33 1 23 45 67 89
                </li>
              </ul>
              <div className="flex items-center gap-3 mt-4">
                <a href="#" className="w-9 h-9 rounded-lg bg-emerald-800/50 hover:bg-emerald-700/50 flex items-center justify-center transition-colors" aria-label="Twitter">
                  <Twitter className="w-4 h-4 text-emerald-400/70" />
                </a>
                <a href="#" className="w-9 h-9 rounded-lg bg-emerald-800/50 hover:bg-emerald-700/50 flex items-center justify-center transition-colors" aria-label="LinkedIn">
                  <Linkedin className="w-4 h-4 text-emerald-400/70" />
                </a>
                <a href="#" className="w-9 h-9 rounded-lg bg-emerald-800/50 hover:bg-emerald-700/50 flex items-center justify-center transition-colors" aria-label="GitHub">
                  <Github className="w-4 h-4 text-emerald-400/70" />
                </a>
              </div>
            </div>
          </div>

          <Separator className="bg-emerald-800/50 mb-6" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-emerald-500/60">
              &copy; 2026 SECT — Tous droits réservés
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-xs text-emerald-500/60 hover:text-emerald-400 transition-colors">
                Politique de confidentialité
              </a>
              <a href="#" className="text-xs text-emerald-500/60 hover:text-emerald-400 transition-colors">
                CGU
              </a>
              <a href="#" className="text-xs text-emerald-500/60 hover:text-emerald-400 transition-colors">
                Cookies
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
