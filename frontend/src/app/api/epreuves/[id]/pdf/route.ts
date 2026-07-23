/**
 * GET /api/epreuves/[id]/pdf?type=sujet|corrige|feuille-reponses
 *
 * Génère le PDF d'une épreuve côté serveur Next.js (via @react-pdf/renderer)
 * en fetchant les données depuis le backend Go.
 *
 * Flow V3 :
 *   1. Lit le cookie access_token (auth httpOnly posé par /api/go-auth/login)
 *   2. GET backend /api/epreuves/{id} → epreuve data (incluant niveau, sessionExamen)
 *   3. GET backend /api/me → user context (etablissementId)
 *   4. Si etablissementId, GET backend /api/etablissements/{id} → establishment info
 *      (incluant type, logo, watermark config pour B2B branding)
 *   5. Mappe les données → EpreuvePDFData (V3 avec niveau, sessionExamen, watermark)
 *   6. renderEpreuvePDF(data, type) → Buffer PDF (multi-page, B2B branding, watermark)
 *   7. Retourne le PDF avec Content-Type: application/pdf + Content-Disposition
 *
 * FIX-V3-DEPLOY (2025) : corrections pour déploiement Vercel :
 *   - @react-pdf/renderer ajouté à serverExternalPackages dans next.config.ts
 *   - yoga-layout ajouté à serverExternalPackages (ESM-only, nécessite externalisation)
 *   - Logging debug ajouté pour diagnostiquer les erreurs runtime sur Vercel
 *   - Fallback robuste si /api/me ou /api/etablissements échouent
 *
 * SECT-EPREUVE-PDF-TIMEOUT-FIX-1 : erreur récurrente "erreur génération PDF" sur /epreuves.
 *
 * Cause racine : la route faisait 3 fetchs backend Render consécutifs (epreuve + me + etablissement)
 * SANS timeout ni retry. Sur Render free tier cold start (30-50s), le 1er fetch dépassait
 * la limite Vercel serverless de 10s (défaut Hobby plan) → 500 "erreur génération PDF".
 *
 * Corrections :
 *  1. export const maxDuration = 60 : autorise Vercel à attendre 60s (Hobby max) au lieu
 *     du défaut 10s. La génération PDF + 3 fetchs backend peut prendre 15-30s sur cold start.
 *  2. fetchWithTimeout (20s par fetch) + retry automatique (MAX_RETRIES = 2) sur AbortError
 *     pour les 3 fetchs backend. Même stratégie que /api/go-auth/login (SECT-LOGIN-TIMEOUT-FIX-1).
 *  3. fetchWithTimeout global (90s) autour de renderEpreuvePDF : @react-pdf/renderer peut
 *     prendre 10-20s sur un cold lambda Vercel (chargement fonts + yoga-layout).
 *  4. Messages d'erreur categorisés : backend timeout vs render PDF vs données manquantes.
 *     Le détail est renvoyé dans `detail` pour aider au diagnostic.
 *  5. Validation des données epreuve avant render : si contenu.questions est absent ou
 *     si le titre est vide, on renvoie 422 avec message clair (au lieu d'un crash @react-pdf).
 *
 * Sécurité : le token n'est jamais exposé côté client (route server-side).
 */
import { NextRequest, NextResponse } from 'next/server'
import { renderEpreuvePDF, type EpreuvePDFData } from '@/lib/pdf/epreuve-pdf-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// SECT-EPREUVE-PDF-TIMEOUT-FIX-1 : 60s pour couvrir 3 fetchs backend + génération PDF.
// Vercel Hobby supporte jusqu'à 60s, Pro jusqu'à 300s. Sans ce maxDuration, Vercel
// coupe à 10s (défaut) → 500 générique sur Render cold start.
export const maxDuration = 60

const BACKEND_URL = 'https://sect-zead.onrender.com'
const BACKEND_FETCH_TIMEOUT_MS = 20000
const RENDER_PDF_TIMEOUT_MS = 90000
const MAX_RETRIES = 2

