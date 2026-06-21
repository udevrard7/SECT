'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import gsap from 'gsap'
import {
  Mail,
  Lock,
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  Sparkles,
  Shield,
  GraduationCap,
  Users,
  Brain,
  ChevronRight,
  Zap,
  Globe,
  TrendingUp,
  Hash,
  Briefcase,
} from 'lucide-react'
import { useAuthStore, type LoginError } from '@/stores/auth-store'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ═══════════════════════════════════════════════════════════════
// TYPES & VALIDATION
// ═══════════════════════════════════════════════════════════════

type LoginMode = 'personnel' | 'etudiant'

const personnelSchema = z.object({
  identifier: z.string().email('Veuillez entrer une adresse email valide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
})

const etudiantSchema = z.object({
  identifier: z.string().min(3, 'Veuillez entrer votre matricule ou email'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
})

type PersonnelFormValues = z.infer<typeof personnelSchema>
type EtudiantFormValues = z.infer<typeof etudiantSchema>

// ═══════════════════════════════════════════════════════════════
// FEATURE DATA
// ═══════════════════════════════════════════════════════════════

const features = [
  { icon: Brain, label: 'IA Intégrée', desc: 'Questions auto-générées', stat: '98%' },
  { icon: Zap, label: 'Temps Réel', desc: 'Correction instantanée', stat: '<1s' },
  { icon: Shield, label: 'Anti-Triche', desc: 'Proctoring intelligent', stat: '24/7' },
  { icon: Globe, label: 'Multi-tenant', desc: 'Établissements illimités', stat: '∞' },
]

const typewriterWords = ['Intelligence Artificielle', 'Automatisation', 'Précision', 'Innovation']

// ═══════════════════════════════════════════════════════════════
// GSAP FLOATING PARTICLES — 30 particles
// ═══════════════════════════════════════════════════════════════

function FloatingParticles() {
  const containerRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<HTMLDivElement[]>([])

  useEffect(() => {
    if (!containerRef.current) return
    const els = particlesRef.current.filter(Boolean)
    if (els.length === 0) return

    const ctx = gsap.context(() => {
      els.forEach((el, i) => {
        gsap.to(el, {
          y: -(30 + Math.random() * 50),
          opacity: 0.7,
          scale: 1.2,
          duration: 4 + Math.random() * 3,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: i * 0.15,
        })
        gsap.to(el, {
          x: (Math.random() - 0.5) * 50,
          duration: 3 + Math.random() * 4,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
          delay: i * 0.1,
        })
      })
    }, containerRef)

    return () => ctx.revert()
  }, [])

  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      isEmerald: Math.random() > 0.5,
    })),
  [])

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p, i) => (
        <div
          key={p.id}
          ref={(el) => { if (el) particlesRef.current[i] = el }}
          className={`absolute rounded-full ${p.isEmerald ? 'bg-emerald-400' : 'bg-white'}`}
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            opacity: 0,
            scale: 0.3,
          }}
        />
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// GSAP AURORA GRADIENT — continuous rotation
// ═══════════════════════════════════════════════════════════════

function AuroraEffect() {
  const auroraRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!auroraRef.current) return
    const anim = gsap.to(auroraRef.current, {
      rotation: 360,
      duration: 20,
      repeat: -1,
      ease: 'none',
      transformOrigin: 'center center',
    })
    return () => { anim.kill() }
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        ref={auroraRef}
        className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] rounded-full opacity-20"
        style={{
          background: 'conic-gradient(from 0deg, transparent 0%, rgba(16,185,129,0.5) 8%, transparent 16%, rgba(6,182,212,0.35) 24%, transparent 32%, rgba(16,185,129,0.3) 40%, transparent 50%)',
        }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// GSAP GLOWING ORBS — floating at different speeds
// ═══════════════════════════════════════════════════════════════

function GlowingOrbs() {
  const orb1Ref = useRef<HTMLDivElement>(null)
  const orb2Ref = useRef<HTMLDivElement>(null)
  const orb3Ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (orb1Ref.current) {
        gsap.to(orb1Ref.current, {
          y: -50, x: 35, scale: 1.2,
          duration: 8, repeat: -1, yoyo: true, ease: 'sine.inOut',
        })
      }
      if (orb2Ref.current) {
        gsap.to(orb2Ref.current, {
          y: 40, x: -25, scale: 0.85,
          duration: 11, repeat: -1, yoyo: true, ease: 'sine.inOut',
        })
      }
      if (orb3Ref.current) {
        gsap.to(orb3Ref.current, {
          y: -30, scale: 1.15,
          duration: 14, repeat: -1, yoyo: true, ease: 'sine.inOut',
        })
      }
    })
    return () => ctx.revert()
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        ref={orb1Ref}
        className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, transparent 65%)' }}
      />
      <div
        ref={orb2Ref}
        className="absolute top-1/4 -right-24 w-[400px] h-[400px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.2) 0%, transparent 65%)' }}
      />
      <div
        ref={orb3Ref}
        className="absolute -bottom-32 left-1/3 w-[350px] h-[350px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.18) 0%, transparent 65%)' }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TYPEWRITER HOOK
// ═══════════════════════════════════════════════════════════════

