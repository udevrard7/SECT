'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { AcceptInvitationPage } from '@/components/auth/accept-invitation-page'
import { useAuthStore } from '@/stores/auth-store'
import { useEffect } from 'react'

function InvitationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const { status } = useAuthStore()

  // If no token, redirect to login
  if (!token) {
    router.push('/login')
    return null
  }

  return (
    <AcceptInvitationPage
      token={token}
      onComplete={() => {
        router.push('/login')
      }}
    />
  )
}

export default function InvitationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Chargement...</div>
      </div>
    }>
      <InvitationContent />
    </Suspense>
  )
}
