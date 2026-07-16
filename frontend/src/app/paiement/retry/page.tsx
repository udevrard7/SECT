'use client'

import { useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Phone, Loader2, Shield, ArrowLeft, AlertCircle, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { initiatePayment, setPendingAbonnement } from '@/hooks/use-payment'
import {
  PaymentMethodSelector,
  getPaymentMethodLabel,
  type PaymentMethodValue,
} from '@/components/payment'

/**
 * /paiement/retry — Page pour re-initier un paiement Wave quand l'utilisateur
 * a déjà un compte B2C Premium créé mais dont l'abonnement est EN_ATTENTE_PAIEMENT.
 *
 * SECT-GENIUSPAY-WAVE-SECURITY : le login est bloqué tant que le paiement n'est
 * pas confirmé. Cette page permet à l'utilisateur de finaliser son paiement
 * sans recréer un compte (juste son numéro Wave + abonnement ID existant).
 *
 * Query params : ?abo=<abonnementId> (requis)
 */
function PaiementRetryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const aboId = searchParams.get('abo') || ''

  const [phone, setPhone] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ─── Moyen de paiement (Wave / Orange Money / MTN Money) ───
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>('wave_ci')

  const phoneValid = phone.startsWith('+225') && phone.replace(/\D/g, '').length >= 12
  const showPhoneError = phoneTouched && !phoneValid && phone.length > 0

  const handlePayment = useCallback(async () => {
    if (!aboId) {
      setError('Abonnement introuvable. Veuillez contacter le support.')
      return
    }
    if (!phoneValid) {
      setPhoneTouched(true)
      setError('Entrez votre numéro Wave au format +225 suivi de 10 chiffres.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      setPendingAbonnement(aboId)
      // `initiatePayment` (hook use-payment) accepte en 4e argument le
      // `paymentMethod` (wave_ci / orange_money_ci / mtn_money_ci) et l'inclut
      // automatiquement dans le body de la requête POST.
      const resp = await initiatePayment(aboId, phone, undefined, paymentMethod)
      // Rediriger vers la page de paiement du provider sélectionné
      window.location.href = resp.paymentUrl
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : err instanceof Error
            ? err.message
            : 'Erreur lors de la création du paiement'
      setError(msg)
      setLoading(false)
    }
  }, [aboId, phone, phoneValid, paymentMethod])

  if (!aboId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <AlertCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Lien invalide</h1>
          <p className="text-sm text-slate-600 mb-6">
            Aucun identifiant d&apos;abonnement fourni. Si vous avez déjà un compte,
            connectez-vous ou contactez le support.
          </p>
          <Button onClick={() => router.push('/login')} className="w-full">
            Retour à la connexion
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-lime-50/30 p-4">
      <div className="max-w-md w-full">
        <button
          onClick={() => router.push('/login')}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la connexion
        </button>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 mb-4">
              <Wallet className="h-7 w-7 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Finalisez votre paiement
            </h1>
            <p className="text-sm text-slate-600">
              Votre compte est créé. Finalisez votre paiement Mobile Money pour activer
              votre abonnement Prof Premium et accéder à la plateforme.
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Abonnement</span>
              <span className="font-mono text-xs text-slate-700">{aboId.slice(0, 20)}...</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-slate-500">Montant</span>
              <span className="font-bold text-slate-900">4 900 FCFA/mois</span>
            </div>
          </div>

          <div className="space-y-2 mb-5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Moyen de paiement
            </Label>
            <PaymentMethodSelector
              value={paymentMethod}
              onChange={setPaymentMethod}
              variant="light"
            />
          </div>

          <div className="space-y-2 mb-5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Numéro {getPaymentMethodLabel(paymentMethod)}
            </Label>
            <div className="relative group">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-lime-600 transition-transform group-focus-within:scale-110" />
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="+225 07 77 12 34 56"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setPhoneTouched(true)}
                className="pl-10 h-12 rounded-xl font-mono tracking-wide"
                aria-invalid={showPhoneError}
              />
            </div>
            {showPhoneError && (
              <p className="text-xs text-orange-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Format invalide. Entrez +225 suivi de 10 chiffres.
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </p>
            </div>
          )}

          <div className="bg-lime-50 border border-lime-200 rounded-lg p-3 mb-5">
            <p className="text-xs text-slate-700 flex items-start gap-2">
              <Shield className="h-4 w-4 text-lime-700 shrink-0 mt-0.5" />
              Vous serez redirigé vers la page sécurisée {getPaymentMethodLabel(paymentMethod)} pour valider le
              paiement. Aucune donnée bancaire n&apos;est stockée par SECT.
            </p>
          </div>

          <Button
            onClick={handlePayment}
            disabled={loading || (phone.length > 0 && !phoneValid)}
            className="w-full h-12 rounded-xl bg-lime-500 hover:bg-lime-600 text-slate-900 font-semibold shadow-lg shadow-lime-500/25"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Redirection vers {getPaymentMethodLabel(paymentMethod)}...
              </>
            ) : (
              <>
                Payer 4 900 FCFA avec {getPaymentMethodLabel(paymentMethod)}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PaiementRetryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}>
      <PaiementRetryContent />
    </Suspense>
  )
}
