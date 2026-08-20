'use client'

/**
 * SECT — Landing page (refonte 2026)
 * Design: navy profond + violet/indigo + orange CTA. Inspiré de Linear/Vercel/Notion.
 * Conversion-first copywriting, 12 sections, mobile-first, accessible.
 *
 * Auth-compatible: garde la signature LandingPage({ onLogin, onDemo }).
 */

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  motion,
  useInView,
  AnimatePresence,
  type Variants,
} from 'framer-motion'
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import {
  Sparkles,
  ArrowRight,
  Play,
  Check,
  X,
  Menu,
  Shield,
  Brain,
  Clock,
  Zap,
  FileText,
  Users,
  Lock,
  Code2,
  Wifi,
  MessageCircle,
  Server,
  Star,
  ChevronRight,
  GraduationCap,
  Mail,
  Send,
  Loader2,
  Lightbulb,
  Eye,
  Upload,
  Rocket,
  PenTool,
  AlertCircle,
  BookOpen,
  Headphones,
  Target,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar'

gsap.registerPlugin(ScrollTrigger)

/* ─── Types ─── */
interface LandingPageProps {
  onLogin: () => void
  onDemo: () => void
  onSignUp: () => void
}

/* ─── Magnetic Button ─── */
function MagneticButton({
  children,
  className = '',
  ...props
}: React.ComponentProps<typeof Button> & { children: ReactNode }) {
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
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      {...props}
    >
      {children}
    </Button>
  )
}

/* ─── Gradient text helpers ─── */
function VioletText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent ${className}`}>
      {children}
    </span>
  )
}
function WarmText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent ${className}`}>
      {children}
    </span>
  )
}

/* ─── Section fade-in wrapper ─── */
const fadeVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
}

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      variants={fadeVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ─── Decorative grid + glow ─── */
function DotGrid() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 opacity-[0.18] pointer-events-none"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(139,92,246,0.25) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)',
      }}
    />
  )
}

function GlowOrb({ x, y, color = 'violet' }: { x: string; y: string; color?: 'violet' | 'indigo' | 'orange' }) {
  const colorMap = {
    violet: 'rgba(139,92,246,0.18)',
    indigo: 'rgba(99,102,241,0.18)',
    orange: 'rgba(249,115,22,0.15)',
  }
  return (
    <div
      aria-hidden
      className="absolute pointer-events-none rounded-full blur-[100px]"
      style={{
        left: x,
        top: y,
        width: '420px',
        height: '420px',
        transform: 'translate(-50%, -50%)',
        background: colorMap[color],
      }}
    />
  )
}

/* ─── CountUp (animated number on scroll) ─── */
function CountUp({
  end,
  duration = 2000,
  suffix = '',
  prefix = '',
}: {
  end: number
  duration?: number
  suffix?: string
  prefix?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-50px' })
  const [val, setVal] = useState(0)

  useEffect(() => {
    if (!inView) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(end * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, end, duration])

  return (
    <span ref={ref}>
      {prefix}
      {val.toLocaleString('fr-FR')}
      {suffix}
    </span>
  )
}

/* ════════════════════════════════════════════════════════════════════
   NAVBAR
   ════════════════════════════════════════════════════════════════════ */
function Navbar({ onLogin }: { onLogin: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { label: 'Fonctionnalités', href: '#fonctionnalites' },
    { label: 'Démo', href: '#demo' },
    { label: 'Tarifs', href: '#tarifs' },
    { label: 'FAQ', href: '#faq' },
  ]

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-[#0A1628]/85 backdrop-blur-2xl border-b border-white/[0.06]'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <a href="#top" className="flex items-center gap-2.5 group">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
              <GraduationCap className="h-4.5 w-4.5 text-white" />
            </span>
            <span className="text-xl font-bold tracking-tight text-white">SECT</span>
          </a>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-zinc-400 hover:text-white transition-colors duration-300"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="ghost"
              className="text-sm text-zinc-300 hover:text-white hover:bg-white/10 transition-colors duration-200"
              onClick={onLogin}
            >
              Connexion
            </Button>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden text-white p-2 -mr-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Ouvrir le menu"
            aria-expanded={mobileOpen}
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
              className="md:hidden bg-[#0A1628]/95 backdrop-blur-2xl border-b border-white/[0.06] overflow-hidden"
            >
              <div className="px-6 py-4 flex flex-col gap-1">
                {links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="text-sm text-zinc-300 hover:text-white transition-colors py-2.5"
                    onClick={() => setMobileOpen(false)}
                  >
                    {l.label}
                  </a>
                ))}
                <Button
                  className="mt-2 w-full bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-lg"
                  onClick={() => {
                    setMobileOpen(false)
                    onLogin()
                  }}
                >
                  Connexion
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </>
  )
}

/* ════════════════════════════════════════════════════════════════════
   1. HERO
   ════════════════════════════════════════════════════════════════════ */
