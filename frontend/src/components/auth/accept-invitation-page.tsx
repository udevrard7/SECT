'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap,
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
  Shield,
  RefreshCw,
  ArrowRight,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

// ─── Types ───

interface InvitationData {
  id: string
  email: string
  role: string
  name: string | null
  etablissement: { nom: string; ville: string | null } | null
  filiere: { nom: string; code: string | null } | null
  createdBy: { name: string } | null
  expiresAt: string
  createdAt: string
}

type VerifyError = 'INVALID_TOKEN' | 'EXPIRED' | 'ALREADY_USED' | 'USER_EXISTS' | 'NETWORK_ERROR' | 'SERVER_ERROR' | null

interface AcceptInvitationPageProps {
  token: string
  onComplete: () => void
}

// ─── Role labels & colors ───

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrateur',
  RESPONSABLE: 'Responsable des études',
  ENSEIGNANT: 'Enseignant',
  ETUDIANT: 'Étudiant',
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
  RESPONSABLE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  ENSEIGNANT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  ETUDIANT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
}

// ─── Password strength helpers ───

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
  if (score === 3) return { score, label: 'Fort', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500' }
  return { score, label: 'Très fort', color: 'text-teal-600 dark:text-teal-400', bgColor: 'bg-teal-500' }
}

function getPasswordChecks(password: string) {
  return [
    { label: 'Au moins 8 caractères', met: password.length >= 8 },
    { label: 'Une lettre majuscule', met: /[A-Z]/.test(password) },
    { label: 'Une lettre minuscule', met: /[a-z]/.test(password) },
    { label: 'Un chiffre', met: /[0-9]/.test(password) },
    { label: 'Un caractère spécial', met: /[^A-Za-z0-9]/.test(password) },
  ]
}

// ─── Countdown timer ───

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

// ─── Step Indicator ───

function StepIndicator({ currentStep }: { currentStep: 1 | 2 }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-6">
      {/* Step 1 */}
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
            currentStep >= 1
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
          }`}
        >
          {currentStep > 1 ? <CheckCircle2 className="h-4 w-4" /> : '1'}
        </div>
        <span
          className={`text-sm font-medium transition-colors ${
            currentStep >= 1
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          Vérification
        </span>
      </div>

      {/* Connector */}
      <div
        className={`h-0.5 w-8 transition-colors ${
          currentStep >= 2
            ? 'bg-emerald-500'
            : 'bg-gray-200 dark:bg-gray-700'
        }`}
      />

      {/* Step 2 */}
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
            currentStep >= 2
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
          }`}
        >
          2
        </div>
        <span
          className={`text-sm font-medium transition-colors ${
            currentStep >= 2
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          Création du compte
        </span>
      </div>
    </div>
  )
}

// ─── Main Component ───

