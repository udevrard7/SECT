'use client'

import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // BUGFIX (FLICKER-FIX-1) : staleTime 3 min au lieu de 1 min.
            // Garde la donnée "fraîche" plus longtemps → 0 refetch au retour
            // navigation ou au focus onglet pendant 3 minutes.
            staleTime: 1000 * 60 * 3, // 3 minutes
            // BUGFIX (FLICKER-FIX-1) : JAMAIS de refetch au focus de l'onglet.
            // C'est la cause principale du clignotement : quand l'utilisateur
            // revient sur l'onglet, TanStack refetch → isFetching → Suspense
            // démonte le HTML → flash. Avec false, la donnée en cache est
            // affichée instantanément, 0 flash.
            refetchOnWindowFocus: false,
            // BUGFIX (QUERY-403-1) : ne pas retry sur 403/401 (rôle non autorisé).
            retry: (failureCount, error: unknown) => {
              const msg = error instanceof Error ? error.message : String(error)
              if (msg.includes('403') || msg.includes('401')) return false
              return failureCount < 2
            },
          },
        },
      })
  )

  const refreshSession = useAuthStore((s) => s.refreshSession)

  // Hydrater la session au démarrage (remplace SessionProvider)
  useEffect(() => {
    refreshSession()
  }, [refreshSession])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