function HeroSection({ onDemo, onLogin, onSignUp }: { onDemo: () => void; onLogin: () => void; onSignUp: () => void }) {
  const headline = ['Vos copies corrigées', 'en 2 minutes.', 'Pas en 2 semaines.']

  return (
    <section id="top" className="relative overflow-hidden bg-[#0A1628] pt-28 pb-12 sm:pt-32 sm:pb-16">
      <DotGrid />
      <GlowOrb x="20%" y="25%" color="violet" />
      <GlowOrb x="80%" y="35%" color="indigo" />
      <GlowOrb x="50%" y="80%" color="orange" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        {/* Trust badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 mb-7 rounded-full border border-violet-400/20 bg-violet-500/10 backdrop-blur-sm"
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-300" />
          <span className="text-xs text-violet-200 font-medium tracking-wide">
            Conçu pour les universités d&apos;Afrique
          </span>
        </motion.div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6 text-white">
          {headline[0]}{' '}
          <br className="hidden sm:block" />
          <WarmText>{headline[1]}</WarmText>{' '}
          <span className="text-zinc-500">{headline[2]}</span>
        </h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="max-w-2xl mx-auto text-base sm:text-lg text-zinc-400 leading-relaxed mb-9"
        >
          SECT génère vos sujets par IA, surveille les examens en ligne, corrige
          automatiquement et accompagne vos étudiants 365j/an avec le compagnon de révision <span className="text-violet-300 font-semibold">ExamPrep IA</span>.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8"
        >
          <MagneticButton
            className="w-full sm:w-auto bg-orange-500 hover:bg-orange-400 text-white font-semibold px-7 py-3.5 text-base shadow-[0_0_30px_rgba(249,115,22,0.4)] hover:shadow-[0_0_50px_rgba(249,115,22,0.6)] transition-shadow duration-300 rounded-xl"
            onClick={onDemo}
          >
            Voir la démo
            <ArrowRight className="ml-2 h-5 w-5" />
          </MagneticButton>
          <MagneticButton
            variant="outline"
            className="w-full sm:w-auto border-white/[0.12] bg-white/[0.02] text-white hover:bg-white/[0.06] px-7 py-3.5 text-base rounded-xl"
            onClick={onSignUp}
          >
            <Play className="mr-2 h-4 w-4" />
            Essayer gratuitement
          </MagneticButton>
        </motion.div>

        {/* Trust line */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-8 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-violet-400" /> Déjà adopté par 15+ établissements
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-violet-400" /> 98% de précision IA
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-violet-400" /> Sans carte bancaire
          </span>
        </div>

        {/* Animated dashboard mockup */}
        <HeroMockup />

        {/* Live counter */}
        <Reveal className="mt-10" delay={0.2}>
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
            </span>
            <span className="text-sm text-zinc-400">
              Temps économisé par les enseignants :{' '}
              <span className="font-bold text-white">
                <CountUp end={1247} suffix=" h" />
              </span>
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ─── Animated hero dashboard mockup (pure CSS/JSX, no image) ─── */
function HeroMockup() {
  const [progress, setProgress] = useState(0)
  const [score, setScore] = useState(0)

  useEffect(() => {
    let raf = 0
    let start = 0
    const cycle = (now: number) => {
      if (!start) start = now
      const p = ((now - start) / 4000) % 1
      setProgress(Math.min(p * 100, 100))
      setScore(Math.min(Math.round(p * 18), 18))
      if (p > 0.97) {
        // pause then restart
        setTimeout(() => {
          start = 0
          raf = requestAnimationFrame(cycle)
        }, 1200)
        return
      }
      raf = requestAnimationFrame(cycle)
    }
    raf = requestAnimationFrame(cycle)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto max-w-4xl"
    >
      {/* Glow */}
      <div className="absolute -inset-4 bg-gradient-to-tr from-violet-500/20 via-indigo-500/10 to-orange-500/15 rounded-3xl blur-3xl" aria-hidden />

      {/* Browser frame */}
      <div className="relative rounded-2xl ring-1 ring-white/[0.08] shadow-2xl shadow-violet-500/10 overflow-hidden bg-[#0D1B30]">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-white/[0.06] bg-white/[0.02]">
          <span className="h-3 w-3 rounded-full bg-red-400/70" />
          <span className="h-3 w-3 rounded-full bg-amber-400/70" />
          <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
          <div className="ml-3 flex-1 max-w-xs h-5 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center px-2">
            <span className="text-[10px] text-zinc-500 font-mono">sect.app/exam/session</span>
          </div>
        </div>

        {/* Content */}
        <div className="grid sm:grid-cols-2 gap-0">
          {/* Question panel */}
          <div className="p-6 text-left border-b sm:border-b-0 sm:border-r border-white/[0.06]">
            <div className="flex items-center gap-2 mb-4">
              <Badge className="bg-violet-500/15 text-violet-300 border-violet-400/20 hover:bg-violet-500/15">
                QCM • Moyen
              </Badge>
              <span className="text-[10px] text-zinc-500">Généré par IA</span>
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed mb-4">
              La photosynthèse convertit l&apos;énergie lumineuse en quelle forme
              d&apos;énergie chimique ?
            </p>
            <div className="space-y-2">
              {['ATP et NADPH', 'ADP uniquement', 'Glucose pur', 'Oxygène libre'].map((opt, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
                    i === 0
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                      : 'border-white/[0.06] bg-white/[0.02] text-zinc-400'
                  }`}
                >
                  <span className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                    i === 0 ? 'border-emerald-400 bg-emerald-400/20' : 'border-white/20'
                  }`}>
                    {i === 0 && <Check className="h-2.5 w-2.5 text-emerald-300" />}
                  </span>
                  {opt}
                </div>
              ))}
            </div>
          </div>

          {/* AI correction panel */}
          <div className="p-6 text-left bg-[#0A1628]">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-violet-300" />
                <span className="text-xs text-zinc-300 font-medium">Correction IA en cours…</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-5">
              <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5">
                <span>Analyse des copies</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Live rows */}
            <div className="space-y-2 mb-5">
              {['Copie #042', 'Copie #043', 'Copie #044', 'Copie #045'].map((c, i) => {
                const done = progress > (i + 1) * 22
                return (
                  <div key={c} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">{c}</span>
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <Check className="h-3 w-3" /> Corrigée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-zinc-600">
                        <Loader2 className="h-3 w-3 animate-spin" /> En attente
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Score */}
            <div className="flex items-end justify-between pt-4 border-t border-white/[0.06]">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Note moyenne</p>
                <p className="text-2xl font-bold text-white">
                  {score}
                  <span className="text-sm text-zinc-500">/20</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Durée</p>
                <p className="text-sm font-semibold text-emerald-300">2 min 04 s</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <div className="absolute -right-3 sm:-right-5 top-1/3 px-3 py-1.5 bg-[#0A1628]/90 border border-violet-400/20 rounded-lg backdrop-blur-sm shadow-xl hidden sm:block">
        <div className="flex items-center gap-2">
          <Zap className="h-3 w-3 text-orange-400" />
          <span className="text-xs text-zinc-200 font-medium">200 copies / 2 min</span>
        </div>
      </div>
      <div className="absolute -left-3 sm:-left-5 bottom-1/4 px-3 py-1.5 bg-[#0A1628]/90 border border-indigo-400/20 rounded-lg backdrop-blur-sm shadow-xl hidden sm:block">
        <div className="flex items-center gap-2">
          <Shield className="h-3 w-3 text-indigo-400" />
          <span className="text-xs text-zinc-200 font-medium">Anti-fraude actif</span>
        </div>
      </div>
    </motion.div>
  )
}

/* ════════════════════════════════════════════════════════════════════
   2. TRUST BAR (animated stats)
   ════════════════════════════════════════════════════════════════════ */
function TrustBar() {
  const stats = [
    { value: 10000, suffix: '+', label: 'Copies corrigées', icon: FileText },
    { value: 15, suffix: '+', label: 'Universités partenaires', icon: Users },
    { value: 98, suffix: '%', label: 'Satisfaction enseignant', icon: Star },
    { value: 2, suffix: ' min', label: 'Correction moyenne', icon: Clock },
  ]

  return (
    <section className="relative py-10 sm:py-12 bg-[#0D1B30] border-y border-white/[0.05]">
      <div className="max-w-6xl mx-auto px-6">
        <Reveal>
          <p className="text-center text-xs uppercase tracking-[0.2em] text-zinc-500 mb-8 font-medium">
            Ils font confiance à SECT
          </p>
        </Reveal>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.1}>
              <div className="text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-400/15 mb-3">
                  <s.icon className="h-4.5 w-4.5 text-violet-300" />
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                  <CountUp end={s.value} suffix={s.suffix} />
                </div>
                <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   3. PROBLEM (empathy)
   ════════════════════════════════════════════════════════════════════ */
function ProblemSection() {
  const problems = [
    {
      icon: Clock,
      title: 'Vos week-ends passés à corriger',
      text: 'Des piles de copies qui ne finissent jamais. Vos samedis et dimanches sacrifiés sur l\'encre rouge.',
    },
    {
      icon: AlertCircle,
      title: '3 semaines avant les résultats',
      text: 'Les étudiants s\'impatientent, réclament leurs notes. Le retard nuit à leur apprentissage.',
    },
    {
      icon: Shield,
      title: 'Fraudes et recompositions',
      text: 'Triche en ligne, copies identiques, contestations. Vous perdez des heures à gérer les litiges.',
    },
  ]

  return (
    <section className="relative py-12 sm:py-16 bg-[#0A1628] overflow-hidden">
      <GlowOrb x="50%" y="50%" color="indigo" />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-orange-400 font-semibold mb-3">
            Le problème
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Vous en avez assez de…
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {problems.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.12}>
              <div className="group h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 hover:border-orange-400/25 hover:bg-orange-500/[0.03] transition-all duration-300">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-400/15 mb-4 group-hover:scale-105 transition-transform">
                  <p.icon className="h-5 w-5 text-orange-300" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{p.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   4. SOLUTION (before / after)
   ════════════════════════════════════════════════════════════════════ */
function SolutionSection() {
  return (
    <section className="relative py-12 sm:py-16 bg-[#0D1B30] overflow-hidden">
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-violet-400 font-semibold mb-3">
            La solution
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Deux semaines de travail. <VioletText>Deux minutes.</VioletText>
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto text-sm sm:text-base">
            SECT transforme votre charge de correction en un simple clic. Voici ce qui change.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Before */}
          <Reveal>
            <div className="relative h-full rounded-2xl border border-white/[0.07] bg-[#0A1628] overflow-hidden">
              <div className="absolute top-4 left-4 z-10">
                <Badge className="bg-red-500/15 text-red-300 border-red-400/20 hover:bg-red-500/15">
                  Avant
                </Badge>
              </div>
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src="/before-grading.png"
                  alt="Enseignant épuisé entouré de piles de copies à corriger"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-5">
                <ul className="space-y-2 text-sm text-zinc-400">
                  {['Semaines de correction manuelle', 'Résultats en retard', 'Fatigue et charge mentale'].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <X className="h-4 w-4 text-red-400 shrink-0" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          {/* After */}
          <Reveal delay={0.12}>
            <div className="relative h-full rounded-2xl border border-violet-400/25 bg-gradient-to-b from-violet-500/[0.06] to-[#0A1628] overflow-hidden shadow-[0_0_40px_rgba(139,92,246,0.12)]">
              <div className="absolute top-4 left-4 z-10">
                <Badge className="bg-violet-500/20 text-violet-200 border-violet-400/30 hover:bg-violet-500/20">
                  Après SECT
                </Badge>
              </div>
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src="/after-dashboard.png"
                  alt="Enseignant détendu devant un dashboard d'analytics SECT"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-5">
                <ul className="space-y-2 text-sm text-zinc-300">
                  {['Correction en 2 minutes', 'Résultats publiés immédiatement', 'Temps libéré pour vos étudiants'].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   5. FEATURES (bento grid, benefit-driven)
   ════════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════
   EXAMPREP SHOWCASE (L'argument d'apprentissage continu par IA)
   ════════════════════════════════════════════════════════════════════ */
function ExamPrepShowcase() {
  return (
    <section className="relative py-14 sm:py-20 bg-gradient-to-b from-[#0A1628] via-[#0D1B30] to-[#0A1628] overflow-hidden border-y border-white/[0.06]">
      <DotGrid />
      <GlowOrb x="20%" y="40%" color="violet" />
      <GlowOrb x="80%" y="60%" color="indigo" />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-4 rounded-full border border-violet-400/30 bg-violet-500/15">
            <Sparkles className="h-4 w-4 text-violet-300" />
            <span className="text-xs font-bold text-violet-200 uppercase tracking-wider">
              Exclusivité SECT ExamPrep™
            </span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Au-delà de l&apos;évaluation : <VioletText>Un tuteur IA personnel 24/7</VioletText>
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            SECT ne se contente pas d&apos;évaluer. Il transforme chaque support de cours en un compagnon de révision interactif adapté au rythme de chaque étudiant.
          </p>
        </Reveal>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Card 1: SRS Flashcards */}
          <Reveal delay={0.1}>
            <div className="h-full rounded-2xl border border-violet-400/25 bg-white/[0.02] p-6 hover:border-violet-400/40 transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/15 border border-violet-400/20 text-violet-300 mb-5">
                  <Layers className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Fiches SRS & Répétition Spacée</h3>
                <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                  Algorithme intelligent qui planifie les révisions au moment exact où la mémoire flanche pour ancrer les connaissances durablement.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#0A1628] border border-white/[0.06] text-xs space-y-2">
                <div className="flex justify-between items-center text-zinc-400">
                  <span>Mémoire à long terme</span>
                  <span className="text-emerald-400 font-bold">92% rétention</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-emerald-400 w-[92%]" />
                </div>
              </div>
            </div>
          </Reveal>

          {/* Card 2: RAG Q&A sur cours */}
          <Reveal delay={0.2}>
            <div className="h-full rounded-2xl border border-indigo-400/25 bg-white/[0.02] p-6 hover:border-indigo-400/40 transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-400/20 text-indigo-300 mb-5">
                  <BookOpen className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Q&A RAG sur vos Propres Cours</h3>
                <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                  L&apos;étudiant interroge l&apos;IA sur son polycopié PDF ou Word et obtient des réponses sourcées tirées directement du cours de son professeur.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#0A1628] border border-white/[0.06] text-xs">
                <p className="text-violet-300 font-medium mb-1">« Peux-tu m&apos;expliquer le théorème p.42 ? »</p>
                <p className="text-zinc-400 italic">« D&apos;après le chapitre 3 (p.42 de votre cours), le principe s&apos;applique ainsi... »</p>
              </div>
            </div>
          </Reveal>

          {/* Card 3: Résumés Audio & Lacunes */}
          <Reveal delay={0.3}>
            <div className="h-full rounded-2xl border border-amber-400/25 bg-white/[0.02] p-6 hover:border-amber-400/40 transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-400/20 text-amber-300 mb-5">
                  <Headphones className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Résumés Audio & Radar de Lacunes</h3>
                <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                  Génération de podcasts de révision pour écouter ses cours en mobilité et détection automatique des chapitres fragiles à retravailler.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-[#0A1628] border border-white/[0.06] flex items-center gap-3 text-xs">
                <Headphones className="h-5 w-5 text-amber-400 shrink-0" />
                <div>
                  <div className="text-white font-medium">Podcast de révision - Chapitre 4</div>
                  <div className="text-zinc-500">Audio Synthétisé IA • 4 min 30 s</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function FeaturesBento() {
  const features = [
    {
      icon: Zap,
      title: 'Générez vos sujets en 60 secondes',
      text: 'Décrivez votre cours, l\'IA produit un sujet complet et cohérent, prêt à diffuser.',
      span: '',
      glow: 'violet',
    },
    {
      icon: Brain,
      title: 'Corrigez 200 copies pendant votre café',
      text: 'QCM, questions ouvertes, code… la correction automatique est instantanée.',
      span: '',
      glow: 'indigo',
    },
    {
      icon: Target,
      title: 'ExamPrep™ — Révision guidée par IA',
      text: 'Fiches SRS, tuteur RAG sur cours, résumés audio et détection des lacunes.',
      span: '',
      glow: 'violet',
    },
    {
      icon: Shield,
      title: 'Détectez la fraude avant qu\'elle n\'arrive',
      text: 'Proctoring IA, détection de similarité et surveillance vidéo en temps réel.',
      span: '',
      glow: 'orange',
    },
    {
      icon: Code2,
      title: 'Évaluez le code avec un éditeur intégré',
      text: 'Éditeur Monaco, exécution Python/JS et tableur Excel. Unique sur le marché.',
      span: '',
      glow: 'violet',
    },
    {
      icon: Rocket,
      title: 'Publiez les résultats en un clic',
      text: 'Notes, certificats et badges générés et envoyés automatiquement aux étudiants.',
      span: '',
      glow: 'orange',
    },
  ]

  const glowMap: Record<string, string> = {
    violet: 'hover:border-violet-400/30 hover:shadow-[0_0_40px_rgba(139,92,246,0.12)]',
    indigo: 'hover:border-indigo-400/30 hover:shadow-[0_0_40px_rgba(99,102,241,0.12)]',
    orange: 'hover:border-orange-400/30 hover:shadow-[0_0_40px_rgba(249,115,22,0.12)]',
  }
  const iconBg: Record<string, string> = {
    violet: 'bg-violet-500/10 border-violet-400/15 text-violet-300',
    indigo: 'bg-indigo-500/10 border-indigo-400/15 text-indigo-300',
    orange: 'bg-orange-500/10 border-orange-400/15 text-orange-300',
  }

  return (
    <section id="fonctionnalites" className="relative py-12 sm:py-16 bg-[#0A1628] overflow-hidden">
      <DotGrid />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-violet-400 font-semibold mb-3">
            Fonctionnalités
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Tout ce qu&apos;il faut pour <VioletText>évaluer sans effort</VioletText>
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto text-sm sm:text-base">
            Pensé pour les bénéfices concrets, pas pour la technologie. Chaque fonction vous fait gagner du temps.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.08} className={f.span}>
              <div className={`group h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-all duration-300 hover:-translate-y-1 ${glowMap[f.glow]}`}>
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border mb-4 ${iconBg[f.glow]} group-hover:scale-110 transition-transform`}>
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   6. HOW IT WORKS (3 steps)
   ════════════════════════════════════════════════════════════════════ */
function HowItWorks() {
  const steps = [
    {
      icon: Upload,
      step: '01',
      title: 'Importez vos cours',
      text: 'Glissez votre PDF, DOCX ou syllabus. SECT analyse le contenu en quelques secondes.',
    },
    {
      icon: Brain,
      step: '02',
      title: 'L\'IA génère et surveille',
      text: 'Sujets créés, examens diffusés, copies corrigées et fraude détectée — automatiquement.',
    },
    {
      icon: Rocket,
      step: '03',
      title: 'Vous publiez les résultats',
      text: 'Notes, certificats et badges envoyés en un clic. Vous gardez le contrôle final.',
    },
  ]

  return (
    <section className="relative py-12 sm:py-16 bg-[#0D1B30] overflow-hidden">
      <GlowOrb x="50%" y="40%" color="violet" />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-orange-400 font-semibold mb-3">
            Comment ça marche
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Trois étapes. <WarmText>Zéro friction.</WarmText>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-violet-400/30 to-transparent" aria-hidden />

          {steps.map((s, i) => (
            <Reveal key={s.step} delay={i * 0.15}>
              <div className="relative text-center">
                <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-[#0A1628] border border-violet-400/20 mb-5 shadow-[0_0_30px_rgba(139,92,246,0.15)]">
                  <s.icon className="h-7 w-7 text-violet-300" />
                  <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-md bg-orange-500 text-[10px] font-bold text-white">
                    {s.step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{s.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   7. INTERACTIVE DEMO (live QCM generation via LLM)
   ════════════════════════════════════════════════════════════════════ */
interface QCM {
  question: string
  options: string[]
  correctIndex: number
  difficulty: 'Facile' | 'Moyen' | 'Difficile'
  explanation: string
}

function InteractiveDemo() {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [qcm, setQcm] = useState<QCM | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')

  const examples = ['La photosynthèse', 'Le droit constitutionnel', 'Les algorithmes de tri', 'La balance des paiements']

  const generate = async (t?: string) => {
    const subject = (t ?? topic).trim()
    if (!subject) return
    setLoading(true)
    setError('')
    setQcm(null)
    setSelected(null)
    if (t) setTopic(t)
    try {
      const res = await fetch('/api/landing-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: subject }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Erreur')
      setQcm(data.qcm)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  const diffColor: Record<string, string> = {
    Facile: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
    Moyen: 'bg-amber-500/15 text-amber-300 border-amber-400/20',
    Difficile: 'bg-red-500/15 text-red-300 border-red-400/20',
  }

  return (
    <section id="demo" className="relative py-12 sm:py-16 bg-[#0A1628] overflow-hidden">
      <DotGrid />
      <GlowOrb x="50%" y="50%" color="orange" />
      <div className="relative z-10 max-w-4xl mx-auto px-6">
        <Reveal className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-orange-400 font-semibold mb-3">
            Démo interactive
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Voyez l&apos;IA <WarmText>générer un QCM en direct</WarmText>
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto text-sm sm:text-base">
            Tapez un sujet de cours. L&apos;IA crée instantanément une question de niveau universitaire.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0D1B30] p-6 sm:p-8 shadow-2xl shadow-violet-500/5">
            {/* Input */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && generate()}
                placeholder="Ex : La photosynthèse, le droit civil, les matrices…"
                className="flex-1 h-12 bg-white/[0.03] border-white/[0.1] text-white placeholder:text-zinc-500 focus-visible:border-violet-400/50 focus-visible:ring-violet-400/20"
                aria-label="Sujet du cours"
              />
              <MagneticButton
                className="h-12 bg-orange-500 hover:bg-orange-400 text-white font-semibold px-6 rounded-xl shadow-[0_0_24px_rgba(249,115,22,0.3)]"
                onClick={() => generate()}
                disabled={loading || !topic.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Génération…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Générer
                  </>
                )}
              </MagneticButton>
            </div>

            {/* Example chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              {examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => generate(ex)}
                  disabled={loading}
                  className="px-3 py-1 rounded-full text-xs border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-violet-300 hover:border-violet-400/25 transition-colors disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>

            {/* Result */}
            <div className="min-h-[180px]">
              {error && (
                <div className="flex items-center gap-2 p-4 rounded-xl border border-red-400/20 bg-red-500/5 text-red-300 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {loading && !qcm && (
                <div className="space-y-3 animate-pulse">
                  <div className="h-5 w-3/4 rounded bg-white/[0.05]" />
                  <div className="h-10 rounded-lg bg-white/[0.04]" />
                  <div className="h-10 rounded-lg bg-white/[0.04]" />
                  <div className="h-10 rounded-lg bg-white/[0.04]" />
                </div>
              )}

              {qcm && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className={`${diffColor[qcm.difficulty]} border`}>{qcm.difficulty}</Badge>
                    <span className="text-[10px] text-zinc-500 inline-flex items-center gap-1">
                      <Brain className="h-3 w-3 text-violet-400" /> Généré par IA
                    </span>
                  </div>
                  <p className="text-base text-zinc-100 font-medium mb-4">{qcm.question}</p>
                  <div className="space-y-2 mb-4">
                    {qcm.options.map((opt, i) => {
                      const isCorrect = i === qcm.correctIndex
                      const isPicked = i === selected
                      const reveal = selected !== null
                      return (
                        <button
                          key={i}
                          onClick={() => selected === null && setSelected(i)}
                          disabled={reveal}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm border text-left transition-colors ${
                            reveal && isCorrect
                              ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                              : reveal && isPicked && !isCorrect
                              ? 'border-red-400/40 bg-red-500/10 text-red-100'
                              : 'border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-violet-400/30 hover:bg-violet-500/5'
                          } ${reveal ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[10px] font-bold shrink-0">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="flex-1">{opt}</span>
                          {reveal && isCorrect && <Check className="h-4 w-4 text-emerald-300" />}
                          {reveal && isPicked && !isCorrect && <X className="h-4 w-4 text-red-300" />}
                        </button>
                      )
                    })}
                  </div>
                  {selected !== null && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="flex items-start gap-2 p-3 rounded-lg bg-violet-500/[0.07] border border-violet-400/15 text-sm text-zinc-300"
                    >
                      <Lightbulb className="h-4 w-4 text-violet-300 shrink-0 mt-0.5" />
                      <span>{qcm.explanation}</span>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {!loading && !qcm && !error && (
                <div className="flex flex-col items-center justify-center py-10 text-center text-zinc-500">
                  <PenTool className="h-8 w-8 mb-3 text-zinc-600" />
                  <p className="text-sm">Saisissez un sujet et cliquez sur « Générer ».</p>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   8. TESTIMONIALS
   ════════════════════════════════════════════════════════════════════ */
function Testimonials() {
  const items = [
    {
      quote: 'Je récupère mes samedis. 200 copies corrigées avant ma pause café.',
      name: 'Dr. Aminata Diallo',
      role: 'Maître de conférences',
      org: 'Université Cheikh Anta Diop',
      initials: 'AD',
      color: 'from-violet-500 to-indigo-600',
    },
    {
      quote: 'Les résultats tombent en 48 h au lieu de 3 semaines. Les étudiants adorent.',
      name: 'Prof. Kwame Mensah',
      role: 'Doyen de faculté',
      org: 'KNUST, Kumasi',
      initials: 'KM',
      color: 'from-orange-500 to-amber-600',
    },
    {
      quote: 'Zéro fraude cette session. Le proctoring IA a tout changé pour nous.',
      name: 'Dr. Fatou Touré',
      role: 'Responsable pédagogique',
      org: 'Université de Bamako',
      initials: 'FT',
      color: 'from-indigo-500 to-violet-600',
    },
  ]

  return (
    <section className="relative py-12 sm:py-16 bg-[#0D1B30] overflow-hidden">
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-violet-400 font-semibold mb-3">
            Témoignages
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Ils ont <VioletText>transformé leurs évaluations</VioletText>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {items.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.12}>
              <div className="h-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 flex flex-col">
                <div className="flex gap-0.5 mb-4">
                  {[0, 1, 2, 3, 4].map((s) => (
                    <Star key={s} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <blockquote className="text-base text-zinc-100 leading-relaxed mb-6 flex-1">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="flex items-center gap-3 pt-4 border-t border-white/[0.06]">
                  <Avatar className="h-10 w-10 border border-white/10">
                    <AvatarFallback className={`bg-gradient-to-br ${t.color} text-white text-xs font-semibold`}>
                      {t.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-semibold text-white">{t.name}</div>
                    <div className="text-xs text-zinc-500">{t.role} · {t.org}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="text-center text-[11px] text-zinc-600 mt-6">
          Témoignages illustratifs — remplacez-les par vos vrais retours établissements.
        </p>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   9. PRICING (monthly/annual toggle, FCFA)
   ════════════════════════════════════════════════════════════════════ */
function PricingSection({ onDemo }: { onDemo: () => void }) {
  const fmt = (n: number) => n.toLocaleString('fr-FR').replace(/\u202F/g, ' ')

  // SECT-DEMO-REQUEST : dialog de demande de démo B2B (formulaire + envoi email admin)
  const [demoOpen, setDemoOpen] = useState(false)
  const [demoSubmitting, setDemoSubmitting] = useState(false)
  const [demoDone, setDemoDone] = useState(false)
  const [demoForm, setDemoForm] = useState({
    nom: '', email: '', telephone: '', etablissementNom: '', ville: '', nbEtudiants: '', message: '',
  })

  const handleDemoSubmit = async () => {
    if (!demoForm.nom.trim() || !demoForm.email.includes('@') || !demoForm.etablissementNom.trim() || !demoForm.nbEtudiants.trim()) return
    setDemoSubmitting(true)
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demoForm),
      })
      if (res.ok) {
        setDemoDone(true)
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data?.error || 'Erreur lors de l\'envoi')
      }
    } catch {
      alert('Erreur de connexion')
    } finally {
      setDemoSubmitting(false)
    }
  }

  const openDemoDialog = () => {
    setDemoDone(false)
    setDemoForm({ nom: '', email: '', telephone: '', etablissementNom: '', ville: '', nbEtudiants: '', message: '' })
    setDemoOpen(true)
  }

  // ─── B2C : Enseignants freelance ───
  const plansB2C = [
    {
      name: 'Prof Solo',
      tagline: 'Pour découvrir SECT',
      priceMain: 'Gratuit',
      priceSuffix: '',
      priceSub: '',
      features: [
        '1 enseignant',
        '2 classes / groupes',
        '40 étudiants max',
        'Génération IA : 3 épreuves/mois',
        'Correction IA : 3 épreuves/mois',
        'Export PDF inclus',
      ],
      popular: false,
      cta: 'Commencer gratuitement',
      href: '/souscrire-b2c?plan=prof-solo',
    },
    {
      name: 'Prof Premium',
      tagline: 'Pour gagner du temps avec l\'IA',
      priceMain: '4 900',
      priceSuffix: 'FCFA / mois',
      priceSub: '49 000 FCFA / an',
      features: [
        '1 enseignant',
        'Classes illimitées',
        '200 étudiants max',
        'Génération IA illimitée',
        'Correction IA illimitée',
        'Export PDF + support prioritaire',
      ],
      popular: true,
      cta: 'S\'abonner maintenant',
      href: '/souscrire-b2c?plan=prof-premium',
    },
  ]

  // ─── B2B : Institutions (modèle capitation) ───
  const planB2B = {
    name: 'Institutionnel',
    tagline: 'Universités, grandes écoles, centres de formation',
    priceMain: '900',
    priceSuffix: 'FCFA / étudiant / an',
    priceSub: 'Plancher 50 étudiants (45 000 FCFA / an)',
    features: [
      'Enseignants illimités',
      'Filières illimitées',
      'Étudiants illimités',
      'Génération IA illimitée',
      'Correction IA illimitée',
      'Proctoring anti-fraude inclus',
      'Support téléphone dédié',
      'Logs d\'audit pour la direction',
    ],
    popular: true,
    cta: 'Demander une démo',
    exemple: 'École de 1 000 étudiants = 900 000 FCFA / an',
  }

  return (
    <section id="tarifs" className="relative py-12 sm:py-16 bg-[#0A1628] overflow-hidden">
      <DotGrid />
      <GlowOrb x="50%" y="30%" color="violet" />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-orange-400 font-semibold mb-3">
            Tarifs
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Un plan pour chaque <VioletText>ambition</VioletText>
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto text-sm sm:text-base">
            Tarifs en Franc CFA. Sans carte bancaire pour démarrer.
          </p>
        </Reveal>

        {/* ─── B2C : Enseignants freelance ─── */}
        <Reveal className="text-center mb-5 mt-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-400/30 bg-violet-500/10">
            <GraduationCap className="h-4 w-4 text-violet-300" />
            <span className="text-xs font-semibold text-violet-200 uppercase tracking-wider">
              Enseignants freelance & indépendants (B2C)
            </span>
          </div>
          <p className="mt-3 text-xs text-zinc-500 max-w-xl mx-auto">
            Pour le professeur dont l&apos;établissement n&apos;est pas équipé. Sans engagement, annulable à tout moment.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-5 items-start max-w-3xl mx-auto mb-12">
          {plansB2C.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.1}>
              <div
                className={`relative h-full rounded-2xl border p-6 transition-all duration-300 ${
                  plan.popular
                    ? 'border-violet-400/40 bg-gradient-to-b from-violet-500/[0.07] to-[#0D1B30] shadow-[0_0_50px_rgba(139,92,246,0.15)]'
                    : 'border-white/[0.07] bg-white/[0.02]'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-orange-500 rounded-full">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">⭐ Populaire</span>
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                <p className="text-xs text-zinc-400 mb-4">{plan.tagline}</p>
                <div className="mb-5 mt-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold text-white">{plan.priceMain}</span>
                    {plan.priceSuffix && <span className="text-sm text-zinc-500">{plan.priceSuffix}</span>}
                  </div>
                  {plan.priceSub && (
                    <p className="text-[11px] text-emerald-400 mt-1">{plan.priceSub}</p>
                  )}
                </div>
                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                      <Check className="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href={plan.href}>
                  <MagneticButton
                    className={`w-full rounded-lg font-semibold text-sm ${
                      plan.popular
                        ? 'bg-orange-500 hover:bg-orange-400 text-white shadow-[0_0_24px_rgba(249,115,22,0.3)]'
                        : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.1]'
                    }`}
                  >
                    {plan.cta}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </MagneticButton>
                </a>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ─── B2B : Institutions (modèle capitation) ─── */}
        <Reveal className="text-center mb-5">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-orange-400/30 bg-orange-500/10">
            <Server className="h-4 w-4 text-orange-300" />
            <span className="text-xs font-semibold text-orange-200 uppercase tracking-wider">
              Institutions (B2B) — modèle capitation
            </span>
          </div>
          <p className="mt-3 text-xs text-zinc-500 max-w-xl mx-auto">
            Pour les universités, grandes écoles et centres de formation. Facturation par étudiant actif.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="relative h-full rounded-2xl border border-orange-400/40 bg-gradient-to-b from-orange-500/[0.07] to-[#0D1B30] p-7 max-w-3xl mx-auto shadow-[0_0_50px_rgba(249,115,22,0.15)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-orange-500 rounded-full">
              <span className="text-xs font-bold text-white uppercase tracking-wider">⭐ Populaire</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-semibold text-white mb-1">{planB2B.name}</h3>
                <p className="text-xs text-zinc-400">{planB2B.tagline}</p>
              </div>
              <div className="text-left sm:text-right">
                <div className="flex items-baseline gap-1.5 sm:justify-end">
                  <span className="text-4xl font-bold text-white">{planB2B.priceMain}</span>
                  <span className="text-sm text-zinc-500">{planB2B.priceSuffix}</span>
                </div>
                <p className="text-[11px] text-emerald-400 mt-1">{planB2B.priceSub}</p>
              </div>
            </div>
            <ul className="grid sm:grid-cols-2 gap-2.5 mb-6">
              {planB2B.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="rounded-lg bg-white/[0.04] border border-white/[0.08] p-3 mb-5">
              <p className="text-xs text-zinc-300 flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                <span className="font-medium text-white">Exemple :</span> {planB2B.exemple}
              </p>
            </div>
            <a href="/souscrire-b2b" className="block">
              <MagneticButton
                className="w-full rounded-lg font-semibold text-sm bg-orange-500 hover:bg-orange-400 text-white shadow-[0_0_24px_rgba(249,115,22,0.3)]"
              >
                {planB2B.cta}
                <ChevronRight className="ml-1 h-4 w-4" />
              </MagneticButton>
            </a>
          </div>
        </Reveal>
      </div>

      {/* SECT-DEMO-REQUEST : Dialog demande de démo B2B */}
      <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {demoDone ? (
            <div className="text-center py-8">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Check className="h-8 w-8 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Demande envoyée !</h3>
              <p className="text-sm text-zinc-400 mb-6">
                Merci pour votre intérêt. Notre équipe vous contactera dans les 24h pour planifier votre démonstration personnalisée.
              </p>
              <Button
                className="bg-orange-500 hover:bg-orange-400 text-white"
                onClick={() => setDemoOpen(false)}
              >
                Fermer
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                  <Server className="h-5 w-5 text-orange-400" />
                  Demander une démo B2B
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Découvrez SECT pour votre institution. Notre équipe vous contactera dans les 24h.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 font-medium">Nom complet *</label>
                    <Input
                      value={demoForm.nom}
                      onChange={(e) => setDemoForm({ ...demoForm, nom: e.target.value })}
                      placeholder="Dr. Jean Kouassi"
                      className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 font-medium">Email *</label>
                    <Input
                      type="email"
                      value={demoForm.email}
                      onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })}
                      placeholder="directeur@ecole.edu"
                      className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 font-medium">Téléphone</label>
                    <Input
                      value={demoForm.telephone}
                      onChange={(e) => setDemoForm({ ...demoForm, telephone: e.target.value })}
                      placeholder="+225 07 00 00 00"
                      className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 font-medium">Ville</label>
                    <Input
                      value={demoForm.ville}
                      onChange={(e) => setDemoForm({ ...demoForm, ville: e.target.value })}
                      placeholder="Abidjan"
                      className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 font-medium">Nom de l'établissement *</label>
                  <Input
                    value={demoForm.etablissementNom}
                    onChange={(e) => setDemoForm({ ...demoForm, etablissementNom: e.target.value })}
                    placeholder="Université d'Abidjan"
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 font-medium">Nombre d'étudiants *</label>
                  <Input
                    value={demoForm.nbEtudiants}
                    onChange={(e) => setDemoForm({ ...demoForm, nbEtudiants: e.target.value })}
                    placeholder="ex: 1000"
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
                  />
                  <p className="text-[11px] text-zinc-500">Tarif capitation : 900 FCFA / étudiant / an (plancher 50).</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 font-medium">Message (optionnel)</label>
                  <textarea
                    value={demoForm.message}
                    onChange={(e) => setDemoForm({ ...demoForm, message: e.target.value })}
                    placeholder="Vos besoins spécifiques, questions..."
                    rows={3}
                    className="w-full rounded-md bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <Button
                  className="w-full bg-orange-500 hover:bg-orange-400 text-white font-semibold mt-2"
                  disabled={demoSubmitting || !demoForm.nom.trim() || !demoForm.email.includes('@') || !demoForm.etablissementNom.trim() || !demoForm.nbEtudiants.trim()}
                  onClick={handleDemoSubmit}
                >
                  {demoSubmitting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Envoi...</>
                  ) : (
                    <>Envoyer ma demande <Send className="h-4 w-4 ml-2" /></>
                  )}
                </Button>
                <p className="text-[11px] text-zinc-500 text-center">
                  Réponse sous 24h ouvrées. Sans engagement.
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   10. FAQ (accordion, objection handling)
   ════════════════════════════════════════════════════════════════════ */
function FAQSection() {
  const faqs = [
    {
      q: 'Mes données sont-elles sécurisées ?',
      a: 'Oui. Vos données sont chiffrées (AES-256), hébergées sur une infrastructure conforme aux standards. Un hébergement local en Afrique est disponible sur le plan Entreprise pour la souveraineté des données.',
    },
    {
      q: 'L\'IA peut-elle se tromper ?',
      a: 'L\'IA atteint 98 % de précision sur les QCM et questions structurées. Pour les questions ouvertes, vous gardez toujours le contrôle final : vous validez et ajustez les notes avant publication.',
    },
    {
      q: 'Ça marche avec une connexion 3G ?',
      a: 'Oui. SECT est optimisé pour les réseaux mobiles africains (3G/4G). L\'interface est légère et un mode hors-ligne partiel permet aux étudiants de composer même en cas de coupure, avec synchronisation au retour du réseau.',
    },
    {
      q: 'Puis-je essayer avant de payer ?',
      a: 'Absolument. L\'essai gratuit ne demande aucune carte bancaire. Vous pouvez tester toutes les fonctionnalités essentielles avant de vous engager.',
    },
    {
      q: 'Vos serveurs sont-ils en Afrique ?',
      a: 'Sur le plan Entreprise, nous proposons un déploiement on-premise ou cloud privé, avec hébergement local possible. Cela garantit la conformité réglementaire et des temps de réponse optimaux.',
    },
    {
      q: 'L\'IA gère-t-elle toutes les matières ?',
      a: 'L\'IA couvre la plupart des disciplines universitaires : sciences, droit, économie, langues, informatique. Pour les évaluations de code, un éditeur intégré exécute Python et JavaScript directement.',
    },
    {
      q: 'Que se passe-t-il en cas de coupure internet pendant l\'examen ?',
      a: 'La progression de l\'étudiant est sauvegardée automatiquement. Il peut reprendre là où il s\'est arrêté une fois la connexion rétablie, sans perte de données ni pénalité de temps.',
    },
  ]

  return (
    <section id="faq" className="relative py-12 sm:py-16 bg-[#0D1B30] overflow-hidden">
      <div className="relative z-10 max-w-3xl mx-auto px-6">
        <Reveal className="text-center mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-violet-400 font-semibold mb-3">
            FAQ
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Vos questions, <VioletText>nos réponses</VioletText>
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-5 data-[state=open]:border-violet-400/25"
              >
                <AccordionTrigger className="text-left text-sm sm:text-base font-medium text-white hover:no-underline py-5">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-zinc-400 leading-relaxed pb-5">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   DIFFERENTIATORS STRIP (Conçu pour l'Afrique)
   ════════════════════════════════════════════════════════════════════ */
function DifferentiatorsStrip() {
  const items = [
    { icon: Wifi, title: 'Optimisé 3G/4G', text: 'Pensé pour les réseaux mobiles africains.' },
    { icon: MessageCircle, title: 'Support WhatsApp', text: 'Une équipe reachable sur WhatsApp.' },
    { icon: Server, title: 'Hébergement local', text: 'Souveraineté des données possible.' },
    { icon: Code2, title: 'Éditeur de code', text: 'Python/JS exécutés. Unique au marché.' },
  ]
  return (
    <section className="relative py-10 bg-[#0A1628] border-y border-white/[0.05]">
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-medium">
            Conçu pour l&apos;Afrique, par des enseignants
          </p>
        </Reveal>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 0.08}>
              <div className="flex flex-col items-center text-center gap-2">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-400/15">
                  <it.icon className="h-4.5 w-4.5 text-violet-300" />
                </div>
                <div className="text-sm font-semibold text-white">{it.title}</div>
                <div className="text-xs text-zinc-500 leading-relaxed">{it.text}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   11. FINAL CTA
   ════════════════════════════════════════════════════════════════════ */
function CTASection({ onDemo, onLogin, onSignUp }: { onDemo: () => void; onLogin: () => void; onSignUp: () => void }) {
  return (
    <section className="relative py-16 sm:py-20 bg-[#0A1628] overflow-hidden">
      <GlowOrb x="50%" y="50%" color="orange" />
      <GlowOrb x="30%" y="40%" color="violet" />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(249,115,22,0.4) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black 30%, transparent 75%)',
        }}
      />
      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <Reveal>
          <h2 className="text-4xl sm:text-6xl font-bold text-white tracking-tight mb-5">
            Prêt à libérer <WarmText>10 heures par semaine</WarmText> ?
          </h2>
          <p className="text-base sm:text-lg text-zinc-400 mb-9 max-w-xl mx-auto">
            Rejoignez les 15+ établissements qui ont déjà transformé leur façon d&apos;évaluer.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
            <MagneticButton
              className="w-full sm:w-auto bg-orange-500 hover:bg-orange-400 text-white font-semibold px-8 py-4 text-base shadow-[0_0_40px_rgba(249,115,22,0.45)] hover:shadow-[0_0_60px_rgba(249,115,22,0.65)] transition-shadow duration-300 rounded-xl"
              onClick={onSignUp}
            >
              Démarrer l&apos;essai gratuit
              <ArrowRight className="ml-2 h-5 w-5" />
            </MagneticButton>
            <MagneticButton
              variant="outline"
              className="w-full sm:w-auto border-white/[0.12] bg-white/[0.02] text-white hover:bg-white/[0.06] px-8 py-4 text-base rounded-xl"
              onClick={onDemo}
            >
              Parler à un expert
            </MagneticButton>
          </div>
          <p className="text-xs text-zinc-500">
            Sans carte bancaire • Annulation à tout moment
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   12. FOOTER
   ════════════════════════════════════════════════════════════════════ */
function Footer() {
  const cols = [
    {
      title: 'Produit',
      links: ['Fonctionnalités', 'Tarifs', 'Démo', 'Sécurité'],
    },
    {
      title: 'Ressources',
      links: ['Guides pédagogiques', 'Documentation', 'Blog', 'Statut'],
    },
    {
      title: 'Entreprise',
      links: ['À propos', 'Partenaires', 'Carrières', 'Contact'],
    },
    {
      title: 'Légal',
      links: ['Confidentialité', 'Conditions', 'RGPD', 'Mentions légales'],
    },
  ]

  return (
    <footer className="bg-[#070F1E] border-t border-white/[0.06] pt-16 pb-28 md:pb-10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 lg:gap-10 mb-8">
          {/* Brand + newsletter */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
                <GraduationCap className="h-4.5 w-4.5 text-white" />
              </span>
              <span className="text-xl font-bold text-white">SECT</span>
            </div>
            <p className="text-sm text-zinc-500 leading-relaxed mb-5 max-w-xs">
              L&apos;évaluation universitaire réinventée par l&apos;IA. Conçue pour l&apos;Afrique.
            </p>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex gap-2"
              aria-label="Inscription à la newsletter"
            >
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  type="email"
                  placeholder="Votre email"
                  className="pl-9 h-10 bg-white/[0.03] border-white/[0.1] text-white placeholder:text-zinc-600 text-sm focus-visible:border-violet-400/50"
                  aria-label="Votre adresse email"
                />
              </div>
              <Button type="submit" size="icon" className="h-10 w-10 bg-violet-500 hover:bg-violet-400 text-white rounded-lg">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="text-[11px] text-zinc-600 mt-2">Recevez nos guides pédagogiques.</p>
          </div>

          {/* Link columns */}
          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-zinc-500 hover:text-violet-300 transition-colors">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-white/[0.06]">
          <p className="text-xs text-zinc-600">
            © {new Date().getFullYear()} SECT. Tous droits réservés.
          </p>
          <div className="flex items-center gap-4">
            {['Twitter', 'LinkedIn', 'GitHub'].map((s) => (
              <a
                key={s}
                href="#"
                aria-label={s}
                className="text-xs text-zinc-500 hover:text-violet-300 transition-colors"
              >
                {s}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ════════════════════════════════════════════════════════════════════
   STICKY MOBILE CTA BAR
   ════════════════════════════════════════════════════════════════════ */
function MobileStickyCTA({ onDemo, onLogin, onSignUp }: { onDemo: () => void; onLogin: () => void; onSignUp: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-0 left-0 right-0 z-50 md:hidden p-3 bg-[#0A1628]/95 backdrop-blur-xl border-t border-white/[0.08] flex gap-2"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Button
            onClick={onSignUp}
            className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.1] rounded-xl"
          >
            Essai gratuit
          </Button>
          <Button
            onClick={onDemo}
            className="flex-1 bg-orange-500 hover:bg-orange-400 text-white font-semibold rounded-xl"
          >
            Voir la démo
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ════════════════════════════════════════════════════════════════════
   MAIN LANDING PAGE
   ════════════════════════════════════════════════════════════════════ */
export function LandingPage({ onLogin, onDemo, onSignUp }: LandingPageProps) {
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ScrollTrigger.refresh()
    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill())
    }
  }, [])

  return (
    <div ref={mainRef} className="min-h-screen flex flex-col bg-[#0A1628]">
      <Navbar onLogin={onLogin} />
      <main className="flex-1">
        <HeroSection onDemo={onDemo} onLogin={onLogin} onSignUp={onSignUp} />
        <TrustBar />
        <ProblemSection />
        <SolutionSection />
        <ExamPrepShowcase />
        <FeaturesBento />
        <HowItWorks />
        <InteractiveDemo />
        <Testimonials />
        <PricingSection onDemo={onDemo} />
        <DifferentiatorsStrip />
        <FAQSection />
        <CTASection onDemo={onDemo} onLogin={onLogin} onSignUp={onSignUp} />
      </main>
      <Footer />
      <MobileStickyCTA onDemo={onDemo} onLogin={onLogin} onSignUp={onSignUp} />
    </div>
  )
}
