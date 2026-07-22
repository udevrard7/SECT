'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// ──────────────────────────────────────────────────────────────
// OPT-7 : Hook WebSocket pour la surveillance temps réel.
//
// Remplace le polling TanStack Query (30s) par push immédiat.
// Quand le WebSocket est connecté, le polling est désactivé.
// Quand il est déconnecté, on retombe sur le polling (fallback).
//
// Le WebSocket s'abonne à des epreuveIds spécifiques et reçoit
// les événements SESSION_STARTED, SESSION_SUBMITTED, ALERT_TRIGGERED,
// SESSION_UPDATED. Chaque événement invalide le cache TanStack Query
// pour déclencher un refetch ciblé.
// ──────────────────────────────────────────────────────────────

interface SurveillanceWSMessage {
  type: 'SESSION_STARTED' | 'SESSION_SUBMITTED' | 'ALERT_TRIGGERED' | 'SESSION_UPDATED'
  epreuveId: string
  payload: unknown
  timestamp: string
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

interface UseSurveillanceWSOptions {
  epreuveIds: string[]
  enabled: boolean
  userId?: string
}

export function useSurveillanceWS({ epreuveIds, enabled, userId }: UseSurveillanceWSOptions) {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const enabledRef = useRef(enabled)
  const userIdRef = useRef(userId)
  const epreuveIdsRef = useRef(epreuveIds)

  // Keep refs in sync
  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { userIdRef.current = userId }, [userId])
  useEffect(() => { epreuveIdsRef.current = epreuveIds }, [epreuveIds])

  const connect = useCallback(() => {
    if (!enabledRef.current || !userIdRef.current) return

    // Build WebSocket URL — same host as the page, proxy handles routing to Go backend
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/surveillance/ws`

    try {
      const ws = new WebSocket(wsUrl)
      setConnectionStatus('connecting')

      ws.onopen = () => {
        setConnectionStatus('connected')
        reconnectAttemptsRef.current = 0
        // Subscribe to the current epreuves
        const ids = epreuveIdsRef.current
        if (ids.length > 0) {
          ws.send(JSON.stringify({ action: 'subscribe', epreuveIds: ids }))
        }
      }

      ws.onmessage = (event) => {
        try {
          const msg: SurveillanceWSMessage = JSON.parse(event.data)
          if (msg.type && msg.epreuveId) {
            // Invalidate the relevant queries to trigger a refetch
            // This is more targeted than invalidating everything
            queryClient.invalidateQueries({ queryKey: ['surveillance-sessions'] })
            queryClient.invalidateQueries({ queryKey: ['surveillance-stats'] })
          }
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        setConnectionStatus('disconnected')
        wsRef.current = null
        // Reconnect with exponential backoff (max 30s)
        if (enabledRef.current) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
          reconnectAttemptsRef.current++
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        // onclose will fire after onerror, handling cleanup there
      }

      wsRef.current = ws
    } catch {
      setConnectionStatus('disconnected')
    }
  }, [queryClient])

  // Connect/disconnect based on enabled state
  useEffect(() => {
    if (enabled && userId) {
      connect()
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      setConnectionStatus('disconnected')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId, connect])

  // Update subscriptions when epreuveIds change
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && epreuveIds.length > 0) {
      wsRef.current.send(JSON.stringify({ action: 'subscribe', epreuveIds }))
    }
  }, [epreuveIds])

  return { connectionStatus }
}