function useTypewriter(words: string[], typingSpeed = 80, deletingSpeed = 40, pauseTime = 2000) {
  const [text, setText] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const currentWord = words[wordIndex]
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        setText(currentWord.substring(0, text.length + 1))
        if (text.length === currentWord.length) {
          setTimeout(() => setIsDeleting(true), pauseTime)
        }
      } else {
        setText(currentWord.substring(0, text.length - 1))
        if (text.length === 0) {
          setIsDeleting(false)
          setWordIndex((prev) => (prev + 1) % words.length)
        }
      }
    }, isDeleting ? deletingSpeed : typingSpeed)

    return () => clearTimeout(timeout)
  }, [text, isDeleting, wordIndex, words, typingSpeed, deletingSpeed, pauseTime])

  return text
}

// ═══════════════════════════════════════════════════════════════
// GSAP 3D TILT FEATURE CARD
// ═══════════════════════════════════════════════════════════════

function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (!cardRef.current) return
    const card = cardRef.current

    const handleMouseMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2
      const rotateX = (y / rect.height) * -14
      const rotateY = (x / rect.width) * 14

      gsap.to(card, {
        rotateX,
        rotateY,
        duration: 0.25,
        ease: 'power2.out',
        transformPerspective: 500,
      })
    }

    const handleMouseLeave = () => {
      gsap.to(card, {
        rotateX: 0,
        rotateY: 0,
        duration: 0.6,
        ease: 'elastic.out(1, 0.5)',
        transformPerspective: 500,
      })
      setHovered(false)
    }

    const handleMouseEnter = () => {
      setHovered(true)
      if (iconRef.current) {
        gsap.to(iconRef.current, {
          scale: 1.2,
          rotation: 10,
          duration: 0.3,
          ease: 'back.out(2)',
        })
      }
    }

    card.addEventListener('mousemove', handleMouseMove)
    card.addEventListener('mouseleave', handleMouseLeave)
    card.addEventListener('mouseenter', handleMouseEnter)

    return () => {
      card.removeEventListener('mousemove', handleMouseMove)
      card.removeEventListener('mouseleave', handleMouseLeave)
      card.removeEventListener('mouseenter', handleMouseEnter)
    }
  }, [index])

  useEffect(() => {
    if (!hovered && iconRef.current) {
      gsap.to(iconRef.current, {
        scale: 1,
        rotation: 0,
        duration: 0.4,
        ease: 'power2.out',
      })
    }
  }, [hovered])

  return (
    <div
      ref={cardRef}
      className={`flex items-center gap-3 rounded-xl px-3.5 py-3 border transition-colors duration-300 cursor-default ${
        hovered
          ? 'bg-white/[0.12] backdrop-blur-xl border-white/20 shadow-lg shadow-emerald-500/10'
          : 'bg-white/[0.04] backdrop-blur-sm border-white/[0.08] hover:bg-white/[0.08]'
      }`}
      style={{ opacity: 0, transform: 'translateY(20px) rotateX(15deg)' }}
    >
      <div
        ref={iconRef}
        className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center shrink-0 border border-emerald-400/20"
      >
        <feature.icon className="w-4 h-4 text-emerald-300" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-white/90">{feature.label}</p>
          <span className="text-[9px] font-bold text-emerald-300/80 bg-emerald-400/15 px-1.5 py-0.5 rounded-full">
            {feature.stat}
          </span>
        </div>
        <p className="text-[10px] text-white/40 mt-0.5">{feature.desc}</p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// GSAP ANIMATED GRADIENT BORDER BUTTON with MAGNETIC HOVER
// ═══════════════════════════════════════════════════════════════

function GradientButton({ children, onClick, disabled, className, btnRef }: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  btnRef?: React.RefObject<HTMLDivElement | null>
}) {
  const borderRef = useRef<HTMLDivElement>(null)
  const shineRef = useRef<HTMLDivElement>(null)

  // Animated gradient border position
  useEffect(() => {
    if (!borderRef.current) return
    const anim = gsap.to(borderRef.current, {
      backgroundPosition: '300% 300%',
      duration: 3,
      repeat: -1,
      ease: 'none',
    })
    return () => { anim.kill() }
  }, [])

  // Shine sweep effect
  useEffect(() => {
    if (!shineRef.current) return
    const anim = gsap.to(shineRef.current, {
      x: '250%',
      duration: 1.8,
      repeat: -1,
      repeatDelay: 1.2,
      ease: 'power2.inOut',
    })
    return () => { anim.kill() }
  }, [])

  // Magnetic hover via gsap.quickTo
  useEffect(() => {
    const wrapper = btnRef?.current
    if (!wrapper) return

    const xTo = gsap.quickTo(wrapper, 'x', { duration: 0.3, ease: 'power2.out' })
    const yTo = gsap.quickTo(wrapper, 'y', { duration: 0.3, ease: 'power2.out' })

    const handleMouseMove = (e: MouseEvent) => {
      const rect = wrapper.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2
      xTo(x * 0.2)
      yTo(y * 0.2)
    }

    const handleMouseLeave = () => {
      xTo(0)
      yTo(0)
    }

    wrapper.addEventListener('mousemove', handleMouseMove)
    wrapper.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      wrapper.removeEventListener('mousemove', handleMouseMove)
      wrapper.removeEventListener('mouseleave', handleMouseLeave)
      xTo.kill?.()
      yTo.kill?.()
    }
  }, [btnRef])

  return (
    <div ref={btnRef} className="relative rounded-xl p-[1.5px] overflow-hidden group">
      {/* Animated gradient border */}
      <div
        ref={borderRef}
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #10b981, #14b8a6, #06b6d4, #10b981)',
          backgroundSize: '300% 300%',
          backgroundPosition: '0% 0%',
        }}
      />
      <Button
        type="submit"
        onClick={onClick}
        disabled={disabled}
        className={`relative w-full h-12 rounded-[10px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-600/25 hover:shadow-emerald-500/40 transition-all duration-300 text-sm ${className || ''}`}
      >
        {children}
      </Button>
      {/* Shine sweep */}
      <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div
          ref={shineRef}
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.12) 43%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.12) 57%, transparent 62%)',
            transform: 'translateX(-120%)',
          }}
        />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// GSAP MODE TOGGLE — emerald sliding pill
