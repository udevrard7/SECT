'use client'

import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { PageCacheProvider } from '@/components/layout/page-cache-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
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
        {/* BUGFIX (KEEPALIVE-PAGES-1) : cache keep-alive des pages au niveau
            Providers (ne se remonte jamais, contrairement à PageContent qui
            est remonté à chaque navigation par le catch-all route). */}
        <PageCacheProvider>
          {children}
        </PageCacheProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
