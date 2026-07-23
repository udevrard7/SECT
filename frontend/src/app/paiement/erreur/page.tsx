'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  XCircle,
  Loader2,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  GraduationCap,
  Wallet,
  Clock,
  Ban,
  Home,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { initiatePayment, getPendingAbonnement } from '@/hooks/use-payment'
import { toast } from 'sonner'

/**
 * /paiement/erreur — page de retour Wave (error_url).
 *
 * GP-7 / GENIUSPAY_CONTRACT.md :
 *   - URL : /paiement/erreur?reference=MTX-XXX&status=failed&error_code=PAYMENT_FAILED&abo=abo_b2c_xxx
 *   - Affiche un message adapté selon error_code
 *   - Bouton "Réessayer le paiement" → re-initie via POST initiate-payment → redirect paymentUrl
 *   - Bouton "Retour à l'accueil" → /
 *
 * Codes d'erreur gérés (Wave/GeniusPay) :
 *   - INSUFFICIENT_FUNDS    → "Solde Wave insuffisant"
 *   - TIMEOUT               → "Délai de paiement dépassé"
 *   - CANCELLED_BY_USER     → "Paiement annulé"
 *   - PAYMENT_FAILED / default → "Le paiement a échoué"
 */

type ErrorCode =
  | 'INSUFFICIENT_FUNDS'
  | 'TIMEOUT'
  | 'CANCELLED_BY_USER'
  | 'PAYMENT_FAILED'
  | 'UNKNOWN'

interface ErrorConfig {
  title: string
  message: string
  icon: React.ReactNode
}

function resolveErrorConfig(code: string | null): ErrorConfig {
  const upper = (code || '').toUpperCase() as ErrorCode
  switch (upper) {
    case 'INSUFFICIENT_FUNDS':
      return {
        title: 'Solde Wave insuffisant',
        message:
          'Le solde de votre compte Wave est insuffisant pour régler 4 900 FCFA. Rechargez votre compte Wave puis réessayez.',
        icon: <Wallet className="h-10 w-10 text-white" strokeWidth={2.2} />,
      }
    case 'TIMEOUT':
      return {
        title: 'Délai de paiement dépassé',
        message:
          "Vous n'avez pas validé le paiement dans les temps. Cliquez sur « Réessayer » pour relancer un paiement Wave.",
        icon: <Clock className="h-10 w-10 text-white" strokeWidth={2.2} />,
      }
    case 'CANCELLED_BY_USER':
      return {
        title: 'Paiement annulé',
        message:
          "Vous avez annulé le paiement. Votre abonnement est toujours en attente. Cliquez sur « Réessayer » pour reprendre.",
        icon: <Ban className="h-10 w-10 text-white" strokeWidth={2.2} />,
      }
    case 'PAYMENT_FAILED':
    case 'UNKNOWN':
    default:
      return {
        title: 'Le paiement a échoué',
        message:
          "Une erreur est survenue lors du traitement du paiement. Vous pouvez réessayer. Si le problème persiste, contactez le support.",
        icon: <XCircle className="h-10 w-10 text-white" strokeWidth={2.2} />,
      }
  }
}

export default function PaiementErreurPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PaiementErreurContent />
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

function PaiementErreurContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ─── Query params (Wave error_url) ───
  const reference = searchParams.get('reference')
  const errorCode = searchParams.get('error_code')
  const aboFromQuery = searchParams.get('abo')

  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const config = resolveErrorConfig(errorCode)

  // ─── Réessayer le paiement ───
  // Re-initie un paiement via POST initiate-payment → redirige vers paymentUrl.
  // Nécessite l'abonnementId (query `abo` ou localStorage `sect_pending_abo`).
  const handleRetry = async () => {
    if (retrying) return

    // Résoudre l'abonnementId (query → localStorage)
    let aboId: string | null = aboFromQuery
    if (!aboId) {
      aboId = getPendingAbonnement()
    }

    if (!aboId) {
      toast.error('Abonnement introuvable', {
        description: "Impossible de relancer le paiement. Veuillez recommencer votre inscription.",
      })
      setRetryError("Impossible de retrouver votre abonnement. Veuillez recommencer l'inscription.")
      return
    }

    setRetrying(true)
    setRetryError(null)

    try {
      // On n'a pas le téléphone ici (page de retour) → on l'envoie vide.
      // Le backend renverra 400 si téléphone requis — l'utilisateur devra
      // repasser par /souscrire-b2c. Ce cas est rare car Wave renvoie
      // toujours le query param `abo` en cas d'échec après initiation.
      const data = await initiatePayment(aboId, '', undefined)

      if (data && data.paymentUrl) {
        toast.success('Redirection vers Wave...', {
          description: 'Nouvelle tentative de paiement.',
        })
        window.location.href = data.paymentUrl
        return
      }

      // initiatePayment retourne null en cas d'erreur (le hook throw)
      setRetryError('La réinitialisation du paiement a échoué.')
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Erreur inconnue'
      // Si 400 → téléphone requis, il faut repasser par /souscrire-b2c
      if (msg.includes('téléphone') || msg.includes('phone')) {
        toast.error('Téléphone requis', {
          description: "Veuillez reprendre la souscription pour saisir votre numéro Wave.",
        })
        setRetryError("Le téléphone Wave est requis. Veuillez reprendre la souscription.")
      } else {
        toast.error('Réessai impossible', { description: msg })
        setRetryError(msg)
      }
    } finally {
      setRetrying(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDU
  // ═══════════════════════════════════════════════════════════════════

  return (
    <Shell>
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-col items-center text-center"
      >
        {/* Icône d'erreur */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          className="h-20 w-20 rounded-full bg-gradient-to-br from-[#C2410C] to-[#9A3412] flex items-center justify-center mb-5 shadow-lg shadow-[#C2410C]/30"
        >
          {config.icon}
        </motion.div>

        <h1 className="text-2xl font-bold text-[#1E1B4B] mb-2">{config.title}</h1>
        <p className="text-sm text-[#1E1B4B]/70 mb-5 max-w-sm">{config.message}</p>

        {/* Détails de la transaction échouée */}
        {(reference || errorCode) && (
          <div className="w-full bg-[#F8FAFC] border border-[#1E1B4B]/8 rounded-xl p-4 space-y-2 mb-5">
            {reference && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#1E1B4B]/60 uppercase tracking-wider">Référence</span>
                <span className="text-sm text-[#1E1B4B] font-mono text-right">{reference}</span>
              </div>
            )}
            {errorCode && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#1E1B4B]/60 uppercase tracking-wider">Code erreur</span>
                <span className="text-xs text-[#C2410C] font-mono text-right uppercase">
                  {errorCode}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Erreur de réessai (si applicable) */}
        <AnimatePresence>
          {retryError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full bg-[#C2410C]/8 border border-[#C2410C]/25 rounded-lg p-3 mb-4"
            >
              <p className="text-xs text-[#C2410C] flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{retryError}</span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Boutons d'action */}
        <div className="w-full space-y-2">
          <Button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full h-12 rounded-xl bg-[#84CC16] hover:bg-[#65A30D] text-[#1E1B4B] font-semibold text-sm shadow-lg shadow-[#84CC16]/25 hover:shadow-xl hover:shadow-[#84CC16]/40 transition-all"
          >
            {retrying ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Réinitialisation...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" /> Réessayer le paiement
              </>
            )}
          </Button>

          <Button
            onClick={() => router.push('/souscrire-b2c')}
            variant="outline"
            className="w-full h-11 rounded-xl border-[#1E1B4B]/15 text-[#1E1B4B]/80 hover:bg-[#1E1B4B]/5 hover:text-[#1E1B4B]"
          >
            Reprendre la souscription <ArrowRight className="h-4 w-4 ml-2" />
          </Button>

          <Button
            variant="ghost"
            onClick={() => router.push('/')}
            className="w-full h-10 text-[#1E1B4B]/70 hover:text-[#1E1B4B] hover:bg-[#1E1B4B]/5"
          >
            <Home className="h-4 w-4 mr-2" /> Retour à l'accueil
          </Button>
        </div>

        <p className="text-xs text-[#1E1B4B]/50 mt-4">
          Besoin d'aide ? Contactez le support SECT à{' '}
          <a
            href="mailto:support@sect.app"
            className="text-[#84CC16] hover:underline font-medium"
          >
            support@sect.app
          </a>
        </p>
      </motion.div>
    </Shell>
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
