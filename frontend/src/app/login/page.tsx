'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard')
    }
  }, [status, router])

  if (status === 'loading') return null
  if (status === 'authenticated') return null

  return <LoginForm />
}
