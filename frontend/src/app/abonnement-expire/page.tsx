'use client'

import { useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle, RefreshCw, ArrowDownCircle, CheckCircle2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * /abonnement-expire — Page affichée quand un prof B2C Premium tente de se
 * connecter avec un abonnement expiré (HTTP 402 + code EXPIRE).
 *
 * SECT-B2C-EXPIRE (Option A + rétrogradation) :
 *   1. Bouton "Renouveler" → /paiement/renouvellement (Wave 4 900 FCFA)
 *   2. Bouton "Continuer en gratuit" → POST /downgrade → /login
 *
 * Query params : ?abo=<abonnementId> (requis)
 *               &action=downgrade (optionnel : auto-déclenche le downgrade)
 */
function AbonnementExpireContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const aboId = searchParams.get('abo') || ''
  const autoDowngrade = searchParams.get('action') === 'downgrade'

  const [downgrading, setDowngrading] = useState(false)
  const [downgraded, setDowngraded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRenew = useCallback(() => {
    router.push(`/paiement/renouvellement?abo=${encodeURIComponent(aboId)}`)
  }, [router, aboId])

  const handleDowngrade = useCallback(async () => {
    if (!aboId) return
    setDowngrading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/subscriptions/b2c/${aboId}/downgrade`, {
        method: 'POST',
      })
      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data.error || 'Erreur lors de la rétrogradation')
      }
      setDowngraded(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la rétrogradation'
      setError(msg)
      setDowngrading(false)
    }
  }, [aboId])

  // Auto-downgrade si ?action=downgrade (depuis l'email)
  if (autoDowngrade && !downgrading && !downgraded) {
    handleDowngrade()
  }

  if (!aboId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <AlertCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Lien invalide</h1>
          <p className="text-sm text-slate-600 mb-6">
            Aucun identifiant d&apos;abonnement fourni. Contactez le support.
          </p>
          <Button onClick={() => router.push('/login')} className="w-full">
            Retour à la connexion
          </Button>
        </div>
      </div>
    )
  }

  // État : rétrogradation réussie
  if (downgraded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-lime-50/30 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-lime-100 mb-4">
            <CheckCircle2 className="h-9 w-9 text-lime-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Bienvenue sur Prof Solo !
          </h1>
          <p className="text-sm text-slate-600 mb-6">
            Votre compte a été rétrogradé en mode gratuit. Vous pouvez continuer
            à utiliser SECT avec les fonctionnalités de base (2 classes, 40 étudiants,
            3 épreuves IA/mois).
          </p>
          <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs text-slate-500 mb-1">Vous pouvez revenir à Premium à tout moment :</p>
            <p className="text-sm font-semibold text-slate-700">4 900 FCFA/mois — IA illimitée</p>
          </div>
          <Button onClick={() => router.push('/login')} className="w-full h-12 bg-lime-500 hover:bg-lime-600 text-slate-900 font-semibold">
            <LogIn className="h-5 w-5 mr-2" />
            Se connecter
          </Button>
        </div>
      </div>
    )
  }

  // État : choix renouvellement / rétrogradation
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-amber-50/30 p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 mb-4">
              <AlertCircle className="h-7 w-7 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Abonnement expiré
            </h1>
            <p className="text-sm text-slate-600">
              Votre abonnement Prof Premium a expiré. Pour continuer à utiliser
              SECT, choisissez une option :
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </p>
            </div>
          )}

          {/* Option 1 : Renouveler */}
          <div className="bg-gradient-to-br from-lime-50 to-amber-50 border border-lime-200 rounded-xl p-5 mb-4">
            <div className="flex items-start gap-3 mb-3">
              <RefreshCw className="h-5 w-5 text-lime-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-slate-900 mb-1">Renouveler Premium</h2>
                <p className="text-xs text-slate-600">
                  IA illimitée, classes illimitées, 200 étudiants, export PDF,
                  support prioritaire.
                </p>
              </div>
            </div>
            <p className="text-lg font-bold text-lime-700 mb-3">4 900 FCFA/mois</p>
            <Button
              onClick={handleRenew}
              className="w-full h-11 bg-lime-500 hover:bg-lime-600 text-slate-900 font-semibold"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Renouveler avec Wave
            </Button>
          </div>

          {/* Option 2 : Rétrograder */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-3">
              <ArrowDownCircle className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-slate-700 mb-1">Continuer en gratuit</h2>
                <p className="text-xs text-slate-500">
                  Prof Solo : 2 classes, 40 étudiants, 3 épreuves IA/mois,
                  export PDF inclus.
                </p>
              </div>
            </div>
            <p className="text-lg font-bold text-slate-600 mb-3">Gratuit</p>
            <Button
              onClick={handleDowngrade}
              disabled={downgrading}
              variant="outline"
              className="w-full h-11 border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              {downgrading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rétrogradation...
                </>
              ) : (
                <>
                  <ArrowDownCircle className="h-4 w-4 mr-2" />
                  Continuer en gratuit
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-slate-400 text-center mt-6">
            Vous pourrez revenir à Premium à tout moment depuis votre espace.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AbonnementExpirePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}>
      <AbonnementExpireContent />
    </Suspense>
  )
}
