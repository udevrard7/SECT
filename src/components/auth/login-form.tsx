'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
  Loader2,
  GraduationCap,
  Briefcase,
  Sparkles,
  Zap,
  Shield,
  Users,
  TrendingUp,
  Award,
  CheckCircle2,
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
// TYPES & VALIDATION (préservé de l'ancien)
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
// COMPOSANT : Particule flottante animée
// ═══════════════════════════════════════════════════════════════

function FloatingParticle({ delay, duration, x, y, size, color }: { delay: number; duration: number; x: string; y: string; size: number; color: string }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ left: x, top: y, width: size, height: size, backgroundColor: color, filter: 'blur(1px)' }}
      animate={{
        y: [0, -30, 0],
        opacity: [0, 0.6, 0],
        scale: [0.5, 1, 0.5],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  )
}

// ═══════════════════════════════════════════════════════════════
// COMPOSANT : Counter animé (compte de 0 à value)
// ═══════════════════════════════════════════════════════════════

function AnimatedCounter({ value, suffix = '', duration = 1.5 }: { value: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true
          const steps = 60
          const increment = value / steps
          let current = 0
          const interval = setInterval(() => {
            current += increment
            if (current >= value) {
              setCount(value)
              clearInterval(interval)
            } else {
              setCount(Math.floor(current))
            }
          }, (duration * 1000) / steps)
        }
      },
      { threshold: 0.3 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [value, duration])

  return (
    <span ref={ref} className="font-mono tabular-nums">
      {count}{suffix}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════
// LOGIN FORM — SECT "Savane EdTech"
// ═══════════════════════════════════════════════════════════════

export function LoginForm() {
  const [loginMode, setLoginMode] = useState<LoginMode>('personnel')
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // Password reset state
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmSending, setConfirmSending] = useState(false)

  const login = useAuthStore((state) => state.login)
  const loginStudent = useAuthStore((state) => state.loginStudent)
  const isLoading = useAuthStore((state) => state.isLoading)

  const form = useForm<PersonnelFormValues | EtudiantFormValues>({
    resolver: zodResolver(loginMode === 'personnel' ? personnelSchema : etudiantSchema),
    defaultValues: { identifier: '', password: '' },
  })

  const handleModeChange = useCallback((newMode: LoginMode) => {
    if (newMode === loginMode) return
    setLoginMode(newMode)
    setLoginError(null)
    form.reset({ identifier: '', password: '' })
  }, [loginMode, form])

  const onSubmit = useCallback(async (data: PersonnelFormValues | EtudiantFormValues) => {
    setLoginError(null)
    try {
      let success = false
      if (loginMode === 'etudiant') {
        success = await loginStudent(data.identifier, data.password)
      } else {
        success = await login(data.identifier, data.password)
      }
      if (!success) {
        setLoginError('Identifiants incorrects. Veuillez réessayer.')
      }
    } catch (err) {
      const loginErr = err as LoginError
      if (loginErr?.status === 500) {
        setLoginError('Erreur serveur. Veuillez réessayer plus tard.')
      } else if (loginErr?.status === 403) {
        setLoginError(loginErr.message || 'Votre compte a été désactivé.')
      } else if (loginErr?.status === 0) {
        setLoginError('Problème de connexion. Vérifiez votre réseau.')
      } else {
        const errorMsg = loginMode === 'etudiant'
          ? 'Matricule/email ou mot de passe incorrect.'
          : 'Email ou mot de passe incorrect.'
        setLoginError(errorMsg)
      }
    }
  }, [loginMode, login, loginStudent])

  // Password reset handlers
  const handleResetRequest = useCallback(async () => {
    if (!resetEmail.trim()) return
    setResetSending(true)
    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim() }),
      })
      if (res.ok) {
        setResetSent(true)
        toast.success('Email envoyé', { description: 'Vérifiez votre boîte de réception.' })
      } else {
        toast.error('Erreur', { description: 'Impossible d\'envoyer l\'email.' })
      }
    } catch {
      toast.error('Erreur', { description: 'Vérifiez votre connexion.' })
    } finally {
      setResetSending(false)
    }
  }, [resetEmail])

  const handleResetConfirm = useCallback(async () => {
    if (!resetToken?.trim() || !newPassword.trim()) return
    setConfirmSending(true)
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), newPassword: newPassword.trim() }),
      })
      if (res.ok) {
        toast.success('Mot de passe réinitialisé', { description: 'Vous pouvez vous connecter.' })
        setConfirmDialogOpen(false)
        setResetDialogOpen(false)
        setResetSent(false)
        setResetToken(null)
        setNewPassword('')
      } else {
        toast.error('Erreur', { description: 'Token invalide ou expiré.' })
      }
    } catch {
      toast.error('Erreur', { description: 'Vérifiez votre connexion.' })
    } finally {
      setConfirmSending(false)
    }
  }, [resetToken, newPassword])

  const isPersonnel = loginMode === 'personnel'
  const identifierLabel = isPersonnel ? 'Adresse email' : 'Matricule ou Email'

  // Données pour les stats animées
  const stats = [
    { icon: Users, value: 500, suffix: '+', label: 'Étudiants', color: '#84CC16' },
    { icon: Zap, value: 200, suffix: '+', label: 'Examens corrigés', color: '#F59E0B' },
    { icon: Shield, value: 98, suffix: '%', label: 'Précision IA', color: '#84CC16' },
    { icon: Award, value: 4, suffix: '', label: 'Rôles', color: '#F59E0B' },
  ]

  // Témoignages
  const testimonials = [
    { text: 'Mes corrections passent de 2 semaines à 2 minutes. Incroyable !', author: 'Pr. Aïcha K.', role: 'Université Félix Houphouët-Boigny' },
    { text: "L'IA génère mes QCM à partir de mes cours. Un gain de temps énorme.", author: 'Dr. Konan Y.', role: 'ENS Abidjan' },
  ]
  const [activeTestimonial, setActiveTestimonial] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [testimonials.length])

  return (
    <div className="min-h-screen flex bg-[#1E1B4B]">
      {/* ════════════════════════════════════════════════════════════════
          CÔTÉ GAUCHE (60%) — Bleu nuit + Kente riche + SECT branding
          ════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[60%] relative flex-col overflow-hidden">
        {/* ── Fond : dégradé bleu nuit profond ── */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E1B4B] via-[#1a1740] to-[#0f0d2e]" />

        {/* ── Motif Kente riche (multi-couches, inspiration tissage traditionnel) ── */}
        {/* Couche 1 : bandes verticales kente tricolores */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: `
              repeating-linear-gradient(90deg,
                transparent 0, transparent 60px,
                #84CC16 60px, #84CC16 64px,
                transparent 64px, transparent 68px,
                #F59E0B 68px, #F59E0B 70px,
                transparent 70px, transparent 74px,
                #C2410C 74px, #C2410C 76px,
                transparent 76px, transparent 120px
              )
            `,
          }}
        />
        {/* Couche 2 : losanges diagonaux (motif bogolan) */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: `
              repeating-linear-gradient(45deg, transparent 0, transparent 30px, #F59E0B 30px, #F59E0B 34px, transparent 34px, transparent 60px),
              repeating-linear-gradient(-45deg, transparent 0, transparent 30px, #84CC16 30px, #84CC16 34px, transparent 34px, transparent 60px)
            `,
          }}
        />
        {/* Couche 3 : points dorés (motif mandala) */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, #F59E0B 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* ── Bande kente décorative verticale (bord droit, 4 couleurs) ── */}
        <div
          className="absolute top-0 bottom-0 right-0 w-3 z-20"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg,
              #84CC16 0px, #84CC16 50px,
              #C2410C 50px, #C2410C 100px,
              #F59E0B 100px, #F59E0B 150px,
              #1E1B4B 150px, #1E1B4B 200px
            )`,
          }}
        />

        {/* ── Particules flottantes dorées/vertes ── */}
        <FloatingParticle delay={0} duration={4} x="15%" y="30%" size={4} color="#F59E0B" />
        <FloatingParticle delay={1} duration={5} x="80%" y="20%" size={3} color="#84CC16" />
        <FloatingParticle delay={2} duration={3.5} x="25%" y="70%" size={5} color="#F59E0B" />
        <FloatingParticle delay={0.5} duration={4.5} x="70%" y="60%" size={3} color="#84CC16" />
        <FloatingParticle delay={1.5} duration={3} x="50%" y="15%" size={4} color="#C2410C" />
        <FloatingParticle delay={2.5} duration={4} x="90%" y="80%" size={3} color="#F59E0B" />

        {/* ── Motifs géométriques africains en coins (losanges concentriques) ── */}
        <motion.div
          className="absolute top-6 right-12 w-28 h-28 pointer-events-none z-10"
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 100 100" fill="none">
            <polygon points="50,5 95,50 50,95 5,50" stroke="#F59E0B" strokeWidth="1.5" fill="none" opacity="0.3" />
            <polygon points="50,20 80,50 50,80 20,50" stroke="#F59E0B" strokeWidth="1" fill="none" opacity="0.2" />
            <polygon points="50,35 65,50 50,65 35,50" stroke="#84CC16" strokeWidth="1" fill="none" opacity="0.15" />
          </svg>
        </motion.div>
        <motion.div
          className="absolute bottom-12 left-12 w-36 h-36 pointer-events-none z-10"
          animate={{ rotate: -360 }}
          transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 120 120" fill="none">
            <polygon points="60,5 115,60 60,115 5,60" stroke="#84CC16" strokeWidth="1.5" fill="none" opacity="0.25" />
            <polygon points="60,25 95,60 60,95 25,60" stroke="#84CC16" strokeWidth="1" fill="none" opacity="0.15" />
            <circle cx="60" cy="60" r="8" fill="#F59E0B" opacity="0.1" />
          </svg>
        </motion.div>

        {/* ── Halo lumineux (glow) derrière le contenu ── */}
        <div className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full bg-[#84CC16] opacity-[0.04] blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[#F59E0B] opacity-[0.03] blur-[100px] pointer-events-none" />

        {/* ═══ Contenu du côté gauche ═══ */}
        <div className="relative z-20 flex flex-col justify-between h-full p-12 xl:p-16">

          {/* ── Header : Logo SECT ── */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="flex items-center gap-3"
          >
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center shadow-xl shadow-[#84CC16]/20">
              <GraduationCap className="h-8 w-8 text-[#1E1B4B]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">SECT</h1>
              <p className="text-xs text-[#F59E0B]/70 font-medium tracking-wider uppercase">Système d'Évaluation</p>
            </div>
          </motion.div>

          {/* ── Section centrale : titre + stats + témoignage ── */}
          <div className="flex-1 flex flex-col justify-center max-w-xl">

            {/* Titre principal animé */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
            >
              <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight mb-4">
                L'évaluation
                <br />
                <span className="bg-gradient-to-r from-[#84CC16] via-[#F59E0B] to-[#C2410C] bg-clip-text text-transparent">
                  réinventée par l'IA
                </span>
              </h2>
              <p className="text-white/50 text-lg leading-relaxed max-w-md">
                Générez vos sujets, surveillez les examens en ligne et corrigez
                automatiquement. Conçu pour les universités d'Afrique de l'Ouest.
              </p>
            </motion.div>

            {/* Stats animées (compteurs) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease: 'easeOut' }}
              className="grid grid-cols-4 gap-4 mt-10"
            >
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + i * 0.1, type: 'spring', damping: 15 }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                >
                  <stat.icon className="h-5 w-5" style={{ color: stat.color }} />
                  <span className="text-xl font-bold text-white">
                    <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                  </span>
                  <span className="text-[10px] text-white/40 uppercase tracking-wider text-center">{stat.label}</span>
                </motion.div>
              ))}
            </motion.div>

            {/* Témoignage rotatif */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 1 }}
              className="mt-8 p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTestimonial}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.4 }}
                >
                  <p className="text-white/70 text-sm italic leading-relaxed mb-3">
                    "{testimonials[activeTestimonial].text}"
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#F59E0B] to-[#C2410C] flex items-center justify-center text-xs font-bold text-white">
                      {testimonials[activeTestimonial].author.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">{testimonials[activeTestimonial].author}</p>
                      <p className="text-[10px] text-white/40">{testimonials[activeTestimonial].role}</p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
              {/* Indicateurs */}
              <div className="flex gap-1.5 mt-3">
                {testimonials.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveTestimonial(i)}
                    className={`h-1 rounded-full transition-all ${i === activeTestimonial ? 'w-6 bg-[#84CC16]' : 'w-2 bg-white/20'}`}
                    aria-label={`Témoignage ${i + 1}`}
                  />
                ))}
              </div>
            </motion.div>
          </div>

          {/* ── Features badges (bas) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="flex items-center gap-6 mt-8"
          >
            {[
              { icon: Sparkles, label: 'IA Intégrée' },
              { icon: Shield, label: 'Anti-Triche' },
              { icon: TrendingUp, label: 'Analytics' },
              { icon: CheckCircle2, label: 'Multi-rôles' },
            ].map((feature, i) => (
              <motion.div
                key={feature.label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.3 + i * 0.1 }}
                className="flex items-center gap-2"
              >
                <feature.icon className="h-4 w-4 text-[#F59E0B]" />
                <span className="text-xs text-white/50 font-medium">{feature.label}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Footer ── */}
          <p className="text-xs text-white/25 mt-6">
            © 2025 SECT — Conçu en Côte d'Ivoire 🇨🇮
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          CÔTÉ DROIT (40%) — Formulaire sur fond clair
          ════════════════════════════════════════════════════════════════ */}
      <div className="w-full lg:w-[40%] flex items-center justify-center bg-[#F8FAFC] p-6 sm:p-12 relative">
        {/* Motifs géométriques dorés dans les coins */}
        <div className="absolute top-6 right-6 w-16 h-16 opacity-10 pointer-events-none">
          <svg viewBox="0 0 60 60" fill="none">
            <polygon points="30,5 55,30 30,55 5,30" stroke="#F59E0B" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
        <div className="absolute bottom-6 left-6 w-20 h-20 opacity-10 pointer-events-none">
          <svg viewBox="0 0 80 80" fill="none">
            <polygon points="40,5 75,40 40,75 5,40" stroke="#84CC16" strokeWidth="1.5" fill="none" />
            <polygon points="40,20 60,40 40,60 20,40" stroke="#84CC16" strokeWidth="1" fill="none" />
          </svg>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full max-w-sm"
        >
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-[#1E1B4B]" />
            </div>
            <span className="text-xl font-bold text-[#1E1B4B]">SECT</span>
          </div>

          {/* Toggle Personnel / Étudiant */}
          <div className="relative flex bg-[#1E1B4B]/5 rounded-xl p-1 mb-8 border border-[#1E1B4B]/10">
            <motion.div
              className="absolute top-1 bottom-1 rounded-lg bg-[#84CC16] shadow-md"
              initial={false}
              animate={{ left: isPersonnel ? '4px' : '50%', width: 'calc(50% - 4px)' }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            />
            <button
              type="button"
              onClick={() => handleModeChange('personnel')}
              aria-pressed={isPersonnel}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#84CC16] focus-visible:ring-offset-2 ${isPersonnel ? 'text-[#1E1B4B]' : 'text-[#1E1B4B]/40 hover:text-[#1E1B4B]/60'}`}
            >
              <Briefcase className="w-4 h-4" />
              Personnel
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('etudiant')}
              aria-pressed={!isPersonnel}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#84CC16] focus-visible:ring-offset-2 ${!isPersonnel ? 'text-[#1E1B4B]' : 'text-[#1E1B4B]/40 hover:text-[#1E1B4B]/60'}`}
            >
              <GraduationCap className="w-4 h-4" />
              Étudiant
            </button>
          </div>

          {/* Titre */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[#1E1B4B] tracking-tight">
              Bon retour ! 👋
            </h2>
            <p className="text-sm text-[#1E1B4B]/50 mt-1">
              Accédez à votre espace d'apprentissage
            </p>
          </div>

          {/* Erreur */}
          <AnimatePresence>
            {loginError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 px-4 py-3 rounded-lg bg-[#C2410C]/10 border border-[#C2410C]/20 text-sm text-[#C2410C] font-medium"
              >
                {loginError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Formulaire */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Email / Matricule */}
            <div className="space-y-1.5">
              <Label htmlFor="identifier" className="text-xs font-semibold text-[#1E1B4B]/70 uppercase tracking-wider">
                {identifierLabel}
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B]" />
                <Input
                  id="identifier"
                  type={isPersonnel ? 'email' : 'text'}
                  placeholder={isPersonnel ? 'votre.email@universite.fr' : 'ETU-XXXXXX ou email'}
                  className="pl-10 h-12 rounded-xl border-[#1E1B4B]/15 bg-white text-[#1E1B4B] placeholder:text-[#1E1B4B]/30 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/20 focus-visible:ring-[#84CC16]/20 transition-all"
                  {...form.register('identifier')}
                />
              </div>
              {form.formState.errors.identifier && (
                <p className="text-xs text-[#C2410C]">{form.formState.errors.identifier.message}</p>
              )}
            </div>

            {/* Mot de passe */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-[#1E1B4B]/70 uppercase tracking-wider">
                Mot de passe
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B]" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 pr-10 h-12 rounded-xl border-[#1E1B4B]/15 bg-white text-[#1E1B4B] placeholder:text-[#1E1B4B]/30 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/20 focus-visible:ring-[#84CC16]/20 transition-all"
                  {...form.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1E1B4B]/40 hover:text-[#1E1B4B] transition-colors"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-[#C2410C]">{form.formState.errors.password.message}</p>
              )}
            </div>

            {/* Lien mot de passe oublié */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setResetDialogOpen(true); setResetSent(false); setResetEmail('') }}
                className="text-xs font-medium text-[#1E1B4B] hover:text-[#C2410C] transition-colors underline-offset-2 hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </div>

            {/* Bouton principal */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-[#84CC16]/40 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#84CC16] focus-visible:ring-offset-2"
            >
              {isLoading ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Connexion...</>
              ) : (
                'Se connecter'
              )}
            </Button>
          </form>

          {/* Retour landing */}
          <div className="mt-8 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-[#1E1B4B]/50 hover:text-[#1E1B4B] transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Retour à l'accueil
            </a>
          </div>
        </motion.div>
      </div>

      {/* ════════ DIALOG : Mot de passe oublié ════════ */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl border-[#1E1B4B]/10">
          <DialogHeader>
            <DialogTitle className="text-[#1E1B4B] font-bold">Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription className="text-[#1E1B4B]/50">
              {resetSent
                ? 'Entrez le token reçu par email et votre nouveau mot de passe.'
                : 'Entrez votre adresse email pour recevoir un lien de réinitialisation.'}
            </DialogDescription>
          </DialogHeader>

          {!resetSent ? (
            <>
              <div className="space-y-2 py-2">
                <Label htmlFor="reset-email" className="text-xs font-semibold text-[#1E1B4B]/70 uppercase tracking-wider">
                  Adresse email
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="votre.email@universite.fr"
                  className="h-11 rounded-xl border-[#1E1B4B]/15 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/20"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetDialogOpen(false)} className="rounded-xl border-[#1E1B4B]/15">
                  Annuler
                </Button>
                <Button
                  onClick={handleResetRequest}
                  disabled={resetSending || !resetEmail.trim()}
                  className="rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold"
                >
                  {resetSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Envoyer
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="reset-token" className="text-xs font-semibold text-[#1E1B4B]/70 uppercase tracking-wider">
                    Token de réinitialisation
                  </Label>
                  <Input
                    id="reset-token"
                    type="text"
                    value={resetToken ?? ''}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Collez le token reçu par email"
                    className="h-11 rounded-xl border-[#1E1B4B]/15 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-password" className="text-xs font-semibold text-[#1E1B4B]/70 uppercase tracking-wider">
                    Nouveau mot de passe
                  </Label>
                  <Input
                    id="reset-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 rounded-xl border-[#1E1B4B]/15 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/20"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetDialogOpen(false)} className="rounded-xl border-[#1E1B4B]/15">
                  Annuler
                </Button>
                <Button
                  onClick={handleResetConfirm}
                  disabled={confirmSending || !resetToken?.trim() || !newPassword.trim()}
                  className="rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold"
                >
                  {confirmSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Réinitialiser
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
