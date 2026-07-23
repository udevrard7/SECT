'use client'

// Page publique d'inscription étudiante via lien direct.
// Clone de /invitation/page.tsx — lit le token depuis l'URL, redirige vers
// /login si absent, sinon affiche StudentSignupPage.

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { StudentSignupPage } from '@/components/auth/student-signup-page'

function InscriptionContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const initialEmail = searchParams.get('email') || ''

  // If no token, redirect to login
  if (!token) {
    router.push('/login')
    return null
  }

  return (
    <StudentSignupPage
      token={token}
      initialEmail={initialEmail}
      onComplete={() => {
        router.push('/login?registered=1')
      }}
    />
  )
}

export default function InscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-sm text-muted-foreground">Chargement...</div>
        </div>
      }
    >
      <InscriptionContent />
    </Suspense>
  )
}
