'use client'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect, useCallback } from 'react'
import {
  Sparkles,
  FileText,
  CheckCircle,
  Shield,
  BarChart3,
  Building2,
  ArrowRight,
  Star,
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
  MapPin,
  Users,
  Globe,
  BookOpen,
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

gsap.registerPlugin(ScrollTrigger)

interface LandingPageProps {
  onLogin: () => void
  onDemo: () => void
}

/* ─── Magnetic Button ─── */
function MagneticButton({
  children,
  className = '',
  ...props
}: React.ComponentProps<typeof Button> & { children: React.ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null)
  const xTo = useRef<gsap.QuickToFunc | null>(null)
  const yTo = useRef<gsap.QuickToFunc | null>(null)

  useEffect(() => {
    if (!ref.current) return
    xTo.current = gsap.quickTo(ref.current, 'x', { duration: 0.3, ease: 'power2.out' })
    yTo.current = gsap.quickTo(ref.current, 'y', { duration: 0.3, ease: 'power2.out' })
    return () => {
      xTo.current = null
      yTo.current = null
    }
  }, [])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current || !xTo.current || !yTo.current) return
    const rect = ref.current.getBoundingClientRect()
    const dx = e.clientX - rect.left - rect.width / 2
    const dy = e.clientY - rect.top - rect.height / 2
    xTo.current(dx * 0.3)
    yTo.current(dy * 0.3)
  }

  const handleMouseLeave = () => {
    xTo.current?.(0)
    yTo.current?.(0)
  }

  return (
    <Button
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </Button>
  )
}

/* ─── Animated Counter ─── */
function AnimatedCounter({ target, suffix = '', prefix = '' }: { target: number; suffix?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const counted = useRef(false)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        if (counted.current) return
        counted.current = true
        const obj = { val: 0 }
        gsap.to(obj, {
          val: target,
          duration: 2,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = prefix + Math.round(obj.val).toLocaleString() + suffix
          },
        })
      },
    })
    return () => trigger.kill()
  }, [target, suffix, prefix])

  return <span ref={ref}>{prefix}0{suffix}</span>
}

/* ─── Typing Effect ─── */
function TypingText({ texts, speed = 80, pause = 2000 }: { texts: string[]; speed?: number; pause?: number }) {
  const [display, setDisplay] = useState('')
  const [textIdx, setTextIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const current = texts[textIdx]
    if (!deleting && charIdx < current.length) {
      const t = setTimeout(() => {
        setDisplay(current.slice(0, charIdx + 1))
        setCharIdx(charIdx + 1)
      }, speed)
      return () => clearTimeout(t)
    }
    if (!deleting && charIdx === current.length) {
      const t = setTimeout(() => setDeleting(true), pause)
      return () => clearTimeout(t)
    }
    if (deleting && charIdx > 0) {
      const t = setTimeout(() => {
        setDisplay(current.slice(0, charIdx - 1))
        setCharIdx(charIdx - 1)
      }, speed / 2)
      return () => clearTimeout(t)
    }
    if (deleting && charIdx === 0) {
      const t = setTimeout(() => {
        setDeleting(false)
        setTextIdx((prev) => (prev + 1) % texts.length)
      }, speed)
      return () => clearTimeout(t)
    }
  }, [charIdx, deleting, textIdx, texts, speed, pause])

  return (
    <span>
      {display}
      <span className="animate-pulse text-emerald-400">|</span>
    </span>
  )
}

/* ─── Feature Card Data ─── */
const features: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Brain, title: 'Génération IA', desc: 'Créez des épreuves intelligemment avec l\'IA avancée, adaptées à chaque niveau et matière.' },
  { icon: FileText, title: 'Correction Automatique', desc: 'Corrigez instantanément les copies avec une précision remarquable grâce à l\'IA.' },
  { icon: Shield, title: 'Anti-Fraude', desc: 'Détectez le plagiat et les comportements suspects avec des algorithmes avancés.' },
  { icon: BarChart3, title: 'Analytics Prédictifs', desc: 'Anticipez les résultats et identifiez les étudiants à risque avant les examens.' },
  { icon: Users, title: 'Gestion Multi-Rôles', desc: 'Administrez enseignants, étudiants et responsables avec des permissions granulaires.' },
  { icon: Globe, title: 'Multi-Établissements', desc: 'Déployez la plateforme à l\'échelle de plusieurs campus et universités.' },
]

