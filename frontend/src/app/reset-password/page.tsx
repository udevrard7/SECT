'use client'

import { useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Lock, Eye, EyeOff, Loader2, GraduationCap, CheckCircle2, ArrowLeft, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

// Wrappeur Suspense car useSearchParams doit être dans un Suspense boundary
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetLoading />}>
      <ResetPasswordContent />
    </Suspense>
  )
}

function ResetLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1E1B4B]">
      <Loader2 className="h-8 w-8 animate-spin text-[#84CC16]" />
    </div>
  )
}

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Trim + sanitize: certains webmails cassent les liens longs (espace, CRLF).
  // On nettoie le token pour éviter les erreurs silencieuses.
  const token = (searchParams.get('token') || '').trim()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  // Erreur fatale (token déjà utilisé/expiré) → on bascule sur un écran dédié
  // au lieu d'un toast éphémère, avec un bouton "Demander un nouveau lien".
  const [fatalError, setFatalError] = useState<string | null>(null)

  const hasToken = !!token

  const handleSubmit = useCallback(async () => {
    if (!token) return
    if (newPassword.length < 8) {
      toast.error('Mot de passe trop court', { description: '8 caractères minimum.' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas')
      return
    }
    // Protection double-submit : si déjà en cours, on ignore.
    if (submitting || done) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      })
      if (res.ok) {
        setDone(true)
        toast.success('Mot de passe réinitialisé', {
          description: 'Vous pouvez vous connecter avec votre nouveau mot de passe.',
        })
        // Rediriger vers /login après 2.5s
        setTimeout(() => router.push('/login'), 2500)
      } else {
        const data = await res.json().catch(() => ({}))
        const msg = data?.error || 'Token invalide, expiré ou déjà utilisé.'
        // Erreur fatale (401) : le token ne peut plus être utilisé → écran dédié
        // avec bouton "Demander un nouveau lien". Sinon toast (validation).
        if (res.status === 401) {
          setFatalError(msg)
        } else {
          toast.error('Réinitialisation impossible', { description: msg })
        }
      }
    } catch {
      toast.error('Erreur', { description: 'Vérifiez votre connexion.' })
    } finally {
      setSubmitting(false)
    }
  }, [token, newPassword, confirmPassword, router, submitting, done])

  // --- États spéciaux ---
  if (!hasToken) {
    return (
      <Shell title="Lien invalide" icon={<KeyRound className="h-7 w-7 text-[#C2410C]" />}>
        <p className="text-sm text-[#1E1B4B]/70 mb-5">
          Aucun jeton de réinitialisation n&apos;a été trouvé dans l&apos;URL.
          Assurez-vous d&apos;avoir cliqué sur le lien complet contenu dans l&apos;email.
        </p>
        <Button onClick={() => router.push('/login')} className="w-full h-11 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold">
          <ArrowLeft className="h-4 w-4 mr-2" /> Retour à la connexion
        </Button>
      </Shell>
    )
  }

  // Écran d'erreur fatale : token déjà utilisé / expiré / invalide.
  // On propose de redemander un lien plutôt que de bloquer l'utilisateur.
  if (fatalError) {
    return (
      <Shell title="Lien non valide" icon={<KeyRound className="h-7 w-7 text-[#C2410C]" />}>
        <p className="text-sm text-[#1E1B4B]/70 mb-2">
          {fatalError}
        </p>
        <p className="text-xs text-[#1E1B4B]/55 mb-5">
          Pour des raisons de sécurité, chaque lien ne peut être utilisé qu&apos;une seule fois
          et expire après 30 minutes.
        </p>
        <Button
          onClick={() => router.push('/login')}
          className="w-full h-11 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Demander un nouveau lien
        </Button>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell title="Mot de passe modifié" icon={<CheckCircle2 className="h-7 w-7 text-[#84CC16]" />}>
        <p className="text-sm text-[#1E1B4B]/70 mb-5">
          Votre mot de passe a été réinitialisé avec succès. Vous allez être redirigé
          vers la page de connexion.
        </p>
        <Button onClick={() => router.push('/login')} className="w-full h-11 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold">
          Se connecter
        </Button>
      </Shell>
    )
  }

  // --- Formulaire principal ---
  return (
    <Shell title="Nouveau mot de passe" icon={<Lock className="h-7 w-7 text-[#84CC16]" />}>
      <p className="text-sm text-[#1E1B4B]/70 mb-5">
        Choisissez un nouveau mot de passe pour votre compte SECT (8 caractères minimum).
      </p>

      <div className="space-y-4">
        {/* Nouveau mot de passe */}
        <div className="space-y-1.5">
          <Label htmlFor="newPassword" className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">
            Nouveau mot de passe
          </Label>
          <div className="relative group">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B] transition-transform group-focus-within:scale-110" />
            <Input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              className="pl-10 pr-10 h-12 rounded-xl border-[#1E1B4B]/12 bg-[#F8FAFC] text-[#1E1B4B] placeholder:text-[#1E1B4B]/60 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/15 focus:bg-white transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#1E1B4B]/55 hover:text-[#1E1B4B] transition-colors"
              aria-label={showPassword ? 'Masquer' : 'Afficher'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirmation */}
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-xs font-semibold text-[#1E1B4B]/60 uppercase tracking-wider">
            Confirmer le mot de passe
          </Label>
          <div className="relative group">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#F59E0B] transition-transform group-focus-within:scale-110" />
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              className="pl-10 h-12 rounded-xl border-[#1E1B4B]/12 bg-[#F8FAFC] text-[#1E1B4B] placeholder:text-[#1E1B4B]/60 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/15 focus:bg-white transition-all"
            />
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-[#C2410C]">Les mots de passe ne correspondent pas.</p>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting || done || !!fatalError || newPassword.length < 8 || newPassword !== confirmPassword}
          className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
        >
          {submitting ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Réinitialisation...</>
          ) : (
            'Réinitialiser mon mot de passe'
          )}
        </Button>

        <div className="pt-2 text-center">
          <a
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-[#1E1B4B]/60 hover:text-[#1E1B4B] transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Retour à la connexion
          </a>
        </div>
      </div>
    </Shell>
  )
}

// Shell commun — reprend les couleurs SECT (bleu nuit / lime / ambre)
function Shell({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0A1931] via-[#1E1B4B] to-[#0f0d2e] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-7 sm:p-8"
      >
        {/* Logo + titre */}
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center mb-4 shadow-lg shadow-[#84CC16]/30">
            <GraduationCap className="h-8 w-8 text-[#1E1B4B]" />
          </div>
          <div className="flex items-center gap-2 mb-1">
            {icon}
            <h1 className="text-xl font-bold text-[#1E1B4B]">{title}</h1>
          </div>
          <p className="text-[10px] text-[#F59E0B]/80 font-medium tracking-wider uppercase">SECT — Système d&apos;Évaluation</p>
        </div>
        {children}
      </motion.div>
    </div>
  )
}
