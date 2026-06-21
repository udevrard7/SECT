'use client'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect, useCallback } from 'react'
import {
  Sparkles,
  FileText,
  BarChart3,
  ArrowRight,
  Star,
  Zap,
  Crown,
  Menu,
  X,
  Brain,
  Shield,
  GraduationCap,
  Cpu,
  BookOpen,
  Users,
  Globe,
  Check,
  Play,
  Clock,
  Monitor,
  Layers,
  Lock,
  ChevronRight,
  Award,
  Mail,
  Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

gsap.registerPlugin(ScrollTrigger)

/* ─── Types ─── */
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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!ref.current || !xTo.current || !yTo.current) return
      const rect = ref.current.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2
      xTo.current(x * 0.3)
      yTo.current(y * 0.3)
    },
    []
  )

  const handleMouseLeave = useCallback(() => {
    xTo.current?.(0)
    yTo.current?.(0)
  }, [])

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

/* ─── Gradient Text Helper ─── */
function GradientText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent ${className}`}>
      {children}
    </span>
  )
}

/* ─── Dot Grid Background ─── */
function DotGrid() {
  return (
    <div
      className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:32px_32px] pointer-events-none"
      aria-hidden
    />
  )
}

/* ─── Glow Orb ─── */
function GlowOrb({ x, y, color = 'emerald' }: { x: string; y: string; color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'rgba(16,185,129,0.15)',
    cyan: 'rgba(34,211,238,0.12)',
    teal: 'rgba(45,212,191,0.13)',
  }
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top: y, width: 600, height: 600, transform: 'translate(-50%, -50%)' }}
      aria-hidden
    >
      <div
        className="w-full h-full rounded-full blur-[120px]"
        style={{ background: colorMap[color] || colorMap.emerald }}
      />
    </div>
  )
}

/* ─── Navbar ─── */
function Navbar({ onLogin }: { onLogin: () => void }) {
  const navRef = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll, { passive: true })

    const ctx = gsap.context(() => {
      gsap.to(progressRef.current, {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: document.documentElement,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.3,
        },
      })
    })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      ctx.revert()
    }
  }, [])

  const links = ['Fonctionnalites', 'Tarifs', 'Temoignages']

  return (
    <>
      {/* Scroll progress bar */}
      <div className="fixed top-0 left-0 w-full h-[2px] z-[60]">
        <div
          ref={progressRef}
          className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 origin-left"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>

      <nav
        ref={navRef}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-[#09090b]/80 backdrop-blur-2xl border-b border-white/[0.06]'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              SECT
            </span>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase()}`}
                className="text-sm text-zinc-400 hover:text-white transition-colors duration-300"
              >
                {link}
              </a>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <MagneticButton
              variant="ghost"
              className="text-sm text-zinc-400 hover:text-white"
              onClick={onLogin}
            >
              Connexion
            </MagneticButton>
            <MagneticButton
              className="text-sm bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-5 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-shadow duration-300 rounded-lg"
              onClick={onLogin}
            >
              Commencer
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </MagneticButton>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-[#09090b]/95 backdrop-blur-2xl border-b border-white/[0.06] overflow-hidden"
            >
              <div className="px-6 py-4 flex flex-col gap-4">
                {links.map((link) => (
                  <a
                    key={link}
                    href={`#${link.toLowerCase()}`}
                    className="text-sm text-zinc-400 hover:text-white transition-colors py-2"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link}
                  </a>
                ))}
                <MagneticButton
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-lg"
                  onClick={onLogin}
                >
                  Commencer
                </MagneticButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </>
  )
}

