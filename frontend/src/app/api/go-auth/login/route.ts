/**
 * POST /api/go-auth/login
 * Shim: appelle le backend Go /api/auth/login, stocke les tokens en cookies httpOnly.
 * NextAuth reste intact — cette route est utilisée uniquement par le nouveau auth-store.
 *
 * BUGFIX (SECT-LOGIN-500-FIX-1) : la route renvoyait systématiquement 500
 * ("Erreur lors de la connexion") en production Vercel, même pour de mauvais
 * identifiants — alors que le backend Go répondait correctement (401).
 *
 * Cause racine : la variable NEXT_PUBLIC_API_URL sur Vercel pointait vers
 * un ancien service Render (sect-s1pb.onrender.com, 404 Not Found). Le fetch
 * recevait du texte brut "Not Found" → resp.json() levait SyntaxError → le
 * catch{} muet avalait l'erreur → 500 générique. Corrigé en mettant à jour
 * la variable Vercel → https://sect-zead.onrender.com (service actif).
 *
 * Robustesse ajoutée (pour éviter tout retour silencieux à l'avenir) :
 *  1. fetchWithTimeout (AbortController 12s) — consistance avec /session,
 *     évite les hangs infinis si Render est en cold start prolongé.
 *  2. cache: 'no-store' — les POST dynamiques ne doivent JAMAIS être mis en
 *     cache par le fetch instrumenté de Next.js/Vercel.
 *  3. console.error détaillé — l'erreur exacte (name + message + step + API_URL)
 *     est loggée dans les logs Vercel Functions (dashboard Vercel → Logs).
 *  4. Gestion granulaire des codes HTTP :
 *       - 504 Gateway Timeout (AbortError) → serveur auth lent
 *       - 502 Bad Gateway (réseau / non-JSON / fetch failed) → backend injoignable
 *       - 500 (autre) → erreur inattendue
 *     Le frontend login-form.tsx a été mis à jour pour gérer 502/504.
 *  5. Validation : si la réponse backend n'est pas du JSON valide, on retourne
 *     502 (au lieu d'un SyntaxError → 500 muet).
 */
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-zead.onrender.com'

// Timeout pour l'appel backend : 12s (le cold start Render free peut prendre
// jusqu'à ~30-50s, mais on ne veut pas bloquer la requête de login trop
// longtemps — on retourne 504 et l'utilisateur réessaie).
const BACKEND_TIMEOUT_MS = 12000

/** fetch avec timeout explicite via AbortController. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = BACKEND_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const resp = await fetchWithTimeout(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store', // POST dynamique — ne jamais cacher
    })

    // Robustesse : si la réponse n'est pas du JSON valide (ex: 404 HTML d'un
    // service Render mort), resp.json() lèverait SyntaxError. On détecte le
    // Content-Type pour retourner un 502 propre au lieu d'un 500 muet.
    const contentType = resp.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      // Le backend a répondu mais pas en JSON → URL incorrecte ou service down
      const text = await resp.text().catch(() => '')
      console.error('[go-auth/login] Non-JSON response:', JSON.stringify({
        status: resp.status,
        contentType,
        bodyPreview: text.slice(0, 200),
        apiUrl: API_URL,
      }))
      return NextResponse.json(
        { error: "Serveur d'authentification injoignable (réponse invalide). Veuillez réessayer." },
        { status: 502 },
      )
    }

    const data = await resp.json()

    if (!resp.ok) {
      // Propager le status réel du backend (401 identifiants incorrects,
      // 403 compte désactivé, 402 paiement requis, etc.)
      return NextResponse.json(data, { status: resp.status })
    }

    // SECT-B2C-MULTI-ETAB : si multi-comptes, retourner la liste (pas de tokens)
    if (data.multiAccounts && data.multiAccounts.length > 0) {
      return NextResponse.json({
        multiAccounts: data.multiAccounts,
        message: 'Plusieurs établissements trouvés. Choisissez-en un.',
      })
    }

    const response = NextResponse.json({
      user: data.user,
      message: 'Login réussi',
    })

    response.cookies.set('access_token', data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    })

    response.cookies.set('refresh_token', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    })

    return response
  } catch (err) {
    // LOGGING DÉTAILLÉ (SECT-LOGIN-500-FIX-1) : le catch précédent `catch {}`
    // avalait l'erreur sans variable ni log → 500 impossible à diagnostiquer.
    const errName = err instanceof Error ? err.name : 'Unknown'
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[go-auth/login] EXCEPTION:', JSON.stringify({ name: errName, message: errMsg, apiUrl: API_URL }))

    // Timeout réseau (AbortError via fetchWithTimeout) → 504 Gateway Timeout
    if (errName === 'AbortError') {
      return NextResponse.json(
        { error: "Le serveur d'authentification met trop de temps à répondre. Veuillez réessayer." },
        { status: 504 },
      )
    }

    // Erreur réseau (fetch failed, ECONNREFUSED, DNS…) → 502 Bad Gateway
    // Sur Node.js 18+, les erreurs réseau fetch sont des TypeError("fetch failed").
    if (errName === 'TypeError' && /fetch failed/i.test(errMsg)) {
      return NextResponse.json(
        { error: "Serveur d'authentification injoignable. Veuillez réessayer dans un instant." },
        { status: 502 },
      )
    }

    // Autre erreur inattendue (parsing JSON, etc.) → 500
    return NextResponse.json(
      { error: 'Erreur lors de la connexion. Veuillez réessayer.' },
      { status: 500 },
    )
  }
}
