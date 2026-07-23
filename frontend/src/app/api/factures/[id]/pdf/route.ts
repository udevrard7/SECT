/**
 * GET /api/factures/[id]/pdf
 *
 * SECT-FACTURATION-IMPROVEMENTS : génère le PDF d'une facture côté serveur Next.js
 * (via @react-pdf/renderer) en fetchant les données depuis le backend Go.
 *
 * Le vercel.json rewrite /api/* vers Render, MAIS Vercel priorise les routes
 * API Next.js sur les rewrites → cette route intercepte la requête avant Render.
 *
 * Flow :
 *   1. Lit le cookie access_token (auth httpOnly posé par /api/go-auth/login)
 *   2. GET https://sect-zead.onrender.com/api/factures/{id} (Bearer token)
 *      → retourne la facture avec abonnement{plan} + etablissement nested (fix B1)
 *   3. Mappe la Facture Go → FacturePDFData
 *   4. renderFacturePDF(data) → Buffer PDF
 *   5. Retourne le PDF avec Content-Type: application/pdf
 *
 * Sécurité : le token n'est jamais exposé côté client (route server-side).
 *            Le backend exige RequireAuth + RequireRole("ADMIN") pour /api/factures.
 */
import { NextRequest, NextResponse } from 'next/server'
import { renderFacturePDF, type FacturePDFData } from '@/lib/pdf/facture-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND_URL = 'https://sect-zead.onrender.com'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    // 1. Lire le cookie access_token
    const accessToken = req.cookies.get('access_token')?.value
    if (!accessToken) {
      return NextResponse.json({ error: 'authentication required' }, { status: 401 })
    }

    // 2. Fetch la facture depuis le backend Go (getFactureByID retourne la struct nested)
    const res = await fetch(`${BACKEND_URL}/api/factures/${id}`, {
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
    const f = data.facture
    if (!f) {
      return NextResponse.json({ error: 'facture introuvable' }, { status: 404 })
    }

    // 3. Mapper vers FacturePDFData
    const pdfData: FacturePDFData = {
      numero: f.numero || '',
      statut: f.statut || 'EN_ATTENTE',
      dateEmission: f.dateEmission || new Date().toISOString(),
      dateEcheance: f.dateEcheance || new Date().toISOString(),
      datePaiement: f.datePaiement ?? null,
      modePaiement: f.modePaiement ?? null,
      referencePaiement: f.referencePaiement ?? null,
      montantHt: typeof f.montantHt === 'number' ? f.montantHt : 0,
      tva: typeof f.tva === 'number' ? f.tva : 20,
      montantTtc: typeof f.montantTtc === 'number' ? f.montantTtc : 0,
      lignes: Array.isArray(f.lignes) ? f.lignes.map((l: { description?: string; montant?: number }) => ({
        description: l.description || '',
        montant: typeof l.montant === 'number' ? l.montant : 0,
      })) : [],
      notes: f.notes ?? null,
      // Etablissement (peut être null si RLS ou données manquantes, mais fix B1 garantit nested)
      etablissementNom: f.etablissement?.nom ?? 'Établissement inconnu',
      etablissementVille: f.etablissement?.ville ?? null,
      etablissementEmail: f.etablissement?.email ?? null,
      etablissementPays: f.etablissement?.pays ?? null,
      etablissementTelephone: f.etablissement?.telephone ?? null,
      etablissementAdresse: f.etablissement?.adresse ?? null,
      // Plan
      planNom: f.abonnement?.plan?.nom ?? '—',
      planType: f.abonnement?.plan?.type ?? '—',
      planPrixMensuel: typeof f.abonnement?.plan?.prixMensuel === 'number'
        ? f.abonnement.plan.prixMensuel
        : 0,
    }

    // 4. Générer le PDF
    const pdfBuffer = await renderFacturePDF(pdfData)

    // 5. Retourner le PDF
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="facture-${f.numero || id}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    console.error('[factures/pdf] Error:', err)
    return NextResponse.json(
      { error: 'erreur génération PDF', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
