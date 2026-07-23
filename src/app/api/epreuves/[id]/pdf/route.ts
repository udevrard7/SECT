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
 * Sécurité : le token n'est jamais exposé côté client (route server-side).
 */
import { NextRequest, NextResponse } from 'next/server'
import { renderEpreuvePDF, type EpreuvePDFData } from '@/lib/pdf/epreuve-pdf-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND_URL = 'https://sect-zead.onrender.com'

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

    // 2. Fetch l'épreuve depuis le backend Go
    console.log(`${logPrefix} Fetch epreuve ${id} depuis backend...`)
    const epreuveRes = await fetch(`${BACKEND_URL}/api/epreuves/${id}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Cookie': `access_token=${accessToken}`,
      },
      cache: 'no-store',
    })

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

    // 3. Fetch le user context (pour récupérer l'etablissementId)
    console.log(`${logPrefix} Fetch /api/me pour etablissementId...`)
    let meRes: Response
    try {
      meRes = await fetch(`${BACKEND_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': `access_token=${accessToken}`,
        },
        cache: 'no-store',
      })
    } catch (meErr) {
      console.warn(`${logPrefix} /api/me fetch error (réseau): ${meErr instanceof Error ? meErr.message : 'unknown'}`)
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

      // 4. Si l'utilisateur a un etablissementId, fetch l'établissement
      if (user?.etablissementId) {
        console.log(`${logPrefix} User etablissementId=${user.etablissementId}, fetch etablissement...`)
        try {
          const etabRes = await fetch(`${BACKEND_URL}/api/etablissements/${user.etablissementId}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Cookie': `access_token=${accessToken}`,
            },
            cache: 'no-store',
          })

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
          console.warn(`${logPrefix} Fetch etablissement error: ${etabErr instanceof Error ? etabErr.message : 'unknown'}`)
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

    // 6. Générer le PDF
    console.log(`${logPrefix} renderEpreuvePDF(data, "${type}") — début...`)
    const pdfBuffer = await renderEpreuvePDF(pdfData, type)
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
