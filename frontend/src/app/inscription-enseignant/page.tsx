'use client'

// Page publique d'inscription enseignante via lien direct (SECT-TEACHER-REG-LINK-1).
// Clone de /inscription/page.tsx — lit le token depuis l'URL, redirige vers
// /login si absent, sinon affiche TeacherSignupPage.

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { TeacherSignupPage } from '@/components/auth/teacher-signup-page'

function InscriptionEnseignantContent() {
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
    <TeacherSignupPage
      token={token}
      initialEmail={initialEmail}
      onComplete={() => {
        router.push('/login?registered=1')
      }}
    />
  )
}

export default function InscriptionEnseignantPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-sm text-muted-foreground">Chargement...</div>
        </div>
      }
    >
      <InscriptionEnseignantContent />
    </Suspense>
  )
}
