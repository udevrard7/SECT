import { NextResponse } from 'next/server'

/**
 * GET /api/push/vapid-public-key — Retourne la clé publique VAPID.
 *
 * Endpoint public (pas d'auth) car le client en a besoin pour s'abonner
 * via PushManager.subscribe({ applicationServerKey }).
 *
 * La clé privée reste côté serveur (jamais exposée).
 */
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  if (!publicKey) {
    return NextResponse.json(
      { error: 'Push notifications non configurées (VAPID_PUBLIC_KEY manquant)' },
      { status: 503 }
    )
  }
  return NextResponse.json({ publicKey })
}
