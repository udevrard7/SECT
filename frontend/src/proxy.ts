import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js 16 Proxy.
 *
 * Pour /api/* : proxy manuel vers le Go backend avec injection Authorization.
 * (Vercel rewrites ne forwardent pas les headers modifiés vers les URLs externes)
 *
 * Pour les pages : redirect /login si pas de cookie
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-s1pb.onrender.com'

const PUBLIC_PATHS = ['/', '/login', '/invitation', '/verify', '/offline']
const PUBLIC_API_PATHS = ['/api/go-auth', '/api/health', '/api/certificats/verify']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Assets statiques
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/fonts') || pathname.includes('.')) {
    return NextResponse.next()
  }

  // Routes API publiques — laisser passer (traitées par les route handlers Next.js)
  if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Pour les routes /api/* protégées : proxy direct vers Go backend
  if (pathname.startsWith('/api/')) {
    const accessToken = request.cookies.get('access_token')?.value

    // Construire l'URL cible
    const targetUrl = `${API_URL}${pathname}${request.nextUrl.search}`

    // Cloner les headers
    const headers = new Headers(request.headers)
    headers.set('Host', new URL(API_URL).host)
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
    // Supprimer les headers qui causent des problèmes
    headers.delete('content-length')

    // Forward la requête vers le Go backend
    try {
      const resp = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
      })

      // Cloner la réponse et ajouter CORS
      const body = await resp.text()
      const response = new NextResponse(body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: {
          'Content-Type': resp.headers.get('Content-Type') || 'application/json',
        },
      })
      return response
    } catch {
      return NextResponse.json({ error: 'Backend inaccessible' }, { status: 502 })
    }
  }

  // Pages publiques
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Pages protégées : vérifier cookie
  const accessToken = request.cookies.get('access_token')?.value
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'SessionExpired')
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts|public).*)'],
}
