'use client'

/**
 * use-payment — Hook unifié pour l'intégration paiement Wave via GeniusPay.
 *
 * Implémente le contrat GENIUSPAY_CONTRACT.md (Task SECT-GENIUSPAY-WAVE) :
 *   - POST /api/subscriptions/b2c/{id}/initiate-payment
 *   - GET  /api/subscriptions/b2c/{id}/payment-status
 *
 * Tous les appels utilisent des URLs relatives `/api/...` (proxy dev via
 * next.config.ts rewrites, et vercel.json rewrites en prod).
 *
 * Les fonctions sont des wrappers `fetch` simples (pas de TanStack Query) car
 * ce sont des flux one-shot (initiate → redirect, ou poll successif). TanStack
 * Query est intéressant pour du cache read-only, pas pour des mutations à
 * effets de bord (redirection externe).
 *
 * Stockage localStorage :
 *   - `sect_pending_abo` : abonnementId en cours de paiement, pour permettre
 *     à /paiement/succes de retrouver l'abonnement si Wave ne renvoie pas le
 *     query param `abo`.
 */

// ═══════════════════════════════════════════════════════════════════
// Types — strictement alignés sur GENIUSPAY_CONTRACT.md
// ═══════════════════════════════════════════════════════════════════

export interface InitiatePaymentResponse {
  abonnementId: string
  reference: string // ex: MTX-A1B2C3D4
  paymentUrl: string // https://gateway.genius.ci/pay/MTX-...
  amount: number // 4900
  currency: string // XOF
  status: 'pending' | 'completed' | 'failed' | 'cancelled'
}

export interface PaymentStatusResponse {
  abonnementId: string
  abonnementStatut: 'EN_ATTENTE_PAIEMENT' | 'ACTIF'
  paymentStatus: 'pending' | 'completed' | 'failed' | 'cancelled' | null
  reference: string | null
  amount: number | null
  message: string | null
}

export interface PaymentError {
  status: number
  message: string
}

// ═══════════════════════════════════════════════════════════════════
// Validation téléphone
// ═══════════════════════════════════════════════════════════════════

/**
 * Valide un numéro de téléphone Wave au format international Côte d'Ivoire.
 * Accepte : +225 07 77 12 34 56, +2250777123456, +225 0777123456
 * Refuse : 0707..., +33..., formats incomplets.
 */
export function isValidWavePhone(phone: string): boolean {
  // Normaliser : retirer tous les espaces
  const cleaned = phone.trim().replace(/\s+/g, '')
  // Format attendu : +225 suivi de 10 chiffres (opérateur 01/05/07/27 + 8 chiffres)
  return /^\+225\d{10}$/.test(cleaned)
}

/**
 * Normalise un numéro de téléphone en format +225XXXXXXXXXX (sans espaces).
 * Si l'utilisateur a tapé "07 77 12 34 56" sans indicatif → préfixe +225.
 */
export function normalizeWavePhone(phone: string): string {
  let cleaned = phone.trim().replace(/[\s.-]/g, '')
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('00')) {
      cleaned = '+' + cleaned.slice(2)
    } else if (cleaned.startsWith('225')) {
      cleaned = '+' + cleaned
    } else if (cleaned.startsWith('0')) {
      // Numéro local CI sans indicatif → on suppose +225
      cleaned = '+225' + cleaned
    } else {
      cleaned = '+' + cleaned
    }
  }
  return cleaned
}

// ═══════════════════════════════════════════════════════════════════
// localStorage helpers — stockage de l'abonnement en cours de paiement
// ═══════════════════════════════════════════════════════════════════

const PENDING_ABO_KEY = 'sect_pending_abo'

export function setPendingAbonnement(aboId: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PENDING_ABO_KEY, aboId)
  } catch {
    // localStorage peut être désactivé (mode privé) — on ignore silencieusement
  }
}

export function getPendingAbonnement(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(PENDING_ABO_KEY)
  } catch {
    return null
  }
}

export function clearPendingAbonnement(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(PENDING_ABO_KEY)
  } catch {
    // ignore
  }
}

// ═══════════════════════════════════════════════════════════════════
// API calls
// ═══════════════════════════════════════════════════════════════════

/**
 * Initie un paiement Wave via GeniusPay.
 *
 * Contrat :
 *   POST /api/subscriptions/b2c/{abonnementId}/initiate-payment
 *   Body: { customerPhone: "+2250777123456", customerName?: "Jean Kouassi" }
 *   200 → InitiatePaymentResponse
 *   400 → téléphone requis / invalide
 *   404 → abonnement introuvable
 *   409 → abonnement non en attente de paiement
 *   502 → GeniusPay indisponible
 *
 * En cas de succès, stocke l'abonnementId dans localStorage pour permettre
 * à /paiement/succes de retrouver l'abonnement si Wave omet le query param.
 */
