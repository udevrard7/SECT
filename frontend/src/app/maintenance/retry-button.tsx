'use client'

import { useState, useEffect } from 'react'
import { RotateCw, CheckCircle2 } from 'lucide-react'

/**
 * MaintenanceRetryButton — Bouton "Réessayer" pour la page /maintenance.
 *
 * Client Component séparé car il utilise onClick + un état de chargement.
 * La page /maintenance reste un Server Component pour préserver metadata.
 *
 * SECT-RESILIENCE-1 : auto-refresh toutes les 30s pour détecter le retour
 * du backend. L'utilisateur n'a pas besoin de cliquer manuellement — dès que
 * le backend répond, on redirige vers le dashboard.
 */
export function MaintenanceRetryButton() {
  const [checking, setChecking] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  // Auto-check toutes les 30s : ping /api/health, si OK → redirect /dashboard
  useEffect(() => {
    let cancelled = false

    const checkHealth = async () => {
      setChecking(true)
      try {
        const res = await fetch('/api/health', {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        })
        setLastCheck(new Date())
        if (res.ok && !cancelled) {
          // Backend revenu → rediriger vers le dashboard
          window.location.href = '/dashboard'
        }
      } catch {
        // Backend encore down — on reste sur /maintenance
        setLastCheck(new Date())
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    // 1er check immédiat au montage, puis toutes les 30s
    checkHealth()
    const interval = setInterval(checkHealth, 30000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={() => window.location.reload()}
        disabled={checking}
        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
      >
        <RotateCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
        {checking ? 'Vérification…' : 'Réessayer'}
      </button>
      {lastCheck && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Dernière vérification : {lastCheck.toLocaleTimeString('fr-FR')}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Vérification automatique toutes les 30 secondes
      </p>
    </div>
  )
}