// ═══════════════════════════════════════════════════════════════

function LoginModeToggle({ mode, onModeChange }: {
  mode: LoginMode
  onModeChange: (mode: LoginMode) => void
}) {
  const indicatorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!indicatorRef.current) return
    gsap.to(indicatorRef.current, {
      left: mode === 'personnel' ? '3px' : '50%',
      width: 'calc(50% - 3px)',
      duration: 0.45,
      ease: 'elastic.out(1, 0.55)',
    })
  }, [mode])

  return (
    <div className="relative flex rounded-xl bg-white/[0.04] p-[3px] mb-7 border border-white/[0.06]">
      {/* Sliding indicator — emerald pill */}
      <div
        ref={indicatorRef}
        className="absolute top-[3px] bottom-[3px] rounded-[9px] bg-gradient-to-r from-emerald-600/90 to-teal-600/90 shadow-lg shadow-emerald-500/20"
        style={{ left: '3px', width: 'calc(50% - 3px)' }}
      />

      <button
        type="button"
        onClick={() => onModeChange('personnel')}
        className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors duration-200 ${
          mode === 'personnel'
            ? 'text-white'
            : 'text-white/40 hover:text-white/60'
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={mode === 'personnel' ? 'briefcase-active' : 'briefcase'}
            initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6, rotate: 90 }}
            transition={{ duration: 0.2 }}
          >
            <Briefcase className="w-4 h-4" />
          </motion.div>
        </AnimatePresence>
        Personnel
      </button>

      <button
        type="button"
        onClick={() => onModeChange('etudiant')}
        className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors duration-200 ${
          mode === 'etudiant'
            ? 'text-white'
            : 'text-white/40 hover:text-white/60'
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={mode === 'etudiant' ? 'grad-active' : 'grad'}
            initial={{ opacity: 0, scale: 0.6, rotate: -90 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6, rotate: 90 }}
            transition={{ duration: 0.2 }}
          >
            <GraduationCap className="w-4 h-4" />
          </motion.div>
        </AnimatePresence>
        Étudiant
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DOT GRID PATTERN for RIGHT PANEL
// ═══════════════════════════════════════════════════════════════

function DotGrid() {
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-[0.35]"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

interface LoginFormProps {
  onBack?: () => void
}

export function LoginForm({ onBack }: LoginFormProps) {
  const [loginMode, setLoginMode] = useState<LoginMode>('personnel')
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const login = useAuthStore((state) => state.login)
  const loginStudent = useAuthStore((state) => state.loginStudent)
  const isLoading = useAuthStore((state) => state.isLoading)

  // Typewriter
  const typedText = useTypewriter(typewriterWords)

  // Password Reset state
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)

  // Password Reset Confirm state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirmToken, setConfirmToken] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)
  const [confirmSuccess, setConfirmSuccess] = useState(false)

  // GSAP refs
  const pageRef = useRef<HTMLDivElement>(null)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const bgImgRef = useRef<HTMLDivElement>(null)
  const logoBoxRef = useRef<HTMLDivElement>(null)
  const logoGlowRef = useRef<HTMLDivElement>(null)
  const logoSparkRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const subtitleRef = useRef<HTMLParagraphElement>(null)
  const taglineRef = useRef<HTMLDivElement>(null)
  const featuresGridRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const formCardRef = useRef<HTMLDivElement>(null)
  const mobileLogoRef = useRef<HTMLDivElement>(null)
  const identifierInputRef = useRef<HTMLInputElement>(null)
  const identifierLabelRef = useRef<HTMLLabelElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const passwordLabelRef = useRef<HTMLLabelElement>(null)
  const submitBtnRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLSpanElement>(null)

  const form = useForm({
    resolver: zodResolver(loginMode === 'personnel' ? personnelSchema : etudiantSchema),
    defaultValues: { identifier: '', password: '' },
  })

  // Reset form when mode changes
  useEffect(() => {
    form.reset({ identifier: '', password: '' })
    setLoginError(null)
  }, [loginMode, form])

  // ═══════════════════════════════════════════════════════════
  // GSAP ANIMATION 1: Page Entrance
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

      // Left panel slides in from left
      if (leftPanelRef.current) {
        tl.fromTo(leftPanelRef.current,
          { x: -60, opacity: 0 },
          { x: 0, opacity: 1, duration: 1 },
          0
        )
      }

      // Right panel slides in from right
      if (rightPanelRef.current) {
        tl.fromTo(rightPanelRef.current,
          { x: 60, opacity: 0 },
          { x: 0, opacity: 1, duration: 1 },
          0.15
        )
      }

      // ANIMATION 3: Logo entrance with scale bounce
      if (logoBoxRef.current) {
        tl.fromTo(logoBoxRef.current,
          { scale: 1.2, opacity: 0, rotation: -15 },
          { scale: 1, opacity: 1, rotation: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' },
          0.4
        )
      }

      // Logo glow pulse
      if (logoGlowRef.current) {
        gsap.to(logoGlowRef.current, {
          boxShadow: [
            '0 0 20px rgba(16,185,129,0.15), inset 0 0 20px rgba(16,185,129,0.08)',
            '0 0 40px rgba(16,185,129,0.4), inset 0 0 30px rgba(16,185,129,0.15)',
            '0 0 20px rgba(16,185,129,0.15), inset 0 0 20px rgba(16,185,129,0.08)',
          ],
          duration: 3,
          repeat: -1,
          ease: 'sine.inOut',
        })
      }

      // Logo sparkle rotation
      if (logoSparkRef.current) {
        gsap.to(logoSparkRef.current, {
          scale: 1.4,
          rotation: 15,
          duration: 2.5,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        })
      }

      // Title stagger
      if (titleRef.current) {
        tl.fromTo(titleRef.current,
          { x: -30, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.6 },
          0.55
        )
      }

      if (subtitleRef.current) {
        tl.fromTo(subtitleRef.current,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.6 },
          0.7
        )
      }

      // Tagline
      if (taglineRef.current) {
        tl.fromTo(taglineRef.current,
          { y: 15, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.6 },
          0.75
        )
      }

      // ANIMATION 4: Feature pills stagger with rotationX
      if (featuresGridRef.current) {
        const cards = featuresGridRef.current.querySelectorAll('[data-feature-card]')
        tl.fromTo(cards,
          { y: 25, opacity: 0, rotationX: 15 },
          {
            y: 0, opacity: 1, rotationX: 0,
            duration: 0.5,
            stagger: 0.1,
            ease: 'power2.out',
          },
          0.8
        )
      }

      // Bottom stats
      if (statsRef.current) {
        const statEls = statsRef.current.querySelectorAll('[data-stat]')
        tl.fromTo(statEls,
          { scale: 0.5, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.4, stagger: 0.12, ease: 'back.out(2)' },
          1.2
        )
      }

      // ANIMATION 6: Form card entrance with scale
      if (formCardRef.current) {
        tl.fromTo(formCardRef.current,
          { scale: 0.96, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.7, ease: 'power2.out' },
          0.3
        )
      }

      // ANIMATION 7: Input fields stagger from bottom
      const inputs = formCardRef.current?.querySelectorAll('[data-form-field]')
      if (inputs && inputs.length > 0) {
        tl.fromTo(inputs,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, stagger: 0.1, ease: 'power2.out' },
          0.6
        )
      }

      // Mobile logo slow rotate
      if (mobileLogoRef.current) {
        gsap.to(mobileLogoRef.current, {
          rotation: 360,
          duration: 25,
          repeat: -1,
          ease: 'none',
        })
      }

      // Cursor blink
      if (cursorRef.current) {
        gsap.to(cursorRef.current, {
          opacity: 0,
          duration: 0.5,
          repeat: -1,
          yoyo: true,
          ease: 'steps(1)',
        })
      }
    }, pageRef)

    return () => ctx.revert()
  }, [])

  // ═══════════════════════════════════════════════════════════
  // GSAP ANIMATION 2: Ken Burns on background
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (!bgImgRef.current) return
    const anim = gsap.to(bgImgRef.current, {
      scale: 1.12,
      duration: 25,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    })
    return () => { anim.kill() }
  }, [])

  // ═══════════════════════════════════════════════════════════
  // GSAP Logo gentle float
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (!logoBoxRef.current) return
    const anim = gsap.to(logoBoxRef.current, {
      y: -6,
      duration: 3,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    })
    return () => { anim.kill() }
  }, [])

  // ═══════════════════════════════════════════════════════════
  // GSAP Input Focus Label Animation
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    const idInput = identifierInputRef.current
    const idLabel = identifierLabelRef.current
    const pwInput = passwordInputRef.current
    const pwLabel = passwordLabelRef.current

    const setupFloat = (input: HTMLInputElement | null, label: HTMLLabelElement | null) => {
      if (!input || !label) return

      const onFocus = () => {
        gsap.to(label, {
          y: -2,
          scale: 1.03,
          color: '#10b981',
          duration: 0.25,
          ease: 'power2.out',
        })
      }
      const onBlur = () => {
        gsap.to(label, {
          y: 0,
          scale: 1,
          color: '',
          duration: 0.25,
          ease: 'power2.out',
        })
      }

      input.addEventListener('focus', onFocus)
      input.addEventListener('blur', onBlur)

      return () => {
        input.removeEventListener('focus', onFocus)
        input.removeEventListener('blur', onBlur)
      }
    }

    const cleanupId = setupFloat(idInput, idLabel)
    const cleanupPw = setupFloat(pwInput, pwLabel)

    return () => {
      cleanupId?.()
      cleanupPw?.()
    }
  }, [loginMode])

  // ═══════════════════════════════════════════════════════════
  // LOGIN HANDLER
  // ═══════════════════════════════════════════════════════════

  const onSubmit = useCallback(async (data: { identifier: string; password: string }) => {
    setLoginError(null)

    try {
      let success: boolean
      if (loginMode === 'etudiant') {
        success = await loginStudent(data.identifier, data.password)
      } else {
        success = await login(data.identifier, data.password)
      }

      if (!success) {
        setLoginError('Identifiants incorrects. Veuillez réessayer.')
      }
    } catch (err: unknown) {
      const loginErr = err as LoginError
      if (loginErr?.status === 500) {
        setLoginError('Erreur serveur. Veuillez réessayer plus tard.')
        toast.error('Erreur serveur', {
          description: 'Une erreur technique est survenue. Veuillez réessayer dans quelques instants.',
        })
      } else if (loginErr?.status === 403) {
        setLoginError(loginErr.message || 'Votre compte a été désactivé.')
        toast.error('Accès refusé', {
          description: loginErr.message,
        })
      } else if (loginErr?.status === 0) {
        setLoginError('Erreur de connexion. Vérifiez votre réseau.')
        toast.error('Erreur réseau', {
          description: 'Impossible de contacter le serveur. Vérifiez votre connexion internet.',
        })
      } else {
        const errorMsg = loginMode === 'etudiant'
          ? 'Matricule, email ou mot de passe incorrect.'
          : 'Identifiants incorrects. Veuillez réessayer.'
        setLoginError(errorMsg)
        toast.error('Échec de la connexion', {
          description: errorMsg,
        })
      }
    }
  }, [loginMode, login, loginStudent])

  const handleModeChange = useCallback((newMode: LoginMode) => {
    setLoginMode(newMode)
  }, [])

  // ═══════════════════════════════════════════════════════════
  // PASSWORD RESET HANDLERS
  // ═══════════════════════════════════════════════════════════

  const handleResetRequest = async () => {
    if (!resetEmail.trim()) {
      toast.error('Champ requis', { description: 'Veuillez entrer votre adresse email.' })
      return
    }
    setResetSending(true)
    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim() }),
      })
      const data = await res.json()
      setResetSent(true)
      if (data.token) setResetToken(data.token)
      toast.success('Demande envoyée', {
        description: data.message || 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
      })
    } catch {
      toast.error('Erreur', { description: 'Impossible d\'envoyer la demande. Veuillez réessayer.' })
    } finally {
      setResetSending(false)
    }
  }

  const handleResetConfirm = async () => {
    if (!confirmToken.trim()) {
      toast.error('Champ requis', { description: 'Veuillez entrer le token de réinitialisation.' })
      return
    }
    if (!confirmPassword || confirmPassword.length < 6) {
      toast.error('Mot de passe invalide', { description: 'Le mot de passe doit contenir au moins 6 caractères.' })
      return
    }
    setConfirmSubmitting(true)
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: confirmToken.trim(), password: confirmPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la réinitialisation')
      setConfirmSuccess(true)
      toast.success('Mot de passe réinitialisé', {
        description: 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.',
      })
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de réinitialiser le mot de passe.',
      })
    } finally {
      setConfirmSubmitting(false)
    }
  }

  const openResetDialog = () => {
    setResetEmail('')
    setResetSent(false)
    setResetToken(null)
    setResetDialogOpen(true)
  }

  const openConfirmDialog = (token?: string) => {
    setConfirmToken(token || '')
    setConfirmPassword('')
    setConfirmSuccess(false)
    setConfirmDialogOpen(true)
  }

  // Derived values
  const isPersonnel = loginMode === 'personnel'
  const identifierLabel = isPersonnel ? 'Adresse email' : 'Matricule ou Email'
  const identifierPlaceholder = isPersonnel ? 'votre.email@universite.fr' : 'Ex: 2024-INFO-001 ou email'
  const IdentifierIcon = isPersonnel ? Mail : Hash

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <>
      <div ref={pageRef} className="min-h-screen flex flex-col lg:flex-row bg-[#09090b] overflow-hidden">

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LEFT PANEL — Dark cinematic branding with premium bg   */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div
          ref={leftPanelRef}
          className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between"
          style={{ opacity: 0 }}
        >
          {/* ANIMATION 2: Ken Burns background image */}
          <div className="absolute inset-0" ref={bgImgRef} style={{ scale: 1 }}>
            <img
              src="/login-bg-premium.jpg"
              alt=""
              className="w-full h-full object-cover"
              style={{ filter: 'brightness(0.25) saturate(1.4) contrast(1.1)' }}
            />
          </div>

          {/* Multi-layer dark overlay with emerald tints */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-emerald-950/50 to-black/80" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />

          {/* ANIMATION 10: Aurora gradient */}
          <AuroraEffect />

          {/* ANIMATION 11: Particles */}
          <FloatingParticles />

          {/* ANIMATION 12: Glowing orbs */}
          <GlowingOrbs />

          {/* Back button */}
          {onBack && (
            <div className="relative z-10 p-6">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-white/50 hover:text-white transition-all duration-300 group px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" />
                <span className="text-sm font-medium">Retour</span>
              </button>
            </div>
          )}

          {/* Central branding content */}
          <div className="relative z-10 flex-1 flex flex-col justify-center max-w-xl px-8 xl:px-10">

            {/* ANIMATION 3: Logo with bounce + glow */}
            <div className="flex items-center gap-5 mb-10">
              <div ref={logoBoxRef} className="relative" style={{ opacity: 0 }}>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600/30 to-teal-600/20 backdrop-blur-xl border border-emerald-400/20 flex items-center justify-center shadow-2xl">
                  <img
                    src="/sect-logo.png"
                    alt="SECT"
                    className="w-9 h-9 object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      if (target.nextElementSibling) {
                        (target.nextElementSibling as HTMLElement).style.display = 'flex'
                      }
                    }}
                  />
                  <span className="text-white font-black text-2xl tracking-tighter hidden items-center justify-center w-full h-full absolute inset-0">S</span>
                </div>
                {/* Glow ring */}
                <div
                  ref={logoGlowRef}
                  className="absolute -inset-1.5 rounded-2xl border-2 border-emerald-400/25"
                  style={{ boxShadow: '0 0 20px rgba(16,185,129,0.15), inset 0 0 20px rgba(16,185,129,0.08)' }}
                />
                {/* Sparkle badge */}
                <div
                  ref={logoSparkRef}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 border-2 border-emerald-900 flex items-center justify-center shadow-lg shadow-yellow-500/30"
                >
                  <Sparkles className="w-3 h-3 text-yellow-900" />
                </div>
              </div>
              <div>
                <h1
                  ref={titleRef}
                  className="text-5xl xl:text-6xl font-black text-white tracking-tighter"
                  style={{ opacity: 0 }}
                >
                  SECT
                </h1>
                <p
                  ref={subtitleRef}
                  className="text-emerald-400/70 text-[10px] font-bold tracking-[0.3em] uppercase mt-1"
                  style={{ opacity: 0 }}
                >
                  Système d&apos;Évaluation Casse-Tête
                </p>
              </div>
            </div>

            {/* Tagline with typewriter */}
            <div
              ref={taglineRef}
              className="mb-12"
              style={{ opacity: 0 }}
            >
              <p className="text-xl xl:text-2xl text-white/80 font-light leading-relaxed">
                L&apos;évaluation réinventée par l&apos;
              </p>
              <p className="text-xl xl:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 inline-block min-h-[2rem]">
                {typedText}
                <span
                  ref={cursorRef}
                  className="inline-block w-0.5 h-6 bg-emerald-300 ml-1 align-middle"
                  style={{ opacity: 1 }}
                />
              </p>
            </div>

            {/* ANIMATION 4: Feature pills with stagger + 3D tilt */}
            <div
              ref={featuresGridRef}
              className="grid grid-cols-2 gap-2.5"
            >
              {features.map((feature, index) => (
                <div key={feature.label} data-feature-card>
                  <FeatureCard feature={feature} index={index} />
                </div>
              ))}
            </div>
          </div>

          {/* Bottom stats + copyright */}
          <div
            ref={statsRef}
            className="relative z-10 flex items-center gap-8 px-8 pb-6 pt-4"
          >
            {[
              { value: '4', label: 'Rôles', icon: Users },
              { value: '25+', label: 'Modèles', icon: TrendingUp },
              { value: '80+', label: 'API Routes', icon: Zap },
            ].map((stat) => (
              <div key={stat.label} data-stat className="text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <stat.icon className="w-3 h-3 text-emerald-500/50" />
                  <p className="text-xl font-black text-white/80">{stat.value}</p>
                </div>
                <p className="text-[9px] text-white/30 font-semibold uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
            <div className="ml-auto">
              <p className="text-[9px] text-white/20 font-medium">&copy; 2026 SECT &middot; v2.0</p>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* RIGHT PANEL — Dark form with glassmorphism card         */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div
          ref={rightPanelRef}
          className="flex-1 flex flex-col min-h-screen lg:min-h-0 bg-[#09090b] relative"
          style={{ opacity: 0 }}
        >
          {/* Dot grid background */}
          <DotGrid />

          {/* Subtle gradient accents */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-emerald-500/[0.03] blur-[100px]" />
            <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-teal-500/[0.03] blur-[100px]" />
          </div>

          {/* Mobile header */}
          <div className="lg:hidden p-4 flex items-center justify-between border-b border-white/[0.06] relative z-10">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-white/50 hover:text-white/80 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm font-medium">Retour</span>
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <div
                ref={mobileLogoRef}
                className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600/80 to-teal-600/80 flex items-center justify-center"
              >
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <span className="text-lg font-bold text-white">SECT</span>
            </div>
          </div>

          {/* Form content */}
          <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
            <div className="w-full max-w-[440px] space-y-7">

              {/* Header */}
              <div className="text-center lg:text-left">
                <div className="lg:hidden flex items-center justify-center gap-3 mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600/80 to-teal-600/80 flex items-center justify-center shadow-xl shadow-emerald-500/20">
                    <GraduationCap className="w-7 h-7 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Bon retour
                  <span className="inline-block ml-1.5 text-emerald-400">✦</span>
                </h2>
                <p className="mt-2 text-white/40 text-sm sm:text-base">
                  Connectez-vous pour accéder à votre espace
                </p>
              </div>

              {/* ANIMATION 6: Form Card with glassmorphism */}
              <div ref={formCardRef} style={{ opacity: 0 }}>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl p-6 sm:p-8 shadow-2xl shadow-black/30">

                  {/* Mode Toggle */}
                  <LoginModeToggle mode={loginMode} onModeChange={handleModeChange} />

                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                    {/* ─── Identifier Field ─── */}
                    <div data-form-field className="space-y-2" style={{ opacity: 0 }}>
                      <Label
                        ref={identifierLabelRef}
                        htmlFor="identifier"
                        className="text-xs font-semibold text-white/50 transition-colors duration-200 origin-left uppercase tracking-wider"
                      >
                        {identifierLabel}
                      </Label>
                      <div className="relative group">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={loginMode}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2"
                            initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                            transition={{ duration: 0.2 }}
                          >
                            <IdentifierIcon className="h-4 w-4 text-white/25 group-focus-within:text-emerald-400 transition-colors duration-300" />
                          </motion.div>
                        </AnimatePresence>
                        <Input
                          ref={identifierInputRef}
                          id="identifier"
                          type={isPersonnel ? 'email' : 'text'}
                          placeholder={identifierPlaceholder}
                          autoComplete={isPersonnel ? 'email' : 'off'}
                          className="pl-10 h-11 rounded-xl bg-white/[0.05] border-white/[0.08] text-white placeholder:text-white/20 focus:bg-white/[0.08] focus:border-emerald-500/50 focus:ring-emerald-500/20 focus:ring-2 transition-all duration-300"
                          {...form.register('identifier')}
                          aria-invalid={!!form.formState.errors.identifier}
                        />
                      </div>
                      <AnimatePresence>
                        {form.formState.errors.identifier && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="text-xs text-rose-400 flex items-center gap-1"
                          >
                            {form.formState.errors.identifier.message}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* ─── Password Field ─── */}
                    <div data-form-field className="space-y-2" style={{ opacity: 0 }}>
                      <Label
                        ref={passwordLabelRef}
                        htmlFor="password"
                        className="text-xs font-semibold text-white/50 transition-colors duration-200 origin-left uppercase tracking-wider"
                      >
                        Mot de passe
                      </Label>
                      <div className="relative group">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25 group-focus-within:text-emerald-400 transition-colors duration-300" />
                        <Input
                          ref={passwordInputRef}
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          className="pl-10 pr-10 h-11 rounded-xl bg-white/[0.05] border-white/[0.08] text-white placeholder:text-white/20 focus:bg-white/[0.08] focus:border-emerald-500/50 focus:ring-emerald-500/20 focus:ring-2 transition-all duration-300"
                          {...form.register('password')}
                          aria-invalid={!!form.formState.errors.password}
                        />
                        <motion.button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors p-0.5 rounded-md hover:bg-white/[0.05]"
                          aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                          whileTap={{ scale: 0.85 }}
                        >
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={showPassword ? 'hide' : 'show'}
                              initial={{ opacity: 0, rotate: -90 }}
                              animate={{ opacity: 1, rotate: 0 }}
                              exit={{ opacity: 0, rotate: 90 }}
                              transition={{ duration: 0.15 }}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </motion.div>
                          </AnimatePresence>
                        </motion.button>
                      </div>
                      <AnimatePresence>
                        {form.formState.errors.password && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="text-xs text-rose-400 flex items-center gap-1"
                          >
                            {form.formState.errors.password.message}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* ─── Forgot Password Link ─── */}
                    <div data-form-field className="flex justify-end" style={{ opacity: 0 }}>
                      <button
                        type="button"
                        onClick={openResetDialog}
                        className="text-xs font-semibold text-emerald-400/80 hover:text-emerald-300 transition-colors duration-200"
                      >
                        Mot de passe oublié ?
                      </button>
                    </div>

                    {/* ─── Error Message with red glow ─── */}
                    <AnimatePresence>
                      {loginError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          className="overflow-hidden"
                        >
                          <motion.div
                            className="rounded-xl border border-rose-500/30 bg-rose-500/[0.08] backdrop-blur-sm px-4 py-3 text-sm text-rose-300 flex items-center gap-2.5"
                            animate={{ x: [0, -4, 4, -4, 0] }}
                            transition={{ duration: 0.4, delay: 0.1 }}
                            style={{ boxShadow: '0 0 20px rgba(239,68,68,0.1)' }}
                          >
                            <motion.div
                              className="w-2 h-2 rounded-full bg-rose-500 shrink-0"
                              animate={{ scale: [1, 1.4, 1] }}
                              transition={{ duration: 0.6, repeat: Infinity }}
                              style={{ boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}
                            />
                            {loginError}
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* ─── Submit with gradient border + magnetic hover ─── */}
                    <div data-form-field style={{ opacity: 0 }}>
                      <GradientButton disabled={isLoading} btnRef={submitBtnRef}>
                        {isLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Connexion en cours...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            Se connecter
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        )}
                      </GradientButton>
                    </div>
                  </form>
                </div>
              </div>

              {/* Footer text */}
              <div className="text-center">
                <p className="text-[11px] text-white/25">
                  {loginMode === 'personnel' ? (
                    <>Connexion réservée au personnel administratif et enseignant</>
                  ) : (
                    <>Connexion réservée aux étudiants via leur matricule ou email</>
                  )}
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* PASSWORD RESET REQUEST DIALOG                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Dialog open={resetDialogOpen} onOpenChange={(open) => { if (!open) setResetDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-[#0a0a0a] border-white/[0.08] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg text-white">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-emerald-400" />
              </div>
              Réinitialiser le mot de passe
            </DialogTitle>
            <DialogDescription className="text-sm text-white/40">
              Entrez votre adresse email pour recevoir un token de réinitialisation.
            </DialogDescription>
          </DialogHeader>

          {!resetSent ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-xs font-semibold text-white/50 uppercase tracking-wider">Adresse email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="votre.email@universite.fr"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="pl-10 h-11 rounded-xl bg-white/[0.05] border-white/[0.08] text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:ring-emerald-500/20 focus:ring-2"
                    onKeyDown={(e) => e.key === 'Enter' && handleResetRequest()}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-2 pt-2">
                <Button variant="outline" onClick={() => setResetDialogOpen(false)} className="rounded-xl h-10 border-white/[0.08] bg-transparent text-white/60 hover:text-white hover:bg-white/[0.05]">
                  Annuler
                </Button>
                <Button onClick={handleResetRequest} disabled={resetSending} className="rounded-xl h-10 bg-emerald-600 hover:bg-emerald-500 text-white">
                  {resetSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Envoi...
                    </>
                  ) : (
                    'Envoyer le token'
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.4 }}
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                </motion.div>
                <p className="text-sm font-medium text-emerald-300">
                  Demande envoyée avec succès
                </p>
                <p className="text-xs text-emerald-400/50 mt-1">
                  Vérifiez votre boîte mail pour le token de réinitialisation.
                </p>
              </motion.div>

              {resetToken && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-3"
                >
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                    <p className="text-xs font-medium text-white/40 mb-1">Token reçu :</p>
                    <code className="text-sm font-mono bg-white/[0.06] px-2 py-1 rounded break-all text-emerald-300">{resetToken}</code>
                  </div>
                  <Button
                    onClick={() => openConfirmDialog(resetToken)}
                    className="w-full rounded-xl h-10 bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    Définir un nouveau mot de passe
                  </Button>
                </motion.div>
              )}

              <DialogFooter className="gap-2 sm:gap-2 pt-2">
                <Button variant="outline" onClick={() => setResetDialogOpen(false)} className="rounded-xl h-10 border-white/[0.08] bg-transparent text-white/60 hover:text-white hover:bg-white/[0.05]">
                  Fermer
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setResetSent(false)
                    setResetToken(null)
                    setResetEmail('')
                  }}
                  className="rounded-xl h-10 text-white/40 hover:text-white hover:bg-white/[0.05]"
                >
                  Renvoyer
                </Button>
                {!resetToken && (
                  <Button
                    onClick={() => openConfirmDialog()}
                    className="rounded-xl h-10 bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    J&apos;ai déjà un token
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* PASSWORD RESET CONFIRM DIALOG                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      <Dialog open={confirmDialogOpen} onOpenChange={(open) => { if (!open) setConfirmDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-[#0a0a0a] border-white/[0.08] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg text-white">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <Lock className="w-4 h-4 text-emerald-400" />
              </div>
              Nouveau mot de passe
            </DialogTitle>
            <DialogDescription className="text-sm text-white/40">
              Entrez votre token et choisissez un nouveau mot de passe.
            </DialogDescription>
          </DialogHeader>

          {!confirmSuccess ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="confirm-token" className="text-xs font-semibold text-white/50 uppercase tracking-wider">Token de réinitialisation</Label>
                <Input
                  id="confirm-token"
                  type="text"
                  placeholder="Entrez le token ici"
                  value={confirmToken}
                  onChange={(e) => setConfirmToken(e.target.value)}
                  className="h-11 rounded-xl bg-white/[0.05] border-white/[0.08] text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:ring-emerald-500/20 focus:ring-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-xs font-semibold text-white/50 uppercase tracking-wider">Nouveau mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/25" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl bg-white/[0.05] border-white/[0.08] text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:ring-emerald-500/20 focus:ring-2"
                    onKeyDown={(e) => e.key === 'Enter' && handleResetConfirm()}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} className="rounded-xl h-10 border-white/[0.08] bg-transparent text-white/60 hover:text-white hover:bg-white/[0.05]">
                  Annuler
                </Button>
                <Button onClick={handleResetConfirm} disabled={confirmSubmitting} className="rounded-xl h-10 bg-emerald-600 hover:bg-emerald-500 text-white">
                  {confirmSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Mise à jour...
                    </>
                  ) : (
                    'Confirmer'
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-center"
              >
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-emerald-300">
                  Mot de passe mis à jour avec succès !
                </p>
              </motion.div>
              <DialogFooter className="pt-2">
                <Button
                  onClick={() => {
                    setConfirmDialogOpen(false)
                    setResetDialogOpen(false)
                  }}
                  className="w-full rounded-xl h-10 bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Retour à la connexion
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
