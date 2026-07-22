'use client'

import { useState, Suspense, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(token ? 'loading' : 'error')
  const [message, setMessage] = useState(token ? '' : 'Token de vérification manquant')

  useEffect(() => {
    if (!token) return

    fetch(`/api/b2b/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json()
        if (res.ok && data.success) {
          setStatus('success')
          setMessage(data.message || 'Email vérifié avec succès')
        } else {
          setStatus('error')
          setMessage(data.error || 'Erreur lors de la vérification')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('Erreur de connexion')
      })
  }, [token])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-slate-600">Vérification de votre email...</p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-orange-50/30 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-100 mb-4">
            <CheckCircle2 className="h-9 w-9 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Email vérifié !</h1>
          <p className="text-sm text-slate-600 mb-6">{message}</p>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <p className="text-xs text-slate-600">
              Notre équipe va valider votre établissement sous 24h. Vous recevrez un email
              de confirmation dès que votre période d'essai aura démarré.
            </p>
          </div>
          <Button onClick={() => router.push('/login')} className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold">
            <LogIn className="h-5 w-5 mr-2" />
            Se connecter
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 mb-4">
          <XCircle className="h-9 w-9 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Vérification échouée</h1>
        <p className="text-sm text-slate-600 mb-6">{message}</p>
        <Button onClick={() => router.push('/')} variant="outline" className="w-full">
          Retour à l'accueil
        </Button>
      </div>
    </div>
  )
}

export default function B2BVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}>
      <VerifyContent />
    </Suspense>
  )
}
