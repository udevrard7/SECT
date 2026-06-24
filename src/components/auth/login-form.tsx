'use client'

import { useState, useCallback } from 'react'
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
// LOGIN FORM — Savane EdTech
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

  // Reset form when mode changes
  const handleModeChange = useCallback((newMode: LoginMode) => {
    if (newMode === loginMode) return
    setLoginMode(newMode)
    setLoginError(null)
    form.reset({ identifier: '', password: '' })
  }, [loginMode, form])

  // Submit handler
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

  return (
    <div className="min-h-screen flex bg-[#1E1B4B]">
      {/* ════════ CÔTÉ GAUCHE (60%) — Bleu nuit + Kente + Branding ════════ */}
      <div className="hidden lg:flex lg:w-[60%] relative flex-col justify-between p-12 overflow-hidden">
        {/* Motif Kente subtil en filigrane */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage: `
              repeating-linear-gradient(45deg, transparent 0, transparent 20px, #84CC16 20px, #84CC16 24px, transparent 24px, transparent 44px, #F59E0B 44px, #F59E0B 48px),
              repeating-linear-gradient(-45deg, transparent 0, transparent 20px, #C2410C 20px, #C2410C 24px, transparent 24px, transparent 44px, #F59E0B 44px, #F59E0B 48px)
            `,
          }}
        />

        {/* Motifs géométriques dorés en coins */}
        <div className="absolute top-8 right-8 w-24 h-24 opacity-20 pointer-events-none">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,5 95,50 50,95 5,50" stroke="#F59E0B" strokeWidth="2" fill="none" />
            <polygon points="50,20 80,50 50,80 20,50" stroke="#F59E0B" strokeWidth="1.5" fill="none" />
            <circle cx="50" cy="50" r="8" fill="#F59E0B" opacity="0.5" />
          </svg>
        </div>
        <div className="absolute bottom-8 left-8 w-32 h-32 opacity-15 pointer-events-none">
          <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="60,10 110,60 60,110 10,60" stroke="#84CC16" strokeWidth="2" fill="none" />
            <polygon points="60,30 90,60 60,90 30,60" stroke="#84CC16" strokeWidth="1.5" fill="none" />
          </svg>
        </div>

        {/* Bande kente verticale décorative sur le bord droit */}
        <div
          className="absolute top-0 bottom-0 right-0 w-2 opacity-60"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg,
              #84CC16 0px, #84CC16 40px,
              #C2410C 40px, #C2410C 80px,
              #F59E0B 80px, #F59E0B 120px,
              #1E1B4B 120px, #1E1B4B 160px
            )`,
          }}
        />

        {/* Logo + Brand en haut */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center shadow-lg">
            <GraduationCap className="h-7 w-7 text-[#1E1B4B]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#F59E0B] tracking-tight">Savane EdTech</h1>
            <p className="text-xs text-white/50">SECT — Système d'Évaluation</p>
          </div>
        </div>

        {/* Illustration centrale — baobab + étudiant stylisé */}
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="text-center"
          >
            {/* Baobab géométrique stylisé */}
            <svg width="280" height="240" viewBox="0 0 280 240" fill="none" className="mx-auto mb-6">
              {/* Tronc */}
              <rect x="125" y="120" width="30" height="100" rx="4" fill="#C2410C" opacity="0.8" />
              {/* Branches */}
              <path d="M140 120 Q100 80 70 60" stroke="#C2410C" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.7" />
              <path d="M140 120 Q180 80 210 60" stroke="#C2410C" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.7" />
              <path d="M140 120 Q120 70 110 40" stroke="#C2410C" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.6" />
              <path d="M140 120 Q160 70 170 40" stroke="#C2410C" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.6" />
              {/* Feuillage — cercles dorés */}
              <circle cx="70" cy="55" r="22" fill="#F59E0B" opacity="0.25" />
              <circle cx="210" cy="55" r="22" fill="#F59E0B" opacity="0.25" />
              <circle cx="110" cy="35" r="18" fill="#F59E0B" opacity="0.2" />
              <circle cx="170" cy="35" r="18" fill="#F59E0B" opacity="0.2" />
              <circle cx="140" cy="25" r="25" fill="#84CC16" opacity="0.2" />
              {/* Étudiant avec ordinateur — silhouette simple */}
              <circle cx="140" cy="195" r="12" fill="#84CC16" opacity="0.6" />
              <rect x="128" y="210" width="24" height="6" rx="2" fill="#84CC16" opacity="0.5" />
              {/* Sol */}
              <ellipse cx="140" cy="225" rx="50" ry="6" fill="#F59E0B" opacity="0.1" />
            </svg>

            <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">
              L'évaluation réinventée
            </h2>
            <p className="text-white/60 max-w-md mx-auto leading-relaxed">
              Générez vos sujets par IA, surveillez les examens en ligne et corrigez
              automatiquement. Conçu pour les universités d'Afrique de l'Ouest.
            </p>

            {/* Points forts */}
            <div className="flex items-center justify-center gap-6 mt-8">
              {[
                { icon: Sparkles, label: 'IA Intégrée', value: '98%' },
                { icon: KeyRound, label: 'Anti-Triche', value: '24/7' },
                { icon: GraduationCap, label: 'Multi-rôles', value: '4' },
              ].map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex flex-col items-center gap-1"
                >
                  <f.icon className="h-5 w-5 text-[#F59E0B]" />
                  <span className="text-xs font-mono font-bold text-[#84CC16]">{f.value}</span>
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">{f.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Footer gauche */}
        <div className="relative z-10 text-center">
          <p className="text-xs text-white/30">
            © 2025 Savane EdTech — Conçu en Côte d'Ivoire 🇨🇮
          </p>
        </div>
      </div>

      {/* ════════ CÔTÉ DROIT (40%) — Formulaire sur fond blanc ════════ */}
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

        <div className="w-full max-w-sm">
          {/* Logo mobile (visible seulement sur petit écran) */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-[#1E1B4B]" />
            </div>
            <span className="text-xl font-bold text-[#F59E0B]">Savane EdTech</span>
          </div>

          {/* Toggle Personnel / Étudiant */}
          <div className="relative flex bg-[#1E1B4B]/5 rounded-xl p-1 mb-8 border border-[#1E1B4B]/10">
            <motion.div
              className="absolute top-1 bottom-1 rounded-lg bg-[#84CC16] shadow-md"
              initial={false}
              animate={{
                left: isPersonnel ? '4px' : '50%',
                width: 'calc(50% - 4px)',
              }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            />
            <button
              type="button"
              onClick={() => handleModeChange('personnel')}
              aria-pressed={isPersonnel}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#84CC16] focus-visible:ring-offset-2 ${
                isPersonnel ? 'text-[#1E1B4B]' : 'text-[#1E1B4B]/40 hover:text-[#1E1B4B]/60'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              Personnel
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('etudiant')}
              aria-pressed={!isPersonnel}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#84CC16] focus-visible:ring-offset-2 ${
                !isPersonnel ? 'text-[#1E1B4B]' : 'text-[#1E1B4B]/40 hover:text-[#1E1B4B]/60'
              }`}
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

          {/* Séparateur doré */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#F59E0B]/30 to-transparent" />
            <span className="text-xs text-[#1E1B4B]/40 font-medium">ou</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#F59E0B]/30 to-transparent" />
          </div>

          {/* Bouton secondaire Google (placeholder) */}
          <button
            type="button"
            className="w-full h-12 rounded-xl border border-[#C2410C]/30 bg-white text-[#C2410C] font-medium text-sm hover:bg-[#C2410C]/5 transition-all duration-300 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] focus-visible:ring-offset-2"
            onClick={() => toast.info('Bientôt disponible', { description: 'L\'authentification Google arrivera prochainement.' })}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continuer avec Google
          </button>

          {/* Retour landing */}
          <div className="mt-6 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-[#1E1B4B]/50 hover:text-[#1E1B4B] transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Retour à l'accueil
            </a>
          </div>
        </div>
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
                <Button
                  variant="outline"
                  onClick={() => setResetDialogOpen(false)}
                  className="rounded-xl border-[#1E1B4B]/15"
                >
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
                <Button
                  variant="outline"
                  onClick={() => setResetDialogOpen(false)}
                  className="rounded-xl border-[#1E1B4B]/15"
                >
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
