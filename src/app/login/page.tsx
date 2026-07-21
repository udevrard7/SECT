'use client'

import { useAuthStore } from '@/stores/auth-store'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import { toast } from 'sonner'
import { LoginForm } from '@/components/auth/login-form'

function LoginPageInner() {
  const { user, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()

  // SECT-REG-LINK-B2C-MVP-1 : toast de succès après inscription étudiant.
  // Redirigé depuis /inscription?token=... vers /login?registered=1 quand
  // l'étudiant a créé son compte avec succès.
  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      toast.success('Compte créé avec succès', {
        description: 'Vous pouvez maintenant vous connecter.',
      })
      // Nettoie l'URL pour éviter que le toast réapparaisse au refresh
      router.replace('/login')
    }
  }, [searchParams, router])

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, user, router])

  // Si déjà authentifié, ne pas afficher le formulaire
  if (isAuthenticated) return null

  // Sinon, afficher le formulaire de connexion
  return <LoginForm />
}

export default function LoginPage() {
  // Suspense requis par Next.js 16 car useSearchParams() est utilisé dans
  // LoginPageInner (pour le toast ?registered=1 post-inscription).
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}
