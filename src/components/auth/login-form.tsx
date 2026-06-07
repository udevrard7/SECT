'use client'

import { useState, useCallback, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
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

// ─── Login mode ───
type LoginMode = 'personnel' | 'etudiant'

// ─── Validation ───
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

// ─── Features for left panel ───
const features = [
  { icon: Brain, label: 'IA Intégrée', desc: 'Questions auto-générées', stat: '98%' },
  { icon: Zap, label: 'Temps Réel', desc: 'Correction instantanée', stat: '<1s' },
  { icon: Shield, label: 'Anti-Triche', desc: 'Proctoring intelligent', stat: '24/7' },
  { icon: Globe, label: 'Multi-tenant', desc: 'Établissements illimités', stat: '∞' },
]

// ─── Typewriter words ───
const typewriterWords = ['Intelligence Artificielle', 'Automatisation', 'Précision', 'Innovation']

// ─── Animation Variants ───
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
}

const leftPanelVariants = {
  hidden: { opacity: 0, x: -60, scale: 0.95 },
  visible: {
    opacity: 1, x: 0, scale: 1,
    transition: { duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  },
}

// ─── Floating Particles ───
function FloatingParticles() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 1,
    duration: Math.random() * 10 + 8,
    delay: Math.random() * 5,
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-white"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
          }}
          animate={{
            y: [0, -(30 + Math.random() * 40), 0],
            opacity: [0, 0.6, 0],
            scale: [0.5, 1, 0.5],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: p.delay,
          }}
        />
      ))}
    </div>
  )
}

