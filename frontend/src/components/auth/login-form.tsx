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
  ArrowRight,
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

  const [lastCredentials, setLastCredentials] = useState<{identifier: string; password: string} | null>(null)

  const login = useAuthStore((state) => state.login)
  const loginStudent = useAuthStore((state) => state.loginStudent)
  const isLoading = useAuthStore((state) => state.isLoading)
  const multiAccounts = useAuthStore((state) => state.multiAccounts)

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
    setLastCredentials({ identifier: data.identifier, password: data.password })
    try {
      let success = false
      if (loginMode === 'etudiant') {
        success = await loginStudent(data.identifier, data.password)
      } else {
        success = await login(data.identifier, data.password)
      }
      // SECT-B2C-MULTI-ETAB : si multiAccounts est présent, le store a reçu
      // la liste des établissements. On les affiche pour choix.
      const { multiAccounts } = useAuthStore.getState()
      if (multiAccounts && multiAccounts.length > 0) {
        // L'utilisateur choisira un établissement — ne pas afficher d'erreur
        return
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
      } else if (loginErr?.status === 402) {
        // SECT-GENIUSPAY-WAVE-SECURITY + SECT-B2C-EXPIRE : paiement requis.
        // Rediriger selon reason :
        //   - pending → /paiement/retry (jamais payé, finaliser inscription)
        //   - expired → /abonnement-expire (expiré, renouveler OU rétrograder)
        const aboId = loginErr.abonnementId
        const reason = loginErr.reason
        if (aboId) {
          // Stocker en localStorage pour /paiement/succes
          try { localStorage.setItem('sect_pending_abo', aboId) } catch {}
          if (reason === 'expired') {
            window.location.href = `/abonnement-expire?abo=${encodeURIComponent(aboId)}`
          } else {
            window.location.href = `/paiement/retry?abo=${encodeURIComponent(aboId)}`
          }
        } else {
          setLoginError('Paiement requis. Veuillez finaliser votre inscription sur la page de souscription.')
        }
      } else if (loginErr?.status === 0) {
        setLoginError('Problème de connexion. Vérifiez votre réseau.')
      } else {
        const errorMsg = loginMode === 'etudiant'
          ? 'Matricule/email ou mot de passe incorrect.'
          : 'Email ou mot de passe incorrect.'
        setLoginError(errorMsg)
      }
    }
  }, [loginMode, login, loginStudent, setLastCredentials])

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
        toast.success('Email envoyé', { description: 'Si un compte existe, un lien de réinitialisation a été envoyé.' })
      } else {
        toast.error('Erreur', { description: 'Impossible d\'envoyer l\'email.' })
      }
    } catch {
      toast.error('Erreur', { description: 'Vérifiez votre connexion.' })
    } finally {
      setResetSending(false)
    }
  }, [resetEmail])

  const isPersonnel = loginMode === 'personnel'
  const identifierLabel = isPersonnel ? 'Adresse email' : 'Matricule ou Email'

  // Données pour les stats animées
  const stats = [
    { icon: Users, value: 500, suffix: '+', label: 'Étudiants', color: '#84CC16' },
    { icon: Zap, value: 200, suffix: '+', label: 'Examens corrigés', color: '#F59E0B' },
    { icon: Shield, value: 98, suffix: '%', label: 'Précision IA', color: '#84CC16' },
    { icon: Award, value: 4, suffix: '', label: 'Rôles', color: '#F59E0B' },
  ]

  // Textes promotionnels rotatifs
  const promoTexts = [
    '✨ Générez des QCM, QRC et exercices de code à partir de vos cours en 60 secondes',
    '🛡️ Détection de fraude en temps réel : onglets, copier-coller, reconnaissance faciale',
    '⚡ Corrigez 200 copies pendant votre café avec 98% de précision',
    '📊 Statistiques détaillées : moyennes, taux de réussite, questions à risque',
    '🎓 4 rôles : Admin, Responsable, Enseignant, Étudiant — une expérience pour chacun',
    '🌐 Fonctionne hors ligne — vos examens sont sauvegardés et synchronisés automatiquement',
    '🔔 Notifications push — soyez alerté en temps réel des nouveaux résultats et badges',
    '🇨🇮 Conçu en Côte d\'Ivoire pour les universités d\'Afrique de l\'Ouest',
  ]
  const [activePromo, setActivePromo] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActivePromo((prev) => (prev + 1) % promoTexts.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [promoTexts.length])

  return (
    <div className="min-h-screen flex bg-[#1E1B4B]">
      {/* ════════════════════════════════════════════════════════════════
          CÔTÉ GAUCHE (60%) — Bleu nuit + Kente riche + Avantages SECT
          ════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[60%] relative flex-col overflow-hidden">
        {/* ── Fond : dégradé bleu nuit profond ── */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A1931] via-[#1E1B4B] to-[#0f0d2e]" />

        {/* ── Motif Kente riche (inspiration tissage traditionnel, opacité augmentée) ── */}
        {/* Couche 1 : bandes verticales kente tricolores (plus visibles) */}
        <div
          className="absolute inset-0 opacity-[0.12] pointer-events-none"
          style={{
            backgroundImage: `
              repeating-linear-gradient(90deg,
                transparent 0, transparent 50px,
                #84CC16 50px, #84CC16 55px,
                transparent 55px, transparent 58px,
                #F59E0B 58px, #F59E0B 61px,
                transparent 61px, transparent 64px,
                #C2410C 64px, #C2410C 66px,
                transparent 66px, transparent 100px
              )
            `,
          }}
        />
        {/* Couche 2 : triangles diagonaux (motif kente traditionnel) */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage: `
              repeating-linear-gradient(45deg, transparent 0, transparent 25px, #F59E0B 25px, #F59E0B 30px, transparent 30px, transparent 50px),
              repeating-linear-gradient(-45deg, transparent 0, transparent 25px, #84CC16 25px, #84CC16 30px, transparent 30px, transparent 50px)
            `,
          }}
        />
        {/* Couche 3 : points dorés (motif mandala) */}
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, #F59E0B 1.5px, transparent 1.5px)`,
            backgroundSize: '20px 20px',
          }}
        />

        {/* ── Bande kente verticale (bord droit, 4 couleurs, élargie) ── */}
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
            boxShadow: '-4px 0 12px rgba(0,0,0,0.15)',
          }}
        />

        {/* ── Particules dorées flottantes (plus nombreuses) ── */}
        <FloatingParticle delay={0} duration={4} x="10%" y="25%" size={4} color="#F59E0B" />
        <FloatingParticle delay={0.8} duration={5} x="85%" y="15%" size={3} color="#84CC16" />
        <FloatingParticle delay={1.5} duration={3.5} x="20%" y="65%" size={5} color="#F59E0B" />
        <FloatingParticle delay={0.3} duration={4.5} x="75%" y="55%" size={3} color="#84CC16" />
        <FloatingParticle delay={1.2} duration={3} x="45%" y="10%" size={4} color="#C2410C" />
        <FloatingParticle delay={2} duration={4} x="90%" y="75%" size={3} color="#F59E0B" />
        <FloatingParticle delay={0.6} duration={5.5} x="15%" y="85%" size={4} color="#84CC16" />
        <FloatingParticle delay={1.8} duration={3.8} x="60%" y="40%" size={3} color="#F59E0B" />

        {/* ── Motifs géométriques africains (losanges rotatifs) ── */}
        <motion.div
          className="absolute top-8 right-16 w-32 h-32 pointer-events-none z-10"
          animate={{ rotate: 360 }}
          transition={{ duration: 50, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 100 100" fill="none">
            <polygon points="50,5 95,50 50,95 5,50" stroke="#F59E0B" strokeWidth="2" fill="none" opacity="0.35" />
            <polygon points="50,20 80,50 50,80 20,50" stroke="#F59E0B" strokeWidth="1.5" fill="none" opacity="0.25" />
            <polygon points="50,35 65,50 50,65 35,50" stroke="#84CC16" strokeWidth="1" fill="none" opacity="0.2" />
            <circle cx="50" cy="50" r="4" fill="#F59E0B" opacity="0.3" />
          </svg>
        </motion.div>
        <motion.div
          className="absolute bottom-16 left-12 w-40 h-40 pointer-events-none z-10"
          animate={{ rotate: -360 }}
          transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 120 120" fill="none">
            <polygon points="60,5 115,60 60,115 5,60" stroke="#84CC16" strokeWidth="2" fill="none" opacity="0.3" />
            <polygon points="60,25 95,60 60,95 25,60" stroke="#84CC16" strokeWidth="1.5" fill="none" opacity="0.2" />
            <circle cx="60" cy="60" r="6" fill="#F59E0B" opacity="0.15" />
          </svg>
        </motion.div>

        {/* ── Glow doré animé pulsant ── */}
        <motion.div
          className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full bg-[#F59E0B] blur-[130px] pointer-events-none"
          animate={{ opacity: [0.03, 0.08, 0.03], scale: [1, 1.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[#84CC16] blur-[110px] pointer-events-none"
          animate={{ opacity: [0.02, 0.06, 0.02], scale: [1, 1.15, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />

        {/* ═══ Contenu du côté gauche ═══ */}
        <div className="relative z-20 flex flex-col justify-between h-full p-12 xl:p-16">

          {/* ── Header : Logo SECT ── */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="flex items-center gap-3"
          >
            <div className="ds-logo-glow h-14 w-14 rounded-2xl bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center">
              <GraduationCap className="h-8 w-8 text-[#1E1B4B]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">SECT</h1>
              <p className="text-xs text-[#F59E0B]/80 font-medium tracking-wider uppercase">Système d'Évaluation</p>
            </div>
          </motion.div>

          {/* ── Section centrale : titre + avantages ── */}
          <div className="flex-1 flex flex-col justify-center max-w-xl">

            {/* Titre principal */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
            >
              <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight mb-4">
                L'évaluation
                <br />
                <span className="bg-gradient-to-r from-[#84CC16] via-[#FBBF24] to-[#C2410C] bg-clip-text text-transparent">
                  réinventée par l'IA
                </span>
              </h2>
              <p className="text-white/65 text-lg leading-relaxed max-w-md">
                Générez, surveillez et corrigez vos examens en quelques minutes.
                Conçu pour les universités d'Afrique.
              </p>

              {/* Texte promotionnel dynamique rotatif */}
              <div className="mt-3 h-7 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={activePromo}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="text-sm text-[#FBBF24]/80 font-medium"
                  >
                    {promoTexts[activePromo]}
                  </motion.p>
                </AnimatePresence>
              </div>
            </motion.div>

            {/* ── Avantages de la plateforme (pas de témoignages) ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-8 space-y-3"
            >
              {[
                { icon: Sparkles, title: 'Génération IA de sujets', desc: 'Créez QCM, QRC et exercices de code à partir de vos cours en 60 secondes' },
                { icon: Shield, title: 'Surveillance anti-fraude', desc: 'Détection de triche en temps réel : onglets, copier-coller, reconnaissance faciale' },
                { icon: Zap, title: 'Correction automatique', desc: 'L\'IA corrige 200 copies pendant votre café avec 98% de précision' },
                { icon: TrendingUp, title: 'Analytics pédagogiques', desc: 'Statistiques détaillées : moyennes, taux de réussite, questions à risque' },
              ].map((advantage, i) => (
                <motion.div
                  key={advantage.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.12, type: 'spring', damping: 18 }}
                  className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
                >
                  <div className="shrink-0 h-9 w-9 rounded-lg bg-gradient-to-br from-[#F59E0B]/20 to-[#C2410C]/10 flex items-center justify-center border border-[#F59E0B]/20">
                    <advantage.icon className="h-4.5 w-4.5 text-[#F59E0B]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">{advantage.title}</h3>
                    <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{advantage.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* ── Footer gauche ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="flex items-center justify-between mt-8"
          >
            <div className="flex items-center gap-4">
              {[
                { icon: Users, label: '500+ étudiants' },
                { icon: Award, label: '4 rôles' },
                { icon: CheckCircle2, label: '98% précision' },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-1.5">
                  <stat.icon className="h-3.5 w-3.5 text-[#84CC16]" />
                  <span className="text-xs text-white/55 font-medium">{stat.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-white/40">
              © 2025 SECT 🇨🇮
            </p>
          </motion.div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          CÔTÉ DROIT (40%) — Carte flottante premium, centrée
          ════════════════════════════════════════════════════════════════ */}
      <div className="w-full lg:w-[40%] flex items-center justify-center bg-gradient-to-br from-[#F8FAFC] via-[#F0F2F5] to-[#E8EAF0] px-6 py-8 relative overflow-hidden">

        {/* ── Motifs géométriques décoratifs (coins) ── */}
        <div className="absolute top-4 right-4 w-20 h-20 opacity-[0.08] pointer-events-none">
          <svg viewBox="0 0 80 80" fill="none">
            <polygon points="40,5 75,40 40,75 5,40" stroke="#F59E0B" strokeWidth="2" fill="none" />
            <polygon points="40,20 60,40 40,60 20,40" stroke="#F59E0B" strokeWidth="1.5" fill="none" />
            <circle cx="40" cy="40" r="4" fill="#F59E0B" opacity="0.3" />
          </svg>
        </div>
        <div className="absolute bottom-4 left-4 w-24 h-24 opacity-[0.06] pointer-events-none">
          <svg viewBox="0 0 96 96" fill="none">
            <polygon points="48,5 91,48 48,91 5,48" stroke="#84CC16" strokeWidth="2" fill="none" />
            <polygon points="48,24 72,48 48,72 24,48" stroke="#84CC16" strokeWidth="1.5" fill="none" />
          </svg>
        </div>

        {/* ── Glow subtil en fond ── */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#84CC16] opacity-[0.03] blur-[80px] pointer-events-none" />

        {/* ── Carte flottante ── */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-[380px] bg-white rounded-2xl shadow-2xl shadow-[#1E1B4B]/10 border border-[#1E1B4B]/8 p-8"
        >
          {/* ── Bande kente supérieure (signature) ── */}
          <div
            className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl opacity-60"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg,
                #84CC16 0px, #84CC16 20px,
                #C2410C 20px, #C2410C 40px,
                #F59E0B 40px, #F59E0B 60px
              )`,
            }}
          />

          {/* ── Logo mobile ── */}
          <div className="lg:hidden flex items-center gap-2.5 mb-5 justify-center">
            <div className="ds-logo-glow h-10 w-10 rounded-lg bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-[#1E1B4B]" />
            </div>
            <span className="text-xl font-bold text-[#1E1B4B]">SECT</span>
          </div>

          {/* ── Titre + sous-titre (AU-DESSUS du toggle) ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="mb-5 text-center"
          >
            <h2 className="text-2xl font-bold text-[#1E1B4B] tracking-tight leading-tight">
              Bon retour ! 👋
            </h2>
            <p className="text-sm text-[#1E1B4B]/50 mt-1.5">
              Accédez à votre espace d'évaluation
            </p>
          </motion.div>

          {/* ── Toggle Personnel / Étudiant ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="relative flex bg-[#1E1B4B]/[0.04] rounded-xl p-1 mb-5 border border-[#1E1B4B]/8"
          >
            <motion.div
              className="absolute top-1 bottom-1 rounded-lg bg-[#84CC16] shadow-md shadow-[#84CC16]/30"
              initial={false}
              animate={{ left: isPersonnel ? '4px' : '50%', width: 'calc(50% - 4px)' }}
              transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            />
            <button
              type="button"
              onClick={() => handleModeChange('personnel')}
              aria-pressed={isPersonnel}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#84CC16] focus-visible:ring-offset-2 ${isPersonnel ? 'text-[#1E1B4B]' : 'text-[#1E1B4B]/55 hover:text-[#1E1B4B]/60'}`}
            >
              <Briefcase className="w-4 h-4" />
              Personnel
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('etudiant')}
              aria-pressed={!isPersonnel}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#84CC16] focus-visible:ring-offset-2 ${!isPersonnel ? 'text-[#1E1B4B]' : 'text-[#1E1B4B]/55 hover:text-[#1E1B4B]/60'}`}
            >
              <GraduationCap className="w-4 h-4" />
              Étudiant
            </button>
          </motion.div>

          {/* ── Erreur ── */}
          <AnimatePresence>
            {/* SECT-B2C-MULTI-ETAB : choix d'établissement si multi-comptes */}
            {multiAccounts && multiAccounts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="px-3 py-3 rounded-lg bg-[#84CC16]/8 border border-[#84CC16]/20"
              >
                <p className="text-sm font-semibold text-[#1E1B4B] mb-3">
                  Plusieurs établissements trouvés. Choisissez :
                </p>
                <div className="space-y-2">
                  {multiAccounts.map((acc: any) => (
                    <button
                      key={acc.userId}
                      type="button"
                      onClick={async () => {
                        setLoginError(null)
                        useAuthStore.setState({ multiAccounts: null })
                        const s = await login(lastCredentials?.identifier || form.getValues('identifier'), lastCredentials?.password || form.getValues('password'), acc.userId)
                        if (!s) setLoginError('Connexion échouée. Réessayez.')
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-lg bg-white border border-[#1E1B4B]/10 hover:border-[#84CC16] hover:bg-[#84CC16]/5 transition-colors text-left"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#1E1B4B]">{acc.etablissementNom || 'Établissement'}</p>
                        <p className="text-xs text-[#1E1B4B]/50">{acc.role} — {acc.email}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-[#84CC16]" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            {loginError && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="px-3 py-2.5 rounded-lg bg-[#C2410C]/8 border border-[#C2410C]/15 text-sm text-[#C2410C] font-medium flex items-center gap-2"
              >
                <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-[#C2410C]" />
                {loginError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Formulaire ── */}
          <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            {/* Email / Matricule */}
            <div className="space-y-1.5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={identifierLabel}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <Label htmlFor="identifier" className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">
                    {identifierLabel}
                  </Label>
                </motion.div>
              </AnimatePresence>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B] transition-transform group-focus-within:scale-110" />
                <Input
                  id="identifier"
                  type={isPersonnel ? 'email' : 'text'}
                  placeholder={isPersonnel ? 'votre.email@universite.fr' : 'ETU-XXXXXX ou email'}
                  autoComplete="username"
                  className="pl-10 h-12 rounded-xl border-[#1E1B4B]/12 bg-[#F8FAFC] text-[#1E1B4B] placeholder:text-[#1E1B4B]/60 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/15 focus:bg-white transition-all"
                  {...form.register('identifier')}
                />
              </div>
              {form.formState.errors.identifier && (
                <p className="text-xs text-[#C2410C]">{form.formState.errors.identifier.message}</p>
              )}
            </div>

            {/* Mot de passe */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">
                Mot de passe
              </Label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B] transition-transform group-focus-within:scale-110" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pl-10 pr-10 h-12 rounded-xl border-[#1E1B4B]/12 bg-[#F8FAFC] text-[#1E1B4B] placeholder:text-[#1E1B4B]/60 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/15 focus:bg-white transition-all"
                  {...form.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#1E1B4B]/55 hover:text-[#1E1B4B] transition-colors"
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
            <div className="flex justify-end -mt-0.5">
              <button
                type="button"
                onClick={() => { setResetDialogOpen(true); setResetSent(false); setResetEmail('') }}
                className="text-xs font-medium text-[#1E1B4B]/70 hover:text-[#C2410C] transition-colors underline-offset-2 hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </div>

            {/* Bouton principal */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="pt-1"
            >
              <Button
                type="submit"
                disabled={isLoading}
                className="ds-shimmer w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#84CC16] focus-visible:ring-offset-2"
              >
                {isLoading ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Connexion...</>
                ) : (
                  'Se connecter'
                )}
              </Button>
            </motion.div>
          </motion.form>

          {/* ── Retour landing ── */}
          <div className="mt-5 pt-4 border-t border-[#1E1B4B]/8 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-[#1E1B4B]/60 hover:text-[#1E1B4B] transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Retour à l'accueil
            </a>
          </div>
        </motion.div>
      </div>

      {/* ════════ DIALOG : Mot de passe oublié (self-service reset — 000054) ════════ */}
      {/* Flux : l'utilisateur saisit son email → POST /api/auth/password-reset */}
      {/* → le backend génère un token (valable 30 min) et envoie un email avec un */}
      {/* lien /reset-password?token=... → l'utilisateur clique et choisit son nouveau */}
      {/* mot de passe. Anti-énumération : réponse 200 générique qu'un compte existe ou non. */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl border-[#1E1B4B]/10">
          <DialogHeader>
            <DialogTitle className="text-[#1E1B4B] font-bold">Mot de passe oublié ?</DialogTitle>
            <DialogDescription className="text-[#1E1B4B]/50">
              Réinitialisation par email
            </DialogDescription>
          </DialogHeader>

          {!resetSent ? (
            <>
              <div className="space-y-3 py-2">
                <p className="text-sm text-[#1E1B4B]/80">
                  Saisissez votre adresse email professionnelle. Vous recevrez un lien
                  de réinitialisation valable <span className="font-semibold">30 minutes</span>.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="resetEmail" className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">
                    Adresse email
                  </Label>
                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B] transition-transform group-focus-within:scale-110" />
                    <Input
                      id="resetEmail"
                      type="email"
                      placeholder="votre.email@universite.fr"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && resetEmail.trim()) handleResetRequest() }}
                      className="pl-10 h-11 rounded-xl border-[#1E1B4B]/12 bg-[#F8FAFC] text-[#1E1B4B] placeholder:text-[#1E1B4B]/60 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/15 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  onClick={() => setResetDialogOpen(false)}
                  variant="outline"
                  className="rounded-xl border-[#1E1B4B]/15 text-[#1E1B4B]/70 hover:bg-[#1E1B4B]/5"
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleResetRequest}
                  disabled={resetSending || !resetEmail.trim()}
                  className="rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold"
                >
                  {resetSending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Envoi...</>
                  ) : (
                    'Envoyer le lien'
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-3 py-2 text-sm text-[#1E1B4B]/80">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-[#84CC16] mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <p className="font-medium text-[#1E1B4B]">Lien envoyé</p>
                    <p>
                      Si un compte existe pour <span className="font-semibold">{resetEmail}</span>,
                      un email contenant un lien de réinitialisation vient d&apos;être envoyé.
                    </p>
                    <p className="text-xs text-[#1E1B4B]/60">
                      Le lien est valable 30 minutes. Pensez à vérifier vos spams.
                      Si vous ne recevez rien, votre email n&apos;est peut-être pas associé
                      à un compte SECT.
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => { setResetDialogOpen(false); setResetSent(false); setResetEmail('') }}
                  className="rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold"
                >
                  Fermer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