export function AcceptInvitationPage({ token, onComplete }: AcceptInvitationPageProps) {
  // State
  const [step, setStep] = useState<1 | 2>(1)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [verifyError, setVerifyError] = useState<VerifyError>(null)
  const [verifyErrorMessage, setVerifyErrorMessage] = useState('')
  const [isVerifying, setIsVerifying] = useState(true)

  // Step 2 form
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Countdown
  const countdown = useCountdown(invitation?.expiresAt || null)

  // Check if nearing expiry (less than 24h)
  const isNearExpiry = invitation
    ? new Date(invitation.expiresAt).getTime() - new Date().getTime() < 24 * 60 * 60 * 1000
    : false

  // Verify token on mount
  const verifyToken = useCallback(async () => {
    setIsVerifying(true)
    setVerifyError(null)
    setVerifyErrorMessage('')

    try {
      const res = await fetch(`/api/invitations/verify?token=${encodeURIComponent(token)}`)
      const data = await res.json()

      if (!res.ok) {
        setVerifyError(data.code || 'SERVER_ERROR')
        setVerifyErrorMessage(data.error || 'Erreur lors de la vérification')

        // If already used, auto-redirect after a delay
        if (data.code === 'ALREADY_USED' || data.code === 'USER_EXISTS') {
          setTimeout(() => {
            onComplete()
          }, 3000)
        }
        return
      }

      setInvitation(data.invitation)
      setName(data.invitation.name || '')
    } catch {
      setVerifyError('NETWORK_ERROR')
      setVerifyErrorMessage('Erreur de connexion. Veuillez vérifier votre connexion internet.')
    } finally {
      setIsVerifying(false)
    }
  }, [token, onComplete])

  useEffect(() => {
    verifyToken()
  }, [verifyToken])

  // Handle accept invitation
  const handleAccept = async () => {
    // Validate
    if (!name.trim()) {
      toast.error('Champ requis', { description: 'Veuillez entrer votre nom.' })
      return
    }

    if (password.length < 8) {
      toast.error('Mot de passe trop court', { description: 'Le mot de passe doit contenir au moins 8 caractères.' })
      return
    }

    const checks = getPasswordChecks(password)
    const allMet = checks.every((c) => c.met)
    if (!allMet) {
      toast.error('Mot de passe non conforme', { description: 'Veuillez respecter toutes les exigences de mot de passe.' })
      return
    }

    if (password !== confirmPassword) {
      toast.error('Mots de passe différents', { description: 'Les mots de passe ne correspondent pas.' })
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, name: name.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error) {
          toast.error('Erreur', { description: data.error })
        }
        return
      }

      setIsSuccess(true)
      toast.success('Compte créé avec succès', {
        description: 'Vous allez être redirigé vers la page de connexion.',
      })

      // Auto-redirect after 3 seconds
      setTimeout(() => {
        onComplete()
      }, 3000)
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
      <Loader2 className="h-10 w-10 animate-spin text-emerald-600 dark:text-emerald-400 mb-4" />
      <p className="text-sm text-muted-foreground">Vérification de votre invitation...</p>
    </div>
  )

  // ─── Render: Error state ───
  const renderError = () => {
    const getErrorContent = () => {
      switch (verifyError) {
        case 'INVALID_TOKEN':
          return {
            icon: <X className="h-8 w-8" />,
            title: 'Lien invalide',
            description: 'Ce lien d\'invitation n\'est pas valide. Il a peut-être été modifié ou corrompu.',
            action: 'Demander une nouvelle invitation',
            showRetry: false,
          }
        case 'EXPIRED':
          return {
            icon: <Clock className="h-8 w-8" />,
            title: 'Invitation expirée',
            description: verifyErrorMessage,
            action: 'Demander une nouvelle invitation',
            showRetry: false,
          }
        case 'ALREADY_USED':
          return {
            icon: <CheckCircle2 className="h-8 w-8" />,
            title: 'Invitation déjà utilisée',
            description: 'Cette invitation a déjà été utilisée pour créer un compte. Vous allez être redirigé vers la page de connexion.',
            action: 'Aller à la connexion',
            showRetry: false,
          }
        case 'USER_EXISTS':
          return {
            icon: <AlertCircle className="h-8 w-8" />,
            title: 'Compte existant',
            description: 'Un compte avec cette adresse email existe déjà. Vous allez être redirigé vers la page de connexion.',
            action: 'Aller à la connexion',
            showRetry: false,
          }
        case 'NETWORK_ERROR':
          return {
            icon: <AlertCircle className="h-8 w-8" />,
            title: 'Erreur de connexion',
            description: 'Impossible de vérifier votre invitation. Veuillez vérifier votre connexion internet.',
            action: 'Réessayer',
            showRetry: true,
          }
        default:
          return {
            icon: <AlertCircle className="h-8 w-8" />,
            title: 'Erreur',
            description: verifyErrorMessage || 'Une erreur inattendue s\'est produite.',
            action: 'Réessayer',
            showRetry: true,
          }
      }
    }

    const errorContent = getErrorContent()
    const isRedirectError = verifyError === 'ALREADY_USED' || verifyError === 'USER_EXISTS'

    return (
      <div className="flex flex-col items-center text-center py-8">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full mb-4 ${
            isRedirectError
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
          }`}
        >
          {errorContent.icon}
        </div>
        <h3 className="text-lg font-semibold mb-2">{errorContent.title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">{errorContent.description}</p>
        <div className="flex gap-3">
          {errorContent.showRetry && (
            <Button
              variant="outline"
              onClick={verifyToken}
              className="border-emerald-200 dark:border-emerald-800"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Réessayer
            </Button>
          )}
          <Button
            onClick={onComplete}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
          >
            {errorContent.action}
          </Button>
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
        className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
        >
          <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        </motion.div>
      </motion.div>
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-xl font-semibold text-emerald-800 dark:text-emerald-300 mb-2"
      >
        Compte créé avec succès !
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="text-sm text-muted-foreground mb-6"
      >
        Vous allez être redirigé vers la page de connexion dans quelques secondes...
      </motion.p>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Button
          onClick={onComplete}
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
        >
          Aller à la connexion
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </motion.div>
    </div>
  )

  // ─── Render: Step 1 - Verification ───
  const renderStep1 = () => {
    if (!invitation) return null

    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.3 }}
      >
        <div className="space-y-5">
          {/* Invitation info */}
          <div className="rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
            {/* Email */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Adresse email</p>
                <p className="text-sm font-medium truncate">{invitation.email}</p>
              </div>
            </div>

            {/* Role */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Rôle attribué</p>
                <Badge
                  variant="outline"
                  className={`mt-0.5 ${ROLE_COLORS[invitation.role] || ''}`}
                >
                  {ROLE_LABELS[invitation.role] || invitation.role}
                </Badge>
              </div>
            </div>

            {/* Établissement */}
            {invitation.etablissement && (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Établissement</p>
                  <p className="text-sm font-medium">
                    {invitation.etablissement.nom}
                    {invitation.etablissement.ville && ` — ${invitation.etablissement.ville}`}
                  </p>
                </div>
              </div>
            )}

            {/* Filière */}
            {invitation.filiere && (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                  <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Filière</p>
                  <p className="text-sm font-medium">
                    {invitation.filiere.nom}
                    {invitation.filiere.code && ` (${invitation.filiere.code})`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Expiry timer */}
          {isNearExpiry && countdown && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-semibold">Expire dans :</span> {countdown}
              </p>
            </div>
          )}

          {/* Invited by */}
          {invitation.createdBy && (
            <p className="text-xs text-muted-foreground text-center">
              Invitation envoyée par <span className="font-medium">{invitation.createdBy.name}</span>
            </p>
          )}

          {/* Continue button */}
          <Button
            onClick={() => setStep(2)}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20"
          >
            Continuer
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </motion.div>
    )
  }

  // ─── Render: Step 2 - Account Creation ───
  const renderStep2 = () => {
    const strength = getPasswordStrength(password)
    const checks = getPasswordChecks(password)
    const allChecksMet = checks.every((c) => c.met)
    const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
    const canSubmit = name.trim() && allChecksMet && passwordsMatch && !isSubmitting

    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
      >
        <div className="space-y-4">
          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="invite-name">Nom complet</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="invite-name"
                type="text"
                placeholder="Votre nom complet"
                className="pl-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          {/* Email (read-only) */}
          {invitation && (
            <div className="space-y-2">
              <Label htmlFor="invite-email">Adresse email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="invite-email"
                  type="email"
                  className="pl-9 bg-muted/50 cursor-not-allowed"
                  value={invitation.email}
                  readOnly
                />
              </div>
              <p className="text-xs text-muted-foreground">Cette adresse email est associée à votre invitation</p>
            </div>
          )}

          <Separator />

          {/* Password field */}
          <div className="space-y-2">
            <Label htmlFor="invite-password">Mot de passe</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="invite-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Créez un mot de passe sécurisé"
                className="pl-9 pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
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
                        strength.score >= level ? strength.bgColor : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-medium ${strength.color}`}>
                  Force : {strength.label}
                </p>
              </div>
            )}
          </div>

          {/* Password requirements checklist */}
          {password.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground mb-2">Exigences du mot de passe</p>
              {checks.map((check) => (
                <div key={check.label} className="flex items-center gap-2">
                  {check.met ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  )}
                  <span
                    className={`text-xs ${
                      check.met
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {check.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Confirm password field */}
          <div className="space-y-2">
            <Label htmlFor="invite-confirm-password">Confirmer le mot de passe</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="invite-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirmez votre mot de passe"
                className="pl-9 pr-10"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSubmit) handleAccept()
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-600 dark:text-red-400">Les mots de passe ne correspondent pas</p>
            )}
            {confirmPassword.length > 0 && passwordsMatch && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Les mots de passe correspondent</p>
            )}
          </div>

          {/* Submit button */}
          <Button
            onClick={handleAccept}
            disabled={!canSubmit}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20 mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Création du compte...
              </>
            ) : (
              <>
                Créer mon compte
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>

          {/* Back button */}
          <Button
            variant="ghost"
            onClick={() => setStep(1)}
            className="w-full text-muted-foreground"
            disabled={isSubmitting}
          >
            Retour
          </Button>
        </div>
      </motion.div>
    )
  }

  // ─── Main render ───
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-emerald-950 dark:via-teal-950 dark:to-emerald-900">
      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
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
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-emerald-700 to-teal-600 dark:from-emerald-300 dark:to-teal-400 bg-clip-text text-transparent">
              SECT
            </h1>
          </div>
          <p className="text-lg font-medium text-emerald-800 dark:text-emerald-200">
            Acceptation de l&apos;invitation
          </p>
          <p className="mt-2 text-sm text-emerald-600/80 dark:text-emerald-400/80 max-w-md">
            Créez votre compte pour rejoindre la plateforme d&apos;évaluation
          </p>
        </motion.div>

        {/* Invitation Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <Card className="border-emerald-200/60 dark:border-emerald-800/40 shadow-xl shadow-emerald-900/5 dark:shadow-emerald-900/20">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Créer votre compte</CardTitle>
              <CardDescription>
                {isSuccess
                  ? 'Votre compte a été créé avec succès'
                  : verifyError
                    ? 'Erreur de vérification'
                    : 'Suivez les étapes pour rejoindre SECT'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Step indicator - only show when invitation is valid */}
              {!isVerifying && !verifyError && !isSuccess && invitation && (
                <StepIndicator currentStep={step} />
              )}

              <AnimatePresence mode="wait">
                {isVerifying && renderLoading()}
                {!isVerifying && verifyError && renderError()}
                {!isVerifying && !verifyError && isSuccess && renderSuccess()}
                {!isVerifying && !verifyError && !isSuccess && invitation && step === 1 && renderStep1()}
                {!isVerifying && !verifyError && !isSuccess && invitation && step === 2 && renderStep2()}
              </AnimatePresence>
            </CardContent>
            {!isVerifying && !verifyError && !isSuccess && invitation && (
              <CardFooter className="justify-center">
                <p className="text-xs text-muted-foreground">
                  En créant un compte, vous acceptez les conditions d&apos;utilisation
                </p>
              </CardFooter>
            )}
          </Card>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center">
        <Separator className="mx-auto max-w-md mb-4 bg-emerald-200/60 dark:bg-emerald-800/40" />
        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
          &copy; 2026 SECT — Tous droits réservés
        </p>
      </footer>
    </div>
  )
}
