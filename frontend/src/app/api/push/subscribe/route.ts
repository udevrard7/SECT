import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth-session'
import { db } from '@/lib/db'

/**
 * POST /api/push/subscribe — Enregistre un abonnement push pour l'utilisateur courant.
 *
 * Body: { endpoint, keys: { p256dh, auth } }
 *
 * Le client appelle cet endpoint après PushManager.subscribe() pour
 * stocker la subscription en DB (liée à userId). Plusieurs subscriptions
 * possibles par utilisateur (multi-appareils).
 *
 * Si l'endpoint existe déjà (même appareil), on met à jour les clés au
 * lieu de dupliquer (upsert via endpoint unique).
 */
const _postHandler = async (
  request: NextRequest,
  context: { params: unknown; user: { id: string } }
) => {
  try {
    const body = await request.json()
    const { endpoint, keys } = body as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'endpoint, keys.p256dh et keys.auth requis' },
        { status: 400 }
      )
    }

    const userId = context.user.id
    const userAgent = request.headers.get('user-agent') ?? null

    // Upsert : si l'endpoint existe déjà pour cet user, met à jour les clés
    await db.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
      update: {
        userId, // re-lier au user courant au cas où l'appareil change de compte
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Push] Subscribe error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'abonnement push' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/push/subscribe — Supprime un abonnement push (désabonnement).
 *
 * Body: { endpoint }
 */
const _deleteHandler = async (request: NextRequest) => {
  try {
    const body = await request.json().catch(() => ({}))
    const { endpoint } = body as { endpoint?: string }

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint requis' }, { status: 400 })
    }

    await db.pushSubscription.deleteMany({ where: { endpoint } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Push] Unsubscribe error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du désabonnement push' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(_postHandler, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
export const DELETE = withAuth(_deleteHandler, ['ADMIN', 'RESPONSABLE', 'ENSEIGNANT', 'ETUDIANT'])
