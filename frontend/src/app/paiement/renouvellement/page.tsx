'use client'

import { useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Phone, Loader2, Shield, ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PaymentMethodSelector,
  getPaymentMethodLabel,
  type PaymentMethodValue,
} from '@/components/payment'

/**
 * /paiement/renouvellement — Page pour renouveler un abonnement B2C Premium
 * qui arrive à expiration (email de relance J-7).
 *
 * SECT-FACTURE-EMAIL (Étape 3) : l'email de relance contient un lien vers cette
 * page avec ?abo=<abonnementId>. L'utilisateur entre son numéro Wave, un nouveau
 * paiement est créé, et après confirmation l'abonnement est prolongé de 30 jours.
 *
 * Query params : ?abo=<abonnementId> (requis)
 */
function PaiementRenouvellementContent() {
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
      // Appel direct au backend /renew (pas de hook use-payment car c'est un endpoint différent)
      // On ajoute `paymentMethod` au body pour sélectionner Wave / Orange / MTN.
      const resp = await fetch(`/api/subscriptions/b2c/${aboId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerPhone: phone, paymentMethod }),
      })

      const data = await resp.json()

      if (!resp.ok) {
        throw new Error(data.error || 'Erreur lors du renouvellement')
      }

      // Stocker l'aboId pour /paiement/succes
      try { localStorage.setItem('sect_pending_abo', aboId) } catch {}

      // Rediriger vers la page de paiement du provider sélectionné
      window.location.href = data.paymentUrl
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors du renouvellement'
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
            Aucun identifiant d&apos;abonnement fourni. Si vous avez un compte,
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-amber-50/30 p-4">
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
              <RefreshCw className="h-7 w-7 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Renouvelez votre abonnement
            </h1>
            <p className="text-sm text-slate-600">
              Votre abonnement Prof Premium arrive à expiration. Renouvelez-le
              maintenant pour éviter toute interruption de service.
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
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-slate-500">Prolongation</span>
              <span className="font-semibold text-lime-600">+30 jours</span>
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
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-600 transition-transform group-focus-within:scale-110" />
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

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5">
            <p className="text-xs text-slate-700 flex items-start gap-2">
              <Shield className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              Vous serez redirigé vers la page sécurisée {getPaymentMethodLabel(paymentMethod)} pour valider le
              paiement. Aucune donnée bancaire n&apos;est stockée par SECT.
            </p>
          </div>

          <Button
            onClick={handlePayment}
            disabled={loading || (phone.length > 0 && !phoneValid)}
            className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/25"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Redirection vers {getPaymentMethodLabel(paymentMethod)}...
              </>
            ) : (
              <>
                <RefreshCw className="h-5 w-5 mr-2" />
                Renouveler — 4 900 FCFA avec {getPaymentMethodLabel(paymentMethod)}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PaiementRenouvellementPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}>
      <PaiementRenouvellementContent />
    </Suspense>
  )
}