const steps = [
  { icon: Upload, title: 'Importez', desc: 'Téléchargez vos programmes académiques et critères d\'évaluation en quelques clics.' },
  { icon: Cpu, title: 'Générez', desc: 'L\'IA crée des épreuves personnalisées conformes à vos standards pédagogiques.' },
  { icon: CheckCircle, title: 'Évaluez', desc: 'Corrigez automatiquement et obtenez des analyses détaillées des performances.' },
]

const plans = [
  { name: 'Starter', price: '29', icon: Zap, desc: 'Pour les petits établissements', features: ['Jusqu\'à 100 étudiants', '5 enseignants', 'Génération IA basique', 'Correction automatique', 'Support email'], popular: false },
  { name: 'Pro', price: '79', icon: Crown, desc: 'Pour les universités moyennes', features: ['Jusqu\'à 2 000 étudiants', '50 enseignants', 'IA avancée + Anti-fraude', 'Analytics prédictifs', 'Multi-départements', 'Support prioritaire'], popular: true },
  { name: 'Enterprise', price: '199', icon: Building2, desc: 'Pour les grands groupes', features: ['Étudiants illimités', 'Enseignants illimités', 'IA premium + Custom', 'Multi-établissements', 'API & Intégrations', 'Account dédié'], popular: false },
]

const testimonials = [
  { name: 'Dr. Aminata Diallo', role: 'Doyenne, Université Cheikh Anta Diop', text: 'ExamAI a révolutionné notre processus d\'évaluation. La correction automatique nous fait gagner 15 heures par semaine.', rating: 5 },
  { name: 'Prof. Kwame Asante', role: 'Vice-Recteur, Université de Ghana', text: 'L\'anti-fraude IA est remarquable. Nous avons réduit les cas de triche de 87% en un semestre.', rating: 5 },
  { name: 'Dr. Fatima Zahra', role: 'Directrice Pédagogique, Université Mohammed V', text: 'Les analytics prédictifs nous permettent d\'identifier les étudiants en difficulté bien avant les examens.', rating: 5 },
]

const trustLogos = [
  'Université Cheikh Anta Diop',
  'Université de Ghana',
  'Université Mohammed V',
  'Université de Nairobi',
  'Université de Abidjan',
  'Université de Dakar',
]

