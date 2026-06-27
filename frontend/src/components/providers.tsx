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
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            // BUGFIX (QUERY-403-1) : ne pas retry sur 403/401 (rôle non autorisé).
            // Les pages accessibles à plusieurs rôles mais dont l'API restreint
            // certaines données (ex: /filieres pour un enseignant) ne doivent pas
            // crasher. Le queryFn doit gérer le 403 en retournant un tableau vide.
            retry: (failureCount, error: unknown) => {
              // Ne pas retry sur les erreurs 403/401
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
