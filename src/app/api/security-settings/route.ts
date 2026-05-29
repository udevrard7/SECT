import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/security-settings — List all security settings with etablissement info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const etablissementId = searchParams.get('etablissementId') || ''

    const where: Record<string, unknown> = {}
    if (etablissementId) where.etablissementId = etablissementId

    const securitySettings = await db.securitySettings.findMany({
      where,
      include: {
        etablissement: {
          select: { id: true, nom: true, type: true, ville: true, actif: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ securitySettings })
  } catch (error) {
    console.error('Error fetching security settings:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des paramètres de sécurité' },
      { status: 500 }
    )
  }
}

// POST /api/security-settings — Create security settings for an etablissement
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { etablissementId } = body

    if (!etablissementId) {
      return NextResponse.json(
        { error: "L'identifiant de l'établissement est obligatoire" },
        { status: 400 }
      )
    }

    // Check that the etablissement exists
    const etablissement = await db.etablissement.findUnique({
      where: { id: etablissementId },
    })
    if (!etablissement) {
      return NextResponse.json(
        { error: 'Établissement non trouvé' },
        { status: 404 }
      )
    }

    // Check uniqueness — one-to-one relation
    const existing = await db.securitySettings.findUnique({
      where: { etablissementId },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Des paramètres de sécurité existent déjà pour cet établissement' },
        { status: 409 }
      )
    }

    const securitySettings = await db.securitySettings.create({
      data: {
        etablissementId,
        proctoringActif: body.proctoringActif ?? false,
        detectionCopie: body.detectionCopie ?? true,
        detectionOnglet: body.detectionOnglet ?? true,
        detectionFullscreen: body.detectionFullscreen ?? true,
        blocageCopie: body.blocageCopie ?? true,
        blocageClicDroit: body.blocageClicDroit ?? true,
        blocageImpression: body.blocageImpression ?? true,
        verificationIdentite: body.verificationIdentite ?? false,
        tempsInactiviteMax: body.tempsInactiviteMax ?? 120,
        nbOngletsMax: body.nbOngletsMax ?? 3,
        nbAlertesMax: body.nbAlertesMax ?? 5,
        autoSubmitOnViolation: body.autoSubmitOnViolation ?? false,
        captureEcran: body.captureEcran ?? false,
        rapportFraude: body.rapportFraude ?? true,
        seuilSimilarite: body.seuilSimilarite ?? 0.85,
      },
      include: {
        etablissement: {
          select: { id: true, nom: true, type: true, ville: true, actif: true },
        },
      },
    })

    // Log audit
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entite: 'SecuritySettings',
        entiteId: securitySettings.id,
        details: JSON.stringify({ etablissementId }),
      },
    })

    return NextResponse.json({ securitySettings }, { status: 201 })
  } catch (error) {
    console.error('Error creating security settings:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création des paramètres de sécurité' },
      { status: 500 }
    )
  }
}
