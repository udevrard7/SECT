'use client'

import { useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Loader2, Shield, ArrowLeft, AlertCircle, Wallet, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { initiatePayment, setPendingAbonnement } from '@/hooks/use-payment'

function PaiementRetryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const aboId = searchParams.get('abo') || ''

  const [phone, setPhone] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phoneValid = phone.startsWith('+225') && phone.replace(/\D/g, '').length >= 12
  const showPhoneError = phoneTouched && !phoneValid && phone.length > 0

  const handlePayment = useCallback(async () => {
    if (!aboId) {
      setError('Abonnement introuvable. Veuillez contacter le support.')
      return
    }
    if (!phoneValid) {
      setPhoneTouched(true)
      setError('Entrez votre numéro au format +225 suivi de 10 chiffres.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      setPendingAbonnement(aboId)
      const resp = await initiatePayment(aboId, phone)
      window.location.href = resp.paymentUrl
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : err instanceof Error ? err.message : 'Erreur lors de la création du paiement'
      setError(msg)
      setLoading(false)
    }
  }, [aboId, phone, phoneValid])

  // ─── Pas d'abo ID ───
  if (!aboId) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0A1931] via-[#0f172a] to-[#1E1B4B] p-4 overflow-hidden">
        <BackgroundDecor />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 max-w-md w-full bg-white/[0.06] backdrop-blur-xl border border-white/15 rounded-2xl p-8 text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/15 mb-4">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Lien invalide</h1>
          <p className="text-sm text-white/60 mb-6">
            Aucun identifiant d&apos;abonnement fourni. Connectez-vous ou contactez le support.
          </p>
          <Button onClick={() => router.push('/login')} className="w-full bg-[#84CC16] hover:bg-[#65A30D] text-[#0A1931] font-semibold">
            Retour à la connexion
          </Button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0A1931] via-[#0f172a] to-[#1E1B4B] p-4 sm:p-6 overflow-hidden">
      <BackgroundDecor />

      <div className="relative z-10 max-w-md w-full">
        {/* Back button */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.push('/login')}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la connexion
        </motion.button>

        {/* Main card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative bg-white/[0.06] backdrop-blur-xl border border-white/15 rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Top kente accent bar */}
          <div className="h-1.5 bg-gradient-to-r from-[#84CC16] via-[#F59E0B] to-[#C2410C]" />

          <div className="p-8">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className="text-center mb-6"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#84CC16]/15 border border-[#84CC16]/25 mb-4">
                <Wallet className="h-8 w-8 text-[#84CC16]" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Finalisez votre paiement
              </h1>
              <p className="text-sm text-white/60">
                Votre compte est créé. Finalisez votre paiement Wave pour activer
                votre abonnement <span className="text-[#84CC16] font-semibold">Prof Premium</span>.
              </p>
            </motion.div>

            {/* Récap abonnement */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/[0.04] border border-white/10 rounded-xl p-4 mb-6"
            >
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-white/40">Abonnement</span>
                <span className="font-mono text-xs text-white/70">{aboId.slice(0, 20)}...</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/40">Montant</span>
                <span className="text-xl font-bold text-[#84CC16] font-mono">4 900 FCFA<span className="text-xs text-white/40 font-normal">/mois</span></span>
              </div>
            </motion.div>

            {/* Moyen de paiement — Wave uniquement */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-2 mb-5"
            >
              <Label className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                Moyen de paiement
              </Label>
              <div className="w-full rounded-xl border-2 border-lime-500/60 bg-lime-500/[0.07] p-3 flex items-center gap-3">
                <div
                  className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: '#1DC8FF1A' }}
                >
                  <Phone className="h-5 w-5" style={{ color: '#1DC8FF' }} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-tight text-white">Wave</div>
                  <div className="text-[10px] leading-tight mt-0.5 text-white/50">WaveMoney · Paiement instantané</div>
                </div>
                <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-lime-500/20 text-lime-300">
                  Paiement instantané
                </span>
              </div>
            </motion.div>

            {/* Phone input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="space-y-2 mb-5"
            >
              <Label className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                Numéro Wave
              </Label>
              <div className="relative group">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#84CC16] transition-transform group-focus-within:scale-110" />
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="+225 07 77 12 34 56"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhoneTouched(true)}
                  className="pl-10 h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[#84CC16] focus:ring-2 focus:ring-[#84CC16]/25 focus:bg-white/8 transition-all font-mono tracking-wide"
                  aria-invalid={showPhoneError}
                />
              </div>
              <AnimatePresence>
                {showPhoneError && (
                  <motion.p
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 3, 0] }}
                    exit={{ opacity: 0, y: -8 }}
                    className="text-xs text-red-400 flex items-center gap-1"
                  >
                    <AlertCircle className="h-3 w-3" />
                    Format invalide. Entrez +225 suivi de 10 chiffres.
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 overflow-hidden"
                >
                  <p className="text-xs text-red-400 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Security note */}
            <div className="rounded-lg border border-[#84CC16]/25 bg-[#84CC16]/8 p-3 mb-5">
              <p className="text-xs text-white/70 flex items-start gap-2">
                <Shield className="h-4 w-4 text-[#84CC16] shrink-0 mt-0.5" />
                <span>
                  Redirection sécurisée vers <strong>Wave</strong>. Aucune donnée bancaire n&apos;est
                  stockée par SECT.
                </span>
              </p>
            </div>

            {/* Submit button */}
            <motion.div
              whileHover={{ scale: loading ? 1 : 1.01 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
            >
              <Button
                onClick={handlePayment}
                disabled={loading || (phone.length > 0 && !phoneValid)}
                className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#0A1931] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Redirection vers Wave...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Payer 4 900 FCFA avec Wave
                  </>
                )}
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Footer hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-xs text-white/30 mt-4"
        >
          🔒 Paiement sécurisé par GeniusPay · Wave
        </motion.p>
      </div>
    </div>
  )
}

// ═══ Background décor (glow orbs + kente motif) ═══
function BackgroundDecor() {
  return (
    <>
      <motion.div
        className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#84CC16]/15 blur-3xl pointer-events-none"
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[#F59E0B]/10 blur-3xl pointer-events-none"
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(90deg, transparent 0, transparent 50px, #84CC16 50px, #84CC16 55px, transparent 55px, transparent 58px, #F59E0B 58px, #F59E0B 61px, transparent 61px, transparent 64px, #C2410C 64px, #C2410C 66px, transparent 66px, transparent 100px),
            repeating-linear-gradient(45deg, transparent 0, transparent 25px, #F59E0B 25px, #F59E0B 30px, transparent 30px, transparent 50px)
          `,
        }}
      />
    </>
  )
}

export default function PaiementRetryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0A1931] via-[#0f172a] to-[#1E1B4B]">
        <Loader2 className="h-8 w-8 animate-spin text-[#84CC16]" />
      </div>
    }>
      <PaiementRetryContent />
    </Suspense>
  )
}