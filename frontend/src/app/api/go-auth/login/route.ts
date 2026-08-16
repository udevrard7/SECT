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
 * BUGFIX (SECT-LOGIN-TIMEOUT-FIX-1) : erreur récurrente "Le serveur d'authentification
 * met trop de temps à répondre" sur la page de login.
 *
 * Cause racine : le timeout backend était de 12s, mais Render free tier a un
 * cold start de 30-50s quand le service n'a pas reçu de requête depuis un
 * moment. Le 1er appel (login) tombait systématiquement sur le cold start →
 * AbortError à 12s → 504 → erreur utilisateur. Le 2e appel (retry manuel)
 * passait car le cold start était déjà déclenché.
 *
 * Corrections :
 *  1. Timeout augmenté à 25s (couvre la plupart des cold starts Render).
 *  2. maxDuration = 30 (autorise Vercel serverless à attendre 30s au lieu du
 *     défaut 10s en Hobby plan).
 *  3. Retry automatique au timeout : si le 1er fetch AbortError, on retente
 *     immédiatement (le cold start est déjà en cours → le 2e passe en ~1-3s).
 *  4. fetchWithTimeout + cache: 'no-store' + console.error détaillé (inchangés).
 *  5. Gestion granulaire des codes HTTP (504/502/500) inchangée.
 *  6. Message d'erreur pédagogique : indique que le serveur démarre et qu'il
 *     faut patienter, au lieu de juste "réessayer".
 */
import { NextRequest, NextResponse } from 'next/server'

// SECT-LOGIN-TIMEOUT-FIX-1 : autoriser Vercel à attendre jusqu'à 30s (Hobby
// plan = 10s par défaut, jusqu'à 60s max configuré). Sans ce maxDuration,
// Vercel coupe la route serverless à 10s même si AbortController est à 25s.
export const maxDuration = 30

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-zead.onrender.com'

// SECT-LOGIN-TIMEOUT-FIX-1 : 25s pour couvrir le cold start Render free
// (jusqu'à ~30-50s en pic, mais la majorité des cold starts passent en <20s).
// Si le 1er fetch timeout, on retry une 2e fois (le cold start est déjà déclenché).
const BACKEND_TIMEOUT_MS = 25000
const MAX_RETRIES = 2

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
    const requestBody = JSON.stringify(body)

    // SECT-LOGIN-TIMEOUT-FIX-1 : retry automatique au timeout (cold start Render).
    // Le 1er fetch déclenche le cold start, le 2e (si AbortError) bénéficie du
    // service déjà en train de démarrer → passe en ~1-3s.
    let resp: Response | null = null
    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        resp = await fetchWithTimeout(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          cache: 'no-store', // POST dynamique — ne jamais cacher
        })
        break // succès → on sort de la boucle
      } catch (err) {
        lastErr = err
        const errName = err instanceof Error ? err.name : 'Unknown'
        // Retry seulement si timeout (AbortError = cold start). Les autres
        // erreurs (TypeError fetch failed = DNS/réseau mort) ne bénéficieront
        // pas d'un retry immédiat → on sort directement.
        if (errName !== 'AbortError' || attempt === MAX_RETRIES) {
          throw err
        }
        console.warn(`[go-auth/login] tentative ${attempt}/${MAX_RETRIES} timeout, retry...`, JSON.stringify({ apiUrl: API_URL }))
      }
    }

    if (!resp) {
      throw lastErr ?? new Error('Aucune réponse backend')
    }

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

    // Timeout réseau (AbortError via fetchWithTimeout après retry) → 504
    if (errName === 'AbortError') {
      return NextResponse.json(
        { error: "Le serveur d'authentification démarre (Render free tier, cold start 30-50s). Patientez 30s puis réessayez." },
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
