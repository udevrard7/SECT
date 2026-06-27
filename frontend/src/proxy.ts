import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js 16 Proxy (middleware) — optimisé 0 CPU Edge pour /api/*.
 *
 * BUGFIX (QUOTA-FIX-1) : le matcher exclut désormais `api` du middleware.
 * Avant ce fix, chaque requête /api/* réveillait le middleware (early return
 * mais comptait quand même comme 1 Edge Function Invocation sur Vercel) →
 * 476K invocations/mois. Maintenant, /api/* est routé directement par le
 * CDN Vercel (vercel.json rewrites) vers Render — 0 invocation middleware.
 *
 * Pour les PAGES : redirect /login si pas de cookie access_token.
 * Pour /api/* : jamais intercepté (géré par vercel.json rewrite → Render).
 *
 * Validé par test A/B en preview Vercel (voir worklog, Task ID COOKIE-TEST-1) :
 * le cookie httpOnly est forwardé par le rewrite Vercel → Render cross-origin.
 *
 * Note Next.js 16 : `proxy.ts` est le nom officiel du middleware depuis
 * Next.js 15.5+ (renommage de middleware.ts → proxy.ts). Les deux noms sont
 * reconnus, mais `proxy.ts` est le standard actuel.
 */

const PUBLIC_PATHS = ['/', '/login', '/invitation', '/verify', '/offline']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Pages publiques — laisser passer sans vérification
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Pages protégées — redirect /login si pas de cookie access_token
  const accessToken = request.cookies.get('access_token')?.value
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'SessionExpired')
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Exclut du middleware : api, assets statiques, fonts, public.
  // /api/* est routé par vercel.json (rewrites CDN) → 0 Function Invocation.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|fonts|public).*)'],
}
