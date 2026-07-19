'use client'

// ═══════════════════════════════════════════════════════════════════════════
// StudentSignupPage — Inscription étudiante via lien direct (MVP B2C Phase 1)
// ═══════════════════════════════════════════════════════════════════════════
// Clone de accept-invitation-page.tsx (design particules + password strength),
// adapté pour l'inscription étudiante B2C : l'étudiant saisit lui-même son
// email + nom + mot de passe. Le token est vérifié via
// /api/student-signup/verify, puis l'inscription est finalisée via
// /api/student-signup.
//
// Identité visuelle : "Savane EdTech" (palette africaine, motif kente,
// particules flottantes, font-display). Aucune dépendance à accept-invitation
// (les helpers getPasswordStrength / getPasswordChecks / useCountdown /
// FloatingParticle sont clonés ici pour éviter un couplage fragile).
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Building2,
  BookOpen,
  MapPin,
  RefreshCw,
  ArrowRight,
  X,
  KeyRound,
  Users,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Badge as DSBadge, ProgressBar } from '@/components/ds'

// ─── Types ───

interface VerifyLinkResponse {
  valid: boolean
  etablissementId: string
  etablissementNom: string
  etablissementType: string
  etablissementVille: string | null
  filiereId: string | null
  filiereNom: string | null
  filiereCode: string | null
  creatorName: string
  expiresAt: string
  useCount: number
  maxUses: number | null
  niveau: string | null
  label: string | null
}

type VerifyErrorCode =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'QUOTA_EXCEEDED'
  | 'USER_EXISTS'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | null

interface StudentSignupPageProps {
  token: string
  initialEmail?: string
  onComplete: () => void
}

// ─── Etab type labels ───

const ETAB_TYPE_LABELS: Record<string, string> = {
  UNIVERSITE: 'Université',
  INSTITUT: 'Institut',
  ECOLE: 'École',
  PERSONNEL: 'Établissement personnel',
  IUT: 'IUT',
  BTS: 'BTS',
}

// ─── Password strength helpers (clonés depuis accept-invitation-page.tsx) ───

