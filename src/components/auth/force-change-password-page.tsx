'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap,
  Lock,
  Eye,
  EyeOff,
  Check,
  X,
  Shield,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { AuthUser } from '@/stores/auth-store'

// ─── Password strength calculation ───
function getPasswordStrength(password: string) {
  let score = 0
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password),
  }

  if (checks.length) score++
  if (checks.uppercase) score++
  if (checks.lowercase) score++
  if (checks.digit) score++
  if (checks.special) score++

  // Map to 4-level strength
  let level: number
  let label: string
  let color: string
  let barColor: string

  if (score <= 1) {
    level = 1
    label = 'Faible'
    color = 'text-red-500'
    barColor = 'bg-red-500'
  } else if (score === 2) {
    level = 2
    label = 'Moyen'
    color = 'text-orange-500'
    barColor = 'bg-orange-500'
  } else if (score === 3) {
    level = 3
    label = 'Fort'
    color = 'text-yellow-500'
    barColor = 'bg-yellow-500'
  } else {
    level = 4
    label = 'Très fort'
    color = 'text-emerald-500'
    barColor = 'bg-emerald-500'
  }

  return { score, level, label, color, barColor, checks }
}

// ─── Props ───
interface ForceChangePasswordPageProps {
  userId: string
  currentPassword: string
  user: AuthUser
  onSuccess: (user: AuthUser) => void
}

// ─── Component ───
export function ForceChangePasswordPage({
  userId,
  currentPassword,
  user,
  onSuccess,
}: ForceChangePasswordPageProps) {
  const [currentPwd, setCurrentPwd] = useState(currentPassword)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword])

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword
  const allRequirementsMet = Object.values(strength.checks).every(Boolean)
  const canSubmit = allRequirementsMet && passwordsMatch && !isSubmitting && !isSuccess

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          currentPassword: currentPwd,
          newPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du changement de mot de passe')
      }

      setIsSuccess(true)
      toast.success('Mot de passe modifié avec succès', {
        description: 'Vous allez être redirigé vers l\'application.',
      })

      // Clear the mustChangePassword flag after a short delay so the user sees the success animation
      setTimeout(() => {
        onSuccess({
          ...user,
          mustChangePwd: false,
        } as AuthUser)
      }, 2000)
    } catch (err) {
      toast.error('Erreur', {
        description: err instanceof Error ? err.message : 'Impossible de changer le mot de passe.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [canSubmit, userId, currentPwd, newPassword, onSuccess])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-gray-950 dark:via-gray-900 dark:to-emerald-950">
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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 shadow-lg shadow-emerald-600/20">
              <GraduationCap className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-emerald-700 to-teal-600 dark:from-emerald-300 dark:to-teal-400 bg-clip-text text-transparent">
              SECT
            </h1>
          </div>
          <p className="text-lg font-medium text-emerald-800 dark:text-emerald-200">
            Système d&apos;Evaluation Casse-Tête
          </p>
        </motion.div>

        {/* Change Password Card */}
        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
              className="w-full max-w-md"
            >
              <Card className="border-emerald-200/60 dark:border-emerald-800/40 shadow-xl shadow-emerald-900/5 dark:shadow-emerald-900/20">
                <CardHeader className="text-center">
                  <div className="flex justify-center mb-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                      <Lock className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>
                  <CardTitle className="text-xl">
                    Changement de mot de passe requis
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Pour votre sécurité, vous devez définir un nouveau mot de passe avant de continuer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Current password field */}
                  <div className="space-y-2">
                    <Label htmlFor="current-pwd">Mot de passe actuel</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="current-pwd"
                        type={showCurrentPwd ? 'text' : 'password'}
                        value={currentPwd}
                        onChange={(e) => setCurrentPwd(e.target.value)}
                        className="pl-9 pr-10"
                        placeholder="Votre mot de passe actuel"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showCurrentPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New password field */}
                  <div className="space-y-2">
                    <Label htmlFor="new-pwd">Nouveau mot de passe</Label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="new-pwd"
                        type={showNewPwd ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-9 pr-10"
                        placeholder="Entrez votre nouveau mot de passe"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPwd(!showNewPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showNewPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Strength indicator */}
                    {newPassword.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-2"
                      >
                        {/* Progress bar with 4 segments */}
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4].map((segment) => (
                            <div
                              key={segment}
                              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                                segment <= strength.level
                                  ? strength.barColor
                                  : 'bg-gray-200 dark:bg-gray-700'
                              }`}
                            />
                          ))}
                        </div>
                        <p className={`text-xs font-medium ${strength.color}`}>
                          {strength.label}
                        </p>
                      </motion.div>
                    )}
                  </div>

                  {/* Confirm new password field */}
                  <div className="space-y-2">
                    <Label htmlFor="confirm-pwd">Confirmer le nouveau mot de passe</Label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-pwd"
                        type={showConfirmPwd ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-9 pr-10"
                        placeholder="Confirmez votre nouveau mot de passe"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showConfirmPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPassword.length > 0 && !passwordsMatch && (
                      <p className="text-xs text-destructive">
                        Les mots de passe ne correspondent pas
                      </p>
                    )}
                    {confirmPassword.length > 0 && passwordsMatch && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Les mots de passe correspondent
                      </p>
                    )}
                  </div>

                  {/* Password requirements checklist */}
                  <div className="rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-2">
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
                      Exigences du mot de passe
                    </p>
                    <RequirementCheck met={strength.checks.length} text="Au moins 8 caractères" />
                    <RequirementCheck met={strength.checks.uppercase} text="Une lettre majuscule" />
                    <RequirementCheck met={strength.checks.lowercase} text="Une lettre minuscule" />
                    <RequirementCheck met={strength.checks.digit} text="Un chiffre" />
                    <RequirementCheck met={strength.checks.special} text="Un caractère spécial" />
                  </div>

                  {/* Submit button */}
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Changement en cours...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4 mr-2" />
                        Changer mon mot de passe
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="w-full max-w-md"
            >
              <Card className="border-emerald-200/60 dark:border-emerald-800/40 shadow-xl shadow-emerald-900/5 dark:shadow-emerald-900/20">
                <CardContent className="py-12 flex flex-col items-center text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 mb-6"
                  >
                    <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                  </motion.div>
                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-xl font-bold text-emerald-800 dark:text-emerald-300 mb-2"
                  >
                    Mot de passe modifié !
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="text-sm text-muted-foreground"
                  >
                    Votre mot de passe a été changé avec succès.
                    <br />
                    Vous allez être redirigé vers l&apos;application...
                  </motion.p>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    className="mt-6"
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-600 dark:text-emerald-400" />
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center">
        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
          &copy; 2026 SECT — Tous droits réservés
        </p>
      </footer>
    </div>
  )
}

// ─── Requirement checklist item ───
function RequirementCheck({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      {met ? (
        <Check className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
      ) : (
        <X className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
      )}
      <span
        className={`text-xs transition-colors ${
          met
            ? 'text-emerald-700 dark:text-emerald-400 line-through'
            : 'text-gray-600 dark:text-gray-400'
        }`}
      >
        {text}
      </span>
    </div>
  )
}
