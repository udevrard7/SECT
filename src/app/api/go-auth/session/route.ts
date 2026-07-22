/**
 * GET /api/go-auth/session
 * Shim: lit access_token cookie, appelle Go /api/me. Auto-refresh si expiré.
 *
 * BUGFIX (KEEPALIVE-1) : résilience au cold start Render.
 * Avant : si le backend Render était indisponible (cold start du plan free
 * après ~15 min d'inactivité, timeout réseau, 502), le catch retournait
 * { user: null } → l'auth-store déconnectait l'utilisateur immédiatement.
 * Pour une app d'examen, c'est critique : un étudiant en passation ne doit
 * JAMAIS être déconnecté à cause d'une indisponibilité backend transitoire.
 *
 * Maintenant : on distingue 3 cas :
 *  1. Session valide (access token OK ou refresh réussi) → { user }
 *  2. Session invalide (refresh token refusé/expiré par le backend) →
 *     { user: null } + suppression cookies → déconnexion légitime
 *  3. Erreur réseau transitoire (timeout, cold start, 502) →
 *     { user: null, transient: true } SANS supprimer les cookies.
 *     L'auth-store garde l'utilisateur connecté et réessaiera plus tard.
 */
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-zead.onrender.com'

// Timeout pour les appels backend : 12s (le cold start Render free peut
// prendre jusqu'à ~30-50s, mais on ne veut pas bloquer la requête trop
// longtemps — on réessaiera via le keep-alive).
const BACKEND_TIMEOUT_MS = 12000

/** fetch avec timeout explicite via AbortController. */
async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = BACKEND_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Réponse "erreur transitoire" : on garde les cookies, l'user reste connecté. */
function transientErrorResponse() {
  // On retourne user: null pour ne pas crasher le frontend, mais avec
  // transient: true pour que l'auth-store sache qu'il ne faut PAS logout.
  return NextResponse.json(
    { user: null, transient: true },
    { status: 200 }
  )
}

/** Vrai logout : supprime les cookies (refresh token refusé par le backend). */
function clearSessionResponse() {
  const response = NextResponse.json({ user: null }, { status: 200 })
  response.cookies.delete('access_token')
  response.cookies.delete('refresh_token')
  return response
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('access_token')?.value
  const refreshToken = request.cookies.get('refresh_token')?.value

  // Pas de tokens du tout → session vraiment vide
  if (!accessToken && !refreshToken) {
    return NextResponse.json({ user: null }, { status: 200 })
  }

  // 1. Essayer l'access token s'il existe
  if (accessToken) {
    try {
      const meResp = await fetchWithTimeout(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (meResp.ok) {
        const user = await meResp.json()
        return NextResponse.json({ user, expires: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
      }

      // 401 = access token expiré → on essaie le refresh
      if (meResp.status === 401 && refreshToken) {
        return await tryRefresh(refreshToken)
      }

      // Autre code (403 compte désactivé, etc.) → session invalide
      if (meResp.status === 403 || meResp.status === 404) {
        return clearSessionResponse()
      }

      // 5xx = backend en difficulté (cold start, surcharge) → transitoire
      if (meResp.status >= 500) {
        return transientErrorResponse()
      }

      // Autre cas : on ne déconnecte pas par défaut (transitoire)
      return transientErrorResponse()
    } catch {
      // Erreur réseau (timeout, DNS, connexion refusée) → transitoire
      // On NE supprime PAS les cookies : le refresh_token (7j) est peut-être
      // encore valide, le backend est juste temporairement indisponible.
      return transientErrorResponse()
    }
  }

  // 2. Pas d'access token mais refresh token présent → refresh
  if (refreshToken) {
    return await tryRefresh(refreshToken)
  }

  return NextResponse.json({ user: null }, { status: 200 })
}

async function tryRefresh(refreshToken: string) {
  let refreshResp: Response
  try {
    refreshResp = await fetchWithTimeout(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    // Erreur réseau sur le refresh → transitoire (backend indisponible)
    return transientErrorResponse()
  }

  // 401/403 du endpoint refresh = refresh token invalide/expiré → vrai logout
  if (refreshResp.status === 401 || refreshResp.status === 403) {
    return clearSessionResponse()
  }

  // 5xx = backend en difficulté → transitoire
  if (refreshResp.status >= 500) {
    return transientErrorResponse()
  }

  if (!refreshResp.ok) {
    // Autre erreur inattendue → transitoire par sécurité
    return transientErrorResponse()
  }

  const refreshData = await refreshResp.json()

  // Récupérer l'user avec le nouveau access token
  let meResp: Response
  try {
    meResp = await fetchWithTimeout(`${API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${refreshData.accessToken}` },
    })
  } catch {
    // Le refresh a réussi mais /api/me échoue (réseau) → transitoire.
    // On pose quand même les nouveaux cookies pour la prochaine fois.
    const response = transientErrorResponse()
    response.cookies.set('access_token', refreshData.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    })
    response.cookies.set('refresh_token', refreshData.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    })
    return response
  }

  if (!meResp.ok) {
    // Le nouveau token ne fonctionne pas → transitoire (ne pas logout)
    return transientErrorResponse()
  }

  const user = await meResp.json()
  const response = NextResponse.json({ user, expires: new Date(Date.now() + 15 * 60 * 1000).toISOString() })
  response.cookies.set('access_token', refreshData.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60,
  })
  response.cookies.set('refresh_token', refreshData.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
  return response
}