function getPasswordStrength(password: string): {
  score: number
  label: string
  color: string
  bgColor: string
} {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 1) return { score, label: 'Faible', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-500' }
  if (score === 2) return { score, label: 'Moyen', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500' }
  if (score === 3) return { score, label: 'Fort', color: 'text-success-text', bgColor: 'bg-success' }
  return { score, label: 'Très fort', color: 'text-success-text', bgColor: 'bg-success' }
}

function getPasswordChecks(password: string) {
  return [
    { label: 'Au moins 8 caractères', met: password.length >= 8 },
    { label: 'Une lettre majuscule', met: /[A-Z]/.test(password) },
    { label: 'Une lettre minuscule', met: /[a-z]/.test(password) },
    { label: 'Un chiffre', met: /[0-9]/.test(password) },
    { label: 'Un caractère spécial (recommandé)', met: /[^A-Za-z0-9]/.test(password) },
  ]
}

// ─── Countdown timer (cloné depuis accept-invitation-page.tsx) ───

function useCountdown(targetDate: string | null) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!targetDate) return

    const update = () => {
      const now = new Date().getTime()
      const target = new Date(targetDate).getTime()
      const diff = target - now

      if (diff <= 0) {
        setTimeLeft('Expirée')
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      if (days > 0) {
        setTimeLeft(`${days}j ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`)
      } else {
        setTimeLeft(`${seconds}s`)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  return timeLeft
}

// ─── Floating particles (cloné depuis login-form.tsx) ───
// Particules flottantes palette africaine : or (#F59E0B), vert lime (#84CC16),
// terre cuite (#C2410C). Identité "Savane EdTech".

function FloatingParticle({
  delay,
  duration,
  x,
  y,
  size,
  color,
}: {
  delay: number
  duration: number
  x: string
  y: string
  size: number
  color: string
}) {
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

// ─── Zod schema ───
// Validation : name ≥ 3 chars, email valide, password ≥ 8 chars avec
// 1 majuscule + 1 minuscule + 1 chiffre (cohérent avec accept-invitation,
// spécial = recommandé mais non bloquant), confirm doit matcher, CGU acceptées.

const signupSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Le nom doit contenir au moins 3 caractères'),
    email: z.string().email('Adresse email invalide'),
    password: z
      .string()
      .min(8, 'Au moins 8 caractères')
      .regex(/[A-Z]/, 'Au moins une majuscule')
      .regex(/[a-z]/, 'Au moins une minuscule')
      .regex(/[0-9]/, 'Au moins un chiffre'),
    confirmPassword: z.string(),
    acceptCGU: z.boolean().refine((v) => v === true, {
      message: "Vous devez accepter les conditions d'utilisation",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

type SignupFormValues = z.infer<typeof signupSchema>

// ─── Main Component ───

export function StudentSignupPage({ token, initialEmail = '', onComplete }: StudentSignupPageProps) {
  // State
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [matricule, setMatricule] = useState<string | null>(null)
  const [userExistsEmail, setUserExistsEmail] = useState<string | null>(null)

  // ─── Verify token (TanStack Query, one-shot) ───
  // On ne logue JAMAIS le token dans la console (sécurité frontend).
  const verifyQuery = useQuery<{
    ok: boolean
    data?: VerifyLinkResponse
    code?: VerifyErrorCode
    message?: string
  }>({
    queryKey: ['student-signup-verify', token],
    queryFn: async () => {
      const res = await fetch(
        `/api/student-signup/verify?token=${encodeURIComponent(token)}`,
      )
      const json = await res.json()
      if (!res.ok) {
        return {
          ok: false,
          code: (json.code || 'SERVER_ERROR') as VerifyErrorCode,
          message: json.error || 'Erreur lors de la vérification',
        }
      }
      return { ok: true, data: json as VerifyLinkResponse }
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const isVerifying = verifyQuery.isLoading || verifyQuery.isFetching
  const linkData = verifyQuery.data?.ok ? verifyQuery.data.data ?? null : null
  const verifyError: VerifyErrorCode = verifyQuery.isError
    ? 'NETWORK_ERROR'
    : verifyQuery.data && !verifyQuery.data.ok
      ? (verifyQuery.data.code ?? null)
      : null
  const verifyErrorMessage = verifyQuery.isError
    ? 'Erreur de connexion. Veuillez vérifier votre connexion internet.'
    : verifyQuery.data && !verifyQuery.data.ok
      ? (verifyQuery.data.message ?? '')
      : ''

  // ─── Form (react-hook-form + zod) ───
  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      email: initialEmail,
      password: '',
      confirmPassword: '',
      acceptCGU: false,
    },
    mode: 'onTouched',
  })

  // Watch password + confirmPassword for live strength meter + match indicator
  const password = form.watch('password')
  const confirmPassword = form.watch('confirmPassword')

  // Countdown
  const countdown = useCountdown(linkData?.expiresAt || null)

  // Places restantes (si maxUses défini)
  const placesRestantes =
    linkData?.maxUses != null ? Math.max(0, linkData.maxUses - linkData.useCount) : null
  const placesPourcentage =
    linkData?.maxUses != null && linkData.maxUses > 0
      ? (linkData.useCount / linkData.maxUses) * 100
      : 0

  // ─── Submit handler ───
  const onSubmit = async (values: SignupFormValues) => {
    setIsSubmitting(true)
    setUserExistsEmail(null)
    try {
      const res = await fetch('/api/student-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email: values.email.trim().toLowerCase(),
          name: values.name.trim(),
          password: values.password,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'USER_EXISTS') {
          setUserExistsEmail(values.email.trim().toLowerCase())
          toast.error('Compte existant', {
            description:
              'Un compte existe déjà avec cet email. Connectez-vous directement.',
          })
        } else if (data.error) {
          toast.error('Erreur', { description: data.error })
        }
        return
      }

      setMatricule(data.user?.matricule ?? null)
      setIsSuccess(true)
      toast.success('Compte créé avec succès', {
        description: 'Vous pouvez maintenant vous connecter.',
      })
    } catch {
      toast.error('Erreur réseau', {
        description: 'Impossible de créer votre compte. Veuillez réessayer.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Render: Loading state ───
  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="h-10 w-10 animate-spin text-success-text mb-4" />
      <p className="text-sm text-muted-foreground">Vérification de votre lien d&apos;inscription...</p>
    </div>
  )

  // ─── Render: Error state ───
  const renderError = () => {
    const getErrorContent = () => {
      switch (verifyError) {
        case 'NOT_FOUND':
          return {
            icon: <X className="h-8 w-8" />,
            title: 'Lien invalide',
            description:
              "Ce lien d'inscription n'est pas valide. Il a peut-être été modifié, révoqué, ou n'existe plus.",
            showRetry: false,
          }
        case 'INACTIVE':
          return {
            icon: <AlertCircle className="h-8 w-8" />,
            title: 'Lien désactivé',
            description:
              "Ce lien d'inscription a été désactivé par l'établissement. Contactez votre établissement pour obtenir un nouveau lien.",
            showRetry: false,
          }
        case 'EXPIRED':
          return {
            icon: <Clock className="h-8 w-8" />,
            title: 'Lien expiré',
            description:
              verifyErrorMessage ||
              "Ce lien d'inscription a expiré. Les liens sont valables 30 jours. Demandez un nouveau lien à votre établissement.",
            showRetry: false,
          }
        case 'QUOTA_EXCEEDED':
          return {
            icon: <Users className="h-8 w-8" />,
            title: 'Quota atteint',
            description:
              "Ce lien a atteint son nombre maximum d'inscriptions. Contactez votre établissement pour obtenir un nouveau lien.",
            showRetry: false,
          }
        case 'NETWORK_ERROR':
          return {
            icon: <AlertCircle className="h-8 w-8" />,
            title: 'Erreur de connexion',
            description:
              'Impossible de vérifier votre lien. Veuillez vérifier votre connexion internet.',
            showRetry: true,
          }
        default:
          return {
            icon: <AlertCircle className="h-8 w-8" />,
            title: 'Erreur',
            description: verifyErrorMessage || "Une erreur inattendue s'est produite.",
            showRetry: true,
          }
      }
    }

    const errorContent = getErrorContent()

    return (
      <div className="flex flex-col items-center text-center py-8" role="alert">
        <div className="flex h-16 w-16 items-center justify-center rounded-full mb-4 bg-destructive/10 text-destructive">
          {errorContent.icon}
        </div>
        <h3 className="text-lg font-semibold mb-2 font-display">{errorContent.title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          {errorContent.description}
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          {errorContent.showRetry && (
            <Button
              variant="outline"
              onClick={() => verifyQuery.refetch()}
              className="border-success/30 text-success-text hover:bg-success/10"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
          )}
          <a href="mailto:contact@sect.app?subject=Probl%C3%A8me%20lien%20d%27inscription">
            <Button className="bg-success hover:bg-success/90 text-success-foreground">
              Contacter le support
            </Button>
          </a>
        </div>
      </div>
    )
  }

  // ─── Render: Success state ───
  const renderSuccess = () => (
    <div className="flex flex-col items-center text-center py-8">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10 mb-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
        >
          <CheckCircle2 className="h-10 w-10 text-success-text" />
        </motion.div>
      </motion.div>
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-xl font-semibold text-success-text mb-2 font-display"
      >
        Compte créé avec succès !
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-sm text-muted-foreground mb-4"
      >
        Bienvenue sur SECT. Vous pouvez maintenant vous connecter avec votre email et votre mot de passe.
      </motion.p>

      {matricule && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 mb-6 flex items-center gap-3"
        >
          <KeyRound className="h-5 w-5 text-warning flex-shrink-0" />
          <div className="text-left">
            <p className="text-xs text-muted-foreground">Votre matricule étudiant</p>
            <p className="text-sm font-mono font-bold tracking-wider text-warning-foreground">
              {matricule}
            </p>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <Button
          onClick={onComplete}
          className="bg-success hover:bg-success/90 text-success-foreground shadow-md shadow-success/20"
        >
          Se connecter
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </motion.div>
    </div>
  )

  // ─── Render: USER_EXISTS state ───
  // Cas spécial : un compte existe déjà avec cet email. On affiche un message
  // dédié + un bouton "Se connecter" au lieu du formulaire.
  const renderUserExists = () => (
    <div className="flex flex-col items-center text-center py-8" role="alert">
      <div className="flex h-16 w-16 items-center justify-center rounded-full mb-4 bg-info/10 text-info">
        <AlertCircle className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold mb-2 font-display">Compte existant</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Un compte existe déjà avec l&apos;adresse{' '}
        <span className="font-medium text-foreground">{userExistsEmail}</span>. Connectez-vous
        directement avec cette adresse email.
      </p>
      <Button
        onClick={onComplete}
        className="bg-success hover:bg-success/90 text-success-foreground"
      >
        Aller à la connexion
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  )

  // ─── Render: Signup form ───
  const renderForm = () => {
    if (!linkData) return null

    const strength = getPasswordStrength(password)
    const checks = getPasswordChecks(password)
    const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
    const isFormValid = form.formState.isValid

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Contexte établissement */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs text-muted-foreground">Vous rejoignez</p>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-success-text flex-shrink-0" />
              <p className="text-sm font-semibold font-display">{linkData.etablissementNom}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <DSBadge variant="primary" size="sm">
                {ETAB_TYPE_LABELS[linkData.etablissementType] || linkData.etablissementType}
              </DSBadge>
              {linkData.filiereNom && (
                <DSBadge variant="success" size="sm">
                  <BookOpen className="h-3 w-3 mr-1" />
                  {linkData.filiereNom}
                  {linkData.filiereCode ? ` (${linkData.filiereCode})` : ''}
                </DSBadge>
              )}
              {linkData.etablissementVille && (
                <DSBadge variant="info" size="sm">
                  <MapPin className="h-3 w-3 mr-1" />
                  {linkData.etablissementVille}
                </DSBadge>
              )}
              {linkData.niveau && (
                <DSBadge variant="warning" size="sm">
                  {linkData.niveau}
                </DSBadge>
              )}
            </div>
            {linkData.creatorName && (
              <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                Invité par <span className="font-medium text-foreground">{linkData.creatorName}</span>
              </p>
            )}
          </div>

          {/* Compte à rebours expiration (si < 24h) */}
          {countdown && countdown !== 'Expirée' && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
              <Clock className="h-4 w-4 text-warning flex-shrink-0" />
              <p className="text-xs text-warning-foreground">
                <span className="font-semibold">Expire dans :</span> {countdown}
              </p>
            </div>
          )}

          {/* Places restantes */}
          {placesRestantes != null && (
            <div className="rounded-lg border border-info/20 bg-info/5 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-info-foreground">
                  <Users className="h-3.5 w-3.5" />
                  Places restantes
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {placesRestantes} / {linkData.maxUses}
                </span>
              </div>
              <ProgressBar
                value={placesPourcentage}
                accent={placesRestantes === 0 ? 'destructive' : 'info'}
                size="sm"
                showLabel={false}
                showValue={false}
              />
            </div>
          )}

          <Separator />

          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="signup-name">Nom complet</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="signup-name"
                type="text"
                placeholder="Prénom Nom"
                autoComplete="name"
                className="pl-9"
                aria-invalid={!!form.formState.errors.name}
                {...form.register('name')}
              />
            </div>
            {form.formState.errors.name && (
              <p className="text-xs text-destructive" role="alert">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Email field */}
          <div className="space-y-2">
            <Label htmlFor="signup-email">Adresse email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="signup-email"
                type="email"
                placeholder="vous@exemple.com"
                autoComplete="email"
                className="pl-9"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
            </div>
            {form.formState.errors.email && (
              <p className="text-xs text-destructive" role="alert">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {/* Password field */}
          <div className="space-y-2">
            <Label htmlFor="signup-password">Mot de passe</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Créez un mot de passe sécurisé"
                autoComplete="new-password"
                className="pl-9 pr-10"
                aria-invalid={!!form.formState.errors.password}
                {...form.register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Strength indicator */}
            {password.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        strength.score >= level ? strength.bgColor : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-medium ${strength.color}`}>
                  Force : {strength.label}
                </p>
              </div>
            )}

            {/* Requirements checklist */}
            {password.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Exigences du mot de passe
                </p>
                {checks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2">
                    {check.met ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success-text flex-shrink-0" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span
                      className={`text-xs ${
                        check.met ? 'text-success-text' : 'text-muted-foreground'
                      }`}
                    >
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {form.formState.errors.password && (
              <p className="text-xs text-destructive" role="alert">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          {/* Confirm password field */}
          <div className="space-y-2">
            <Label htmlFor="signup-confirm-password">Confirmer le mot de passe</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="signup-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirmez votre mot de passe"
                autoComplete="new-password"
                className="pl-9 pr-10"
                aria-invalid={!!form.formState.errors.confirmPassword}
                {...form.register('confirmPassword')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={
                  showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                }
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-destructive">Les mots de passe ne correspondent pas</p>
            )}
            {confirmPassword.length > 0 && passwordsMatch && (
              <p className="text-xs text-success-text">Les mots de passe correspondent</p>
            )}
            {form.formState.errors.confirmPassword && (
              <p className="text-xs text-destructive" role="alert">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {/* CGU checkbox (label sibling — évite le double-toggle Radix) */}
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="signup-cgu"
                checked={form.watch('acceptCGU')}
                onCheckedChange={(checked) => {
                  form.setValue('acceptCGU', checked === true, { shouldValidate: true })
                }}
                className="mt-0.5"
                aria-invalid={!!form.formState.errors.acceptCGU}
              />
              <label
                htmlFor="signup-cgu"
                className="text-sm leading-relaxed cursor-pointer text-muted-foreground"
              >
                J&apos;accepte les{' '}
                <span className="font-medium text-foreground">conditions d&apos;utilisation</span> et la{' '}
                <span className="font-medium text-foreground">politique de confidentialité</span> de SECT.
              </label>
            </div>
            {form.formState.errors.acceptCGU && (
              <p className="text-xs text-destructive" role="alert">
                {form.formState.errors.acceptCGU.message}
              </p>
            )}
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full bg-success hover:bg-success/90 text-success-foreground shadow-md shadow-success/20 mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Création du compte...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mr-1" />
                Créer mon compte
              </>
            )}
          </Button>
        </form>
      </motion.div>
    )
  }

  // ─── Main render ───
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-success/5 via-background to-info/5 relative overflow-hidden">
      {/* Floating particles (palette africaine) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <FloatingParticle delay={0} duration={4} x="10%" y="25%" size={4} color="#F59E0B" />
        <FloatingParticle delay={0.8} duration={5} x="85%" y="15%" size={3} color="#84CC16" />
        <FloatingParticle delay={1.5} duration={3.5} x="20%" y="65%" size={5} color="#F59E0B" />
        <FloatingParticle delay={0.3} duration={4.5} x="75%" y="55%" size={3} color="#84CC16" />
        <FloatingParticle delay={1.2} duration={3} x="45%" y="10%" size={4} color="#C2410C" />
        <FloatingParticle delay={2} duration={4} x="90%" y="75%" size={3} color="#F59E0B" />
        <FloatingParticle delay={0.6} duration={5.5} x="15%" y="85%" size={4} color="#84CC16" />
        <FloatingParticle delay={1.8} duration={3.8} x="60%" y="40%" size={3} color="#F59E0B" />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 relative z-10">
        {/* Branding */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <div className="flex items-center justify-center gap-3 mb-3">
            <img
              src="/logo.svg"
              alt="SECT"
              className="w-14 h-14 rounded-xl shadow-lg"
            />
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-success-text to-info bg-clip-text text-transparent font-display">
              SECT
            </h1>
          </div>
          <p className="text-lg font-medium text-success-text font-display">
            Inscription étudiante
          </p>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Créez votre compte pour rejoindre la plateforme d&apos;évaluation
          </p>
        </motion.div>

        {/* Signup Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          className="w-full max-w-lg"
        >
          <Card className="ds-kente-top overflow-hidden shadow-xl shadow-success/5">
            <CardContent className="pt-6">
              <AnimatePresence mode="wait">
                {isVerifying && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {renderLoading()}
                  </motion.div>
                )}
                {!isVerifying && verifyError && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {renderError()}
                  </motion.div>
                )}
                {!isVerifying && !verifyError && isSuccess && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {renderSuccess()}
                  </motion.div>
                )}
                {!isVerifying && !verifyError && !isSuccess && userExistsEmail && (
                  <motion.div
                    key="user-exists"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {renderUserExists()}
                  </motion.div>
                )}
                {!isVerifying && !verifyError && !isSuccess && !userExistsEmail && linkData && (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {renderForm()}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center relative z-10">
        <Separator className="mx-auto max-w-md mb-4 bg-border/50" />
        <p className="text-xs text-muted-foreground">
          &copy; 2026 SECT — Tous droits réservés
        </p>
      </footer>
    </div>
  )
}