export async function initiatePayment(
  abonnementId: string,
  customerPhone: string,
  customerName?: string,
  paymentMethod?: string,
): Promise<InitiatePaymentResponse> {
  const body: Record<string, string> = { customerPhone }
  if (customerName && customerName.trim()) {
    body.customerName = customerName.trim()
  }
  if (paymentMethod) {
    body.paymentMethod = paymentMethod
  }

  const res = await fetch(
    `/api/subscriptions/b2c/${encodeURIComponent(abonnementId)}/initiate-payment`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err: PaymentError = {
      status: res.status,
      message:
        (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' && data.error) ||
        defaultErrorMessage(res.status),
    }
    throw err
  }

  // Stocker l'abonnement en cours pour permettre à /paiement/succes de retrouver
  // l'ID si Wave ne renvoie pas le query param `abo`.
  setPendingAbonnement(abonnementId)

  return data as InitiatePaymentResponse
}

/**
 * Vérifie le statut du paiement (polling après retour Wave).
 *
 * Contrat :
 *   GET /api/subscriptions/b2c/{abonnementId}/payment-status
 *   200 → PaymentStatusResponse
 */
export async function checkPaymentStatus(
  abonnementId: string,
): Promise<PaymentStatusResponse> {
  const res = await fetch(
    `/api/subscriptions/b2c/${encodeURIComponent(abonnementId)}/payment-status`,
    { method: 'GET' },
  )

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err: PaymentError = {
      status: res.status,
      message:
        (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' && data.error) ||
        defaultErrorMessage(res.status),
    }
    throw err
  }

  return data as PaymentStatusResponse
}

function defaultErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Téléphone client requis (format +225...).'
    case 404:
      return 'Abonnement introuvable.'
    case 409:
      return "L'abonnement n'est plus en attente de paiement."
    case 502:
      return 'Service de paiement indisponible. Réessayez dans un instant.'
    case 429:
      return 'Trop de tentatives. Patientez quelques secondes.'
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Erreur serveur. Réessayez dans un instant.'
    default:
      return `Erreur ${status}.`
  }
}

// ═══════════════════════════════════════════════════════════════════
// Hook React — pour usage dans les composants (encapsule loading/error)
// ═══════════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react'

export interface UsePaymentResult {
  /** true pendant l'appel initiatePayment */
  initiating: boolean
  /** true pendant un appel checkPaymentStatus */
  checking: boolean
  /** dernière erreur reçue (initiate ou check) */
  error: PaymentError | null
  /** Initie un paiement Wave. Retourne l'URL de paiement ou null si erreur. */
  initiate: (
    abonnementId: string,
    customerPhone: string,
    customerName?: string,
  ) => Promise<InitiatePaymentResponse | null>
  /** Vérifie le statut du paiement. Retourne la réponse ou null si erreur. */
  checkStatus: (abonnementId: string) => Promise<PaymentStatusResponse | null>
  /** Réinitialise l'erreur affichée */
  clearError: () => void
}

export function usePayment(): UsePaymentResult {
  const [initiating, setInitiating] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<PaymentError | null>(null)

  const initiate = useCallback(
    async (
      abonnementId: string,
      customerPhone: string,
      customerName?: string,
    ): Promise<InitiatePaymentResponse | null> => {
      setInitiating(true)
      setError(null)
      try {
        return await initiatePayment(abonnementId, customerPhone, customerName)
      } catch (err) {
        const e =
          err && typeof err === 'object' && 'status' in err
            ? (err as PaymentError)
            : { status: 0, message: err instanceof Error ? err.message : 'Erreur inconnue' }
        setError(e)
        return null
      } finally {
        setInitiating(false)
      }
    },
    [],
  )

  const checkStatus = useCallback(
    async (abonnementId: string): Promise<PaymentStatusResponse | null> => {
      setChecking(true)
      setError(null)
      try {
        return await checkPaymentStatus(abonnementId)
      } catch (err) {
        const e =
          err && typeof err === 'object' && 'status' in err
            ? (err as PaymentError)
            : { status: 0, message: err instanceof Error ? err.message : 'Erreur inconnue' }
        setError(e)
        return null
      } finally {
        setChecking(false)
      }
    },
    [],
  )

  const clearError = useCallback(() => setError(null), [])

  return { initiating, checking, error, initiate, checkStatus, clearError }
}