/* ─── Hero Section ─── */
function HeroSection({ onDemo }: { onDemo: () => void }) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const subRef = useRef<HTMLParagraphElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const typingRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Split headline into words and animate
      if (headlineRef.current) {
        const words = headlineRef.current.querySelectorAll('.hero-word')
        gsap.fromTo(
          words,
          { y: 80, opacity: 0, rotateX: -40 },
          {
            y: 0,
            opacity: 1,
            rotateX: 0,
            duration: 1.2,
            stagger: 0.08,
            ease: 'power3.out',
            delay: 0.3,
          }
        )
      }

      // Subtitle fade in
      if (subRef.current) {
        gsap.fromTo(
          subRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 1, ease: 'power2.out', delay: 1.2 }
        )
      }

      // CTA buttons
      if (ctaRef.current) {
        gsap.fromTo(
          ctaRef.current.children,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'power2.out', delay: 1.5 }
        )
      }

      // Dashboard image parallax
      if (imageRef.current) {
        gsap.fromTo(
          imageRef.current,
          { y: 60, opacity: 0, scale: 0.95 },
          { y: 0, opacity: 1, scale: 1, duration: 1.4, ease: 'power3.out', delay: 1.8 }
        )

        // Parallax on scroll
        gsap.to(imageRef.current, {
          y: -40,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        })
      }
    }, sectionRef)

    // 3D tilt on mouse move
    const handleMouseMove = (e: MouseEvent) => {
      if (!imageRef.current) return
      const rect = imageRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const rotateY = ((e.clientX - centerX) / (rect.width / 2)) * 5
      const rotateX = -((e.clientY - centerY) / (rect.height / 2)) * 5
      gsap.to(imageRef.current, {
        rotateX,
        rotateY,
        duration: 0.5,
        ease: 'power2.out',
        transformPerspective: 1200,
      })
    }

    const handleMouseLeave = () => {
      if (!imageRef.current) return
      gsap.to(imageRef.current, {
        rotateX: 0,
        rotateY: 0,
        duration: 0.8,
        ease: 'power2.out',
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    imageRef.current?.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      ctx.revert()
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  // Typing effect
  useEffect(() => {
    if (!typingRef.current) return
    const phrases = [
      "Corriger 100 copies en 5 minutes",
      "Generer des examens avec l'IA",
      "Analyser les resultats en temps reel",
      "Securiser chaque epreuve",
    ]
    let phraseIndex = 0
    let charIndex = 0
    let isDeleting = false
    let timeout: ReturnType<typeof setTimeout>

    const type = () => {
      const currentPhrase = phrases[phraseIndex]
      if (!isDeleting) {
        charIndex++
        if (typingRef.current) {
          typingRef.current.textContent = currentPhrase.slice(0, charIndex)
        }
        if (charIndex === currentPhrase.length) {
          isDeleting = true
          timeout = setTimeout(type, 2000)
          return
        }
        timeout = setTimeout(type, 60)
      } else {
        charIndex--
        if (typingRef.current) {
          typingRef.current.textContent = currentPhrase.slice(0, charIndex)
        }
        if (charIndex === 0) {
          isDeleting = false
          phraseIndex = (phraseIndex + 1) % phrases.length
          timeout = setTimeout(type, 500)
          return
        }
        timeout = setTimeout(type, 30)
      }
    }

    timeout = setTimeout(type, 2000)
    return () => clearTimeout(timeout)
  }, [])

  const headlineWords = ["L'examen", 'reinvente', 'par', "l'Intelligence", 'Artificielle']

  return (
    <section ref={sectionRef} className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#09090b]">
      <DotGrid />
      <GlowOrb x="50%" y="30%" color="emerald" />
      <GlowOrb x="30%" y="60%" color="cyan" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-28 pb-16 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm"
        >
          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs text-zinc-400 font-medium tracking-wide">
            Nouveau : IA Generative integree
          </span>
        </motion.div>

        {/* Headline */}
        <h1
          ref={headlineRef}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-5"
          style={{ perspective: '600px' }}
        >
          {headlineWords.map((word, i) => (
            <span
              key={i}
              className="hero-word inline-block mr-3 sm:mr-4 md:mr-5"
              style={{ transformStyle: 'preserve-3d' }}
            >
              {i === 3 || i === 4 ? (
                <GradientText>{word}</GradientText>
              ) : (
                <span className="text-white">{word}</span>
              )}
            </span>
          ))}
        </h1>

        {/* Typing line */}
        <p ref={subRef} className="text-lg sm:text-xl text-zinc-400 mb-4 min-h-[32px]">
          <span ref={typingRef} className="text-zinc-300" />
          <span className="animate-pulse text-emerald-400">|</span>
        </p>

        {/* Sub-description paragraph */}
        <p className="max-w-3xl mx-auto text-base sm:text-lg text-zinc-500 leading-relaxed mb-8">
          SECT est la plateforme tout-en-un qui automatise le cycle complet de vos examens :
          generation de sujets par IA, surveillance anti-fraude integree, correction instantanee
          et analytics detailles. Concue pour les universites, ecoles d&apos;ingenieurs et centres
          de formation, elle transforme des jours de travail en quelques clics.
        </p>

        {/* CTA Buttons */}
        <div ref={ctaRef} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <MagneticButton
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-8 py-3.5 text-base shadow-[0_0_30px_rgba(16,185,129,0.35)] hover:shadow-[0_0_50px_rgba(16,185,129,0.5)] transition-all duration-300 rounded-xl"
            onClick={onDemo}
          >
            Demander une demo
            <ArrowRight className="ml-2 h-5 w-5" />
          </MagneticButton>
          <MagneticButton
            variant="outline"
            className="border-white/[0.1] text-white hover:bg-white/[0.05] px-8 py-3.5 text-base rounded-xl"
            onClick={onDemo}
          >
            <Play className="mr-2 h-4 w-4" />
            Voir en action
          </MagneticButton>
        </div>

        {/* Trust indicators */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-10">
          {[
            { icon: Check, text: '500+ evaluations realisees' },
            { icon: Shield, text: 'Donnees chiffrees AES-256' },
            { icon: Clock, text: '98% de temps economise' },
            { icon: Users, text: '200+ institutions actives' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-zinc-500">
              <item.icon className="h-3.5 w-3.5 text-emerald-400/70" />
              <span className="text-xs font-medium">{item.text}</span>
            </div>
          ))}
        </div>

        {/* Hero visual — abstract AI-exam concept (distinct from the product dashboard shown later) */}
        <div
          ref={imageRef}
          className="relative mx-auto max-w-5xl"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Layered ambient glow for depth */}
          <div className="absolute -inset-6 bg-gradient-to-tr from-emerald-500/20 via-teal-500/5 to-cyan-500/20 rounded-[2rem] blur-3xl" aria-hidden />
          <div className="absolute -inset-2 bg-gradient-to-br from-emerald-400/10 to-cyan-400/10 rounded-2xl blur-2xl" aria-hidden />

          {/* Refined frame: outer ring + inner border + top highlight */}
          <div className="relative rounded-2xl ring-1 ring-white/[0.06] shadow-2xl shadow-emerald-500/10">
            <div className="relative rounded-2xl border border-white/[0.1] overflow-hidden bg-[#0a0a0a]">
              {/* Top edge light catch */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" aria-hidden />
              <img
                src="/hero-ai-exam.png"
                alt="SECT — L'examen reinvente par l'IA : sujet d'examen holographique genere par intelligence artificielle"
                className="w-full h-auto block"
                loading="eager"
              />
              {/* Cinematic letterbox fades for a premium, framed feel */}
              <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-[#09090b]/60 to-transparent pointer-events-none" aria-hidden />
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#09090b] via-[#09090b]/80 to-transparent pointer-events-none" aria-hidden />
            </div>
          </div>

          {/* Curated floating badges — 3, purposefully placed */}
          <div className="absolute -right-3 sm:-right-5 top-[18%] px-3 py-1.5 bg-[#0a0a0a]/90 border border-white/[0.1] rounded-lg backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
              <span className="text-xs text-zinc-200 font-medium">Generation IA en direct</span>
            </div>
          </div>
          <div className="absolute -left-3 sm:-left-5 top-[42%] px-3 py-1.5 bg-[#0a0a0a]/90 border border-white/[0.1] rounded-lg backdrop-blur-sm shadow-xl hidden sm:block">
            <div className="flex items-center gap-2">
              <Brain className="h-3 w-3 text-cyan-400" />
              <span className="text-xs text-zinc-200 font-medium">Sujets uniques par etudiant</span>
            </div>
          </div>
          <div className="absolute -right-3 sm:-right-5 bottom-[14%] px-3 py-1.5 bg-[#0a0a0a]/90 border border-white/[0.1] rounded-lg backdrop-blur-sm shadow-xl hidden sm:block">
            <div className="flex items-center gap-2">
              <Shield className="h-3 w-3 text-emerald-400" />
              <span className="text-xs text-zinc-200 font-medium">Anti-fraude integre</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Logo Cloud ─── */
function LogoCloud() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const universities = [
    'Universite Mohammed V',
    'EMI Rabat',
    'ENSIAS',
    'Hassania Mohammedia',
    'Universite Cadi Ayyad',
    'ENSA Marrakech',
  ]

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        sectionRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 1, ease: 'power2.out',
          scrollTrigger: { trigger: sectionRef.current, start: 'top 90%' } }
      )
    })
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="relative py-10 bg-[#0a0a0a] border-y border-white/[0.04]">
      <div className="max-w-6xl mx-auto px-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-4 font-medium">
          Adopte par les meilleures institutions
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {universities.map((name) => (
            <span
              key={name}
              className="text-sm text-zinc-500/60 font-medium tracking-wide hover:text-zinc-400 transition-colors duration-300"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Bento Features Grid ─── */
function FeaturesBento() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)

  const features = [
    {
      icon: Brain,
      title: 'Generation IA',
      description: 'Creez des examens complets en quelques secondes avec notre IA generative.',
      bullets: [
        'Questions QCU, QCM, QRC et open-ended generees automatiquement',
        'Adaptation au niveau et au programme de chaque institution',
        'Generation de variantes uniques pour chaque etudiant',
      ],
      span: 'md:col-span-2 md:row-span-2',
      image: true,
      imageSrc: '/hero-exam-ai.png',
    },
    {
      icon: Shield,
      title: 'Anti-Fraude & Proctoring',
      description: 'Surveillance en temps reel et detection automatique des comportements suspects.',
      bullets: [
        'Proctoring video avec IA de detection',
        'Verrouillage navigateur et onglets',
        'Alertes en temps reel pour les surveillants',
      ],
      span: 'md:col-span-1',
    },
    {
      icon: BarChart3,
      title: 'Analytics Avances',
      description: 'Visualisez les performances avec des graphiques interactifs et des rapports detailles.',
      bullets: [
        'Tableaux de bord en temps reel',
        'Analyse par question, etudiant et classe',
        'Export PDF et Excel en un clic',
      ],
      span: 'md:col-span-1',
    },
    {
      icon: FileText,
      title: 'Correction Automatique',
      description: "Correction instantanee avec feedback personnalise pour chaque etudiant.",
      bullets: [
        'Correction QCM/QCU instantanee',
        'Evaluation IA des reponses ouvertes',
        'Feedback detaille et suggestions d\'amelioration',
      ],
      span: 'md:col-span-1',
    },
    {
      icon: Clock,
      title: 'Monitoring Temps Reel',
      description: 'Suivi en direct de chaque epreuve et session avec alertes intelligentes.',
      bullets: [
        'Progression en direct par etudiant',
        'Alertes de depassement de temps',
        'Statistiques live de participation',
      ],
      span: 'md:col-span-1',
    },
    {
      icon: Layers,
      title: 'Multi-Formats',
      description: 'QCM, questions ouvertes, codage, et bien plus encore.',
      bullets: [
        'QCU, QCM, correspondance, ordonnancement',
        'Questions de code avec execution en ligne',
        'Cas cliniques et etudes de cas',
      ],
      span: 'md:col-span-1',
    },
    {
      icon: Users,
      title: 'Multi-Tenant',
      description: 'Gerez plusieurs departements, filieres et campus depuis une seule plateforme.',
      bullets: [
        'Isolation complete des donnees par institution',
        'Roles et permissions granulaires',
        'Branding personnalise par etablissement',
      ],
      span: 'md:col-span-1',
    },
    {
      icon: Award,
      title: 'Certificats & Badges',
      description: 'Generez automatiquement des certificats et badges de competence.',
      bullets: [
        'Certificats horodatés et verifiables',
        'Badges numeriques compatibles Open Badges',
        'Personnalisation complete du design',
      ],
      span: 'md:col-span-1',
    },
    {
      icon: Lock,
      title: 'Securite & Conformite',
      description: 'Chiffrement de bout en bout et conformite RGPD pour toutes vos donnees sensibles.',
      bullets: [
        'Chiffrement AES-256 au repos et TLS en transit',
        'Conformite RGPD et audit trails',
        'Sauvegardes automatiques redondantes',
      ],
      span: 'md:col-span-1',
    },
    {
      icon: Target,
      title: 'Suggestion de Bareme',
      description: "L'IA propose un bareme optimal en fonction de la difficulte de chaque question.",
      bullets: [
        'Analyse de difficulte automatique',
        'Repartition intelligente des points',
        'Ajustement manuel ou automatique',
      ],
      span: 'md:col-span-1',
    },
  ]

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!cardsRef.current) return
      const cards = cardsRef.current.querySelectorAll('.bento-card')
      gsap.fromTo(
        cards,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: cardsRef.current, start: 'top 85%' },
        }
      )
    })
    return () => ctx.revert()
  }, [])

  return (
    <section id="fonctionnalites" ref={sectionRef} className="relative py-12 sm:py-16 bg-[#09090b]">
      <DotGrid />
      <GlowOrb x="20%" y="50%" color="emerald" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-3">
            Fonctionnalites
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight">
            Tout ce dont vous avez{' '}
            <GradientText>besoin</GradientText>
          </h2>
          <p className="mt-3 text-zinc-500 max-w-2xl mx-auto text-sm sm:text-base">
            De la creation a la certification, SECT couvre l&apos;integralite du processus d&apos;evaluation
            avec des outils puissants et une IA de pointe.
          </p>
        </div>

        <div
          ref={cardsRef}
          className="grid grid-cols-1 md:grid-cols-4 gap-3"
        >
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className={`bento-card group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5 transition-all duration-500 hover:border-white/[0.12] hover:bg-white/[0.04] ${feature.span}`}
              whileHover={{ y: -4, transition: { duration: 0.3 } }}
            >
              {/* Hover gradient border glow */}
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-emerald-500/10 via-transparent to-cyan-500/10 pointer-events-none" />

              <div className="relative z-10 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <feature.icon className="h-4.5 w-4.5 text-emerald-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed mb-3">{feature.description}</p>

                {/* Bullet points */}
                <ul className="space-y-1.5 flex-1">
                  {feature.bullets.map((bullet, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-emerald-400/60 mt-2 shrink-0" />
                      <span className="text-xs text-zinc-500 leading-relaxed">{bullet}</span>
                    </li>
                  ))}
                </ul>

                {feature.image && (
                  <div className="mt-4 flex-1 relative rounded-lg overflow-hidden border border-white/[0.06]">
                    <img
                      src={feature.imageSrc}
                      alt={feature.title}
                      className="w-full h-auto object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                    />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── AI Showcase ─── */
function AIShowcase() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const imageWrapperRef = useRef<HTMLDivElement>(null)
  const ringsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Floating image
      if (imageWrapperRef.current) {
        gsap.to(imageWrapperRef.current, {
          y: -15,
          duration: 2.5,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        })
      }

      // Pulsing rings
      if (ringsRef.current) {
        const rings = ringsRef.current.querySelectorAll('.pulse-ring')
        rings.forEach((ring, i) => {
          gsap.fromTo(
            ring,
            { scale: 0.8, opacity: 0.6 },
            {
              scale: 1.4 + i * 0.3,
              opacity: 0,
              duration: 2.5,
              repeat: -1,
              delay: i * 0.6,
              ease: 'power1.out',
            }
          )
        })
      }

      // Text reveal
      gsap.fromTo(
        sectionRef.current?.querySelectorAll('.ai-text') || [],
        { opacity: 0, x: -40 },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          stagger: 0.15,
          ease: 'power3.out',
          scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
        }
      )
    })
    return () => ctx.revert()
  }, [])

  const aiCapabilities = [
    {
      icon: Brain,
      title: 'Generation de questions QCU/QCM/QRC',
      description: 'Creez des items de qualite professionnelle en quelques secondes, adaptes au niveau cible et au programme.',
    },
    {
      icon: FileText,
      title: 'Correction intelligente des copies',
      description: "L'IA evalue les reponses ouvertes avec une precision proche de celle d'un correcteur humain, en quelques instants.",
    },
    {
      icon: Cpu,
      title: 'Analyse documentaire automatique',
      description: 'Importez vos cours et supports PDF : l\'IA extrait les concepts cles et genere des questions pertinentes.',
    },
    {
      icon: Shield,
      title: 'Detection de plagiat IA',
      description: 'Identifiez les reponses generees par ChatGPT ou d\'autres outils IA avec un taux de detection superieur a 95%.',
    },
    {
      icon: Target,
      title: 'Suggestion de bareme',
      description: "L'IA analyse la difficulte de chaque question et propose une repartition optimale des points.",
    },
  ]

  return (
    <section ref={sectionRef} className="relative py-12 sm:py-16 bg-[#0a0a0a] overflow-hidden">
      <DotGrid />
      <GlowOrb x="70%" y="50%" color="teal" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Left: Text */}
          <div>
            <p className="ai-text text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-3">
              Intelligence Artificielle
            </p>
            <h2 className="ai-text text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
              Propulse par{' '}
              <GradientText>l'Intelligence Artificielle</GradientText>
            </h2>
            <p className="ai-text text-base text-zinc-400 leading-relaxed mb-6">
              Notre IA analyse, genere et corrige vos examens avec une precision
              inegalee. De la creation d&apos;epreuves a la correction automatique,
              chaque processus est optimise pour vous faire gagner un temps precieux.
              Les modeles sont entraines sur des millions de copies francophones et
              s&apos;adaptent a votre contexte institutionnel.
            </p>

            {/* AI Capabilities List */}
            <div className="ai-text flex flex-col gap-3">
              {aiCapabilities.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-300">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 mt-0.5">
                    <item.icon className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-zinc-200 block mb-0.5">{item.title}</span>
                    <span className="text-xs text-zinc-500 leading-relaxed">{item.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Image with pulse rings */}
          <div className="relative flex items-center justify-center">
            <div ref={ringsRef} className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="pulse-ring absolute w-[280px] h-[280px] sm:w-[350px] sm:h-[350px] rounded-full border border-emerald-400/30"
                />
              ))}
            </div>
            <div ref={imageWrapperRef} className="relative">
              <div className="absolute -inset-8 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-3xl blur-3xl" aria-hidden />
              <div className="relative rounded-xl border border-white/[0.08] overflow-hidden shadow-2xl shadow-emerald-500/10">
                <img
                  src="/hero-ai-network.png"
                  alt="Reseau neuronal IA - SECT"
                  className="w-full max-w-md h-auto block"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── How It Works ─── */
