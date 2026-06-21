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

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-20 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm"
        >
          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs text-zinc-400 font-medium tracking-wide">
            Nouveau : IA Generative integree
          </span>
        </motion.div>

        {/* Headline */}
        <h1
          ref={headlineRef}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-6"
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
        <p ref={subRef} className="text-lg sm:text-xl text-zinc-400 mb-10 min-h-[32px]">
          <span ref={typingRef} className="text-zinc-300" />
          <span className="animate-pulse text-emerald-400">|</span>
        </p>

        {/* CTA Buttons */}
        <div ref={ctaRef} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
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

        {/* Dashboard Image */}
        <div
          ref={imageRef}
          className="relative mx-auto max-w-5xl"
          style={{ transformStyle: 'preserve-3d' }}
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-cyan-500/20 rounded-2xl blur-3xl" aria-hidden />
          <div className="relative rounded-xl border border-white/[0.08] overflow-hidden shadow-2xl shadow-emerald-500/10">
            <img
              src="/hero-dashboard.png"
              alt="SECT Dashboard - Centre de commande pour examens"
              className="w-full h-auto block"
            />
          </div>
          {/* Floating badge */}
          <div className="absolute -right-3 top-1/4 px-3 py-1.5 bg-[#0a0a0a]/90 border border-white/[0.1] rounded-lg backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-zinc-300 font-medium">IA Active</span>
            </div>
          </div>
          <div className="absolute -left-3 bottom-1/4 px-3 py-1.5 bg-[#0a0a0a]/90 border border-white/[0.1] rounded-lg backdrop-blur-sm shadow-xl">
            <div className="flex items-center gap-2">
              <Shield className="h-3 w-3 text-emerald-400" />
              <span className="text-xs text-zinc-300 font-medium">Chiffrement AES-256</span>
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
    <section ref={sectionRef} className="relative py-16 bg-[#0a0a0a] border-y border-white/[0.04]">
      <div className="max-w-6xl mx-auto px-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-8 font-medium">
          Adopte par les meilleures institutions
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
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
      span: 'md:col-span-2 md:row-span-2',
      image: true,
      imageSrc: '/hero-exam-ai.png',
    },
    {
      icon: Shield,
      title: 'Anti-Fraude',
      description: 'Surveillance en temps reel et detection automatique des comportements suspects.',
      span: 'md:col-span-1',
    },
    {
      icon: BarChart3,
      title: 'Analytics Avances',
      description: 'Visualisez les performances avec des graphiques interactifs.',
      span: 'md:col-span-1',
    },
    {
      icon: FileText,
      title: 'Correction Automatique',
      description: "Correction instantanee avec feedback personnalise pour chaque etudiant.",
      span: 'md:col-span-1',
    },
    {
      icon: Clock,
      title: 'Temps Reel',
      description: 'Suivi en direct de chaque epreuve et session.',
      span: 'md:col-span-1',
    },
    {
      icon: Layers,
      title: 'Multi-Formats',
      description: 'QCM, questions ouvertes, codage, et bien plus encore.',
      span: 'md:col-span-1',
    },
    {
      icon: Lock,
      title: 'Securise',
      description: 'Chiffrement de bout en bout pour toutes vos donnees sensibles.',
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
    <section id="fonctionnalites" ref={sectionRef} className="relative py-24 sm:py-32 bg-[#09090b]">
      <DotGrid />
      <GlowOrb x="20%" y="50%" color="emerald" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-4">
            Fonctionnalites
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight">
            Tout ce dont vous avez{' '}
            <GradientText>besoin</GradientText>
          </h2>
        </div>

        <div
          ref={cardsRef}
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className={`bento-card group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6 transition-all duration-500 hover:border-white/[0.12] hover:bg-white/[0.04] ${feature.span}`}
              whileHover={{ y: -4, transition: { duration: 0.3 } }}
            >
              {/* Hover gradient border glow */}
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-emerald-500/10 via-transparent to-cyan-500/10 pointer-events-none" />

              <div className="relative z-10 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <feature.icon className="h-5 w-5 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>

                {feature.image && (
                  <div className="mt-6 flex-1 relative rounded-lg overflow-hidden border border-white/[0.06]">
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

  return (
    <section ref={sectionRef} className="relative py-24 sm:py-32 bg-[#0a0a0a] overflow-hidden">
      <DotGrid />
      <GlowOrb x="70%" y="50%" color="teal" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <div>
            <p className="ai-text text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-4">
              Intelligence Artificielle
            </p>
            <h2 className="ai-text text-4xl sm:text-5xl font-bold text-white tracking-tight mb-6">
              Propulse par{' '}
              <GradientText>l'Intelligence Artificielle</GradientText>
            </h2>
            <p className="ai-text text-lg text-zinc-400 leading-relaxed mb-8">
              Notre IA analyse, genere et corrige vos examens avec une precision
              inegalee. De la creation d'epreuves a la correction automatique,
              chaque processus est optimise pour vous faire gagner un temps precieux.
            </p>
            <div className="ai-text flex flex-col gap-4">
              {[
                { icon: Cpu, text: 'Modeles entraines sur des millions de copies' },
                { icon: Sparkles, text: 'Generation de contenu contextuel adapte' },
                { icon: Shield, text: 'Donnees protegees et confidentielles' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10">
                    <item.icon className="h-4 w-4 text-emerald-400" />
                  </div>
                  <span className="text-sm text-zinc-300">{item.text}</span>
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
      title: 'Importez',
      description: 'Uploadez vos examens ou laissez l\'IA les generer automatiquement.',
    },
    {
      number: '02',
      icon: Users,
      title: 'Administrez',
      description: 'Organisez les sessions, assignez les surveillants et securisez les epreuves.',
    },
    {
      number: '03',
      icon: BarChart3,
      title: 'Analysez',
      description: 'Obtenez des resultats instantanes avec des insights powers par l\'IA.',
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
    <section ref={sectionRef} className="relative py-24 sm:py-32 bg-[#09090b] overflow-hidden">
      <DotGrid />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-4">
            Comment ca marche
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Simple comme <GradientText>1, 2, 3</GradientText>
          </h2>
        </div>

        <div className="relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-1/2 left-[16%] right-[16%] h-px bg-gradient-to-r from-emerald-500/30 via-teal-400/40 to-cyan-400/30 -translate-y-1/2">
            <div ref={lineRef} className="h-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 origin-left" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
            {steps.map((step, i) => (
              <div key={i} className="step-item relative flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm flex items-center justify-center">
                    <step.icon className="h-8 w-8 text-emerald-400" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-emerald-500 text-black text-xs font-bold flex items-center justify-center">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-[260px]">
                  {step.description}
                </p>
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
    { value: 50000, suffix: '+', label: 'Examens corriges' },
    { value: 99.7, suffix: '%', label: 'Precision IA' },
    { value: 200, suffix: '+', label: 'Institutions' },
    { value: 15, suffix: 'min', label: 'Temps moyen' },
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
    <section ref={sectionRef} className="relative py-20 bg-gradient-to-b from-[#09090b] via-emerald-950/20 to-[#09090b] overflow-hidden">
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div key={i} className="relative flex flex-col items-center text-center group">
              {/* Glow behind number */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-emerald-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden />

              <span
                ref={(el) => { countersRef.current[i] = el }}
                className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-2"
              >
                {0}
              </span>
              <span className="text-emerald-400 text-sm font-semibold mb-1">{stat.suffix}</span>
              <span className="text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</span>
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
    })
    return () => ctx.revert()
  }, [])

  const callouts = [
    { position: 'top-[15%] left-[8%]', text: 'Analytics en temps reel' },
    { position: 'top-[60%] left-[5%]', text: 'Gestion des epreuves' },
    { position: 'top-[20%] right-[5%]', text: 'IA Integration' },
    { position: 'top-[70%] right-[8%]', text: 'Rapports detailles' },
  ]

  return (
    <section ref={sectionRef} className="relative py-24 sm:py-32 bg-[#0a0a0a] overflow-hidden">
      <DotGrid />
      <GlowOrb x="50%" y="50%" color="emerald" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-4">
            Centre de commande
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight">
            Votre <GradientText>Centre de Commande</GradientText>
          </h2>
        </div>

        <div className="relative">
          {/* Callouts */}
          {callouts.map((callout, i) => (
            <div
              key={i}
              className={`absolute ${callout.position} hidden lg:flex items-center gap-2 z-20`}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <span className="text-xs text-zinc-400 font-medium whitespace-nowrap px-2 py-1 bg-[#0a0a0a]/80 rounded border border-white/[0.06]">
                {callout.text}
              </span>
            </div>
          ))}

          <div ref={imageRef} className="relative rounded-xl border border-white/[0.08] overflow-hidden shadow-2xl shadow-emerald-500/5">
            <img
              src="/hero-dashboard.png"
              alt="SECT Dashboard - Vue d'ensemble"
              className="w-full h-auto block"
            />
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
      description: 'Pour les petites institutions qui debutent.',
      features: ['Jusqu\'a 100 etudiants', '5 examens/mois', 'Correction automatique', 'Support email'],
      popular: false,
    },
    {
      name: 'Professionnel',
      price: '1299',
      description: 'Pour les institutions en croissance.',
      features: [
        'Jusqu\'a 2 000 etudiants',
        'Examens illimites',
        'IA Generative avancee',
        'Anti-fraude complet',
        'Analytics detailles',
        'Support prioritaire 24/7',
      ],
      popular: true,
    },
    {
      name: 'Entreprise',
      price: 'Sur mesure',
      description: 'Pour les grandes universites.',
      features: [
        'Etudiants illimites',
        'Tout du plan Pro',
        'Deploiement on-premise',
        'SSO & Integration SI',
        'SLA garanti 99.9%',
        'Account manager dedie',
      ],
      popular: false,
    },
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
    <section id="tarifs" ref={sectionRef} className="relative py-24 sm:py-32 bg-[#09090b] overflow-hidden">
      <DotGrid />
      <GlowOrb x="50%" y="30%" color="emerald" />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-4">
            Tarifs
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Un plan pour chaque{' '}
            <GradientText>ambition</GradientText>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`pricing-card relative rounded-xl border backdrop-blur-sm p-8 transition-all duration-500 ${
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

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                <p className="text-sm text-zinc-400">{plan.description}</p>
              </div>

              <div className="mb-6">
                {plan.price === 'Sur mesure' ? (
                  <span className="text-3xl font-bold text-white">Sur mesure</span>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    <span className="text-sm text-zinc-500">MAD/mois</span>
                  </div>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-sm text-zinc-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <MagneticButton
                className={`w-full rounded-lg font-semibold ${
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
      quote: "SECT a revolutionne notre facon de gerer les examens. La correction automatique nous fait gagner des jours entiers.",
      stars: 5,
    },
    {
      initials: 'MK',
      name: 'Prof. Mohammed Khalil',
      role: 'Doyen, Faculte des Sciences',
      quote: "L'anti-fraude integre nous a donne une tranquillite d'esprit totale pendant les sessions d'examen.",
      stars: 5,
    },
    {
      initials: 'SF',
      name: 'Sara Fassi',
      role: 'Responsable Pedagogique',
      quote: "Les analytics en temps reel nous permettent d'identifier immediatement les etudiants en difficulte.",
      stars: 5,
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
    <section id="temoignages" ref={sectionRef} className="relative py-24 sm:py-32 bg-[#0a0a0a] overflow-hidden">
      <DotGrid />
      <GlowOrb x="70%" y="40%" color="teal" />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-4">
            Temoignages
          </p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Ce qu'ils en <GradientText>disent</GradientText>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="testimonial-card rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-white/[0.12] hover:bg-white/[0.04]"
            >
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: t.stars }).map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-emerald-400 text-emerald-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <span className="text-xs font-bold text-emerald-400">{t.initials}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-zinc-500">{t.role}</p>
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

  return (
    <section ref={sectionRef} className="relative py-24 sm:py-32 bg-[#09090b] overflow-hidden">
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
        <h2 className="cta-reveal text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight mb-6">
          Pret a transformer vos{' '}
          <GradientText>examens ?</GradientText>
        </h2>
        <p className="cta-reveal text-lg text-zinc-400 mb-10 max-w-2xl mx-auto">
          Rejoignez les institutions qui ont deja adopte la plateforme d&apos;examen la plus avancee.
        </p>
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
  const columns = [
    {
      title: 'Produit',
      links: ['Fonctionnalites', 'Tarifs', 'Securite', 'Roadmap'],
    },
    {
      title: 'Ressources',
      links: ['Documentation', 'Blog', 'Guides', 'API'],
    },
    {
      title: 'Entreprise',
      links: ['A propos', 'Carrieres', 'Contact', 'Partenaires'],
    },
    {
      title: 'Legal',
      links: ['Confidentialite', 'CGU', 'Cookies', 'RGPD'],
    },
  ]

  return (
    <footer className="relative bg-[#09090b] border-t border-white/[0.04]">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Logo column */}
          <div className="col-span-2 md:col-span-1">
            <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              SECT
            </span>
            <p className="text-sm text-zinc-500 mt-3 leading-relaxed">
              La plateforme d&apos;examen propulssee par l&apos;intelligence artificielle.
            </p>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors duration-300"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.04] pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} SECT. Tous droits reserves.
          </p>
          <div className="flex items-center gap-4">
            {['Twitter', 'LinkedIn', 'GitHub'].map((social) => (
              <a
                key={social}
                href="#"
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors duration-300"
              >
                {social}
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
