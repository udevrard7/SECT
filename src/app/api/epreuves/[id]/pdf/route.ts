/**
 * GET /api/epreuves/[id]/pdf?type=sujet|corrige|feuille-reponses
 *
 * Génère le PDF d'une épreuve côté serveur Next.js (via @react-pdf/renderer)
 * en fetchant les données depuis le backend Go.
 *
 * Flow :
 *   1. Lit le cookie access_token (auth httpOnly posé par /api/go-auth/login)
 *   2. GET https://sect-zead.onrender.com/api/epreuves/{id} (Bearer token) → epreuve data
 *   3. GET https://sect-zead.onrender.com/api/me (Bearer token) → user context
 *   4. Si user.etablissementId, GET https://sect-zead.onrender.com/api/etablissements/{id} → establishment info
 *   5. Mappe les données → EpreuvePDFData
 *   6. renderEpreuvePDF(data, type) → Buffer PDF
 *   7. Retourne le PDF avec Content-Type: application/pdf + Content-Disposition
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
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    // Type de PDF : sujet, corrige ou feuille-reponses
    const typeParam = req.nextUrl.searchParams.get('type') || 'sujet'
    const validTypes = ['sujet', 'corrige', 'feuille-reponses'] as const
    type EpreuvePdfType = typeof validTypes[number]
    if (!validTypes.includes(typeParam as EpreuvePdfType)) {
      return NextResponse.json(
        { error: `type invalide: ${typeParam}. Valeurs autorisées: sujet, corrige, feuille-reponses` },
        { status: 400 }
      )
    }
    const type = typeParam as EpreuvePdfType

    // 1. Lire le cookie access_token
    const accessToken = req.cookies.get('access_token')?.value
    if (!accessToken) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 })
    }

    // 2. Fetch l'épreuve depuis le backend Go
    const epreuveRes = await fetch(`${BACKEND_URL}/api/epreuves/${id}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Cookie': `access_token=${accessToken}`,
      },
      cache: 'no-store',
    })

    if (!epreuveRes.ok) {
      const errText = await epreuveRes.text().catch(() => 'erreur backend')
      return NextResponse.json(
        { error: `backend error: ${epreuveRes.status}`, detail: errText.substring(0, 200) },
        { status: epreuveRes.status }
      )
    }

    const epreuveData = await epreuveRes.json()
    const epreuve = epreuveData.epreuve
    if (!epreuve) {
      return NextResponse.json({ error: 'epreuve introuvable' }, { status: 404 })
    }

    // 3. Fetch le user context (pour récupérer l'etablissementId)
    const meRes = await fetch(`${BACKEND_URL}/api/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Cookie': `access_token=${accessToken}`,
      },
      cache: 'no-store',
    })

    let etablissementInfo: {
      nom: string
      logo: string | null
      ville: string | null
      pays: string | null
    } = { nom: 'SECT', logo: null, ville: null, pays: null }

    if (meRes.ok) {
      const meData = await meRes.json()
      const user = meData.user

      // 4. Si l'utilisateur a un etablissementId, fetch l'établissement
      if (user?.etablissementId) {
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
              const logo = etab.logo && !etab.logo.includes('image/svg+xml') ? etab.logo : null
              etablissementInfo = {
                nom: etab.nom || 'SECT',
                logo,
                ville: etab.ville ?? null,
                pays: etab.pays ?? null,
              }
            }
          }
        } catch {
          // Fallback si fetch établissement échoue
          etablissementInfo = { nom: 'SECT', logo: null, ville: null, pays: null }
        }
      }
    }

    // 5. Mapper vers EpreuvePDFData
    const contenu = epreuve.contenu || { questions: [], consignes: '', baremeTotal: 0 }

    const pdfData: EpreuvePDFData = {
      id: epreuve.id,
      titre: epreuve.titre || '',
      description: epreuve.description ?? null,
      duree: epreuve.duree ?? null,
      dateDebut: epreuve.dateDebut ?? null,
      dateFin: epreuve.dateFin ?? null,
      noteTotal: epreuve.noteTotal ?? null,
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

    // 6. Générer le PDF
    const pdfBuffer = await renderEpreuvePDF(pdfData, type)

    // 7. Construire le filename selon le type
    const sanitizedTitre = sanitizeFilename(epreuve.titre || id)
    const filenameMap: Record<EpreuvePdfType, string> = {
      'sujet': `Sujet_${sanitizedTitre}.pdf`,
      'corrige': `Corrige_${sanitizedTitre}.pdf`,
      'feuille-reponses': `Feuille_reponses_${sanitizedTitre}.pdf`,
    }
    const filename = filenameMap[type]

    // 8. Retourner le PDF
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    console.error('[epreuves/pdf] Error:', err)
    return NextResponse.json(
      { error: 'erreur génération PDF', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