function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)

  const steps = [
    {
      number: '01',
      icon: FileText,
      title: 'Importez & Creez',
      description: "Uploadez vos examens existants ou laissez l'IA les generer automatiquement a partir de vos cours.",
      subSteps: [
        'Importez vos PDF, Word ou Markdown',
        "L'IA genere des questions pertinentes",
        'Personnalisez le bareme et le timing',
        'Generez des variantes uniques par etudiant',
      ],
    },
    {
      number: '02',
      icon: Users,
      title: 'Administrez & Surveillez',
      description: 'Organisez les sessions, assignez les surveillants et securisez les epreuves avec le proctoring IA.',
      subSteps: [
        'Planifiez les sessions et les salles',
        'Activez le proctoring video et le verrouillage',
        'Suivez la progression en temps reel',
        'Recevez des alertes anti-fraude instantanees',
      ],
    },
    {
      number: '03',
      icon: BarChart3,
      title: 'Corrigez & Analysez',
      description: "Obtenez des resultats instantanes avec des insights powers par l'IA et des rapports detailles.",
      subSteps: [
        'Correction automatique QCM et IA pour copies',
        'Feedback personnalise pour chaque etudiant',
        'Statistiques detaillees par question et classe',
        'Certificats et badges generes automatiquement',
      ],
    },
  ]

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Animated connecting line
      if (lineRef.current) {
        gsap.fromTo(
          lineRef.current,
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 1.5,
            ease: 'power2.inOut',
            scrollTrigger: { trigger: sectionRef.current, start: 'top 70%' },
          }
        )
      }

      // Steps appear sequentially
      const stepEls = sectionRef.current?.querySelectorAll('.step-item')
      if (stepEls) {
        gsap.fromTo(
          stepEls,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            stagger: 0.3,
            ease: 'power3.out',
            scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
          }
        )
      }
    })
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="relative py-12 sm:py-16 bg-[#09090b] overflow-hidden">
      <DotGrid />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-3">
            Comment ca marche
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Simple comme <GradientText>1, 2, 3</GradientText>
          </h2>
          <p className="mt-3 text-zinc-500 max-w-2xl mx-auto text-sm">
            En trois etapes, transformez completement votre processus d&apos;evaluation.
            Pas de formation lourde, pas de migration complexe.
          </p>
        </div>

        <div className="relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-1/2 left-[16%] right-[16%] h-px bg-gradient-to-r from-emerald-500/30 via-teal-400/40 to-cyan-400/30 -translate-y-1/2">
            <div ref={lineRef} className="h-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 origin-left" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-6">
            {steps.map((step, i) => (
              <div key={i} className="step-item relative flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm flex items-center justify-center">
                    <step.icon className="h-7 w-7 text-emerald-400" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 text-black text-xs font-bold flex items-center justify-center">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-[280px] mb-3">
                  {step.description}
                </p>
                {/* Sub-steps */}
                <ul className="space-y-1.5 text-left w-full max-w-[260px]">
                  {step.subSteps.map((sub, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[9px] font-bold text-emerald-400">{j + 1}</span>
                      </span>
                      <span className="text-xs text-zinc-500 leading-relaxed">{sub}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Stats Section ─── */
function StatsSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const stats = [
    { value: 50000, suffix: '+', label: 'Examens corriges', subtext: 'Par l\'IA avec une precision de 99.7%' },
    { value: 99.7, suffix: '%', label: 'Precision IA', subtext: 'Sur la correction automatique QCM/QCU' },
    { value: 200, suffix: '+', label: 'Institutions', subtext: 'Universites et ecoles en Afrique et Europe' },
    { value: 15, suffix: 'min', label: 'Temps moyen', subtext: 'Pour corriger 100 copies completement' },
    { value: 98, suffix: '%', label: 'Taux de satisfaction', subtext: 'Enseignants et administrateurs conquis' },
    { value: 3, suffix: 'M+', label: 'Questions generees', subtext: 'Par l\'IA depuis le lancement de SECT' },
  ]
  const countersRef = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const ctx = gsap.context(() => {
      countersRef.current.forEach((el, i) => {
        if (!el) return
        const target = stats[i].value
        gsap.fromTo(
          el,
          { textContent: '0' },
          {
            textContent: target,
            duration: 2,
            ease: 'power2.out',
            snap: { textContent: target % 1 === 0 ? 1 : 0.1 },
            scrollTrigger: { trigger: sectionRef.current, start: 'top 80%' },
            delay: i * 0.15,
          }
        )
      })
    })
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="relative py-12 sm:py-14 bg-gradient-to-b from-[#09090b] via-emerald-950/20 to-[#09090b] overflow-hidden">
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {stats.map((stat, i) => (
            <div key={i} className="relative flex flex-col items-center text-center group">
              {/* Glow behind number */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-emerald-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden />

              <span
                ref={(el) => { countersRef.current[i] = el }}
                className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-1"
              >
                {0}
              </span>
              <span className="text-emerald-400 text-sm font-semibold mb-0.5">{stat.suffix}</span>
              <span className="text-xs text-zinc-400 uppercase tracking-wider mb-1">{stat.label}</span>
              <span className="text-[10px] text-zinc-600 max-w-[180px] leading-relaxed">{stat.subtext}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Dashboard Preview ─── */
function DashboardPreview() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const metricsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (imageRef.current) {
        // Clip-path circle reveal
        gsap.fromTo(
          imageRef.current,
          { clipPath: 'circle(0% at 50% 50%)' },
          {
            clipPath: 'circle(75% at 50% 50%)',
            duration: 1.8,
            ease: 'power2.inOut',
            scrollTrigger: { trigger: sectionRef.current, start: 'top 65%' },
          }
        )
      }
      // Floating metric cards animation
      if (metricsRef.current) {
        const metricCards = metricsRef.current.querySelectorAll('.metric-float')
        metricCards.forEach((card, i) => {
          gsap.to(card, {
            y: -8 - i * 2,
            duration: 2.5 + i * 0.3,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            delay: i * 0.4,
          })
        })
      }
    })
    return () => ctx.revert()
  }, [])

  const callouts = [
    { position: 'top-[12%] left-[6%]', text: 'Analytics en temps reel', description: 'KPIs et metriques live', icon: BarChart3 },
    { position: 'top-[55%] left-[4%]', text: 'Gestion des epreuves', description: 'Planification et suivi', icon: FileText },
    { position: 'top-[18%] right-[4%]', text: 'IA Integration', description: 'Generation et correction', icon: Brain },
    { position: 'top-[65%] right-[6%]', text: 'Rapports detailles', description: 'Export et partage', icon: BookOpen },
    { position: 'top-[38%] right-[5%]', text: 'Monitoring sessions', description: 'Progression en direct', icon: Monitor },
  ]

  const floatingMetrics = [
    { label: 'Taux de reussite', value: '94.2%', barClass: 'bg-emerald-400/50', textClass: 'text-emerald-400' },
    { label: 'Examens actifs', value: '127', barClass: 'bg-cyan-400/50', textClass: 'text-cyan-400' },
    { label: 'Etudiants en ligne', value: '2.4k', barClass: 'bg-teal-400/50', textClass: 'text-teal-400' },
  ]

  return (
    <section ref={sectionRef} className="relative py-12 sm:py-16 bg-[#0a0a0a] overflow-hidden">
      <DotGrid />
      <GlowOrb x="50%" y="50%" color="emerald" />

      {/* Decorative gradient border at top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-3">
            Centre de commande
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight">
            Votre <GradientText>Centre de Commande</GradientText>
          </h2>
          <p className="mt-3 text-zinc-500 max-w-2xl mx-auto text-sm">
            Un tableau de bord unifie pour piloter l&apos;ensemble de vos evaluations,
            du planning a la certification.
          </p>
        </div>

        <div className="relative">
          {/* Callouts with icons */}
          {callouts.map((callout, i) => (
            <div
              key={i}
              className={`absolute ${callout.position} hidden lg:flex flex-col items-start gap-1 z-20`}
            >
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0a0a0a]/90 rounded-lg border border-white/[0.08] backdrop-blur-md shadow-lg">
                <callout.icon className="h-3 w-3 text-emerald-400 shrink-0" />
                <span className="text-xs text-zinc-200 font-medium whitespace-nowrap">{callout.text}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
              </div>
              <span className="text-[10px] text-zinc-500 ml-5 pl-0.5">{callout.description}</span>
            </div>
          ))}

          {/* Main image */}
          <div ref={imageRef} className="relative rounded-xl border border-white/[0.08] overflow-hidden shadow-2xl shadow-emerald-500/5">
            <img
              src="/dashboard-command-center.png"
              alt="SECT Centre de Commande - Analytics et monitoring en temps reel"
              className="w-full h-auto block"
            />
            {/* Scan line overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(16,185,129,0.02) 2px, rgba(16,185,129,0.02) 4px)' }} />
            {/* Bottom gradient fade */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />
          </div>

          {/* Floating metric cards below image */}
          <div ref={metricsRef} className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {floatingMetrics.map((metric, i) => (
              <div
                key={i}
                className="metric-float relative rounded-lg border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-4 text-center"
              >
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full ${metric.barClass}`} />
                <span className={`text-2xl font-bold block mb-1 ${metric.textClass}`}>{metric.value}</span>
                <span className="text-xs text-zinc-500">{metric.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Pricing Section ─── */
function PricingSection({ onDemo }: { onDemo: () => void }) {
  const sectionRef = useRef<HTMLDivElement>(null)

  const plans = [
    {
      name: 'Starter',
      price: '499',
      description: 'Pour les petites institutions qui debutent avec l\'evaluation numerique.',
      features: [
        'Jusqu\'a 100 etudiants',
        '5 examens/mois',
        'Correction automatique QCM',
        'Support email (48h)',
        '1 administrateur',
        'Rapports basiques',
      ],
      popular: false,
    },
    {
      name: 'Professionnel',
      price: '1299',
      description: 'Pour les institutions en croissance qui veulent exploiter la puissance de l\'IA.',
      features: [
        'Jusqu\'a 2 000 etudiants',
        'Examens illimites',
        'IA Generative avancee',
        'Anti-fraude & proctoring complet',
        'Analytics detailles & exports',
        'Support prioritaire 24/7',
        '5 administrateurs',
        'Certificats & badges',
      ],
      popular: true,
    },
    {
      name: 'Entreprise',
      price: 'Sur mesure',
      description: 'Pour les grandes universites et reseaux multi-campus.',
      features: [
        'Etudiants illimites',
        'Tout du plan Professionnel',
        'Deploiement on-premise ou cloud prive',
        'SSO & Integration SI (LDAP, CAS)',
        'SLA garanti 99.9%',
        'Account manager dedie',
        'Multi-tenant avance',
        'API & Webhooks personnalises',
      ],
      popular: false,
    },
  ]

  // Feature comparison data
  const comparisonFeatures = [
    { name: 'Etudiants', starter: '100', pro: '2 000', enterprise: 'Illimites' },
    { name: 'Examens/mois', starter: '5', pro: 'Illimites', enterprise: 'Illimites' },
    { name: 'Generation IA', starter: false, pro: true, enterprise: true },
    { name: 'Correction IA', starter: 'QCM', pro: 'Tous types', enterprise: 'Tous types' },
    { name: 'Anti-fraude', starter: false, pro: true, enterprise: true },
    { name: 'Proctoring video', starter: false, pro: true, enterprise: true },
    { name: 'Certificats & Badges', starter: false, pro: true, enterprise: true },
    { name: 'Analytics', starter: 'Basiques', pro: 'Avances', enterprise: 'Personnalises' },
    { name: 'Support', starter: 'Email', pro: '24/7', enterprise: 'Dedie' },
    { name: 'SSO / LDAP', starter: false, pro: false, enterprise: true },
  ]

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = sectionRef.current?.querySelectorAll('.pricing-card')
      if (cards) {
        gsap.fromTo(
          cards,
          { opacity: 0, scale: 0.9 },
          {
            opacity: 1,
            scale: 1,
            duration: 0.8,
            stagger: 0.15,
            ease: 'elastic.out(1, 0.6)',
            scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
          }
        )
      }
    })
    return () => ctx.revert()
  }, [])

  return (
    <section id="tarifs" ref={sectionRef} className="relative py-12 sm:py-16 bg-[#09090b] overflow-hidden">
      <DotGrid />
      <GlowOrb x="50%" y="30%" color="emerald" />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-3">
            Tarifs
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Un plan pour chaque{' '}
            <GradientText>ambition</GradientText>
          </h2>
          <p className="mt-3 text-zinc-500 max-w-2xl mx-auto text-sm">
            Que vous soyez une petite ecole ou une grande universite, SECT s&apos;adapte a vos besoins et a votre budget.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start mb-8">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`pricing-card relative rounded-xl border backdrop-blur-sm p-6 transition-all duration-500 ${
                plan.popular
                  ? 'border-emerald-500/40 bg-white/[0.04] md:-mt-4 md:mb-4 shadow-[0_0_40px_rgba(16,185,129,0.12)]'
                  : 'border-white/[0.06] bg-white/[0.02]'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-emerald-500 rounded-full">
                  <span className="text-xs font-bold text-black uppercase tracking-wider">Populaire</span>
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                <p className="text-xs text-zinc-400">{plan.description}</p>
              </div>

              <div className="mb-4">
                {plan.price === 'Sur mesure' ? (
                  <span className="text-3xl font-bold text-white">Sur mesure</span>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    <span className="text-sm text-zinc-500">MAD/mois</span>
                  </div>
                )}
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-zinc-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <MagneticButton
                className={`w-full rounded-lg font-semibold text-sm ${
                  plan.popular
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                    : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.1]'
                }`}
                onClick={onDemo}
              >
                {plan.popular ? 'Commencer maintenant' : 'Nous contacter'}
                <ChevronRight className="ml-1 h-4 w-4" />
              </MagneticButton>
            </div>
          ))}
        </div>

        {/* Feature Comparison Table */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-white">Comparaison detaillee</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="text-left text-zinc-500 font-medium px-5 py-2.5">Fonctionnalite</th>
                  <th className="text-center text-zinc-500 font-medium px-4 py-2.5">Starter</th>
                  <th className="text-center text-emerald-400 font-medium px-4 py-2.5 bg-emerald-500/5">Pro</th>
                  <th className="text-center text-zinc-500 font-medium px-4 py-2.5">Entreprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((feat, i) => (
                  <tr key={i} className="border-b border-white/[0.03] last:border-0">
                    <td className="text-zinc-300 px-5 py-2">{feat.name}</td>
                    <td className="text-center px-4 py-2 text-zinc-500">
                      {typeof feat.starter === 'boolean' ? (
                        feat.starter ? <Check className="h-3.5 w-3.5 text-emerald-400 mx-auto" /> : <X className="h-3.5 w-3.5 text-zinc-700 mx-auto" />
                      ) : feat.starter}
                    </td>
                    <td className="text-center px-4 py-2 text-zinc-300 bg-emerald-500/5">
                      {typeof feat.pro === 'boolean' ? (
                        feat.pro ? <Check className="h-3.5 w-3.5 text-emerald-400 mx-auto" /> : <X className="h-3.5 w-3.5 text-zinc-700 mx-auto" />
                      ) : feat.pro}
                    </td>
                    <td className="text-center px-4 py-2 text-zinc-300">
                      {typeof feat.enterprise === 'boolean' ? (
                        feat.enterprise ? <Check className="h-3.5 w-3.5 text-emerald-400 mx-auto" /> : <X className="h-3.5 w-3.5 text-zinc-700 mx-auto" />
                      ) : feat.enterprise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Testimonials ─── */
function Testimonials() {
  const sectionRef = useRef<HTMLDivElement>(null)

  const testimonials = [
    {
      initials: 'AB',
      name: 'Dr. Amina Benali',
      role: 'Directrice, EMI Rabat',
      institution: 'Ecole Mohammed V - 3 200 etudiants',
      quote: "SECT a revolutionne notre facon de gerer les examens. La correction automatique nous fait gagner des jours entiers. Nous avons reduit notre temps de correction de 85% depuis son adoption.",
      stars: 5,
      result: '85% de temps economise',
    },
    {
      initials: 'MK',
      name: 'Prof. Mohammed Khalil',
      role: 'Doyen, Faculte des Sciences',
      institution: 'Universite Cadi Ayyad - 8 500 etudiants',
      quote: "L'anti-fraude integre nous a donne une tranquillite d'esprit totale pendant les sessions d'examen. Le taux de fraude a chute de 92% des la premiere session.",
      stars: 5,
      result: '92% moins de fraude',
    },
    {
      initials: 'SF',
      name: 'Sara Fassi',
      role: 'Responsable Pedagogique',
      institution: 'ENSA Marrakech - 1 800 etudiants',
      quote: "Les analytics en temps reel nous permettent d'identifier immediatement les etudiants en difficulte. Nous avons ameliore notre taux de reussite de 15% en un semestre.",
      stars: 5,
      result: '+15% de reussite',
    },
    {
      initials: 'YE',
      name: 'Dr. Youssef El Amrani',
      role: 'Chef de Departement Informatique',
      institution: 'ENSIAS Rabat - 2 400 etudiants',
      quote: "La generation IA d'examens est bluffante de qualite. En 2 minutes, j'obtiens un sujet equilibre et complet. C'est un gain de productivite incroyable pour toute l'equipe pedagogique.",
      stars: 5,
      result: '2 min par sujet',
    },
  ]

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = sectionRef.current?.querySelectorAll('.testimonial-card')
      if (cards) {
        cards.forEach((card, i) => {
          gsap.fromTo(
            card,
            { opacity: 0, x: i % 2 === 0 ? -60 : 60 },
            {
              opacity: 1,
              x: 0,
              duration: 0.9,
              ease: 'power3.out',
              scrollTrigger: { trigger: card, start: 'top 85%' },
            }
          )
        })
      }
    })
    return () => ctx.revert()
  }, [])

  return (
    <section id="temoignages" ref={sectionRef} className="relative py-12 sm:py-16 bg-[#0a0a0a] overflow-hidden">
      <DotGrid />
      <GlowOrb x="70%" y="40%" color="teal" />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-3">
            Temoignages
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Ce qu'ils en <GradientText>disent</GradientText>
          </h2>
          <p className="mt-3 text-zinc-500 max-w-2xl mx-auto text-sm">
            Des centaines d&apos;institutions nous font confiance. Voici les retours de celles qui ont transforme leurs evaluations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="testimonial-card rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-5 sm:p-6 transition-all duration-500 hover:border-white/[0.12] hover:bg-white/[0.04]"
            >
              {/* Stars & Result */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex gap-1">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="h-3.5 w-3.5 fill-emerald-400 text-emerald-400" />
                  ))}
                </div>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  {t.result}
                </span>
              </div>

              {/* Quote */}
              <p className="text-sm text-zinc-300 leading-relaxed mb-4">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <span className="text-xs font-bold text-emerald-400">{t.initials}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-zinc-500">{t.role}</p>
                  <p className="text-[10px] text-zinc-600">{t.institution}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── CTA Section ─── */
function CTASection({ onDemo, onLogin }: { onDemo: () => void; onLogin: () => void }) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Continuous gradient hue shift
      if (bgRef.current) {
        gsap.to(bgRef.current, {
          backgroundPosition: '200% center',
          duration: 8,
          repeat: -1,
          ease: 'none',
        })
      }

      // Text reveal
      gsap.fromTo(
        sectionRef.current?.querySelectorAll('.cta-reveal') || [],
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
        }
      )
    })
    return () => ctx.revert()
  }, [])

  const benefits = [
    { icon: Zap, text: 'Configuration en moins de 30 minutes' },
    { icon: Shield, text: 'Securite de niveau entreprise des le premier jour' },
    { icon: Brain, text: 'IA generative incluse dans tous les plans' },
    { icon: Users, text: 'Accompagnement personnalise par notre equipe' },
  ]

  return (
    <section ref={sectionRef} className="relative py-12 sm:py-16 bg-[#09090b] overflow-hidden">
      {/* Gradient border at top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      {/* Animated background */}
      <div
        ref={bgRef}
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(90deg, transparent, rgba(16,185,129,0.15), rgba(34,211,238,0.1), rgba(16,185,129,0.15), transparent)',
          backgroundSize: '200% 100%',
        }}
        aria-hidden
      />

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <h2 className="cta-reveal text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight mb-4">
          Pret a transformer vos{' '}
          <GradientText>examens ?</GradientText>
        </h2>
        <p className="cta-reveal text-base text-zinc-400 mb-6 max-w-2xl mx-auto">
          Rejoignez les institutions qui ont deja adopte la plateforme d&apos;examen la plus avancee.
        </p>

        {/* Benefit bullets */}
        <div className="cta-reveal grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto mb-8">
          {benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-left">
              <b.icon className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-sm text-zinc-300">{b.text}</span>
            </div>
          ))}
        </div>

        <div className="cta-reveal flex flex-col sm:flex-row items-center justify-center gap-4">
          <MagneticButton
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-8 py-3.5 text-base shadow-[0_0_30px_rgba(16,185,129,0.35)] hover:shadow-[0_0_50px_rgba(16,185,129,0.5)] transition-all duration-300 rounded-xl"
            onClick={onDemo}
          >
            Demarrer gratuitement
            <ArrowRight className="ml-2 h-5 w-5" />
          </MagneticButton>
          <MagneticButton
            variant="outline"
            className="border-white/[0.1] text-white hover:bg-white/[0.05] px-8 py-3.5 text-base rounded-xl"
            onClick={onLogin}
          >
            <Globe className="mr-2 h-4 w-4" />
            Planifier une demo
          </MagneticButton>
        </div>
      </div>
    </section>
  )
}

