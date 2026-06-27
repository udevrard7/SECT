'use client'

import { useEffect, useState, useRef } from 'react'

/**
 * useSurveillanceStream — Hook pour recevoir les mises à jour temps réel
 * de surveillance via Server-Sent Events (SSE).
 *
 * SSE-STREAM-1 : utilise l'API native EventSource du navigateur (pas de
 * librairie, pas de WebSocket). Passe nativement à travers les CDN Vercel
 * et le proxy Render (HTTP standard).
 *
 * Le backend Go envoie les stats toutes les 10s + un heartbeat toutes
 * les 15s. Si la connexion drop, EventSource se reconnecte automatiquement.
 *
 * Usage :
 *   const { stats, isConnected } = useSurveillanceStream(enseignantId)
 */

export interface SurveillanceStats {
  totalSessions: number
  activeSessions: number
  withAlerts: number
  flagged: number
  timestamp: string
  error?: string
}

export function useSurveillanceStream(enseignantId?: string) {
  const [stats, setStats] = useState<SurveillanceStats | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enseignantId) return

    // Construire l'URL SSE (passe par le rewrite Vercel → Render)
    const url = `/api/surveillance/stream?enseignantId=${enseignantId}`

    const es = new EventSource(url, { withCredentials: true })
    eventSourceRef.current = es

    es.onopen = () => {
      setIsConnected(true)
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SurveillanceStats
        setStats(data)
      } catch {
        // Ignore les heartbeuts (commentaires SSE `: heartbeat`)
      }
    }

    es.onerror = () => {
      setIsConnected(false)
      // EventSource se reconnecte automatiquement
      // On garde les dernières stats connues (pas de reset)
    }

    return () => {
      es.close()
      eventSourceRef.current = null
      setIsConnected(false)
    }
  }, [enseignantId])

  return { stats, isConnected }
}
