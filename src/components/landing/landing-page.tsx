'use client'

import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
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
  Mail,
  Phone,
  Upload,
  Monitor,
  Brain,
  Check,
  Zap,
  Crown,
  ChevronDown,
  Play,
  Clock,
  GraduationCap,
  Cpu,
  Menu,
  X,
  LucideIcon,
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
import { Separator } from '@/components/ui/separator'

interface LandingPageProps {
  onLogin: () => void
  onDemo: () => void
}

/* ─── Particle system ─── */
function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number; hue: number }[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2.5 + 1,
        opacity: Math.random() * 0.25 + 0.08,
        hue: Math.random() > 0.5 ? 160 : 170,
      })
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particles.forEach((p, i) => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 70%, 45%, ${p.opacity})`
        ctx.fill()

        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[j].x - p.x
          const dy = particles[j].y - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `hsla(165, 60%, 45%, ${0.06 * (1 - dist / 120)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      })

      animationId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />
}

/* ─── Animated counter ─── */
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  useEffect(() => {
    if (!isInView) return
    const duration = 2000
    const steps = 60
    const increment = target / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(Math.floor(current))
      }
    }, duration / steps)
    return () => clearInterval(timer)
  }, [isInView, target])

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

/* ─── Fade in when visible ─── */
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
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  const directionMap = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { x: 40, y: 0 },
    right: { x: -40, y: 0 },
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, ...directionMap[direction] }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/* ─── Floating shapes ─── */
function FloatingShapes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute -top-20 -right-20 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-emerald-200/40 to-teal-200/20 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute top-1/3 -left-32 w-[400px] h-[400px] rounded-full bg-gradient-to-br from-cyan-200/30 to-emerald-100/20 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute -bottom-20 right-1/4 w-[350px] h-[350px] rounded-full bg-gradient-to-br from-teal-200/30 to-cyan-100/20 blur-3xl"
        animate={{ x: [0, 25, 0], y: [0, -35, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

/* ─── Decorative grid ─── */
function DecorativeGrid() {
  return (
    <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
      <div
        className="w-full h-full"
        style={{
          backgroundImage: 'radial-gradient(circle, #0d9488 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
    </div>
  )
}

/* ─── Typing text animation ─── */
function TypingText({ texts, className }: { texts: string[]; className?: string }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [displayText, setDisplayText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const currentFullText = texts[currentIndex]
    let timeout: ReturnType<typeof setTimeout>

    if (!isDeleting) {
      if (displayText.length < currentFullText.length) {
        timeout = setTimeout(() => {
          setDisplayText(currentFullText.slice(0, displayText.length + 1))
        }, 60)
      } else {
        timeout = setTimeout(() => setIsDeleting(true), 2000)
      }
    } else {
      if (displayText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1))
        }, 30)
      } else {
        timeout = setTimeout(() => {
          setIsDeleting(false)
          setCurrentIndex((prev) => (prev + 1) % texts.length)
        }, 300)
      }
    }

    return () => clearTimeout(timeout)
  }, [displayText, isDeleting, currentIndex, texts])

  return (
    <span className={className}>
      {displayText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
        className="inline-block w-[3px] h-[1em] bg-emerald-600 ml-1 align-middle"
      />
    </span>
  )
}

/* ─── Feature card ─── */
function FeatureCard({ icon: Icon, title, description, iconBg, iconColor, delay }: {
  icon: LucideIcon
  title: string
  description: string
  iconBg: string
  iconColor: string
  delay: number
}) {
  return (
    <FadeInWhenVisible delay={delay}>
      <motion.div
        whileHover={{ y: -8, scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <Card className="h-full bg-white/70 backdrop-blur-sm border-gray-100 hover:border-emerald-300/60 hover:shadow-xl hover:shadow-emerald-100/50 transition-all duration-500 group rounded-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-400 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
          <CardContent className="p-7">
            <div className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center mb-5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
              <Icon className={`w-7 h-7 ${iconColor}`} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-3">{title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
          </CardContent>
        </Card>
      </motion.div>
    </FadeInWhenVisible>
  )
}

/* ─── Data ─── */
const features = [
  {
    icon: Sparkles,
    title: 'Génération IA de questions',
    description: "Importez vos documents et laissez l'IA générer automatiquement des questions pertinentes et variées adaptées à votre programme.",
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
  },
  {
    icon: FileText,
    title: 'Épreuves en ligne interactives',
    description: 'Créez des épreuves personnalisées avec QCM, questions ouvertes, et bien plus. Planifiez et diffusez en un clic.',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  {
    icon: CheckCircle,
    title: 'Correction automatisée par IA',
    description: "La correction des copies est effectuée par l'IA en quelques secondes, avec une fiabilité de 99.7% et des feedbacks détaillés.",
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
  },
  {
    icon: Shield,
    title: 'Proctoring & anti-fraude',
    description: "Surveillance intelligente par IA : détection de triche, verrouillage du navigateur, et suivi comportemental en temps réel.",
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
  },
  {
    icon: BarChart3,
    title: 'Tableaux de bord analytiques',
    description: 'Visualisez les performances, identifiez les lacunes et prenez des décisions éclairées grâce à des statistiques détaillées.',
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
  },
  {
    icon: Building2,
    title: 'Multi-établissements SaaS',
    description: 'Gérez plusieurs établissements depuis une seule plateforme. Architecture multi-tenant sécurisée et évolutive.',
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-600',
  },
]

const steps = [
  {
    number: '01',
    icon: Upload,
    title: 'Créez vos épreuves',
    description: "Uploadez vos documents pédagogiques et laissez l'IA générer des questions pertinentes. Personnalisez et composez vos épreuves en quelques minutes.",
    color: 'from-emerald-500 to-teal-500',
  },
  {
    number: '02',
    icon: Monitor,
    title: 'Faites passer les examens',
    description: "Diffusez les épreuves en ligne avec un système de proctoring intégré. Les étudiants passent les examens en toute sécurité depuis n'importe quel appareil.",
    color: 'from-cyan-500 to-sky-500',
  },
  {
    number: '03',
    icon: Brain,
    title: 'Corrigez automatiquement',
    description: "L'IA corrige les copies instantanément et génère des analytics détaillés. Identifiez les forces et les axes d'amélioration de chaque étudiant.",
    color: 'from-teal-500 to-emerald-500',
  },
]

const stats = [
  { value: 10000, suffix: '+', label: 'Questions générées', icon: Sparkles },
  { value: 500, suffix: '+', label: 'Épreuves créées', icon: FileText },
  { value: 99, suffix: '.7%', label: 'Fiabilité', icon: CheckCircle },
  { value: 50, suffix: '+', label: 'Établissements', icon: Building2 },
]

const plans = [
  {
    name: 'Gratuit',
    price: 'Gratuit',
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
    price: '29 900 FCFA',
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
    price: '89 900 FCFA',
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

const testimonials = [
  {
    name: 'Dr. Marie Dupont',
    role: 'Doyenne de la Faculté des Sciences',
    institution: 'Université de Lyon',
    content: "SECT a révolutionné notre processus d'évaluation. La génération de questions par IA nous fait gagner des heures de travail chaque semaine, et la correction automatique est d'une fiabilité remarquable.",
    rating: 5,
    avatar: 'MD',
  },
  {
    name: 'Prof. Ahmed Benali',
    role: 'Responsable Pédagogique',
    institution: 'École Nationale d\'Ingénieurs',
    content: "Le système de proctoring nous a permis de passer aux examens en ligne en toute confiance. Les étudiants apprécient la flexibilité et nous, la qualité des analytics.",
    rating: 5,
    avatar: 'AB',
  },
  {
    name: 'Dr. Claire Martin',
    role: 'Directrice des Études',
    institution: 'Institut d\'Administration des Entreprises',
    content: "La plateforme multi-établissements est exactement ce dont nous avions besoin. Un seul outil pour gérer les évaluations de toutes nos composantes. L'accompagnement est excellent.",
    rating: 5,
    avatar: 'CM',
  },
]

/* ─── Main Component ─── */
export function LandingPage({ onLogin, onDemo }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '25%'])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 via-white to-gray-50 text-gray-900 overflow-x-hidden">
      {/* ─── Navbar ─── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/80 backdrop-blur-xl shadow-sm shadow-gray-200/50 border-b border-gray-100'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="text-xl font-extrabold bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-transparent">
              SECT
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {[
              { href: '#fonctionnalites', label: 'Fonctionnalités' },
              { href: '#comment', label: 'Comment ça marche' },
              { href: '#tarifs', label: 'Tarifs' },
              { href: '#temoignages', label: 'Témoignages' },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-500 hover:text-emerald-600 transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={onLogin}
              className="text-gray-600 hover:text-emerald-700 hover:bg-emerald-50"
            >
              Connexion
            </Button>
            <Button
              onClick={onLogin}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-500/20 px-5 rounded-xl border-0"
            >
              Essai gratuit
            </Button>
          </div>

          <button
            className="md:hidden text-gray-600 hover:text-emerald-600"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white/95 backdrop-blur-xl border-b border-gray-100 px-4 py-4 space-y-3"
            >
              {[
                { href: '#fonctionnalites', label: 'Fonctionnalités' },
                { href: '#comment', label: 'Comment ça marche' },
                { href: '#tarifs', label: 'Tarifs' },
                { href: '#temoignages', label: 'Témoignages' },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block text-sm font-medium text-gray-500 hover:text-emerald-600 py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={onLogin} className="text-gray-600 flex-1 rounded-xl">
                  Connexion
                </Button>
                <Button
                  onClick={onLogin}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex-1 rounded-xl border-0"
                >
                  Essai gratuit
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* ─── Hero Section ─── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-teal-50" />
        <motion.div style={{ y: heroY }} className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_50%,rgba(20,184,166,0.08),rgba(255,255,255,0))]" />
        </motion.div>

        <FloatingShapes />
        <Particles />
        <DecorativeGrid />

        <motion.div style={{ opacity: heroOpacity }} className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20" >
          <div className="max-w-4xl mx-auto text-center relative" style={{ zIndex: 2 }}>
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 backdrop-blur-sm px-5 py-2 mb-8 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-sm font-semibold text-emerald-700">Propulsé par l&apos;Intelligence Artificielle</span>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1]"
            >
              <span className="text-gray-900">Transformez</span>
              <br />
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                l&apos;évaluation
              </span>
              <br />
              <span className="text-gray-900">avec l&apos;IA</span>
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-6 h-8"
            >
              <TypingText
                texts={[
                  'Génération automatique de questions',
                  'Correction intelligente des copies',
                  'Analytics en temps réel',
                  'Proctoring anti-fraude IA',
                ]}
                className="text-lg text-emerald-600 font-medium"
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.55 }}
              className="mt-4 text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed"
            >
              SECT est la plateforme tout-en-un qui automatise la création, la passation et la
              correction des épreuves. Gagnez du temps, améliorez la fiabilité.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Button
                size="lg"
                onClick={onLogin}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-xl shadow-emerald-500/25 px-8 text-base h-14 rounded-2xl border-0 group"
              >
                Commencer gratuitement
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={onDemo}
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 px-8 text-base h-14 rounded-2xl backdrop-blur-sm"
              >
                <Play className="mr-2 h-5 w-5" />
                Voir une démo
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.9 }}
              className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-gray-400"
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-500" />
                <span>Données chiffrées</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span>Configuration en 5 min</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-500" />
                <span>Sans carte de crédit</span>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            <ChevronDown className="h-6 w-6 text-emerald-400" />
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Trust bar ─── */}
      <section className="relative py-12 px-4 border-y border-gray-100 bg-white/50">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">Ils nous font confiance</p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-gray-300">
            {['Université de Lyon', 'ENI Paris', 'IAE Bordeaux', 'UTC Compiègne', 'INSA Toulouse'].map((name) => (
              <span key={name} className="text-lg font-bold tracking-tight">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section id="fonctionnalites" className="relative py-28 px-4 sm:px-6 lg:px-8">
        <FloatingShapes />
        <div className="max-w-7xl mx-auto relative">
          <FadeInWhenVisible>
            <div className="text-center max-w-2xl mx-auto mb-20">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 mb-6">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-700">Fonctionnalités</span>
              </div>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900">
                Tout ce dont vous{' '}
                <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">avez besoin</span>
              </h2>
              <p className="mt-5 text-lg text-gray-500">
                Une suite complète d&apos;outils pour moderniser l&apos;évaluation dans l&apos;enseignement supérieur.
              </p>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <FeatureCard key={feature.title} {...feature} delay={index * 0.1} />
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it Works ─── */}
      <section id="comment" className="relative py-28 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white via-emerald-50/30 to-white">
        <div className="max-w-7xl mx-auto relative">
          <FadeInWhenVisible>
            <div className="text-center max-w-2xl mx-auto mb-20">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1.5 mb-6">
                <Cpu className="w-3.5 h-3.5 text-cyan-600" />
                <span className="text-sm font-semibold text-cyan-700">Comment ça marche</span>
              </div>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900">
                Trois étapes{' '}
                <span className="bg-gradient-to-r from-cyan-600 to-teal-500 bg-clip-text text-transparent">simples</span>
              </h2>
              <p className="mt-5 text-lg text-gray-500">
                De la création à la correction, SECT simplifie chaque étape du processus d&apos;évaluation.
              </p>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, index) => (
              <FadeInWhenVisible key={step.number} delay={index * 0.15}>
                <div className="relative text-center group">
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-20 left-[calc(50%+72px)] w-[calc(100%-144px)] h-0.5">
                      <div className="h-full bg-gradient-to-r from-emerald-300 to-cyan-300 opacity-30" />
                      <motion.div
                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 -mt-0.5"
                        initial={{ width: '0%' }}
                        whileInView={{ width: '100%' }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: 0.5 + index * 0.3 }}
                      />
                    </div>
                  )}
                  <div className="relative z-10">
                    <motion.div
                      whileHover={{ scale: 1.08, rotate: 3 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className={`w-28 h-28 rounded-3xl bg-gradient-to-br ${step.color} flex items-center justify-center mx-auto mb-8 shadow-xl group-hover:shadow-2xl transition-shadow duration-500`}
                    >
                      <step.icon className="w-12 h-12 text-white" />
                    </motion.div>
                    <span className="text-sm font-bold text-emerald-600/60 tracking-[0.2em] uppercase">
                      Étape {step.number}
                    </span>
                    <h3 className="text-2xl font-bold text-gray-900 mt-3 mb-4">{step.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">{step.description}</p>
                  </div>
                </div>
              </FadeInWhenVisible>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Stats Section ─── */}
      <section className="relative py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,rgba(255,255,255,0.1),rgba(255,255,255,0))]" />
        <FloatingShapes />
        <div className="max-w-7xl mx-auto relative">
          <FadeInWhenVisible>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="text-center group"
                >
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 mb-4 group-hover:bg-white/25 transition-colors">
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-4xl sm:text-5xl font-extrabold text-white">
                    <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                  </p>
                  <p className="mt-2 text-sm text-white/70 font-medium">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </FadeInWhenVisible>
        </div>
      </section>

      {/* ─── Pricing Section ─── */}
      <section id="tarifs" className="relative py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <FadeInWhenVisible>
            <div className="text-center max-w-2xl mx-auto mb-20">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 mb-6">
                <Crown className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-sm font-semibold text-amber-700">Tarifs</span>
              </div>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900">
                Un plan pour{' '}
                <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">chaque besoin</span>
              </h2>
              <p className="mt-5 text-lg text-gray-500">
                Commencez gratuitement et évoluez selon vos besoins. Aucune carte de crédit requise.
              </p>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <FadeInWhenVisible key={plan.name} delay={index * 0.1}>
                <motion.div whileHover={{ y: -8 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
                  <Card
                    className={`relative h-full transition-all duration-500 rounded-2xl ${
                      plan.popular
                        ? 'bg-gradient-to-b from-emerald-50 to-white border-2 border-emerald-300 shadow-2xl shadow-emerald-200/50 scale-[1.02] md:-mt-4 md:mb-[-16px]'
                        : 'bg-white/80 backdrop-blur-sm border border-gray-200 hover:border-emerald-200 hover:shadow-lg'
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full px-5 py-1.5 text-xs font-bold shadow-lg shadow-emerald-500/30">
                          Le plus populaire
                        </div>
                      </div>
                    )}
                    <CardHeader className="text-center pb-2 pt-8">
                      <div className={`w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center ${
                        plan.popular
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25'
                          : 'bg-gray-100'
                      }`}>
                        <plan.icon className={`w-7 h-7 ${plan.popular ? 'text-white' : 'text-gray-500'}`} />
                      </div>
                      <CardTitle className="text-xl text-gray-900">{plan.name}</CardTitle>
                      <CardDescription className="text-gray-500">{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center pb-2">
                      <div className="mb-6">
                        <span className="text-5xl font-extrabold text-gray-900">{plan.price}</span>
                        <span className="text-gray-400 text-lg">{plan.period}</span>
                      </div>
                      <Separator className="mb-6 bg-gray-100" />
                      <ul className="space-y-3.5 text-left">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                              plan.popular ? 'bg-emerald-100' : 'bg-gray-100'
                            }`}>
                              <Check className={`w-3 h-3 ${plan.popular ? 'text-emerald-600' : 'text-gray-400'}`} />
                            </div>
                            <span className="text-sm text-gray-600">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter className="pt-4 pb-8">
                      <Button
                        className={`w-full h-12 rounded-xl text-sm font-semibold ${
                          plan.popular
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 border-0'
                            : 'bg-white border-2 border-gray-200 text-gray-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
                        }`}
                        variant={plan.popular ? 'default' : 'outline'}
                        onClick={onLogin}
                      >
                        {plan.cta}
                      </Button>
                    </CardFooter>
                  </Card>
                </motion.div>
              </FadeInWhenVisible>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section id="temoignages" className="relative py-28 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white via-emerald-50/20 to-white">
        <div className="max-w-7xl mx-auto relative">
          <FadeInWhenVisible>
            <div className="text-center max-w-2xl mx-auto mb-20">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 mb-6">
                <GraduationCap className="w-3.5 h-3.5 text-teal-600" />
                <span className="text-sm font-semibold text-teal-700">Témoignages</span>
              </div>
              <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900">
                Ils nous font{' '}
                <span className="bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent">confiance</span>
              </h2>
              <p className="mt-5 text-lg text-gray-500">
                Découvrez ce que les professionnels de l&apos;enseignement supérieur disent de SECT.
              </p>
            </div>
          </FadeInWhenVisible>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <FadeInWhenVisible key={testimonial.name} delay={index * 0.1}>
                <motion.div whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
                  <Card className="h-full bg-white/80 backdrop-blur-sm border border-gray-100 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-50/50 transition-all duration-500 rounded-2xl">
                    <CardContent className="p-7">
                      <Quote className="w-8 h-8 text-emerald-200 mb-5" />
                      <p className="text-sm text-gray-600 leading-relaxed mb-6">
                        &ldquo;{testimonial.content}&rdquo;
                      </p>
                      <div className="flex items-center gap-1 mb-5">
                        {Array.from({ length: testimonial.rating }).map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                      <Separator className="mb-5 bg-gray-100" />
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-sm font-bold text-white shadow-md shadow-emerald-500/20">
                          {testimonial.avatar}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{testimonial.name}</p>
                          <p className="text-xs text-gray-500">{testimonial.role}</p>
                          <p className="text-xs text-gray-400 font-medium">{testimonial.institution}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </FadeInWhenVisible>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="relative py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(255,255,255,0.15),rgba(255,255,255,0))]" />
        <FloatingShapes />
        <div className="max-w-4xl mx-auto text-center relative">
          <FadeInWhenVisible>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2 mb-8 backdrop-blur-sm">
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span className="text-sm font-semibold text-white/90">Commencez maintenant</span>
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight">
              Prêt à transformer
              <br />
              <span className="bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-200 bg-clip-text text-transparent">
                vos évaluations ?
              </span>
            </h2>
            <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto">
              Rejoignez les établissements qui ont déjà adopté SECT. Commencez gratuitement et
              découvrez la puissance de l&apos;IA au service de l&apos;évaluation.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={onLogin}
                className="bg-white text-emerald-700 hover:bg-emerald-50 shadow-xl px-8 text-base h-14 rounded-2xl font-semibold group"
              >
                Commencer gratuitement
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={onDemo}
                className="border-white/30 text-white/90 hover:bg-white/10 hover:text-white px-8 text-base h-14 rounded-2xl"
              >
                <Mail className="mr-2 h-5 w-5" />
                Nous contacter
              </Button>
            </div>
          </FadeInWhenVisible>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="mt-auto relative py-16 px-4 sm:px-6 lg:px-8 border-t border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
            <div className="md:col-span-1">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
                  <span className="text-white font-bold text-sm">S</span>
                </div>
                <span className="text-lg font-extrabold bg-gradient-to-r from-emerald-700 to-teal-600 bg-clip-text text-transparent">SECT</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                Système d&apos;Évaluation et de Contrôle des Tests. La plateforme d&apos;évaluation en ligne propulsée par l&apos;Intelligence Artificielle.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-5">Produit</h4>
              <ul className="space-y-3">
                <li><a href="#fonctionnalites" className="text-sm text-gray-400 hover:text-emerald-600 transition-colors">Fonctionnalités</a></li>
                <li><a href="#tarifs" className="text-sm text-gray-400 hover:text-emerald-600 transition-colors">Tarifs</a></li>
                <li><a href="#comment" className="text-sm text-gray-400 hover:text-emerald-600 transition-colors">Comment ça marche</a></li>
                <li><a href="#temoignages" className="text-sm text-gray-400 hover:text-emerald-600 transition-colors">Témoignages</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-5">Entreprise</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-sm text-gray-400 hover:text-emerald-600 transition-colors">À propos</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-emerald-600 transition-colors">Contact</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-emerald-600 transition-colors">Mentions légales</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-emerald-600 transition-colors">Support</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-5">Contact</h4>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <Mail className="w-4 h-4" /> contact@sect.fr
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-400">
                  <Phone className="w-4 h-4" /> +33 1 23 45 67 89
                </li>
              </ul>
              <div className="flex items-center gap-3 mt-5">
                {[
                  { label: 'Twitter', icon: 'T' },
                  { label: 'LinkedIn', icon: 'in' },
                  { label: 'GitHub', icon: 'GH' },
                ].map((social) => (
                  <a
                    key={social.label}
                    href="#"
                    className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-emerald-100 hover:text-emerald-600 flex items-center justify-center text-gray-400 text-xs font-bold transition-all duration-200"
                  >
                    {social.icon}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <Separator className="mb-6 bg-gray-100" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-400">&copy; 2026 SECT — Tous droits réservés</p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-xs text-gray-400 hover:text-emerald-600 transition-colors">Politique de confidentialité</a>
              <a href="#" className="text-xs text-gray-400 hover:text-emerald-600 transition-colors">CGU</a>
              <a href="#" className="text-xs text-gray-400 hover:text-emerald-600 transition-colors">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
