/**
 * GET /api/enseignant/fiche-notes-pdf
 *
 * Génère un PDF "fiche de notes" collective (1 ligne par étudiant, 1 colonne
 * par épreuve) avec un design institutionnel cohérent avec le certificat +
 * le relevé individuel.
 *
 * Refonte : remplace l'ancienne version jsPDF brute par @react-pdf/renderer
 * (même charte navy/gold, mêmes polices, bordure double, en-tête établissement,
 * signatures enseignant + responsable).
 *
 * Flow :
 *   1. Fetch les données structurées depuis le backend Go
 *      GET /api/enseignant/fiche-notes?format=json&filiereId=...&niveau=...
 *   2. Fetch /api/me → infos enseignant (nom)
 *   3. Fetch /api/etablissements/{etabId} → nom + logo + ville/pays
 *   4. renderFicheNotesPDF(data) → Buffer PDF (design institutionnel)
 *
 * Sécurité : le token JWT (cookie httpOnly) est forwardé au backend Go.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renderFicheNotesPDF, type FicheNotesPDFData } from '@/lib/pdf/fiche-notes-pdf-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND_URL = 'https://sect-s1pb.onrender.com'

interface EpreuveCol {
  id: string
  titre: string
  noteMax: number
  ueCode: string
  ueNom: string
  semestre?: number
}

interface EtudiantRow {
  id: string
  name: string
  matricule: string
  email: string
  filiere: string
  notes: Record<string, number | null>
  moyenne?: number | null
}

interface FicheNotesData {
  epreuves: EpreuveCol[]
  etudiants: EtudiantRow[]
  filiereId: string
  niveau: string
  semestre: string
  anneeUniversitaire: string
  total: number
}

interface MeInfo {
  id: string
  name: string
  email: string
  role: string
  etablissementId?: string | null
}

interface EtablissementInfo {
  id: string
  nom: string
  logo?: string | null
  ville?: string | null
  pays?: string | null
}

export async function GET(req: NextRequest) {
  try {
    const accessToken = req.cookies.get('access_token')?.value
    if (!accessToken) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 })
    }

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Cookie': `access_token=${accessToken}`,
    }

    // 1. Fetch les données de la fiche de notes depuis le backend Go
    const qs = req.nextUrl.searchParams.toString()
    const res = await fetch(`${BACKEND_URL}/api/enseignant/fiche-notes?format=json&${qs}`, {
      headers,
      cache: 'no-store',
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: errBody?.error ?? `backend error: ${res.status}` },
        { status: res.status },
      )
    }

    const data: FicheNotesData = await res.json()

    if (!data.etudiants || data.etudiants.length === 0) {
      return NextResponse.json(
        { error: 'Aucun étudiant à inclure dans la fiche de notes' },
        { status: 404 },
      )
    }

    // 2. Fetch /api/me → infos enseignant (nom)
    let enseignantNom = 'Enseignant'
    let etabId: string | null = null
    try {
      const meRes = await fetch(`${BACKEND_URL}/api/me`, { headers, cache: 'no-store' })
      if (meRes.ok) {
        const me: MeInfo = await meRes.json()
        enseignantNom = me.name || 'Enseignant'
        etabId = me.etablissementId ?? null
      }
    } catch {
      // Si /api/me échoue, on garde les valeurs par défaut
    }

    // 3. Fetch l'établissement (nom + logo + ville/pays)
    let etablissement: EtablissementInfo = {
      id: '',
      nom: 'Établissement',
      logo: null,
      ville: null,
      pays: null,
    }
    if (etabId) {
      try {
        const etabRes = await fetch(`${BACKEND_URL}/api/etablissements/${etabId}`, { headers, cache: 'no-store' })
        if (etabRes.ok) {
          const etabData = await etabRes.json()
          const e = etabData.etablissement || etabData
          etablissement = {
            id: e.id,
            nom: e.nom || e.name || 'Établissement',
            logo: e.logo || e.logoUrl || null,
            ville: e.ville || null,
            pays: e.pays || null,
          }
        }
      } catch {
        // Si l'établissement échoue, on garde les valeurs par défaut
      }
    }

    // 4. Construire les données du PDF
    const pdfData: FicheNotesPDFData = {
      ...data,
      etablissementNom: etablissement.nom,
      etablissementLogo: etablissement.logo ?? null,
      etablissementVille: etablissement.ville ?? null,
      etablissementPays: etablissement.pays ?? null,
      enseignantNom,
      dateEmission: new Date().toISOString(),
    }

    // 5. Générer le PDF
    const pdfBuffer = await renderFicheNotesPDF(pdfData)

    // 6. Retourner le PDF
    const safeNiveau = (data.niveau || '').replace(/[^a-zA-Z0-9_-]/g, '_')
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="fiche_notes_${safeNiveau}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    console.error('[enseignant/fiche-notes-pdf] Error:', err)
    return NextResponse.json(
      { error: 'erreur génération PDF', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
