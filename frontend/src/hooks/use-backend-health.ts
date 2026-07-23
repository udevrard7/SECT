'use client'

/**
 * use-backend-health.ts — Hook de détection de panne backend.
 *
 * SECT-RESILIENCE-1 : évite la page blanche / les loaders infinis quand le
 * backend Render est down. Au lieu de laisser l'utilisateur confronté à des
 * erreurs éparses (502, timeout, fetch failed), on redirige vers /maintenance
 * qui affiche un message clair + auto-retry.
 *
 * Logique :
 *   1. Au montage, ping GET /api/health (backend Render via proxy Vercel).
 *   2. Si OK : rien (backend up).
 *   3. Si échec : incrémente un compteur. Si 5 échecs consécutifs → redirect /maintenance.
 *   4. En parallèle, ping GET /api/maintenance-status. Si maintenanceMode=true → redirect /maintenance.
 *   5. Re-check toutes les 60s (silencieux, non bloquant).
 *
 * Le hook est SILENCIEUX (pas de toast, pas de console.log en dehors des erreurs).
 * Il ne déclenche la redirection QUE sur panne confirmée (5 échecs) ou maintenance
 * planifiée — pas sur une erreur réseau transitoire unique.
 *
 * Usage : à appeler une seule fois dans le layout authentifié (AuthenticatedLayout).
 */

import { useEffect, useRef } from 'react'

const MAX_FAILURES = 5 // 5 échecs consécutifs = panne confirmée
const CHECK_INTERVAL_MS = 60000 // 60s entre les checks
const HEALTH_TIMEOUT_MS = 8000 // 8s timeout par requête

export function useBackendHealth() {
  const failuresRef = useRef(0)
  const redirectedRef = useRef(false) // évite les redirects en boucle

  useEffect(() => {
    let cancelled = false

    const checkHealth = async () => {
      if (redirectedRef.current || cancelled) return

      try {
        // 1. Check maintenance mode (public endpoint, lit PlatformSettings)
        //    Si maintenanceMode=true → redirect immédiat (maintenance planifiée par admin)
        const maintRes = await fetch('/api/maintenance-status', {
          cache: 'no-store',
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        })
        if (maintRes.ok) {
          const data = await maintRes.json().catch(() => ({}))
          if (data?.maintenanceMode === true && !redirectedRef.current) {
            redirectedRef.current = true
            window.location.href = '/maintenance'
            return
          }
          // maintenance=false + endpoint répond → backend up, reset failures
          failuresRef.current = 0
          return
        }
        // maintRes not ok → backend potentiellement down, fall through to health check
      } catch {
        // maintenance-status unreachable → continue vers health check (qui confirmera)
      }

      // 2. Check health (endpoint léger, confirme la disponibilité du backend)
      try {
        const healthRes = await fetch('/api/health', {
          cache: 'no-store',
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        })
        if (healthRes.ok) {
          failuresRef.current = 0 // reset sur succès
          return
        }
        // status non-2xx → compte comme échec
        throw new Error(`health ${healthRes.status}`)
      } catch {
        failuresRef.current += 1
        if (failuresRef.current >= MAX_FAILURES && !redirectedRef.current) {
          // Panne confirmée : 5 échecs consécutifs → redirect maintenance
          redirectedRef.current = true
          window.location.href = '/maintenance'
        }
      }
    }

    // 1er check après 3s (laisse le temps à la page de charger)
    const initialTimer = setTimeout(checkHealth, 3000)
    const interval = setInterval(checkHealth, CHECK_INTERVAL_MS)

    return () => {
      cancelled = true
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [])
}