/** fetch avec timeout explicite via AbortController. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = BACKEND_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** fetch backend avec retry automatique au timeout (cold start Render). */
async function fetchBackendWithRetry(
  url: string,
  accessToken: string,
  label: string,
  logPrefix: string,
): Promise<Response> {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Cookie': `access_token=${accessToken}`,
  }
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchWithTimeout(url, { headers, cache: 'no-store' })
    } catch (err) {
      lastErr = err
      const errName = err instanceof Error ? err.name : 'Unknown'
      if (errName !== 'AbortError' || attempt === MAX_RETRIES) {
        throw err
      }
      console.warn(`${logPrefix} ${label} tentative ${attempt}/${MAX_RETRIES} timeout, retry...`)
    }
  }
  throw lastErr ?? new Error(`${label} : aucune réponse`)
}

/** Sanitize filename by replacing special characters */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const logPrefix = '[epreuves/pdf]'

  try {
    const { id } = await params
    if (!id) {
      console.warn(`${logPrefix} id manquant`)
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    // Type de PDF : sujet, corrige ou feuille-reponses
    const typeParam = req.nextUrl.searchParams.get('type') || 'sujet'
    const validTypes = ['sujet', 'corrige', 'feuille-reponses'] as const
    type EpreuvePdfType = typeof validTypes[number]
    if (!validTypes.includes(typeParam as EpreuvePdfType)) {
      console.warn(`${logPrefix} type invalide: ${typeParam}`)
      return NextResponse.json(
        { error: `type invalide: ${typeParam}. Valeurs autorisées: sujet, corrige, feuille-reponses` },
        { status: 400 }
      )
    }
    const type = typeParam as EpreuvePdfType
    console.log(`${logPrefix} Début génération PDF — id=${id}, type=${type}`)

    // 1. Lire le cookie access_token
    const accessToken = req.cookies.get('access_token')?.value
    if (!accessToken) {
      console.warn(`${logPrefix} access_token cookie absent → 401`)
      return NextResponse.json({ error: 'authentication required' }, { status: 401 })
    }

    // 2. Fetch l'épreuve depuis le backend Go (avec timeout + retry)
    console.log(`${logPrefix} Fetch epreuve ${id} depuis backend...`)
    let epreuveRes: Response
    try {
      epreuveRes = await fetchBackendWithRetry(
        `${BACKEND_URL}/api/epreuves/${id}`,
        accessToken,
        'epreuve',
        logPrefix,
      )
    } catch (err) {
      const errName = err instanceof Error ? err.name : 'Unknown'
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`${logPrefix} Fetch epreuve ${id} échec: ${errName} - ${errMsg}`)
      if (errName === 'AbortError') {
        return NextResponse.json(
          { error: 'backend timeout', detail: `Le backend met trop de temps à répondre (cold start Render). Réessayez dans 30s.` },
          { status: 504 }
        )
      }
      return NextResponse.json(
        { error: 'backend unreachable', detail: `Erreur réseau backend: ${errMsg}` },
        { status: 502 }
      )
    }

    if (!epreuveRes.ok) {
      const errText = await epreuveRes.text().catch(() => 'erreur backend')
      console.error(`${logPrefix} Backend epreuve ${id} → status ${epreuveRes.status}: ${errText.substring(0, 200)}`)
      return NextResponse.json(
        { error: `backend error: ${epreuveRes.status}`, detail: errText.substring(0, 200) },
        { status: epreuveRes.status }
      )
    }

    const epreuveData = await epreuveRes.json()
    const epreuve = epreuveData.epreuve
    if (!epreuve) {
      console.error(`${logPrefix} epreuve null dans la réponse backend`)
      return NextResponse.json({ error: 'epreuve introuvable' }, { status: 404 })
    }
    console.log(`${logPrefix} Epreuve récupérée: "${epreuve.titre}" — ${epreuve.contenu?.questions?.length || 0} questions`)

    // SECT-EPREUVE-PDF-TIMEOUT-FIX-1 : validation des données avant render.
    // Si le titre est vide ou contenu absent, @react-pdf/renderer peut crasher
    // silencieusement → on renvoie 422 avec message clair.
    if (!epreuve.titre || typeof epreuve.titre !== 'string') {
      console.warn(`${logPrefix} Titre epreuve vide/invalide → 422`)
      return NextResponse.json(
        { error: 'données epreuve invalides', detail: 'Le titre de l\'épreuve est vide ou invalide.' },
        { status: 422 }
      )
    }

    // 3. Fetch le user context (pour récupérer l'etablissementId) — non bloquant
    console.log(`${logPrefix} Fetch /api/me pour etablissementId...`)
    let meRes: Response
    try {
      meRes = await fetchBackendWithRetry(
        `${BACKEND_URL}/api/me`,
        accessToken,
        '/api/me',
        logPrefix,
      )
    } catch (meErr) {
      const errMsg = meErr instanceof Error ? meErr.message : 'unknown'
      console.warn(`${logPrefix} /api/me fetch error (réseau): ${errMsg} — B2C fallback`)
      meRes = new Response(JSON.stringify({ user: null }), { status: 503 })
    }

    // Default etablissement info (B2C fallback)
    let etablissementInfo: EpreuvePDFData['etablissement'] = {
      nom: 'SECT',
      logo: null,
      ville: null,
      pays: null,
      type: 'PERSONNEL',
      watermarkText: null,
      watermarkEnabled: false,
      watermarkOpacity: 0.04,
      watermarkColor: '#1B3A5C',
      watermarkPattern: 'diamond',
    }

    if (meRes.ok) {
      const meData = await meRes.json()
      const user = meData.user

      // 4. Si l'utilisateur a un etablissementId, fetch l'établissement — non bloquant
      if (user?.etablissementId) {
        console.log(`${logPrefix} User etablissementId=${user.etablissementId}, fetch etablissement...`)
        try {
          const etabRes = await fetchBackendWithRetry(
            `${BACKEND_URL}/api/etablissements/${user.etablissementId}`,
            accessToken,
            'etablissement',
            logPrefix,
          )

          if (etabRes.ok) {
            const etabData = await etabRes.json()
            const etab = etabData.etablissement
            if (etab) {
              // Skip SVG logos — can't be rendered in PDF
              // Skip data URIs that aren't PNG/JPEG/WebP (only image formats @react-pdf/renderer supports)
              const logo = etab.logo && !etab.logo.includes('image/svg+xml')
                ? etab.logo
                : null
              etablissementInfo = {
                nom: etab.nom || 'SECT',
                logo,
                ville: etab.ville ?? null,
                pays: etab.pays ?? null,
                type: etab.type || 'PERSONNEL',
                watermarkText: etab.certWatermarkText ?? null,
                watermarkEnabled: etab.certWatermarkEnabled ?? false,
                watermarkOpacity: etab.certWatermarkOpacity ?? 0.04,
                watermarkColor: etab.certWatermarkColor ?? '#1B3A5C',
                watermarkPattern: etab.certWatermarkPattern ?? 'diamond',
              }
              console.log(`${logPrefix} Etablissement B2B: "${etab.nom}" — type=${etab.type}, logo=${logo ? 'present' : 'absent'}`)
            } else {
              console.warn(`${logPrefix} etablissement null dans la réponse`)
            }
          } else {
            console.warn(`${logPrefix} Fetch etablissement ${user.etablissementId} → status ${etabRes.status}`)
          }
        } catch (etabErr) {
          console.warn(`${logPrefix} Fetch etablissement error: ${etabErr instanceof Error ? etabErr.message : 'unknown'} — B2C fallback`)
        }
      } else {
        console.log(`${logPrefix} Pas de etablissementId → B2C fallback (PERSONNEL)`)
      }
    } else {
      console.warn(`${logPrefix} /api/me → status ${meRes.status}, B2C fallback`)
    }

    // 5. Mapper vers EpreuvePDFData (V3)
    const contenu = epreuve.contenu || { questions: [], consignes: '', baremeTotal: 0 }

    const pdfData: EpreuvePDFData = {
      id: epreuve.id,
      titre: epreuve.titre || '',
      description: epreuve.description ?? null,
      duree: epreuve.duree ?? null,
      dateDebut: epreuve.dateDebut ?? null,
      dateFin: epreuve.dateFin ?? null,
      noteTotal: epreuve.noteTotal ?? null,
      niveau: epreuve.niveau ?? null,
      sessionExamen: epreuve.sessionExamen ?? null,
      contenu: {
        questions: contenu.questions || [],
        consignes: contenu.consignes || '',
        baremeTotal: contenu.baremeTotal ?? 0,
      },
      filiere: epreuve.filiere
        ? { nom: epreuve.filiere.nom || '', code: epreuve.filiere.code ?? null }
        : { nom: '', code: null },
      uniteEnseignement: epreuve.uniteEnseignement
        ? { code: epreuve.uniteEnseignement.code || '', nom: epreuve.uniteEnseignement.nom || '' }
        : { code: '', nom: '' },
      enseignant: epreuve.enseignant
        ? { name: epreuve.enseignant.name || '' }
        : { name: '' },
      etablissement: etablissementInfo,
    }

    console.log(`${logPrefix} Données mappées: titre="${pdfData.titre}", niveau=${pdfData.niveau}, session=${pdfData.sessionExamen}, etabType=${pdfData.etablissement.type}, questions=${pdfData.contenu.questions.length}`)

    // 6. Générer le PDF (avec timeout global — @react-pdf/renderer peut être lent sur cold lambda)
    console.log(`${logPrefix} renderEpreuvePDF(data, "${type}") — début...`)
    let pdfBuffer: Buffer
    try {
      const renderPromise = renderEpreuvePDF(pdfData, type)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('renderEpreuvePDF timeout (90s)')), RENDER_PDF_TIMEOUT_MS)
      })
      pdfBuffer = await Promise.race([renderPromise, timeoutPromise])
    } catch (renderErr) {
      const errName = renderErr instanceof Error ? renderErr.name : 'Unknown'
      const errMsg = renderErr instanceof Error ? renderErr.message : String(renderErr)
      console.error(`${logPrefix} renderEpreuvePDF ÉCHEC: ${errName} - ${errMsg}`)
      console.error(`${logPrefix} Stack: ${renderErr instanceof Error ? renderErr.stack?.substring(0, 800) : 'N/A'}`)
      return NextResponse.json(
        {
          error: 'erreur génération PDF (render)',
          detail: `@react-pdf/renderer a échoué: ${errMsg}. Si le problème persiste, l'épreuve contient peut-être des données non supportées (logo, question type, etc.).`,
        },
        { status: 500 }
      )
    }
    console.log(`${logPrefix} PDF généré — ${typeof pdfBuffer}, taille=${pdfBuffer?.length ?? 'N/A'} bytes`)

    // 7. Construire le filename selon le type
    const sanitizedTitre = sanitizeFilename(epreuve.titre || id)
    const filenameMap: Record<EpreuvePdfType, string> = {
      'sujet': `Sujet_${sanitizedTitre}.pdf`,
      'corrige': `Corrige_${sanitizedTitre}.pdf`,
      'feuille-reponses': `Feuille_reponses_${sanitizedTitre}.pdf`,
    }
    const filename = filenameMap[type]

    // 8. Retourner le PDF
    console.log(`${logPrefix} Retour PDF "${filename}" — OK`)
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    console.error(`${logPrefix} ERREUR GÉNÉRATION PDF:`, err)
    // Return detailed error info for debugging (Vercel logs will show this)
    const errorDetail = err instanceof Error
      ? `${err.message}\nStack: ${err.stack?.substring(0, 500) || 'N/A'}`
      : String(err)
    return NextResponse.json(
      { error: 'erreur génération PDF', detail: errorDetail },
      { status: 500 }
    )
  }
}