/* ─── Main Landing Page ─── */
export function LandingPage({ onLogin, onDemo }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Refs for GSAP
  const navRef = useRef<HTMLElement>(null)
  const heroRef = useRef<HTMLElement>(null)
  const heroContentRef = useRef<HTMLDivElement>(null)
  const heroImgRef = useRef<HTMLDivElement>(null)
  const heroBgRef = useRef<HTMLDivElement>(null)
  const trustRef = useRef<HTMLDivElement>(null)
  const featuresRef = useRef<HTMLDivElement>(null)
  const howRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const dashboardRef = useRef<HTMLDivElement>(null)
  const pricingRef = useRef<HTMLDivElement>(null)
  const testimonialsRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const shapesRef = useRef<HTMLDivElement>(null)

  // Scroll progress + nav transparency
  useEffect(() => {
    const progressEl = progressRef.current
    const navEl = navRef.current
    if (!progressEl || !navEl) return

    const progressTrigger = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        progressEl.style.transform = `scaleX(${self.progress})`
        if (self.progress > 0.02) {
          setScrolled(true)
        } else {
          setScrolled(false)
        }
      },
    })

    return () => {
      progressTrigger.kill()
    }
  }, [])

  // Hero GSAP animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Parallax background
      if (heroBgRef.current) {
        gsap.to(heroBgRef.current, {
          yPercent: 30,
          ease: 'none',
          scrollTrigger: {
            trigger: heroRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        })
      }

      // Hero content stagger
      if (heroContentRef.current) {
        const items = heroContentRef.current.querySelectorAll('.hero-item')
        gsap.from(items, {
          y: 60,
          opacity: 0,
          duration: 1,
          stagger: 0.15,
          ease: 'power3.out',
          delay: 0.3,
        })
      }

      // Hero image 3D tilt float
      if (heroImgRef.current) {
        gsap.from(heroImgRef.current, {
          y: 80,
          opacity: 0,
          scale: 0.9,
          rotationX: 10,
          duration: 1.2,
          ease: 'power3.out',
          delay: 0.6,
        })
        gsap.to(heroImgRef.current, {
          y: -15,
          duration: 3,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
      }
    }, heroRef)

    return () => ctx.revert()
  }, [])

  // Floating shapes
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!shapesRef.current) return
      const shapes = shapesRef.current.querySelectorAll('.float-shape')
      shapes.forEach((shape, i) => {
        gsap.to(shape, {
          y: `${gsap.utils.random(-30, 30)}`,
          x: `${gsap.utils.random(-20, 20)}`,
          rotation: gsap.utils.random(-20, 20),
          duration: gsap.utils.random(4, 7),
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          delay: i * 0.5,
        })
      })
    })
    return () => ctx.revert()
  }, [])

  // Trust bar scroll
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!trustRef.current) return
      gsap.from(trustRef.current.querySelectorAll('.trust-item'), {
        y: 30,
        opacity: 0,
        stagger: 0.1,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: trustRef.current,
          start: 'top 85%',
          once: true,
        },
      })
    })
    return () => ctx.revert()
  }, [])

  // Features cards scroll
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!featuresRef.current) return
      const cards = featuresRef.current.querySelectorAll('.feature-card')
      cards.forEach((card, i) => {
        gsap.from(card, {
          x: i % 2 === 0 ? -80 : 80,
          rotation: i % 2 === 0 ? -5 : 5,
          opacity: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: card,
            start: 'top 88%',
            once: true,
          },
        })
      })
    })
    return () => ctx.revert()
  }, [])

  // How it works timeline
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!howRef.current) return
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: howRef.current,
          start: 'top 75%',
          once: true,
        },
      })
      const steps = howRef.current.querySelectorAll('.step-item')
      const lines = howRef.current.querySelectorAll('.step-line')
      steps.forEach((step, i) => {
        tl.from(step, { y: 50, opacity: 0, duration: 0.6, ease: 'power2.out' }, i * 0.3)
        if (lines[i]) {
          tl.from(lines[i], { scaleX: 0, duration: 0.4, ease: 'power2.out' }, i * 0.3 + 0.3)
        }
      })
    })
    return () => ctx.revert()
  }, [])

  // Stats counter
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!statsRef.current) return
      gsap.from(statsRef.current.querySelectorAll('.stat-item'), {
        y: 40,
        opacity: 0,
        stagger: 0.15,
        duration: 0.7,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: statsRef.current,
          start: 'top 80%',
          once: true,
        },
      })
    })
    return () => ctx.revert()
  }, [])

  // Dashboard mockup reveal
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!dashboardRef.current) return
      gsap.from(dashboardRef.current.querySelector('.dashboard-img'), {
        scale: 0.85,
        opacity: 0,
        y: 60,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: dashboardRef.current,
          start: 'top 80%',
          once: true,
        },
      })
    })
    return () => ctx.revert()
  }, [])

  // Pricing cards
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!pricingRef.current) return
      const cards = pricingRef.current.querySelectorAll('.pricing-card')
      cards.forEach((card, i) => {
        gsap.from(card, {
          scale: 0.85,
          opacity: 0,
          y: 40,
          duration: 0.7,
          delay: i * 0.15,
          ease: 'back.out(1.5)',
          scrollTrigger: {
            trigger: pricingRef.current,
            start: 'top 80%',
            once: true,
          },
        })
      })
    })
    return () => ctx.revert()
  }, [])

  // Testimonials flip-in
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!testimonialsRef.current) return
      const cards = testimonialsRef.current.querySelectorAll('.testimonial-card')
      cards.forEach((card, i) => {
        gsap.from(card, {
          rotateX: 25,
          y: 60,
          opacity: 0,
          duration: 0.8,
          delay: i * 0.15,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: testimonialsRef.current,
            start: 'top 80%',
            once: true,
          },
        })
      })
    })
    return () => ctx.revert()
  }, [])

  // CTA parallax
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!ctaRef.current) return
      const bg = ctaRef.current.querySelector('.cta-bg')
      if (bg) {
        gsap.to(bg, {
          yPercent: -20,
          ease: 'none',
          scrollTrigger: {
            trigger: ctaRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        })
      }
      gsap.from(ctaRef.current.querySelector('.cta-content'), {
        y: 40,
        opacity: 0,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: ctaRef.current,
          start: 'top 80%',
          once: true,
        },
      })
    })
    return () => ctx.revert()
  }, [])

  const handleSmoothScroll = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950 overflow-x-hidden">
      {/* Scroll progress */}
      <div
        ref={progressRef}
        className="fixed top-0 left-0 w-full h-0.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 z-[60] origin-left"
        style={{ transform: 'scaleX(0)' }}
      />

      {/* Grain texture overlay */}
      <div className="fixed inset-0 z-[1] pointer-events-none opacity-[0.03] dark:opacity-[0.05]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }} />

      {/* Floating geometric shapes */}
      <div ref={shapesRef} className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="float-shape absolute top-[15%] left-[8%] w-20 h-20 border border-emerald-300/20 dark:border-emerald-700/20 rounded-full" />
        <div className="float-shape absolute top-[40%] right-[5%] w-32 h-32 border border-teal-300/15 dark:border-teal-700/15 rotate-45" />
        <div className="float-shape absolute bottom-[30%] left-[3%] w-16 h-16 border border-cyan-300/20 dark:border-cyan-700/20 rounded-lg rotate-12" />
        <div className="float-shape absolute top-[65%] right-[10%] w-24 h-24 bg-emerald-400/5 dark:bg-emerald-600/5 rounded-full blur-sm" />
        <div className="float-shape absolute top-[20%] right-[25%] w-12 h-12 border border-emerald-400/10 dark:border-emerald-600/10 rotate-[30deg]" />
      </div>

      {/* ─── Navbar ─── */}
      <nav
        ref={navRef}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-white/70 dark:bg-gray-950/70 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                ExamAI
              </span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              {['Fonctionnalités', 'Comment ça marche', 'Tarifs', 'Témoignages'].map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleSmoothScroll(['features', 'how-it-works', 'pricing', 'testimonials'][i])}
                  className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Button variant="ghost" onClick={onLogin} className="text-gray-600 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400">
                Connexion
              </Button>
              <MagneticButton
                onClick={onDemo}
                className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 text-white shadow-lg shadow-emerald-500/25"
              >
                Démo gratuite <ArrowRight className="w-4 h-4 ml-1" />
              </MagneticButton>
            </div>

            <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X className="w-6 h-6 text-gray-700 dark:text-gray-200" /> : <Menu className="w-6 h-6 text-gray-700 dark:text-gray-200" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 overflow-hidden"
            >
              <div className="px-4 py-4 space-y-3">
                {['Fonctionnalités', 'Comment ça marche', 'Tarifs', 'Témoignages'].map((item, i) => (
                  <button
                    key={i}
                    onClick={() => handleSmoothScroll(['features', 'how-it-works', 'pricing', 'testimonials'][i])}
                    className="block w-full text-left py-2 text-gray-700 dark:text-gray-200 hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    {item}
                  </button>
                ))}
                <Separator />
                <Button variant="ghost" onClick={onLogin} className="w-full">Connexion</Button>
                <Button onClick={onDemo} className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white">
                  Démo gratuite <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ─── Hero Section ─── */}
      <section ref={heroRef} className="relative min-h-screen flex items-center pt-20 overflow-hidden">
        {/* Background */}
        <div ref={heroBgRef} className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-50/80 via-teal-50/50 to-white dark:from-emerald-950/80 dark:via-teal-950/50 dark:to-gray-950" />
          <img
            src="/landing-hero.png"
            alt="Étudiants africains utilisant des tablettes IA"
            className="absolute inset-0 w-full h-full object-cover opacity-15 dark:opacity-10"
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div ref={heroContentRef} className="space-y-6 sm:space-y-8">
              <div className="hero-item">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
                  <Sparkles className="w-4 h-4" />
                  Propulsé par l\'IA Générative
                </span>
              </div>

              <h1 className="hero-item text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold leading-tight tracking-tight">
                <span className="text-gray-900 dark:text-white">Révolutionnez</span>
                <br />
                <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                  vos examens
                </span>
                <br />
                <span className="text-gray-900 dark:text-white">avec l&apos;IA</span>
              </h1>

              <p className="hero-item text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-xl leading-relaxed">
                <TypingText
                  texts={[
                    'Générez, corrigez et analysez vos épreuves en quelques clics.',
                    'De la création à l\'évaluation, l\'IA fait tout pour vous.',
                    'Zéro triche, zéro effort, résultats exceptionnels.',
                  ]}
                />
              </p>

              <div className="hero-item flex flex-col sm:flex-row gap-4">
                <MagneticButton
                  onClick={onDemo}
                  size="lg"
                  className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 text-white shadow-xl shadow-emerald-500/30 text-base px-8 py-6"
                >
                  Commencer gratuitement <ArrowRight className="w-5 h-5 ml-2" />
                </MagneticButton>
                <MagneticButton
                  onClick={onLogin}
                  variant="outline"
                  size="lg"
                  className="border-2 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-base px-8 py-6"
                >
                  <Play className="w-5 h-5 mr-2" /> Voir la démo
                </MagneticButton>
              </div>

              <div className="hero-item flex items-center gap-6 pt-2">
                <div className="flex -space-x-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-950 bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-[10px] text-white font-bold">
                      {['AD', 'KA', 'FZ', 'MN'][i]}
                    </div>
                  ))}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-900 dark:text-white">2,400+</span> enseignants nous font confiance
                </div>
              </div>
            </div>

            <div ref={heroImgRef} className="relative" style={{ perspective: '1000px' }}>
              <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-emerald-500/20 border border-emerald-200/50 dark:border-emerald-800/50">
                <img
                  src="/ai-brain.png"
                  alt="Réseau neuronal IA"
                  className="w-full h-auto object-cover aspect-square"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-900/30 via-transparent to-transparent" />
              </div>
              {/* Floating badge */}
              <motion.div
                className="absolute -top-4 -right-4 sm:-top-6 sm:-right-6 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg rounded-2xl p-3 sm:p-4 shadow-xl border border-gray-200/50 dark:border-gray-700/50"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">98.7%</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">Précision IA</p>
                  </div>
                </div>
              </motion.div>
              {/* Floating stats badge */}
              <motion.div
                className="absolute -bottom-4 -left-4 sm:-bottom-6 sm:-left-6 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg rounded-2xl p-3 sm:p-4 shadow-xl border border-gray-200/50 dark:border-gray-700/50"
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">-85%</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">Temps correction</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronDown className="w-6 h-6 text-emerald-500/60" />
        </motion.div>
      </section>

      {/* ─── Trust Bar ─── */}
      <section ref={trustRef} className="relative z-10 py-12 sm:py-16 border-y border-gray-100 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-gray-400 dark:text-gray-500 mb-8 uppercase tracking-wider">
            Adopté par les meilleures universités africaines
          </p>
          <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10 lg:gap-16">
            {trustLogos.map((name, i) => (
              <div
                key={i}
                className="trust-item flex items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                <GraduationCap className="w-5 h-5" />
                <span className="text-sm font-medium whitespace-nowrap">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" ref={featuresRef} className="relative z-10 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" /> Fonctionnalités
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
              Tout ce dont vous avez{' '}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">besoin</span>
            </h2>
            <p className="text-lg text-gray-500 dark:text-gray-400">
              Une suite complète d&apos;outils IA pour transformer votre processus d&apos;évaluation.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={i}
                className="feature-card"
                whileHover={{ y: -6, transition: { duration: 0.25 } }}
              >
                <Card className="h-full bg-white/60 dark:bg-gray-900/60 backdrop-blur-lg border-gray-200/60 dark:border-gray-700/40 hover:shadow-xl hover:shadow-emerald-500/10 transition-shadow duration-300">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/50 flex items-center justify-center mb-2">
                      <f.icon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <CardTitle className="text-lg text-gray-900 dark:text-white">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" ref={howRef} className="relative z-10 py-20 sm:py-28 bg-gray-50/70 dark:bg-gray-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-sm font-medium mb-6">
              <BookOpen className="w-4 h-4" /> Comment ça marche
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
              Trois étapes vers{' '}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">l&apos;excellence</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-4 relative">
            {/* Connecting lines (desktop) */}
            <div className="hidden md:block absolute top-20 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-0.5">
              <div className="step-line w-full h-full bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 dark:from-emerald-700 dark:via-teal-700 dark:to-cyan-700 origin-left" />
              <div className="step-line absolute top-0 left-1/2 w-1/2 h-full bg-gradient-to-r from-teal-300 to-cyan-300 dark:from-teal-700 dark:to-cyan-700 origin-left" />
            </div>

            {steps.map((step, i) => (
              <div key={i} className="step-item flex flex-col items-center text-center">
                <div className="relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-6">
                  <step.icon className="w-7 h-7 text-white" />
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white dark:bg-gray-900 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center border-2 border-emerald-300 dark:border-emerald-700">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{step.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section ref={statsRef} className="relative z-10 py-20 sm:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-teal-900 to-cyan-900" />
        <div className="absolute inset-0 opacity-20">
          <img src="/landing-features.png" alt="" className="w-full h-full object-cover" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-4">
              Des chiffres qui parlent
            </h2>
            <p className="text-emerald-200/70 text-lg">L&apos;impact de ExamAI à travers l&apos;Afrique</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { target: 150, suffix: 'K+', label: 'Épreuves générées', icon: FileText },
              { target: 98, suffix: '%', label: 'Précision IA', icon: Brain },
              { target: 85, suffix: '%', label: 'Temps économisé', icon: Clock },
              { target: 2400, suffix: '+', label: 'Enseignants actifs', icon: Users },
            ].map((stat, i) => (
              <div key={i} className="stat-item text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
                  <stat.icon className="w-7 h-7 text-emerald-300" />
                </div>
                <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-2">
                  <AnimatedCounter target={stat.target} suffix={stat.suffix} />
                </div>
                <p className="text-emerald-200/70 text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Dashboard Preview ─── */}
      <section ref={dashboardRef} className="relative z-10 py-20 sm:py-28 bg-white dark:bg-gray-950 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 text-sm font-medium mb-6">
              <Monitor className="w-4 h-4" /> Aperçu
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
              Un tableau de bord{' '}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">intuitif</span>
            </h2>
            <p className="text-lg text-gray-500 dark:text-gray-400">
              Visualisez toutes vos données en un coup d&apos;œil avec notre interface moderne.
            </p>
          </div>

          <div className="dashboard-img relative rounded-2xl overflow-hidden shadow-2xl shadow-emerald-500/10 border border-gray-200/60 dark:border-gray-700/40">
            <img
              src="/dashboard-mockup.png"
              alt="Aperçu du tableau de bord ExamAI"
              className="w-full h-auto"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/20 via-transparent to-transparent pointer-events-none" />
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" ref={pricingRef} className="relative z-10 py-20 sm:py-28 bg-gray-50/70 dark:bg-gray-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-sm font-medium mb-6">
              <Crown className="w-4 h-4" /> Tarifs
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
              Des plans{' '}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">adaptés</span>
            </h2>
            <p className="text-lg text-gray-500 dark:text-gray-400">
              Choisissez le plan qui correspond à la taille de votre établissement.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {plans.map((plan, i) => (
              <motion.div
                key={i}
                className="pricing-card"
                whileHover={{ y: -8, transition: { duration: 0.25 } }}
              >
                <Card className={`h-full relative overflow-hidden ${
                  plan.popular
                    ? 'bg-gradient-to-b from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/50 dark:to-teal-950/50 border-2 border-emerald-400 dark:border-emerald-600 shadow-xl shadow-emerald-500/10'
                    : 'bg-white/60 dark:bg-gray-900/60 backdrop-blur-lg border-gray-200/60 dark:border-gray-700/40'
                }`}>
                  {plan.popular && (
                    <div className="absolute top-0 right-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white text-xs font-bold px-4 py-1 rounded-bl-xl">
                      POPULAIRE
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        plan.popular
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                          : 'bg-emerald-100 dark:bg-emerald-900/50'
                      }`}>
                        <plan.icon className={`w-5 h-5 ${plan.popular ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-gray-900 dark:text-white">{plan.name}</CardTitle>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{plan.desc}</p>
                      </div>
                    </div>
                    <div className="pt-4">
                      <span className="text-4xl font-extrabold text-gray-900 dark:text-white">${plan.price}</span>
                      <span className="text-gray-500 dark:text-gray-400 text-sm">/mois</span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <ul className="space-y-3">
                      {plan.features.map((feature, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                          <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <MagneticButton
                      onClick={onDemo}
                      className={`w-full ${
                        plan.popular
                          ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 text-white shadow-lg shadow-emerald-500/25'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      Commencer <ArrowRight className="w-4 h-4 ml-1" />
                    </MagneticButton>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section id="testimonials" ref={testimonialsRef} className="relative z-10 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-sm font-medium mb-6">
              <Star className="w-4 h-4" /> Témoignages
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
              Ils nous font{' '}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">confiance</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                className="testimonial-card"
                whileHover={{ y: -6, transition: { duration: 0.25 } }}
              >
                <Card className="h-full bg-white/60 dark:bg-gray-900/60 backdrop-blur-lg border-gray-200/60 dark:border-gray-700/40 hover:shadow-xl hover:shadow-emerald-500/10 transition-shadow duration-300">
                  <CardHeader>
                    <div className="flex gap-1 mb-2">
                      {[...Array(t.rating)].map((_, j) => (
                        <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed italic">
                      &ldquo;{t.text}&rdquo;
                    </p>
                  </CardHeader>
                  <CardFooter>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
                        {t.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t.role}</p>
                      </div>
                    </div>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section ref={ctaRef} className="relative z-10 py-20 sm:py-28 overflow-hidden">
        <div className="cta-bg absolute inset-0">
          <img
            src="/landing-cta.png"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/95 via-teal-900/95 to-gray-900/95" />
        </div>

        <div className="cta-content relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-6">
            Prêt à transformer vos examens ?
          </h2>
          <p className="text-emerald-200/70 text-lg mb-10 max-w-2xl mx-auto">
            Rejoignez plus de 2 400 enseignants qui utilisent déjà ExamAI pour créer, corriger et analyser leurs épreuves.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <MagneticButton
              onClick={onDemo}
              size="lg"
              className="bg-white text-emerald-900 hover:bg-gray-100 shadow-xl text-base px-8 py-6"
            >
              Commencer gratuitement <ArrowRight className="w-5 h-5 ml-2" />
            </MagneticButton>
            <MagneticButton
              onClick={onLogin}
              variant="outline"
              size="lg"
              className="border-2 border-white/30 text-white hover:bg-white/10 text-base px-8 py-6"
            >
              Se connecter
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 mt-auto bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                  ExamAI
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                La plateforme IA de nouvelle génération pour la création et la correction d&apos;épreuves en Afrique.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Produit</h4>
              <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li><button onClick={() => handleSmoothScroll('features')} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Fonctionnalités</button></li>
                <li><button onClick={() => handleSmoothScroll('pricing')} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Tarifs</button></li>
                <li><button onClick={() => handleSmoothScroll('how-it-works')} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Comment ça marche</button></li>
                <li><button onClick={onDemo} className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Démo gratuite</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Entreprise</h4>
              <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                <li><span className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">À propos</span></li>
                <li><span className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">Carrières</span></li>
                <li><span className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">Blog</span></li>
                <li><span className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">Contact</span></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Contact</h4>
              <ul className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4" /> contact@examai.ai
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4" /> +221 33 800 00 00
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Dakar, Sénégal
                </li>
              </ul>
            </div>
          </div>

          <Separator className="mb-8" />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              © {new Date().getFullYear()} ExamAI. Tous droits réservés.
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-400 dark:text-gray-500">
              <span className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">Confidentialité</span>
              <span className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">CGU</span>
              <span className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">Cookies</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