// ─── Aurora Gradient Effect ───
function AuroraEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] rounded-full opacity-30"
        style={{
          background: 'conic-gradient(from 0deg, transparent 0%, rgba(16,185,129,0.4) 10%, transparent 20%, rgba(6,182,212,0.3) 30%, transparent 40%)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

// ─── Animated Grid Background ───
function AnimatedGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.08]">
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
        animate={{ y: [0, 30, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

// ─── Glowing Orbs (Enhanced) ───
function GlowingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(52,211,153,0.25) 0%, transparent 70%)',
        }}
        animate={{
          y: [0, -40, 0],
          x: [0, 30, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/4 -right-20 w-80 h-80 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(6,182,212,0.2) 0%, transparent 70%)',
        }}
        animate={{
          y: [0, 30, 0],
          x: [0, -20, 0],
          scale: [1, 0.9, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(34,211,238,0.15) 0%, transparent 70%)',
        }}
        animate={{
          y: [0, -25, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

// ─── Typewriter Hook ───
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

// ─── Glowing Feature Card ───
function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const [hovered, setHovered] = useState(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useTransform(y, [-50, 50], [5, -5])
  const rotateY = useTransform(x, [-50, 50], [-5, 5])

  const handleMouse = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    x.set(e.clientX - rect.left - rect.width / 2)
    y.set(e.clientY - rect.top - rect.height / 2)
  }, [x, y])

  return (
    <motion.div
      key={feature.label}
      variants={itemVariants}
      style={{ rotateX, rotateY, transformPerspective: 600 }}
      onMouseMove={handleMouse}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); x.set(0); y.set(0) }}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 border transition-all duration-300 cursor-default ${
        hovered
          ? 'bg-white/20 backdrop-blur-md border-white/30 shadow-lg shadow-emerald-500/10'
          : 'bg-white/8 backdrop-blur-sm border-white/12 hover:bg-white/12'
      }`}
    >
      <motion.div
        className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center shrink-0 border border-white/10"
        animate={hovered ? { scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        <feature.icon className="w-4.5 h-4.5 text-white" />
      </motion.div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">{feature.label}</p>
          <motion.span
            className="text-[10px] font-bold text-emerald-300 bg-emerald-400/20 px-1.5 py-0.5 rounded-full"
            animate={hovered ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            {feature.stat}
          </motion.span>
        </div>
        <p className="text-[11px] text-white/50 mt-0.5">{feature.desc}</p>
      </div>
    </motion.div>
  )
}

// ─── Animated Gradient Border Button ───
function GradientButton({ children, onClick, disabled, className }: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <motion.div
      className="relative rounded-xl p-[1.5px] overflow-hidden group"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Animated gradient border */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #10b981, #14b8a6, #06b6d4, #10b981)',
          backgroundSize: '300% 300%',
        }}
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
      />
      <Button
        type="submit"
        onClick={onClick}
        disabled={disabled}
        className={`relative w-full h-12 rounded-[10px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-600/25 hover:shadow-emerald-500/50 transition-all duration-300 text-sm ${className || ''}`}
      >
        {children}
      </Button>
      {/* Shine effect */}
      <motion.div
        className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.15) 55%, transparent 60%)',
          }}
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1, ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.div>
  )
}

// ─── Mode Toggle ───
function LoginModeToggle({ mode, onModeChange }: {
  mode: LoginMode
  onModeChange: (mode: LoginMode) => void
}) {
  return (
    <motion.div
      className="relative flex rounded-xl bg-zinc-100 dark:bg-zinc-800/60 p-1 mb-6"
      layout
    >
      {/* Sliding indicator */}
      <motion.div
        className="absolute top-1 bottom-1 rounded-lg bg-white dark:bg-zinc-700 shadow-sm"
        animate={{
          left: mode === 'personnel' ? '4px' : '50%',
          width: 'calc(50% - 4px)',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      />

      <button
        type="button"
        onClick={() => onModeChange('personnel')}
        className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors duration-200 ${
          mode === 'personnel'
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
        }`}
      >
        <Briefcase className="w-4 h-4" />
        <span className="hidden sm:inline">Espace</span> Personnel
      </button>

      <button
        type="button"
        onClick={() => onModeChange('etudiant')}
        className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors duration-200 ${
          mode === 'etudiant'
            ? 'text-teal-700 dark:text-teal-300'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
        }`}
      >
        <GraduationCap className="w-4 h-4" />
        <span className="hidden sm:inline">Espace</span> Étudiant
      </button>
    </motion.div>
  )
}

// ─── Main Component ───
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

  const form = useForm({
    resolver: zodResolver(loginMode === 'personnel' ? personnelSchema : etudiantSchema),
    defaultValues: { identifier: '', password: '' },
  })

  // Reset form when mode changes
  useEffect(() => {
    form.reset({ identifier: '', password: '' })
    setLoginError(null)
  }, [loginMode, form])

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
        // This shouldn't happen anymore since we throw errors, but just in case
        setLoginError('Identifiants incorrects. Veuillez réessayer.')
      }
    } catch (err: unknown) {
      const loginErr = err as LoginError
      if (loginErr?.status === 500) {
        // Server error (DB connection issue, etc.) — NOT a wrong password
        setLoginError('Erreur serveur. Veuillez réessayer plus tard.')
        toast.error('Erreur serveur', {
          description: 'Une erreur technique est survenue. Veuillez réessayer dans quelques instants.',
        })
      } else if (loginErr?.status === 403) {
        // Account disabled
        setLoginError(loginErr.message || 'Votre compte a été désactivé.')
        toast.error('Accès refusé', {
          description: loginErr.message,
        })
      } else if (loginErr?.status === 0) {
        // Network error
        setLoginError('Erreur de connexion. Vérifiez votre réseau.')
        toast.error('Erreur réseau', {
          description: 'Impossible de contacter le serveur. Vérifiez votre connexion internet.',
        })
      } else {
        // 401 or other — wrong credentials
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

  const isPersonnel = loginMode === 'personnel'
  const identifierLabel = isPersonnel ? 'Adresse email' : 'Matricule ou Email'
  const identifierPlaceholder = isPersonnel ? 'votre.email@universite.fr' : 'Ex: 2024-INFO-001 ou email'
  const IdentifierIcon = isPersonnel ? Mail : Hash

  return (
    <>
    <div className="min-h-screen flex flex-col lg:flex-row bg-white dark:bg-zinc-950 overflow-hidden">
      {/* ═══════════════════════════════════════════════════════ */}
      {/* LEFT PANEL — Branding with Background Image + Effects  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <motion.div
        className="hidden lg:flex lg:w-[45%] relative overflow-y-auto flex-col justify-between"
        variants={leftPanelVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Background Image with overlay */}
        <div className="absolute inset-0">
          <motion.img
            src="/login-bg.jpg"
            alt=""
            className="w-full h-full object-cover"
            initial={{ scale: 1.1, filter: 'brightness(0.4) saturate(1.2)' }}
            animate={{ scale: [1.1, 1.15, 1.1], filter: 'brightness(0.35) saturate(1.3)' }}
            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Multi-layer overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/60 via-teal-900/50 to-cyan-900/70" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
        </div>

        {/* Aurora rotating gradient */}
        <AuroraEffect />

        {/* Animated grid */}
        <AnimatedGrid />

        {/* Floating particles */}
        <FloatingParticles />

        {/* Glowing orbs */}
        <GlowingOrbs />

        {/* Back button */}
        {onBack && (
          <motion.div
            className="relative z-10"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-white/70 hover:text-white transition-all duration-300 group px-2 py-1"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" />
              <span className="text-sm font-medium">Retour</span>
            </button>
          </motion.div>
        )}

        {/* Central branding */}
        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }}
          >
            {/* Logo with glow */}
            <div className="flex items-center gap-5 mb-8">
              <motion.div
                className="relative"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="w-16 h-16 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl shadow-emerald-500/20">
                  <span className="text-white font-black text-2xl tracking-tighter">S</span>
                </div>
                {/* Glow ring */}
                <motion.div
                  className="absolute -inset-1 rounded-3xl border-2 border-emerald-400/30"
                  animate={{
                    boxShadow: [
                      '0 0 15px rgba(52,211,153,0.1), inset 0 0 15px rgba(52,211,153,0.05)',
                      '0 0 30px rgba(52,211,153,0.3), inset 0 0 20px rgba(52,211,153,0.1)',
                      '0 0 15px rgba(52,211,153,0.1), inset 0 0 15px rgba(52,211,153,0.05)',
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-yellow-400 border-2 border-emerald-800 flex items-center justify-center"
                  animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                >
                  <Sparkles className="w-3 h-3 text-yellow-900" />
                </motion.div>
              </motion.div>
              <div>
                <motion.h1
                  className="text-5xl xl:text-6xl font-black text-white tracking-tighter"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  SECT
                </motion.h1>
                <motion.p
                  className="text-emerald-300/80 text-xs font-semibold tracking-[0.25em] uppercase mt-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                >
                  Système d&apos;Évaluation Casse-Tête
                </motion.p>
              </div>
            </div>

            {/* Tagline with typewriter */}
            <motion.div
              className="mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <p className="text-xl xl:text-2xl text-white/90 font-light leading-relaxed">
                La plateforme d&apos;évaluation propulsée par l&apos;
              </p>
              <p className="text-xl xl:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 inline-block min-h-[2rem]">
                {typedText}
                <motion.span
                  className="inline-block w-0.5 h-6 bg-emerald-300 ml-1 align-middle"
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
                />
              </p>
            </motion.div>

            {/* Feature pills with 3D tilt */}
            <motion.div
              className="grid grid-cols-2 gap-3"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {features.map((feature, index) => (
                <FeatureCard key={feature.label} feature={feature} index={index} />
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Bottom stats with animated counters */}
        <motion.div
          className="relative z-10 flex items-center gap-8 px-6 pb-6 pt-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          {[
            { value: '4', label: 'Rôles', icon: Users },
            { value: '25+', label: 'Modèles', icon: TrendingUp },
            { value: '80+', label: 'API Routes', icon: Zap },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              className="text-center"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2 + i * 0.15, type: 'spring', stiffness: 200 }}
            >
              <div className="flex items-center justify-center gap-1.5">
                <stat.icon className="w-3 h-3 text-emerald-400/60" />
                <p className="text-2xl font-black text-white">{stat.value}</p>
              </div>
              <p className="text-[10px] text-white/40 font-medium uppercase tracking-wider">{stat.label}</p>
            </motion.div>
          ))}
          <div className="ml-auto">
            <p className="text-[10px] text-white/30 font-medium">&copy; 2026 SECT</p>
          </div>
        </motion.div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* RIGHT PANEL — Form with subtle WOW effects              */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-h-screen lg:min-h-0 bg-white dark:bg-zinc-950 relative">
        {/* Subtle background pattern for right panel */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-emerald-50 dark:bg-emerald-950/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-teal-50 dark:bg-teal-950/10 blur-3xl" />
        </div>

        {/* Mobile header */}
        <div className="lg:hidden p-4 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 relative z-10">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-medium">Retour</span>
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <motion.div
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center"
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              style={{ transform: 'none' }}
            >
              <span className="text-white font-bold text-sm">S</span>
            </motion.div>
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">SECT</span>
          </div>
        </div>

        {/* Form content */}
        <motion.main
          className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-8 lg:py-12"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="w-full max-w-[420px] space-y-8">
            {/* Header */}
            <motion.div variants={itemVariants} className="text-center lg:text-left">
              <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
                <motion.div
                  className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-500/30"
                  animate={{ boxShadow: ['0 20px 40px rgba(16,185,129,0.3)', '0 15px 30px rgba(16,185,129,0.2)', '0 20px 40px rgba(16,185,129,0.3)'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <GraduationCap className="w-7 h-7 text-white" />
                </motion.div>
              </div>
              <motion.h2
                className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight"
              >
                <motion.span
                  className="inline-block"
                  whileHover={{ scale: 1.02 }}
                >
                  Bon retour
                </motion.span>
                <motion.span
                  className="inline-block ml-1.5"
                  animate={{ rotate: [0, 14, -8, 14, -4, 0] }}
                  transition={{ duration: 0.6, delay: 1 }}
                >
                  👋
                </motion.span>
              </motion.h2>
              <p className="mt-2 text-zinc-500 dark:text-zinc-400 text-sm sm:text-base">
                Connectez-vous pour accéder à votre espace
              </p>
            </motion.div>

            {/* Login Form Card */}
            <motion.div variants={itemVariants}>
              <motion.div
                className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-sm p-6 sm:p-8 shadow-xl shadow-zinc-200/40 dark:shadow-zinc-900/50"
                whileHover={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.12)' }}
                transition={{ duration: 0.3 }}
              >
                {/* Mode Toggle */}
                <LoginModeToggle mode={loginMode} onModeChange={handleModeChange} />

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  {/* Identifier (Email or Matricule) */}
                  <div className="space-y-2">
                    <Label htmlFor="identifier" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
                          <IdentifierIcon className="h-4 w-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors duration-300" />
                        </motion.div>
                      </AnimatePresence>
                      <Input
                        id="identifier"
                        type={isPersonnel ? 'email' : 'text'}
                        placeholder={identifierPlaceholder}
                        autoComplete={isPersonnel ? 'email' : 'off'}
                        className="pl-10 h-11 rounded-xl border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 focus:bg-white dark:focus:bg-zinc-800 transition-all duration-300 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500"
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
                          className="text-sm text-rose-500 flex items-center gap-1"
                        >
                          {form.formState.errors.identifier.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Mot de passe
                    </Label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors duration-300" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        className="pl-10 pr-10 h-11 rounded-xl border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 focus:bg-white dark:focus:bg-zinc-800 transition-all duration-300 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500"
                        {...form.register('password')}
                        aria-invalid={!!form.formState.errors.password}
                      />
                      <motion.button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-0.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
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
                          className="text-sm text-rose-500 flex items-center gap-1"
                        >
                          {form.formState.errors.password.message}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Forgot password (available for all modes) */}
                  <div className="flex justify-end">
                    <motion.button
                      type="button"
                      onClick={openResetDialog}
                      className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
                      whileHover={{ x: 2 }}
                    >
                      Mot de passe oublié ?
                    </motion.button>
                  </div>

                  {/* Error message */}
                  <AnimatePresence>
                    {loginError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="overflow-hidden"
                      >
                        <motion.div
                          className="rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2"
                          animate={{ x: [0, -4, 4, -4, 0] }}
                          transition={{ duration: 0.4, delay: 0.1 }}
                        >
                          <motion.div
                            className="w-2 h-2 rounded-full bg-rose-500 shrink-0"
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 0.6, repeat: Infinity }}
                          />
                          {loginError}
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit with animated gradient border */}
                  <GradientButton disabled={isLoading}>
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
                </form>
              </motion.div>
            </motion.div>

            {/* Footer text */}
            <motion.div
              variants={itemVariants}
              className="text-center"
            >
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {loginMode === 'personnel' ? (
                  <>Connexion réservée au personnel administratif et enseignant</>
                ) : (
                  <>Connexion réservée aux étudiants via leur matricule ou email</>
                )}
              </p>
            </motion.div>
          </div>
        </motion.main>
      </div>

      {/* ═══════════════ Password Reset Request Dialog ═══════════════ */}
      <Dialog open={resetDialogOpen} onOpenChange={(open) => { if (!open) setResetDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              Réinitialiser le mot de passe
            </DialogTitle>
            <DialogDescription className="text-sm">
              Entrez votre adresse email pour recevoir un token de réinitialisation.
            </DialogDescription>
          </DialogHeader>

          {!resetSent ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-sm font-medium">Adresse email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="votre.email@universite.fr"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="pl-10 h-11 rounded-xl"
                    onKeyDown={(e) => e.key === 'Enter' && handleResetRequest()}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-2 pt-2">
                <Button variant="outline" onClick={() => setResetDialogOpen(false)} className="rounded-xl h-10">
                  Annuler
                </Button>
                <Button onClick={handleResetRequest} disabled={resetSending} className="rounded-xl h-10 bg-emerald-600 hover:bg-emerald-500">
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
                className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.4 }}
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                </motion.div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Demande envoyée avec succès
                </p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">
                  Vérifiez votre boîte mail pour le token de réinitialisation.
                </p>
              </motion.div>

              {resetToken && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-3"
                >
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Token reçu :</p>
                    <code className="text-sm font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded break-all">{resetToken}</code>
                  </div>
                  <Button
                    onClick={() => openConfirmDialog(resetToken)}
                    className="w-full rounded-xl h-10 bg-emerald-600 hover:bg-emerald-500"
                  >
                    Définir un nouveau mot de passe
                  </Button>
                </motion.div>
              )}

              <DialogFooter className="gap-2 sm:gap-2 pt-2">
                <Button variant="outline" onClick={() => setResetDialogOpen(false)} className="rounded-xl h-10">
                  Fermer
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setResetSent(false)
                    setResetToken(null)
                    setResetEmail('')
                  }}
                  className="rounded-xl h-10"
                >
                  Renvoyer
                </Button>
                {!resetToken && (
                  <Button
                    onClick={() => openConfirmDialog()}
                    className="rounded-xl h-10 bg-emerald-600 hover:bg-emerald-500"
                  >
                    J&apos;ai déjà un token
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════ Password Reset Confirm Dialog ═══════════════ */}
      <Dialog open={confirmDialogOpen} onOpenChange={(open) => { if (!open) setConfirmDialogOpen(false) }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              Nouveau mot de passe
            </DialogTitle>
            <DialogDescription className="text-sm">
              Entrez votre token et choisissez un nouveau mot de passe.
            </DialogDescription>
          </DialogHeader>

          {!confirmSuccess ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="confirm-token" className="text-sm font-medium">Token de réinitialisation</Label>
                <Input
                  id="confirm-token"
                  type="text"
                  placeholder="Entrez le token ici"
                  value={confirmToken}
                  onChange={(e) => setConfirmToken(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-sm font-medium">Nouveau mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl"
                    onKeyDown={(e) => e.key === 'Enter' && handleResetConfirm()}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} className="rounded-xl h-10">
                  Annuler
                </Button>
                <Button onClick={handleResetConfirm} disabled={confirmSubmitting} className="rounded-xl h-10 bg-emerald-600 hover:bg-emerald-500">
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
                className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-center"
              >
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Mot de passe mis à jour avec succès !
                </p>
              </motion.div>
              <DialogFooter className="pt-2">
                <Button
                  onClick={() => {
                    setConfirmDialogOpen(false)
                    setResetDialogOpen(false)
                  }}
                  className="w-full rounded-xl h-10 bg-emerald-600 hover:bg-emerald-500"
                >
                  Retour à la connexion
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </>
  )
}
