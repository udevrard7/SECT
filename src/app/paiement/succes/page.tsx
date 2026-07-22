'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  Clock,
  GraduationCap,
  ShieldCheck,
  Mail,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { checkPaymentStatus, clearPendingAbonnement } from '@/hooks/use-payment'
import type { PaymentStatusResponse } from '@/hooks/use-payment'
import { toast } from 'sonner'

/**
 * /paiement/succes — page de retour Wave (success_url).
 *
 * GP-7 / GENIUSPAY_CONTRACT.md :
 *   - URL : /paiement/succes?reference=MTX-XXX&status=completed&amount=4900&transaction_id=12345&abo=abo_b2c_xxx
 *   - Lit `abo` (abonnementId) depuis la query, sinon fallback localStorage `sect_pending_abo`
 *   - Poll GET /api/subscriptions/b2c/{aboId}/payment-status toutes les 3s (max 10 = 30s)
 *   - abonnementStatut === "ACTIF" → succès + bouton "Se connecter" → /login
 *   - paymentStatus === "failed" → erreur + bouton "Réessayer" → /souscrire-b2c
 *   - Timeout (10 tentatives sans ACTIF) → "Paiement en cours de traitement" + /login
 */

// ─── Constantes de polling ─────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3000
const MAX_ATTEMPTS = 10

type Phase = 'loading' | 'success' | 'failed' | 'timeout' | 'no-abo'

export default function PaiementSuccesPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PaiementSuccesContent />
    </Suspense>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0A1931] via-[#1E1B4B] to-[#0f0d2e]">
      <Loader2 className="h-8 w-8 animate-spin text-[#84CC16]" />
    </div>
  )
}

function PaiementSuccesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ─── Query params (Wave success_url) ───
  const reference = searchParams.get('reference')
  const amount = searchParams.get('amount')
  const transactionId = searchParams.get('transaction_id')
  const aboFromQuery = searchParams.get('abo')

  // ─── State ───
  // aboId est résolu SYNCHRONEMENT au premier render (lazy initializer) pour
  // éviter un setState dans un useEffect (lint react-hooks/set-state-in-effect).
  // On lit la query `abo`, puis on tombe sur localStorage `sect_pending_abo`
  // si la query est absente. Côté client (Suspense), typeof window !== 'undefined'
  // est toujours vrai au moment où ce composant render.
  const [aboId] = useState<string | null>(() => {
    if (aboFromQuery) return aboFromQuery
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('sect_pending_abo')
      } catch {
        return null
      }
    }
    return null
  })
  // Phase initiale dérivée de la présence de aboId (pas de setState dans un effet)
  const [phase, setPhase] = useState<Phase>(() => (aboFromQuery || (typeof window !== 'undefined' && !!localStorage.getItem('sect_pending_abo')) ? 'loading' : 'no-abo'))
  const [attempt, setAttempt] = useState(0)
  const [statusData, setStatusData] = useState<PaymentStatusResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // ─── Nettoyage au démontage (timers + flag) ───
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
      }
    }
  }, [])

  // ─── Polling ───
  useEffect(() => {
    if (!aboId || phase !== 'loading') return

    let cancelled = false

    const poll = async (attemptNum: number) => {
      if (cancelled || !mountedRef.current) return

      try {
        const data = await checkPaymentStatus(aboId)
        if (cancelled || !mountedRef.current) return

        setStatusData(data)

        // Cas 1 : abonnement activé → succès
        if (data.abonnementStatut === 'ACTIF') {
          setPhase('success')
          // Nettoyer le localStorage — l'abo n'est plus "pending"
          clearPendingAbonnement()
          toast.success('Paiement confirmé', {
            description: 'Votre abonnement Prof Premium est maintenant actif.',
          })
          return
        }

        // Cas 2 : paiement échoué explicitement
        if (data.paymentStatus === 'failed' || data.paymentStatus === 'cancelled') {
          setPhase('failed')
          setErrorMsg(data.message || 'Le paiement a échoué.')
          return
        }

        // Cas 3 : encore en attente → continuer le polling ou timeout
        if (attemptNum >= MAX_ATTEMPTS) {
          setPhase('timeout')
          return
        }

        // Planifier la prochaine tentative
        setAttempt(attemptNum + 1)
        pollTimerRef.current = setTimeout(() => poll(attemptNum + 1), POLL_INTERVAL_MS)
      } catch (err) {
        if (cancelled || !mountedRef.current) return
        // Erreur réseau ou API : on tente quand même de retry si on a encore des tentatives
        const message = err instanceof Error ? err.message : 'Erreur inconnue'
        if (attemptNum >= MAX_ATTEMPTS) {
          setPhase('timeout')
          setErrorMsg(message)
          return
        }
        // Retry discret (sans toast bruyant) — on continue à poller
        setAttempt(attemptNum + 1)
        pollTimerRef.current = setTimeout(() => poll(attemptNum + 1), POLL_INTERVAL_MS)
      }
    }

    // Démarrer la première tentative immédiatement
    poll(1)

    return () => {
      cancelled = true
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
      }
    }
  }, [aboId, phase])

  const progressPct = Math.min((attempt / MAX_ATTEMPTS) * 100, 100)

  // ═══════════════════════════════════════════════════════════════════
  // RENDU
  // ═══════════════════════════════════════════════════════════════════

  return (
    <Shell>
      <AnimatePresence mode="wait">
        {/* ─── Loading (vérification en cours) ─── */}
        {phase === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="flex flex-col items-center text-center"
          >
            {/* Spinner + anneau de progression */}
            <div className="relative h-20 w-20 mb-5">
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
                <circle cx="40" cy="40" r="36" fill="none" stroke="#1E1B4B" strokeOpacity="0.08" strokeWidth="6" />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="#84CC16"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(2 * Math.PI * 36 * progressPct) / 100} ${2 * Math.PI * 36}`}
                  style={{ transition: 'stroke-dasharray 600ms ease-out' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-[#84CC16]" />
              </div>
            </div>

            <h1 className="text-xl font-bold text-[#1E1B4B] mb-2">
              Vérification du paiement en cours...
            </h1>
            <p className="text-sm text-[#1E1B4B]/70 mb-4 max-w-sm">
              Nous confirmons votre paiement Wave auprès de notre prestataire. Cela peut prendre
              quelques secondes.
            </p>

            {/* Récap infos reçues */}
            <div className="w-full bg-[#F8FAFC] border border-[#1E1B4B]/8 rounded-xl p-4 space-y-2 mb-4">
              {reference && (
                <Row label="Référence" value={<span className="font-mono">{reference}</span>} />
              )}
              {amount && (
                <Row
                  label="Montant"
                  value={<span className="font-mono font-semibold">{Number(amount).toLocaleString('fr-FR')} FCFA</span>}
                />
              )}
              {transactionId && (
                <Row label="Transaction" value={<span className="font-mono text-xs">{transactionId}</span>} />
              )}
              <div className="border-t border-[#1E1B4B]/8 my-1" />
              <Row label="Tentatives" value={`${Math.min(attempt, MAX_ATTEMPTS)} / ${MAX_ATTEMPTS}`} />
            </div>

            <p className="text-xs text-[#1E1B4B]/50 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Ne fermez pas cette page. Vérification automatique toutes les {POLL_INTERVAL_MS / 1000}s.
            </p>
          </motion.div>
        )}

        {/* ─── Succès ─── */}
        {phase === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="flex flex-col items-center text-center"
          >
            {/* Cercle de succès animé */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="h-20 w-20 rounded-full bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center mb-5 shadow-lg shadow-[#84CC16]/40"
            >
              <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={2.5} />
            </motion.div>

            <h1 className="text-2xl font-bold text-[#1E1B4B] mb-2">Paiement confirmé !</h1>
            <p className="text-sm text-[#1E1B4B]/70 mb-5 max-w-sm">
              Votre abonnement <strong className="text-[#1E1B4B]">Prof Premium</strong> est
              maintenant actif. Vous pouvez accéder à toutes les fonctionnalités SECT.
            </p>

            {statusData && (
              <div className="w-full bg-[#FFFBEB] border border-[#F59E0B]/20 rounded-xl p-4 space-y-2 mb-5">
                {statusData.reference && (
                  <Row label="Référence" value={<span className="font-mono">{statusData.reference}</span>} />
                )}
                {typeof statusData.amount === 'number' && (
                  <Row
                    label="Montant payé"
                    value={
                      <span className="font-mono font-semibold text-[#65A30D]">
                        {statusData.amount.toLocaleString('fr-FR')} FCFA
                      </span>
                    }
                  />
                )}
                <Row
                  label="Statut"
                  value={
                    <span className="inline-flex items-center gap-1 text-[#65A30D] font-semibold">
                      <ShieldCheck className="h-3.5 w-3.5" /> Actif
                    </span>
                  }
                />
                {statusData.message && (
                  <p className="text-xs text-[#1E1B4B]/60 italic pt-1">{statusData.message}</p>
                )}
              </div>
            )}

            <Button
              onClick={() => router.push('/login')}
              className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
            >
              Se connecter <ArrowRight className="h-4 w-4 ml-2" />
            </Button>

            <p className="text-xs text-[#1E1B4B]/50 mt-4 flex items-center gap-1.5">
              <Mail className="h-3 w-3" />
              Un email de confirmation vous a été envoyé.
            </p>
          </motion.div>
        )}

        {/* ─── Échec ─── */}
        {phase === 'failed' && (
          <motion.div
            key="failed"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="flex flex-col items-center text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="h-20 w-20 rounded-full bg-gradient-to-br from-[#C2410C] to-[#9A3412] flex items-center justify-center mb-5 shadow-lg shadow-[#C2410C]/30"
            >
              <XCircle className="h-10 w-10 text-white" strokeWidth={2.5} />
            </motion.div>

            <h1 className="text-2xl font-bold text-[#1E1B4B] mb-2">Paiement échoué</h1>
            <p className="text-sm text-[#1E1B4B]/70 mb-5 max-w-sm">
              {errorMsg || 'Le paiement n\'a pas pu être confirmé.'}{' '}
              Vous pouvez réessayer depuis la page de souscription.
            </p>

            {reference && (
              <div className="w-full bg-[#F8FAFC] border border-[#1E1B4B]/8 rounded-xl p-3 mb-5">
                <Row label="Référence" value={<span className="font-mono text-xs">{reference}</span>} />
              </div>
            )}

            <div className="w-full space-y-2">
              <Button
                onClick={() => router.push('/souscrire-b2c')}
                className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Réessayer
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push('/')}
                className="w-full h-10 text-[#1E1B4B]/70 hover:text-[#1E1B4B] hover:bg-[#1E1B4B]/5"
              >
                Retour à l'accueil
              </Button>
            </div>
          </motion.div>
        )}

        {/* ─── Timeout (10 tentatives sans ACTIF) ─── */}
        {phase === 'timeout' && (
          <motion.div
            key="timeout"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="flex flex-col items-center text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="h-20 w-20 rounded-full bg-gradient-to-br from-[#F59E0B] to-[#C2410C] flex items-center justify-center mb-5 shadow-lg shadow-[#F59E0B]/30"
            >
              <Clock className="h-10 w-10 text-white" strokeWidth={2.5} />
            </motion.div>

            <h1 className="text-2xl font-bold text-[#1E1B4B] mb-2">Paiement en cours de traitement</h1>
            <p className="text-sm text-[#1E1B4B]/70 mb-5 max-w-sm">
              Votre paiement a bien été initié mais sa confirmation prend plus de temps que prévu.
              <strong className="text-[#1E1B4B]"> Vous recevrez un email</strong> dès qu'il sera
              validé. Vous pouvez vous connecter, votre abonnement sera activé automatiquement.
            </p>

            {reference && (
              <div className="w-full bg-[#FFFBEB] border border-[#F59E0B]/20 rounded-xl p-3 mb-5">
                <Row label="Référence" value={<span className="font-mono text-xs">{reference}</span>} />
                {errorMsg && (
                  <p className="text-xs text-[#1E1B4B]/60 italic mt-1 pt-1 border-t border-[#F59E0B]/20">
                    {errorMsg}
                  </p>
                )}
              </div>
            )}

            <div className="w-full space-y-2">
              <Button
                onClick={() => router.push('/login')}
                className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
              >
                Se connecter <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push('/')}
                className="w-full h-10 text-[#1E1B4B]/70 hover:text-[#1E1B4B] hover:bg-[#1E1B4B]/5"
              >
                Retour à l'accueil
              </Button>
            </div>

            <p className="text-xs text-[#1E1B4B]/50 mt-4 flex items-center gap-1.5">
              <Mail className="h-3 w-3" />
              Un email de confirmation vous sera envoyé sous peu.
            </p>
          </motion.div>
        )}

        {/* ─── Pas d'abonnementId ─── */}
        {phase === 'no-abo' && (
          <motion.div
            key="no-abo"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="flex flex-col items-center text-center"
          >
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-[#C2410C] to-[#9A3412] flex items-center justify-center mb-5 shadow-lg shadow-[#C2410C]/30">
              <AlertCircle className="h-10 w-10 text-white" strokeWidth={2.5} />
            </div>

            <h1 className="text-2xl font-bold text-[#1E1B4B] mb-2">Information manquante</h1>
            <p className="text-sm text-[#1E1B4B]/70 mb-5 max-w-sm">
              Nous n'avons pas pu identifier votre abonnement. Si vous venez de payer, contactez le
              support avec votre référence de paiement.
            </p>

            <div className="w-full space-y-2">
              <Button
                onClick={() => router.push('/login')}
                className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
              >
                Se connecter <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push('/')}
                className="w-full h-10 text-[#1E1B4B]/70 hover:text-[#1E1B4B] hover:bg-[#1E1B4B]/5"
              >
                Retour à l'accueil
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  )
}

// ═══ Composant utilitaire — ligne label/value ═══
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[#1E1B4B]/60 uppercase tracking-wider">{label}</span>
      <span className="text-sm text-[#1E1B4B] text-right truncate">{value}</span>
    </div>
  )
}

// ═══ Shell — design cohérent avec /souscrire-b2c (Savane EdTech) ═══
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0A1931] via-[#1E1B4B] to-[#0f0d2e] p-4">
      {/* Motif kente en fond */}
      <div
        className="fixed inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(90deg, transparent 0, transparent 50px, #84CC16 50px, #84CC16 55px, transparent 55px, transparent 58px, #F59E0B 58px, #F59E0B 61px, transparent 61px, transparent 64px, #C2410C 64px, #C2410C 66px, transparent 66px, transparent 100px),
            repeating-linear-gradient(45deg, transparent 0, transparent 25px, #F59E0B 25px, #F59E0B 30px, transparent 30px, transparent 50px)
          `,
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-7 sm:p-8 relative z-10"
      >
        {/* Bandeau kente supérieur */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl"
          style={{
            background:
              'linear-gradient(90deg, #84CC16 0%, #84CC16 25%, #C2410C 25%, #C2410C 50%, #F59E0B 50%, #F59E0B 75%, #1E1B4B 75%)',
          }}
        />
        {/* Logo + titre */}
        <div className="flex flex-col items-center mb-6 mt-2">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#84CC16] to-[#65A30D] flex items-center justify-center mb-4 shadow-lg shadow-[#84CC16]/30">
            <GraduationCap className="h-8 w-8 text-[#1E1B4B]" />
          </div>
          <p className="text-[10px] text-[#F59E0B]/80 font-medium tracking-wider uppercase">
            SECT — Système d'Évaluation Casse-Tête
          </p>
        </div>
        {children}
      </motion.div>
    </div>
  )
}