/* ─── Footer ─── */
function Footer() {
  const [email, setEmail] = useState('')

  const columns = [
    {
      title: 'Produit',
      links: ['Fonctionnalites', 'Tarifs', 'Securite', 'Roadmap', 'Changelog', 'Integrations'],
    },
    {
      title: 'Ressources',
      links: ['Documentation', 'Blog', 'Guides', 'API Reference', 'Webinaires', 'Communaute'],
    },
    {
      title: 'Entreprise',
      links: ['A propos', 'Carrieres', 'Contact', 'Partenaires', 'Presse', 'Equipe'],
    },
    {
      title: 'Legal',
      links: ['Confidentialite', 'CGU', 'Cookies', 'RGPD', 'Mentions legales', 'Conditions'],
    },
  ]

  return (
    <footer className="relative bg-[#09090b] border-t border-white/[0.04]">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-6 mb-8">
          {/* Logo column + newsletter */}
          <div className="col-span-2">
            <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              SECT
            </span>
            <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
              La plateforme d&apos;examen propulssee par l&apos;intelligence artificielle. Automatisez, securisez et optimisez vos evaluations.
            </p>

            {/* Newsletter */}
            <div className="mt-4">
              <p className="text-xs font-medium text-zinc-400 mb-2">Restez informe</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40 transition-colors"
                />
                <button
                  className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg text-xs font-semibold transition-colors shrink-0"
                  aria-label="S'inscrire a la newsletter"
                >
                  <Mail className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold text-white mb-3 uppercase tracking-wider">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors duration-300"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.04] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="text-xs text-zinc-600">
              &copy; {new Date().getFullYear()} SECT. Tous droits reserves.
            </p>
            <span className="text-xs text-zinc-700">|</span>
            <p className="text-xs text-zinc-600">
              Built with <span className="text-red-400">&#10084;</span> in Africa
            </p>
          </div>
          <div className="flex items-center gap-4">
            {[
              { name: 'Twitter', href: '#' },
              { name: 'LinkedIn', href: '#' },
              { name: 'GitHub', href: '#' },
              { name: 'YouTube', href: '#' },
            ].map((social) => (
              <a
                key={social.name}
                href={social.href}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors duration-300"
              >
                {social.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN LANDING PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export function LandingPage({ onLogin, onDemo }: LandingPageProps) {
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Refresh ScrollTrigger on mount
    ScrollTrigger.refresh()

    return () => {
      // Kill all ScrollTriggers on unmount
      ScrollTrigger.getAll().forEach((t) => t.kill())
    }
  }, [])

  return (
    <div ref={mainRef} className="min-h-screen flex flex-col bg-[#09090b]">
      <Navbar onLogin={onLogin} />
      <main className="flex-1">
        <HeroSection onDemo={onDemo} />
        <LogoCloud />
        <FeaturesBento />
        <AIShowcase />
        <HowItWorks />
        <StatsSection />
        <DashboardPreview />
        <PricingSection onDemo={onDemo} />
        <Testimonials />
        <CTASection onDemo={onDemo} onLogin={onLogin} />
      </main>
      <Footer />
    </div>
  )
}
