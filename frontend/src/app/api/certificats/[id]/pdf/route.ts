/**
 * GET /api/certificats/[id]/pdf?orientation=landscape|portrait
 *
 * P2-a-CERTIFICATS : génère le PDF d'un certificat côté serveur Next.js
 * (via @react-pdf/renderer) en fetchant les données depuis le backend Go.
 *
 * Le vercel.json rewrite /api/* vers Render, MAIS Vercel priorise les routes
 * API Next.js sur les rewrites → cette route intercepte la requête avant
 * qu'elle n'aille vers Render.
 *
 * Flow :
 *   1. Lit le cookie access_token (auth httpOnly posé par /api/go-auth/login)
 *   2. GET https://sect-s1pb.onrender.com/api/certificats/{id} (Bearer token)
 *   3. Mappe le Certificat Go → CertificatPDFData (interface frontend)
 *   4. renderCertificatPDF(data, orientation) → Buffer PDF
 *   5. Retourne le PDF avec Content-Type: application/pdf
 *
 * Sécurité : le token n'est jamais exposé côté client (route server-side).
 */
import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { renderCertificatPDF, type CertificatPDFData } from '@/lib/pdf/certificat-pdf-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND_URL = 'https://sect-s1pb.onrender.com'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    // Orientation paysage par défaut
    const orientation = req.nextUrl.searchParams.get('orientation') === 'portrait'
      ? 'portrait'
      : 'landscape'

    // 1. Lire le cookie access_token
    const accessToken = req.cookies.get('access_token')?.value
    if (!accessToken) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 })
    }

    // 2. Fetch le certificat depuis le backend Go
    const res = await fetch(`${BACKEND_URL}/api/certificats/${id}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Cookie': `access_token=${accessToken}`,
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => 'erreur backend')
      return NextResponse.json(
        { error: `backend error: ${res.status}`, detail: errText.substring(0, 200) },
        { status: res.status }
      )
    }

    const data = await res.json()
    const cert = data.certificat
    if (!cert) {
      return NextResponse.json({ error: 'certificat introuvable' }, { status: 404 })
    }

    // 3. Mapper vers CertificatPDFData
    const origin = req.nextUrl.origin
    const verificationUrl = `${origin}/verify/${cert.codeVerification || ''}`

    // Générer le QR code de vérification (data URI PNG)
    let qrCodeDataUri: string | null = null
    try {
      qrCodeDataUri = await QRCode.toDataURL(verificationUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#1B3A5C', light: '#FFFFFF' },
        errorCorrectionLevel: 'M',
      })
    } catch {
      // Si la génération échoue, le certificat affichera juste le code texte
    }

    const pdfData: CertificatPDFData = {
      codeVerification: cert.codeVerification || '',
      type: cert.type || 'STANDARD',
      intitule: cert.intitule || '',
      mention: cert.mention ?? null,
      noteFinale: typeof cert.noteFinale === 'number' ? cert.noteFinale : 0,
      etablissementNom: cert.etablissementNom || '',
      etablissementLogo: cert.etablissementLogo ?? null,
      etablissementVille: cert.etablissementVille ?? null,
      etablissementPays: cert.etablissementPays ?? null,
      filiereNom: cert.filiereNom || '',
      filiereCode: cert.filiereCode ?? null,
      ueCode: cert.ueCode || '',
      ueNom: cert.ueNom || '',
      creditsECTS: cert.creditsECTS ?? null,
      etudiantNom: cert.etudiantNom || '',
      etudiantMatricule: cert.etudiantMatricule ?? null,
      etudiantNiveau: cert.etudiantNiveau ?? null,
      sessionType: cert.sessionType || 'NORMALE',
      anneeAcademique: cert.anneeAcademique ?? null,
      dateEmission: cert.dateEmission || new Date().toISOString(),
      verificationUrl,
      statut: cert.statut || 'EMIS',
      qrCodeDataUri,
    }

    // 4. Générer le PDF
    const pdfBuffer = await renderCertificatPDF(pdfData, orientation)

    // 5. Retourner le PDF
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="certificat-${cert.codeVerification || id}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    console.error('[certificats/pdf] Error:', err)
    return NextResponse.json(
      { error: 'erreur génération PDF', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
