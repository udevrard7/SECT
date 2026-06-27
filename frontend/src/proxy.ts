import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js 16 Proxy (middleware) — optimisé 0 CPU Edge pour /api/*.
 *
 * BUGFIX (SESSION-EXPIRE-1) : le proxy redirigeait vers /login?error=SessionExpired
 * dès que le cookie access_token expirait (maxAge=15min). Or, le refresh_token
 * (maxAge=7j) est encore valide. Le proxy doit donc laisser passer la requête
 * si SOIT access_token SOIT refresh_token est présent — le client-side
 * (auth-store.refreshSession → /api/go-auth/session) fera le refresh
 * automatiquement et re-posera le cookie access_token.
 *
 * Avant ce fix : après 15 min d'inactivité, l'utilisateur était redirigé
 * vers /login même si sa session était encore valide (refresh_token 7j).
 */

const PUBLIC_PATHS = ['/', '/login', '/invitation', '/verify', '/offline']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Pages publiques — laisser passer sans vérification
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Pages protégées — redirect /login seulement si NI access_token NI
  // refresh_token ne sont présents. Si refresh_token existe, on laisse
  // passer : le client-side fera le refresh via /api/go-auth/session.
  const accessToken = request.cookies.get('access_token')?.value
  const refreshToken = request.cookies.get('refresh_token')?.value
  if (!accessToken && !refreshToken) {
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
